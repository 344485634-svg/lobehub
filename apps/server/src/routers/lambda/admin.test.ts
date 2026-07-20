import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserModel } from '@/database/models/user';

import { adminRouter } from './admin';

vi.mock('@/database/models/user');

const adminCtx = { serverDB: {} as any, userId: 'admin_1' };

const asAdmin = () =>
  vi.mocked(UserModel.findById).mockResolvedValue({ id: 'admin_1', role: 'admin' } as any);

describe('adminRouter guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-admin caller', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({ id: 'admin_1', role: 'user' } as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    await expect(caller.listUsers({ page: 1, pageSize: 10 })).rejects.toThrow(TRPCError);
  });
});

describe('adminRouter.listUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it('returns users from model', async () => {
    vi.mocked(UserModel.listUsers).mockResolvedValue({ total: 1, users: [{ id: 'u1' }] } as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.listUsers({ page: 1, pageSize: 10 });
    expect(res.total).toBe(1);
  });
});

describe('adminRouter.banUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it('rejects banning yourself', async () => {
    const caller = adminRouter.createCaller(adminCtx as any);
    await expect(caller.banUser({ reason: 'x', userId: 'admin_1' })).rejects.toThrow(
      'cannot act on your own',
    );
  });

  it('sets ban fields for another user', async () => {
    const updateUser = vi.fn().mockResolvedValue(undefined);
    vi.mocked(UserModel).mockImplementation(() => ({ updateUser }) as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.banUser({ reason: 'spam', userId: 'u2' });
    expect(res.success).toBe(true);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ banReason: 'spam', banned: true }),
    );
  });
});

describe('adminRouter.updateUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it('rejects changing your own role', async () => {
    const caller = adminRouter.createCaller(adminCtx as any);
    await expect(caller.updateUserRole({ role: 'user', userId: 'admin_1' })).rejects.toThrow(
      'cannot act on your own',
    );
  });
});
