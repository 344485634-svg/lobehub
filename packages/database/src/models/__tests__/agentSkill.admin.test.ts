// @vitest-environment node
import type { SkillManifest } from '@lobechat/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agentSkills, users } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { AgentSkillModel } from '../agentSkill';

const serverDB: LobeChatDatabase = await getTestDB();

const userA = 'skill-admin-user-a';
const userB = 'skill-admin-user-b';

const manifest = (): SkillManifest => ({ description: 'd', name: 'n' });

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userA }, { id: userB }]);
  await serverDB.insert(agentSkills).values([
    {
      description: 'coding helper',
      identifier: 'a.1',
      manifest: manifest(),
      name: 'Alpha',
      source: 'user',
      userId: userA,
    },
    {
      description: 'writing helper',
      identifier: 'a.2',
      manifest: manifest(),
      name: 'Beta',
      source: 'market',
      userId: userA,
    },
    {
      description: 'ops helper',
      identifier: 'b.1',
      manifest: manifest(),
      name: 'Gamma',
      source: 'user',
      userId: userB,
    },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users).where(eq(users.id, userA));
  await serverDB.delete(users).where(eq(users.id, userB));
});

describe('AgentSkillModel.adminListAll', () => {
  it('lists skills across all users and includes userId', async () => {
    const res = await AgentSkillModel.adminListAll(serverDB, { page: 1, pageSize: 20 });
    expect(res.total).toBe(3);
    expect(res.data.every((r) => typeof r.userId === 'string')).toBe(true);
  });

  it('filters by userId', async () => {
    const res = await AgentSkillModel.adminListAll(serverDB, {
      page: 1,
      pageSize: 20,
      userId: userB,
    });
    expect(res.total).toBe(1);
    expect(res.data[0].name).toBe('Gamma');
  });

  it('filters by source', async () => {
    const res = await AgentSkillModel.adminListAll(serverDB, {
      page: 1,
      pageSize: 20,
      source: 'market',
    });
    expect(res.total).toBe(1);
    expect(res.data[0].name).toBe('Beta');
  });

  it('filters by search across name and description', async () => {
    const res = await AgentSkillModel.adminListAll(serverDB, {
      page: 1,
      pageSize: 20,
      search: 'writing',
    });
    expect(res.total).toBe(1);
    expect(res.data[0].name).toBe('Beta');
  });

  it('paginates', async () => {
    const res = await AgentSkillModel.adminListAll(serverDB, { page: 1, pageSize: 2 });
    expect(res.total).toBe(3);
    expect(res.data).toHaveLength(2);
  });
});

describe('AgentSkillModel.adminDelete', () => {
  it('force-deletes any user skill by id', async () => {
    const [row] = await serverDB.select().from(agentSkills).where(eq(agentSkills.userId, userB));
    const res = await AgentSkillModel.adminDelete(serverDB, row.id);
    expect(res.success).toBe(true);
    const after = await serverDB.select().from(agentSkills).where(eq(agentSkills.id, row.id));
    expect(after).toHaveLength(0);
  });

  it('returns success false for a missing id', async () => {
    const res = await AgentSkillModel.adminDelete(serverDB, 'does-not-exist');
    expect(res.success).toBe(false);
  });
});
