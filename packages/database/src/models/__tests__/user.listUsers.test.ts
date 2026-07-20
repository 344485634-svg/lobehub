import { beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users } from '../../schemas';
import { UserModel } from '../user';

const db = await getTestDB();

const seed = async () => {
  await db.delete(users);
  await db.insert(users).values([
    { id: 'u_alice', email: 'alice@x.com', username: 'alice', role: 'admin', emailVerified: true },
    { id: 'u_bob', email: 'bob@x.com', username: 'bob', role: 'user', emailVerified: true },
    { id: 'u_carol', email: 'carol@x.com', username: 'carol', banned: true, banReason: 'spam' },
  ]);
};

describe('UserModel.listUsers', () => {
  beforeEach(seed);

  it('returns paginated users with total', async () => {
    const { users: rows, total } = await UserModel.listUsers(db, { page: 1, pageSize: 2 });
    expect(total).toBe(3);
    expect(rows).toHaveLength(2);
  });

  it('filters by search on email/username', async () => {
    const { users: rows, total } = await UserModel.listUsers(db, { page: 1, pageSize: 10, search: 'bob' });
    expect(total).toBe(1);
    expect(rows[0].email).toBe('bob@x.com');
  });

  it('filters bannedOnly', async () => {
    const { users: rows, total } = await UserModel.listUsers(db, { page: 1, pageSize: 10, bannedOnly: true });
    expect(total).toBe(1);
    expect(rows[0].id).toBe('u_carol');
  });
});

describe('UserModel.getUserDetailById', () => {
  beforeEach(seed);

  it('returns a single user detail', async () => {
    const detail = await UserModel.getUserDetailById(db, 'u_alice');
    expect(detail?.email).toBe('alice@x.com');
    expect(detail?.role).toBe('admin');
  });

  it('returns undefined for missing user', async () => {
    const detail = await UserModel.getUserDetailById(db, 'nope');
    expect(detail).toBeUndefined();
  });
});
