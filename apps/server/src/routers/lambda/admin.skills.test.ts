import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentSkillModel } from '@/database/models/agentSkill';
import { UserModel } from '@/database/models/user';

import { adminRouter } from './admin';

vi.mock('@/database/models/user');
vi.mock('@/database/models/agentSkill');

const adminCtx = { serverDB: {} as any, userId: 'admin_1' };
const asAdmin = () =>
  vi.mocked(UserModel.findById).mockResolvedValue({ id: 'admin_1', role: 'admin' } as any);

describe('adminRouter skill procedures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it('rejects a non-admin caller on listAllSkills', async () => {
    vi.mocked(UserModel.findById).mockResolvedValue({ id: 'admin_1', role: 'user' } as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    await expect(caller.listAllSkills({ page: 1, pageSize: 20 })).rejects.toThrow(TRPCError);
  });

  it('listAllSkills returns model output', async () => {
    vi.mocked(AgentSkillModel.adminListAll).mockResolvedValue({
      data: [{ id: 's1', name: 'n', userId: 'u1' } as any],
      total: 1,
    });
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.listAllSkills({
      page: 1,
      pageSize: 20,
      search: 'n',
      source: 'user',
      userId: 'u1',
    });
    expect(res.total).toBe(1);
    expect(AgentSkillModel.adminListAll).toHaveBeenCalledWith(adminCtx.serverDB, {
      page: 1,
      pageSize: 20,
      search: 'n',
      source: 'user',
      userId: 'u1',
    });
  });

  it('deleteSkill calls model and returns success', async () => {
    vi.mocked(AgentSkillModel.adminDelete).mockResolvedValue({ success: true });
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.deleteSkill({ id: 's1' });
    expect(res.success).toBe(true);
    expect(AgentSkillModel.adminDelete).toHaveBeenCalledWith(adminCtx.serverDB, 's1');
  });

  it('deleteSkill returns success false when model returns false', async () => {
    vi.mocked(AgentSkillModel.adminDelete).mockResolvedValue({ success: false });
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.deleteSkill({ id: 'missing' });
    expect(res.success).toBe(false);
  });
});
