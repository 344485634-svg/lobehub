import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyModel } from '@/database/models/apiKey';
import { UserModel } from '@/database/models/user';

import { adminRouter } from './admin';

vi.mock('@/database/models/user');
vi.mock('@/database/models/apiKey');

const adminCtx = { serverDB: {} as any, userId: 'admin_1' };
const asAdmin = () =>
  vi.mocked(UserModel.findById).mockResolvedValue({ id: 'admin_1', role: 'admin' } as any);

describe('adminRouter API key procedures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it('rejects a non-admin caller on listAllApiKeys', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({ id: 'admin_1', role: 'user' } as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    await expect(caller.listAllApiKeys({ page: 1, pageSize: 20 })).rejects.toThrow(TRPCError);
  });

  it('listAllApiKeys returns model output', async () => {
    vi.mocked(ApiKeyModel.adminListAll).mockResolvedValue({
      data: [{ id: 'k1', name: 'n', userId: 'u1' } as any],
      total: 1,
    });
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.listAllApiKeys({ page: 1, pageSize: 20, search: 'n', userId: 'u1' });
    expect(res.total).toBe(1);
    expect(ApiKeyModel.adminListAll).toHaveBeenCalledWith(adminCtx.serverDB, {
      page: 1,
      pageSize: 20,
      search: 'n',
      userId: 'u1',
    });
  });

  it('deleteApiKey calls model and returns success', async () => {
    vi.mocked(ApiKeyModel.adminDelete).mockResolvedValue({ rowCount: 1 } as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.deleteApiKey({ id: 'k1' });
    expect(res.success).toBe(true);
    expect(ApiKeyModel.adminDelete).toHaveBeenCalledWith(adminCtx.serverDB, 'k1');
  });

  it('updateApiKey forwards value to model', async () => {
    vi.mocked(ApiKeyModel.adminUpdate).mockResolvedValue({ rowCount: 1 } as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.updateApiKey({ id: 'k1', value: { enabled: false } });
    expect(res.success).toBe(true);
    expect(ApiKeyModel.adminUpdate).toHaveBeenCalledWith(adminCtx.serverDB, 'k1', {
      enabled: false,
    });
  });
});
