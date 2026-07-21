import { generateApiKey, isApiKeyExpired, validateApiKeyFormat } from '@lobechat/utils/apiKey';
import { hashApiKey } from '@lobechat/utils/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';

import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

import type { ApiKeyItem, NewApiKeyItem } from '../schemas';
import { apiKeys } from '../schemas';
import type { LobeChatDatabase } from '../type';
import { buildWorkspacePayload, buildWorkspaceWhere } from '../utils/workspace';

export type AdminApiKeyListItem = Pick<
  ApiKeyItem,
  | 'id'
  | 'name'
  | 'enabled'
  | 'expiresAt'
  | 'lastUsedAt'
  | 'userId'
  | 'workspaceId'
  | 'createdAt'
  | 'updatedAt'
>;

export class ApiKeyModel {
  static findByKey = async (db: LobeChatDatabase, key: string) => {
    if (!validateApiKeyFormat(key)) {
      return null;
    }
    const keyHash = hashApiKey(key);

    return db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
    });
  };

  static adminListAll = async (
    db: LobeChatDatabase,
    opts: { page: number; pageSize: number; search?: string; userId?: string },
  ): Promise<{ data: AdminApiKeyListItem[]; total: number }> => {
    const { page, pageSize, search, userId } = opts;
    const offset = (page - 1) * pageSize;

    const where = and(
      userId ? eq(apiKeys.userId, userId) : undefined,
      search ? ilike(apiKeys.name, `%${search}%`) : undefined,
    );

    const [data, totalResult] = await Promise.all([
      db
        .select({
          createdAt: apiKeys.createdAt,
          enabled: apiKeys.enabled,
          expiresAt: apiKeys.expiresAt,
          id: apiKeys.id,
          lastUsedAt: apiKeys.lastUsedAt,
          name: apiKeys.name,
          updatedAt: apiKeys.updatedAt,
          userId: apiKeys.userId,
          workspaceId: apiKeys.workspaceId,
        })
        .from(apiKeys)
        .where(where)
        .orderBy(desc(apiKeys.updatedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(apiKeys).where(where),
    ]);

    return { data, total: totalResult[0].value };
  };

  static adminDelete = async (db: LobeChatDatabase, id: string) => {
    return db.delete(apiKeys).where(eq(apiKeys.id, id));
  };

  static adminUpdate = async (
    db: LobeChatDatabase,
    id: string,
    value: { enabled?: boolean; expiresAt?: Date | null; name?: string },
  ) => {
    return db
      .update(apiKeys)
      .set({ ...value, updatedAt: new Date() })
      .where(eq(apiKeys.id, id));
  };

  private userId: string;
  private db: LobeChatDatabase;
  private workspaceId?: string;
  private gateKeeperPromise: Promise<KeyVaultsGateKeeper> | null = null;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.userId = userId;
    this.db = db;
    this.workspaceId = workspaceId;
  }

  private ownership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, apiKeys);

  private async getGateKeeper() {
    if (!this.gateKeeperPromise) {
      this.gateKeeperPromise = KeyVaultsGateKeeper.initWithEnvKey();
    }

    return this.gateKeeperPromise;
  }

  create = async (params: Omit<NewApiKeyItem, 'userId' | 'id' | 'key' | 'keyHash'>) => {
    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const gateKeeper = await this.getGateKeeper();
    const encryptedKey = await gateKeeper.encrypt(key);

    const [result] = await this.db
      .insert(apiKeys)
      .values(
        buildWorkspacePayload(
          { userId: this.userId, workspaceId: this.workspaceId },
          { ...params, key: encryptedKey, keyHash },
        ),
      )
      .returning();

    return result;
  };

  delete = async (id: string) => {
    return this.db.delete(apiKeys).where(and(eq(apiKeys.id, id), this.ownership()));
  };

  deleteAll = async () => {
    return this.db.delete(apiKeys).where(this.ownership());
  };

  query = async () => {
    const results = await this.db.query.apiKeys.findMany({
      orderBy: [desc(apiKeys.updatedAt)],
      where: this.ownership(),
    });

    const gateKeeper = await this.getGateKeeper();

    return Promise.all(
      results.map(async (apiKey) => {
        const decrypted = await gateKeeper.decrypt(apiKey.key);

        if (!decrypted.wasAuthentic) {
          throw new Error(
            'Failed to decrypt API key. Please check whether KEY_VAULTS_SECRET is correct.',
          );
        }

        return {
          ...apiKey,
          key: decrypted.plaintext,
        };
      }),
    );
  };

  findByKey = async (key: string) => {
    return ApiKeyModel.findByKey(this.db, key);
  };

  validateKey = async (key: string) => {
    const apiKey = await this.findByKey(key);

    if (!apiKey) return false;
    if (!apiKey.enabled) return false;
    if (isApiKeyExpired(apiKey.expiresAt)) return false;

    return true;
  };

  update = async (id: string, value: Partial<ApiKeyItem>) => {
    return this.db
      .update(apiKeys)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(apiKeys.id, id), this.ownership()));
  };

  findById = async (id: string) => {
    return this.db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, id), this.ownership()),
    });
  };

  updateLastUsed = async (id: string) => {
    return this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(apiKeys.id, id), this.ownership()));
  };
}
