import { and, count, desc, eq, sql } from 'drizzle-orm';

import {
  type CouponItem,
  type CouponRedemptionItem,
  type NewCoupon,
  couponRedemptions,
  coupons,
} from '../schemas/coupon';
import type { LobeChatDatabase } from '../type';

export type CouponScope = 'subscription' | 'topup' | 'all';
export type CouponType = 'percent' | 'fixed';

export type AppliedCoupon = {
  code: string;
  couponId: string;
  discountAmount: number;
  finalAmount: number;
  name: string;
  originalAmount: number;
  type: CouponType;
  value: number;
};

export class CouponModel {
  constructor(private db: LobeChatDatabase) {}

  async list(opts?: { activeOnly?: boolean; limit?: number }): Promise<CouponItem[]> {
    const limit = opts?.limit ?? 100;
    if (opts?.activeOnly) {
      return this.db.query.coupons.findMany({
        limit,
        orderBy: [desc(coupons.createdAt)],
        where: eq(coupons.active, true),
      });
    }
    return this.db.query.coupons.findMany({
      limit,
      orderBy: [desc(coupons.createdAt)],
    });
  }

  async findById(id: string): Promise<CouponItem | undefined> {
    return this.db.query.coupons.findFirst({ where: eq(coupons.id, id) });
  }

  async findByCode(code: string): Promise<CouponItem | undefined> {
    return this.db.query.coupons.findFirst({
      where: eq(coupons.code, code.trim().toUpperCase()),
    });
  }

  async create(data: Omit<NewCoupon, 'id' | 'usedCount'> & { code: string }): Promise<CouponItem> {
    const [row] = await this.db
      .insert(coupons)
      .values({
        ...data,
        code: data.code.trim().toUpperCase(),
        usedCount: 0,
      })
      .returning();
    return row;
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        CouponItem,
        | 'name'
        | 'description'
        | 'type'
        | 'value'
        | 'minAmount'
        | 'maxDiscount'
        | 'scope'
        | 'totalLimit'
        | 'perUserLimit'
        | 'startsAt'
        | 'endsAt'
        | 'active'
      >
    >,
  ): Promise<CouponItem | undefined> {
    const [row] = await this.db
      .update(coupons)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(coupons.id, id))
      .returning();
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(coupons).where(eq(coupons.id, id));
  }

  async countUserRedemptions(couponId: string, userId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, couponId), eq(couponRedemptions.userId, userId)));
    return Number(rows[0]?.value || 0);
  }

  /**
   * Validate + compute discount. Does not mutate usage counters.
   * Call `redeem` after order is created/paid as needed.
   */
  async preview(
    code: string,
    opts: { amountCny: number; scope: CouponScope; userId: string },
  ): Promise<AppliedCoupon> {
    const coupon = await this.findByCode(code);
    if (!coupon || !coupon.active) throw new Error('COUPON_NOT_FOUND');

    const now = Date.now();
    if (coupon.startsAt && coupon.startsAt.getTime() > now) throw new Error('COUPON_NOT_STARTED');
    if (coupon.endsAt && coupon.endsAt.getTime() < now) throw new Error('COUPON_EXPIRED');

    if (coupon.scope !== 'all' && coupon.scope !== opts.scope) throw new Error('COUPON_SCOPE');

    const minAmount = coupon.minAmount != null ? Number(coupon.minAmount) : 0;
    if (opts.amountCny < minAmount) throw new Error('COUPON_MIN_AMOUNT');

    if (coupon.totalLimit != null && coupon.usedCount >= coupon.totalLimit) {
      throw new Error('COUPON_SOLD_OUT');
    }

    const perUser = coupon.perUserLimit ?? 1;
    if (perUser > 0) {
      const used = await this.countUserRedemptions(coupon.id, opts.userId);
      if (used >= perUser) throw new Error('COUPON_USER_LIMIT');
    }

    const original = Math.round(opts.amountCny * 100) / 100;
    const value = Number(coupon.value) || 0;
    let discount = 0;
    if (coupon.type === 'percent') {
      const pct = Math.min(100, Math.max(0, value));
      discount = (original * pct) / 100;
      if (coupon.maxDiscount != null) {
        discount = Math.min(discount, Number(coupon.maxDiscount));
      }
    } else {
      // fixed
      discount = Math.min(original, value);
    }
    discount = Math.round(discount * 100) / 100;
    // keep at least 0.01 payable if original > 0 (payment gateway often requires positive amount)
    let finalAmount = Math.round((original - discount) * 100) / 100;
    if (original > 0 && finalAmount <= 0) {
      finalAmount = 0.01;
      discount = Math.round((original - finalAmount) * 100) / 100;
    }

    return {
      code: coupon.code,
      couponId: coupon.id,
      discountAmount: discount,
      finalAmount,
      name: coupon.name,
      originalAmount: original,
      type: coupon.type as CouponType,
      value,
    };
  }

  /** Record redemption + increment usedCount (call when order is created successfully) */
  async redeem(opts: {
    applied: AppliedCoupon;
    orderId: string;
    userId: string;
    meta?: Record<string, unknown>;
  }): Promise<CouponRedemptionItem> {
    const [row] = await this.db
      .insert(couponRedemptions)
      .values({
        couponId: opts.applied.couponId,
        discountAmount: String(opts.applied.discountAmount),
        finalAmount: String(opts.applied.finalAmount),
        meta: opts.meta || {},
        orderId: opts.orderId,
        originalAmount: String(opts.applied.originalAmount),
        userId: opts.userId,
      })
      .returning();

    await this.db
      .update(coupons)
      .set({
        updatedAt: new Date(),
        usedCount: sql`${coupons.usedCount} + 1`,
      })
      .where(eq(coupons.id, opts.applied.couponId));

    return row;
  }
}
