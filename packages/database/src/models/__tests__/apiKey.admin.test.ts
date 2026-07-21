// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { apiKeys, users } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { ApiKeyModel } from '../apiKey';

const serverDB: LobeChatDatabase = await getTestDB();

const userA = 'apikey-admin-user-a';
const userB = 'apikey-admin-user-b';
const validKeyVaultsSecret = 'ofQiJCXLF8mYemwfMWLOHoHimlPu91YmLfU7YZ4lreQ=';

let originalSecret: string | undefined;

beforeEach(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = validKeyVaultsSecret;
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userA }, { id: userB }]);
  await new ApiKeyModel(serverDB, userA).create({ enabled: true, name: 'A-key-1' });
  await new ApiKeyModel(serverDB, userA).create({ enabled: true, name: 'A-key-2' });
  await new ApiKeyModel(serverDB, userB).create({ enabled: true, name: 'B-key-1' });
});

afterEach(async () => {
  await serverDB.delete(users).where(eq(users.id, userA));
  await serverDB.delete(users).where(eq(users.id, userB));
  process.env.KEY_VAULTS_SECRET = originalSecret;
});

describe('ApiKeyModel.adminListAll', () => {
  it('lists keys across all users and never returns key/keyHash', async () => {
    const res = await ApiKeyModel.adminListAll(serverDB, { page: 1, pageSize: 20 });
    expect(res.total).toBe(3);
    expect(res.data).toHaveLength(3);
    for (const row of res.data) {
      expect(row).not.toHaveProperty('key');
      expect(row).not.toHaveProperty('keyHash');
      expect(row.userId).toBeDefined();
    }
  });

  it('filters by userId', async () => {
    const res = await ApiKeyModel.adminListAll(serverDB, { page: 1, pageSize: 20, userId: userA });
    expect(res.total).toBe(2);
    expect(res.data.every((r) => r.userId === userA)).toBe(true);
  });

  it('filters by name search (case-insensitive)', async () => {
    const res = await ApiKeyModel.adminListAll(serverDB, {
      page: 1,
      pageSize: 20,
      search: 'b-key',
    });
    expect(res.total).toBe(1);
    expect(res.data[0].name).toBe('B-key-1');
  });

  it('paginates', async () => {
    const res = await ApiKeyModel.adminListAll(serverDB, { page: 1, pageSize: 2 });
    expect(res.total).toBe(3);
    expect(res.data).toHaveLength(2);
  });
});

describe('ApiKeyModel.adminDelete', () => {
  it('deletes any user key by id regardless of owner', async () => {
    const [row] = await serverDB.select().from(apiKeys).where(eq(apiKeys.userId, userB));
    const res = await ApiKeyModel.adminDelete(serverDB, row.id);
    expect(res.rowCount).toBe(1);
    const after = await serverDB.select().from(apiKeys).where(eq(apiKeys.id, row.id));
    expect(after).toHaveLength(0);
  });
});

describe('ApiKeyModel.adminUpdate', () => {
  it('disables any user key by id', async () => {
    const [row] = await serverDB.select().from(apiKeys).where(eq(apiKeys.userId, userA));
    const res = await ApiKeyModel.adminUpdate(serverDB, row.id, { enabled: false });
    expect(res.rowCount).toBe(1);
    const [after] = await serverDB.select().from(apiKeys).where(eq(apiKeys.id, row.id));
    expect(after.enabled).toBe(false);
  });
});
