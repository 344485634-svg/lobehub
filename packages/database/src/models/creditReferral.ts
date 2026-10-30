import { and, desc, eq, sql } from 'drizzle-orm';

import {
  type CreditLedgerItem,
  type NewCreditLedger,
  type ReferralRewardItem,
  type UserInviteCodeItem,
  type UserReferralBindItem,
  creditLedgers,
  referralRewards,
  userInviteCodes,
  userReferralBinds,
} from '../schemas/creditReferral';
import type { LobeChatDatabase } from '../type';
import { createNanoId } from '../utils/idGenerator';

export class CreditLedgerModel {
  constructor(
    private db: LobeChatDatabase,
    private userId: string,
  ) {}

  async insert(entry: Omit<NewCreditLedger, 'id' | 'userId'> & { userId?: string }) {
    const userId = entry.userId || this.userId;
    const [row] = await this.db
      .insert(creditLedgers)
      .values({ ...entry, userId })
      .returning();
    return row;
  }

  async list(limit = 50): Promise<CreditLedgerItem[]> {
    return this.db.query.creditLedgers.findMany({
      limit,
      orderBy: [desc(creditLedgers.createdAt)],
      where: eq(creditLedgers.userId, this.userId),
    });
  }

  /** Sum of top-up / referral / adjust grants minus their consumption is tracked via quotaUsage.topupCredits */
  static async adminInsert(
    db: LobeChatDatabase,
    entry: Omit<NewCreditLedger, 'id'>,
  ): Promise<CreditLedgerItem> {
    const [row] = await db.insert(creditLedgers).values(entry).returning();
    return row;
  }
}

export class ReferralModel {
  constructor(
    private db: LobeChatDatabase,
    private userId: string,
  ) {}

  async getOrCreateInviteCode(): Promise<UserInviteCodeItem> {
    const existing = await this.db.query.userInviteCodes.findFirst({
      where: eq(userInviteCodes.userId, this.userId),
    });
    if (existing) return existing;

    // generate unique code
    for (let i = 0; i < 8; i++) {
      const code = createNanoId(8)().toUpperCase();
      try {
        const [row] = await this.db
          .insert(userInviteCodes)
          .values({ code, userId: this.userId })
          .returning();
        return row;
      } catch {
        // collision, retry
      }
    }
    throw new Error('Failed to generate invite code');
  }

  async updateInviteCode(code: string): Promise<UserInviteCodeItem> {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,8}$/.test(normalized)) {
      throw new Error('INVALID_FORMAT');
    }
    const clash = await this.db.query.userInviteCodes.findFirst({
      where: eq(userInviteCodes.code, normalized),
    });
    if (clash && clash.userId !== this.userId) throw new Error('CODE_EXISTS');

    await this.getOrCreateInviteCode();
    const [row] = await this.db
      .update(userInviteCodes)
      .set({ code: normalized, updatedAt: new Date() })
      .where(eq(userInviteCodes.userId, this.userId))
      .returning();
    return row;
  }

  async getBind(): Promise<UserReferralBindItem | undefined> {
    return this.db.query.userReferralBinds.findFirst({
      where: eq(userReferralBinds.userId, this.userId),
    });
  }

  async bindInviteCode(code: string): Promise<UserReferralBindItem> {
    const existing = await this.getBind();
    if (existing) throw new Error('ALREADY_BOUND');

    const normalized = code.trim().toUpperCase();
    const inviter = await this.db.query.userInviteCodes.findFirst({
      where: eq(userInviteCodes.code, normalized),
    });
    if (!inviter) throw new Error('INVALID_CODE');
    if (inviter.userId === this.userId) throw new Error('SELF_REFERRAL');

    const [row] = await this.db
      .insert(userReferralBinds)
      .values({
        inviteCode: normalized,
        inviterId: inviter.userId,
        userId: this.userId,
      })
      .returning();
    return row;
  }

  async listInvitees(limit = 50) {
    return this.db.query.userReferralBinds.findMany({
      limit,
      orderBy: [desc(userReferralBinds.boundAt)],
      where: eq(userReferralBinds.inviterId, this.userId),
    });
  }

  async listRewards(limit = 50): Promise<ReferralRewardItem[]> {
    return this.db.query.referralRewards.findMany({
      limit,
      orderBy: [desc(referralRewards.createdAt)],
      where: eq(referralRewards.inviterId, this.userId),
    });
  }

  async countInvitees(): Promise<number> {
    const rows = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(userReferralBinds)
      .where(eq(userReferralBinds.inviterId, this.userId));
    return Number(rows[0]?.value || 0);
  }

  static async findInviterOf(
    db: LobeChatDatabase,
    userId: string,
  ): Promise<UserReferralBindItem | undefined> {
    return db.query.userReferralBinds.findFirst({
      where: eq(userReferralBinds.userId, userId),
    });
  }

  static async grantReward(
    db: LobeChatDatabase,
    data: {
      credits: number;
      inviteeId: string;
      inviterId: string;
      orderId?: string;
      rate: number;
      spendAmount: string;
    },
  ): Promise<ReferralRewardItem> {
    const [row] = await db
      .insert(referralRewards)
      .values({
        credits: data.credits,
        inviteeId: data.inviteeId,
        inviterId: data.inviterId,
        orderId: data.orderId,
        rate: String(data.rate),
        spendAmount: data.spendAmount,
        status: 'granted',
      })
      .returning();
    return row;
  }
}
