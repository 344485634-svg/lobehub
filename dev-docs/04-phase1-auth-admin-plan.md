# Phase 1: User Auth + Admin Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable open registration with mandatory email verification (already-built Better Auth infra, activated via env) and add a minimal `/admin` route for user management (list, detail, ban/unban, role change).

**Architecture:** This is a **Vite SPA** (routes in `src/spa/router/desktopRouter.config.tsx`, not filesystem routing). Auth verification/SMTP is already fully implemented — Phase 1 activates it via env vars. The admin surface is a new set of SPA pages guarded client-side (layout redirect) and server-side (tRPC `adminProcedure` that fetches the user from DB and checks `role === 'admin'`). Frontend uses `useSWR` + `lambdaClient.admin.*` directly — no new zustand slice.

**Tech Stack:** React Router (SPA), tRPC (lambda router), Drizzle ORM (PostgreSQL), Better Auth, Zustand, `@lobehub/ui`, vitest.

## Global Constraints

- Do NOT modify existing chat / image / video functionality — additive changes only.
- Admin write procedures MUST reject acting on your own account (`input.userId !== ctx.userId` → 400).
- `adminProcedure` fetches the user via `UserModel.findById(ctx.serverDB, ctx.userId)` and checks `role === 'admin'` — tRPC ctx does NOT carry `role`.
- All DB reads/writes go through `UserModel` (`packages/database/src/models/user.ts`) — no raw SQL in the router.
- Admin router registered in `apps/server/src/routers/lambda/index.ts` under key `admin`.
- SPA routes registered in `src/spa/router/desktopRouter.config.tsx` (desktop) — mobile out of scope for Phase 1.
- Follow existing file patterns: layouts use `Outlet`, pages are `default`-exported FCs, `'use client'` at top of route components.
- Commit after every task with a `feat:` / `test:` / `chore:` prefix.

---

## File Structure

**Modify:**
- `packages/business/const/src/index.ts` — `ENABLE_BUSINESS_FEATURES` env-driven
- `packages/types/src/user/preference.ts` — add `role` to `LobeUser`
- `src/layout/AuthProvider/BetterAuth/UserUpdater.tsx` — sync `role` into store
- `src/store/user/slices/auth/selectors.ts` — add `isAdmin` selector
- `packages/database/src/models/user.ts` — add `listUsers` + `getUserDetailById` static methods
- `apps/server/src/routers/lambda/index.ts` — register admin router
- `src/features/User/UserPanel/useMenu.tsx` — add role-gated Admin menu item
- `src/spa/router/desktopRouter.config.tsx` — register `/admin` route block
- `.env.local` — SMTP + feature-flag env vars

**Create:**
- `apps/server/src/routers/lambda/admin.ts` — admin tRPC router + `adminProcedure`
- `apps/server/src/routers/lambda/admin.test.ts` — router unit tests
- `packages/database/src/models/__tests__/user.listUsers.test.ts` — model tests
- `src/routes/(main)/admin/_layout/index.tsx` — layout + client role guard
- `src/routes/(main)/admin/_layout/Sidebar.tsx` — admin sidebar nav
- `src/routes/(main)/admin/_layout/style.ts` — layout styles
- `src/routes/(main)/admin/index.tsx` — dashboard (stat cards)
- `src/routes/(main)/admin/users/index.tsx` — user list
- `src/routes/(main)/admin/users/[id]/index.tsx` — user detail

---

## Task 1: Make `ENABLE_BUSINESS_FEATURES` env-driven

**Files:**
- Modify: `packages/business/const/src/index.ts:7`
- Modify: `.env.local` (repo root)

**Interfaces:**
- Produces: `ENABLE_BUSINESS_FEATURES: boolean` (now reads `process.env.ENABLE_BUSINESS_FEATURES === '1'`)

- [ ] **Step 1: Change the hardcoded constant to read env**

In `packages/business/const/src/index.ts`, replace line 7:

```typescript
export const ENABLE_BUSINESS_FEATURES = process.env.ENABLE_BUSINESS_FEATURES === '1';
```

- [ ] **Step 2: Add env vars to `.env.local`**

Append to `.env.local` (repo root). Use real SMTP credentials for your domain mailbox:

```
# ---- Phase 1: business features + auth ----
ENABLE_BUSINESS_FEATURES=1
AUTH_EMAIL_VERIFICATION=1

# SMTP (Tencent Exmail example — replace with your provider)
EMAIL_SERVICE_PROVIDER=nodemailer
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@your-domain.com
SMTP_PASS=your-smtp-password
SMTP_FROM=LM Studio <noreply@your-domain.com>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 4: Commit**

```bash
git add packages/business/const/src/index.ts
git commit -m "feat: make ENABLE_BUSINESS_FEATURES env-driven"
```

(`.env.local` is gitignored — not committed. Note the new vars in the PR description instead.)

---

## Task 2: Expose user `role` to the frontend

**Files:**
- Modify: `packages/types/src/user/preference.ts:10-19`
- Modify: `src/layout/AuthProvider/BetterAuth/UserUpdater.tsx`
- Modify: `src/store/user/slices/auth/selectors.ts`

**Interfaces:**
- Consumes: `session.user.role` (from Better Auth `adminClient()` + `inferAdditionalFields`)
- Produces:
  - `LobeUser.role?: string | null`
  - `authSelectors.isAdmin(s: UserStore): boolean`

- [ ] **Step 1: Add `role` to `LobeUser`**

In `packages/types/src/user/preference.ts`, add one field to the `LobeUser` interface:

```typescript
export interface LobeUser {
  avatar?: string;
  email?: string | null;
  firstName?: string | null;
  fullName?: string | null;
  id: string;
  interests?: string[];
  latestName?: string | null;
  role?: string | null;
  username?: string | null;
}
```

- [ ] **Step 2: Sync `role` from session into the store**

In `src/layout/AuthProvider/BetterAuth/UserUpdater.tsx`, inside the `useUserStore.setState` user object (the block that sets `email`, `fullName`, `id`, `username`), add the `role` field:

```typescript
          user: {
            ...baseUser,
            // Preserve avatar from settings, don't override with auth provider value
            avatar: baseUser?.avatar || '',
            email: betterAuthUser.email,
            fullName: betterAuthUser.name,
            id: betterAuthUser.id,
            role: (betterAuthUser as { role?: string | null }).role ?? null,
            username: betterAuthUser.username,
          } as LobeUser,
```

- [ ] **Step 3: Add `isAdmin` selector**

In `src/store/user/slices/auth/selectors.ts`, add to the `authSelectors` object:

```typescript
  isAdmin: (s: UserStore) => s.user?.role === 'admin',
```

- [ ] **Step 4: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/user/preference.ts src/layout/AuthProvider/BetterAuth/UserUpdater.tsx src/store/user/slices/auth/selectors.ts
git commit -m "feat: expose user role to frontend store"
```

---

## Task 3: Add `listUsers` + `getUserDetailById` to `UserModel`

**Files:**
- Modify: `packages/database/src/models/user.ts`
- Test: `packages/database/src/models/__tests__/user.listUsers.test.ts`

**Interfaces:**
- Produces (both static methods on `UserModel`):
  ```typescript
  static listUsers = (db: LobeChatDatabase, params: {
    page: number; pageSize: number; search?: string; bannedOnly?: boolean;
  }): Promise<{ total: number; users: AdminUserListItem[] }>

  static getUserDetailById = (db: LobeChatDatabase, id: string): Promise<AdminUserDetail | undefined>
  ```
  where:
  ```typescript
  interface AdminUserListItem {
    id: string; email: string | null; username: string | null; fullName: string | null;
    role: string | null; banned: boolean | null; banReason: string | null;
    banExpires: Date | null; emailVerified: boolean; createdAt: Date; lastActiveAt: Date;
  }
  type AdminUserDetail = AdminUserListItem; // same shape for Phase 1
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/database/src/models/__tests__/user.listUsers.test.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/dbForTest';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/database && npx vitest run src/models/__tests__/user.listUsers.test.ts`
Expected: FAIL with `UserModel.listUsers is not a function`

- [ ] **Step 3: Implement the two static methods**

In `packages/database/src/models/user.ts`, ensure imports include `and`, `count`, `desc`, `eq`, `ilike`, `or` from `drizzle-orm` (add any missing), then add these static methods inside the `UserModel` class (near the other `static` methods):

```typescript
  static listUsers = async (
    db: LobeChatDatabase,
    params: { bannedOnly?: boolean; page: number; pageSize: number; search?: string },
  ) => {
    const { page, pageSize, search, bannedOnly } = params;

    const conditions = [];
    if (search) {
      conditions.push(or(ilike(users.email, `%${search}%`), ilike(users.username, `%${search}%`)));
    }
    if (bannedOnly) {
      conditions.push(eq(users.banned, true));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(where);

    const rows = await db
      .select({
        banExpires: users.banExpires,
        banReason: users.banReason,
        banned: users.banned,
        createdAt: users.createdAt,
        email: users.email,
        emailVerified: users.emailVerified,
        fullName: users.fullName,
        id: users.id,
        lastActiveAt: users.lastActiveAt,
        role: users.role,
        username: users.username,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { total: Number(total), users: rows };
  };

  static getUserDetailById = async (db: LobeChatDatabase, id: string) => {
    const [row] = await db
      .select({
        banExpires: users.banExpires,
        banReason: users.banReason,
        banned: users.banned,
        createdAt: users.createdAt,
        email: users.email,
        emailVerified: users.emailVerified,
        fullName: users.fullName,
        id: users.id,
        lastActiveAt: users.lastActiveAt,
        role: users.role,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return row;
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/database && npx vitest run src/models/__tests__/user.listUsers.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/models/user.ts packages/database/src/models/__tests__/user.listUsers.test.ts
git commit -m "feat: add UserModel.listUsers and getUserDetailById"
```

---

## Task 4: Create `adminProcedure` + admin tRPC router

**Files:**
- Create: `apps/server/src/routers/lambda/admin.ts`
- Test: `apps/server/src/routers/lambda/admin.test.ts`

**Interfaces:**
- Consumes: `UserModel.listUsers`, `UserModel.getUserDetailById`, `UserModel.findById`, `new UserModel(db, userId).updateUser(...)`
- Produces: `adminRouter` with procedures:
  - `listUsers({ page, pageSize, search?, bannedOnly? }) → { total, users }`
  - `getUserDetail({ userId }) → AdminUserDetail`
  - `banUser({ userId, reason, expiresAt? }) → { success: true }`
  - `unbanUser({ userId }) → { success: true }`
  - `updateUserRole({ userId, role: 'admin'|'user' }) → { success: true }`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/routers/lambda/admin.test.ts`:

```typescript
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
    await expect(caller.banUser({ reason: 'x', userId: 'admin_1' })).rejects.toThrow('cannot act on your own');
  });

  it('sets ban fields for another user', async () => {
    const updateUser = vi.fn().mockResolvedValue(undefined);
    vi.mocked(UserModel).mockImplementation(() => ({ updateUser }) as any);
    const caller = adminRouter.createCaller(adminCtx as any);
    const res = await caller.banUser({ reason: 'spam', userId: 'u2' });
    expect(res.success).toBe(true);
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ banReason: 'spam', banned: true }));
  });
});

describe('adminRouter.updateUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
  });

  it('rejects changing your own role', async () => {
    const caller = adminRouter.createCaller(adminCtx as any);
    await expect(caller.updateUserRole({ role: 'user', userId: 'admin_1' })).rejects.toThrow('cannot act on your own');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run src/routers/lambda/admin.test.ts`
Expected: FAIL with `Cannot find module './admin'`

- [ ] **Step 3: Implement the admin router**

Create `apps/server/src/routers/lambda/admin.ts`:

```typescript
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { UserModel } from '@/database/models/user';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const adminProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const currentUser = await UserModel.findById(ctx.serverDB, ctx.userId);
  if (!currentUser || currentUser.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return opts.next({ ctx: { userModel: new UserModel(ctx.serverDB, ctx.userId) } });
});

const assertNotSelf = (targetUserId: string, currentUserId: string) => {
  if (targetUserId === currentUserId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot act on your own account' });
  }
};

export const adminRouter = router({
  banUser: adminProcedure
    .input(z.object({ expiresAt: z.string().optional(), reason: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({
        banExpires: input.expiresAt ? new Date(input.expiresAt) : null,
        banReason: input.reason,
        banned: true,
      });
      return { success: true as const };
    }),

  getUserDetail: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const detail = await UserModel.getUserDetailById(ctx.serverDB, input.userId);
      if (!detail) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return detail;
    }),

  listUsers: adminProcedure
    .input(
      z.object({
        bannedOnly: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return UserModel.listUsers(ctx.serverDB, input);
    }),

  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({ banExpires: null, banReason: null, banned: false });
      return { success: true as const };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ role: z.enum(['admin', 'user']), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({ role: input.role });
      return { success: true as const };
    }),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && npx vitest run src/routers/lambda/admin.test.ts`
Expected: PASS

Note: if `updateUser` typing rejects `banExpires`/`banReason`/`banned`/`role`, confirm `UserItem` (the `Partial<UserItem>` param of `updateUser`) includes those columns — they exist on the `users` schema, so the generated type should allow them.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routers/lambda/admin.ts apps/server/src/routers/lambda/admin.test.ts
git commit -m "feat: add admin tRPC router with role guard"
```

---

## Task 5: Register the admin router

**Files:**
- Modify: `apps/server/src/routers/lambda/index.ts`

**Interfaces:**
- Consumes: `adminRouter` from `./admin`
- Produces: `lambdaRouter.admin` available to `lambdaClient.admin.*`

- [ ] **Step 1: Import the router**

In `apps/server/src/routers/lambda/index.ts`, add the import alongside the other `./` router imports (keep alphabetical grouping — place near `agentRouter`):

```typescript
import { adminRouter } from './admin';
```

- [ ] **Step 2: Register it in the router map**

Find the `createLambdaRouter`/`router({ ... })` call that lists `agent: agentRouter,` etc., and add:

```typescript
  admin: adminRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routers/lambda/index.ts
git commit -m "feat: register admin router in lambda router"
```

---

## Task 6: Add role-gated Admin nav entry

**Files:**
- Modify: `src/features/User/UserPanel/useMenu.tsx`

**Interfaces:**
- Consumes: `authSelectors.isAdmin` (Task 2)
- Produces: an Admin item in the user-panel `settings` menu, visible only when `isAdmin`

- [ ] **Step 1: Import the guard + icon**

In `src/features/User/UserPanel/useMenu.tsx`, add `ShieldCheck` to the existing `lucide-react` import, and read `isAdmin` from the store near the existing `isLogin` read:

```typescript
  const isAdmin = useUserStore(authSelectors.isAdmin);
```

- [ ] **Step 2: Append the role-gated Admin item to `settings`**

In the `settings` array, after the `showMemory` block, add:

```typescript
    ...(isAdmin
      ? [
          {
            icon: <Icon icon={ShieldCheck} />,
            key: 'admin',
            label: <Link to="/admin">{t('userPanel.admin', { defaultValue: 'Admin' })}</Link>,
          },
        ]
      : []),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 4: Commit**

```bash
git add src/features/User/UserPanel/useMenu.tsx
git commit -m "feat: add role-gated admin nav entry"
```

---

## Task 7: Admin layout with client-side role guard

**Files:**
- Create: `src/routes/(main)/admin/_layout/index.tsx`
- Create: `src/routes/(main)/admin/_layout/Sidebar.tsx`
- Create: `src/routes/(main)/admin/_layout/style.ts`

**Interfaces:**
- Consumes: `authSelectors.isAdmin`, `authSelectors.isLoaded`
- Produces: `DesktopAdminLayout` default export (redirects non-admins to `/`)

- [ ] **Step 1: Create the layout style**

Create `src/routes/(main)/admin/_layout/style.ts`:

```typescript
import { createStyles } from 'antd-style';

export const useStyles = createStyles(({ css, token }) => ({
  mainContainer: css`
    overflow: hidden auto;
    background: ${token.colorBgLayout};
  `,
}));
```

- [ ] **Step 2: Create the sidebar**

Create `src/routes/(main)/admin/_layout/Sidebar.tsx`:

```typescript
'use client';

import { Flexbox } from '@lobehub/ui';
import { Icon } from '@lobehub/ui';
import { LayoutDashboard, Users } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';

const Sidebar = memo(() => {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();

  const items = [
    { icon: LayoutDashboard, key: '/admin', label: t('admin.dashboard', { defaultValue: 'Dashboard' }) },
    { icon: Users, key: '/admin/users', label: t('admin.users', { defaultValue: 'Users' }) },
  ];

  return (
    <Flexbox gap={4} padding={12} style={{ width: 220 }}>
      {items.map((item) => (
        <Link key={item.key} to={item.key} style={{ color: 'inherit' }}>
          <Flexbox
            horizontal
            align="center"
            gap={8}
            padding={8}
            style={{
              background: pathname === item.key ? 'var(--lobe-color-fill-tertiary)' : undefined,
              borderRadius: 8,
            }}
          >
            <Icon icon={item.icon} />
            {item.label}
          </Flexbox>
        </Link>
      ))}
    </Flexbox>
  );
});

Sidebar.displayName = 'AdminSidebar';

export default Sidebar;
```

- [ ] **Step 3: Create the layout with role guard**

Create `src/routes/(main)/admin/_layout/index.tsx`:

```typescript
'use client';

import { Flexbox } from '@lobehub/ui';
import { type FC, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';

import Loading from '@/components/Loading/BrandTextLoading';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import Sidebar from './Sidebar';
import { useStyles } from './style';

const DesktopAdminLayout: FC = () => {
  const { styles } = useStyles();
  const navigate = useNavigate();
  const isLoaded = useUserStore(authSelectors.isLoaded);
  const isAdmin = useUserStore(authSelectors.isAdmin);

  useEffect(() => {
    if (isLoaded && !isAdmin) navigate('/', { replace: true });
  }, [isLoaded, isAdmin, navigate]);

  if (!isLoaded) return <Loading debugId="AdminLayout" />;
  if (!isAdmin) return null;

  return (
    <>
      <Sidebar />
      <Flexbox className={styles.mainContainer} flex={1} height="100%">
        <Outlet />
      </Flexbox>
    </>
  );
};

export default DesktopAdminLayout;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(main)/admin/_layout"
git commit -m "feat: add admin layout with client-side role guard"
```

---

## Task 8: Admin dashboard page

**Files:**
- Create: `src/routes/(main)/admin/index.tsx`

**Interfaces:**
- Consumes: `lambdaClient.admin.listUsers`
- Produces: `AdminDashboard` default export

- [ ] **Step 1: Create the dashboard**

Create `src/routes/(main)/admin/index.tsx`:

```typescript
'use client';

import { Flexbox } from '@lobehub/ui';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import StatisticCard from '@/components/StatisticCard';
import { lambdaClient } from '@/libs/trpc/client';

const AdminDashboard: FC = () => {
  const { t } = useTranslation('common');
  const { data, isLoading } = useSWR('admin-stats-total', () =>
    lambdaClient.admin.listUsers.query({ page: 1, pageSize: 1 }),
  );
  const { data: banned } = useSWR('admin-stats-banned', () =>
    lambdaClient.admin.listUsers.query({ bannedOnly: true, page: 1, pageSize: 1 }),
  );

  if (isLoading) return <Loading debugId="AdminDashboard" />;

  return (
    <Flexbox horizontal gap={16} padding={24} wrap="wrap">
      <StatisticCard title={t('admin.totalUsers', { defaultValue: 'Total users' })} value={data?.total ?? 0} />
      <StatisticCard title={t('admin.bannedUsers', { defaultValue: 'Banned users' })} value={banned?.total ?? 0} />
    </Flexbox>
  );
};

export default AdminDashboard;
```

Note: confirm `@/components/StatisticCard` default export accepts `{ title, value }`. If its prop names differ, adapt to its actual interface (it lives at `src/components/StatisticCard/index.tsx`). If props don't match cleanly, render a plain `<Flexbox>` card with the label and number instead.

- [ ] **Step 2: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(main)/admin/index.tsx"
git commit -m "feat: add admin dashboard page"
```

---

## Task 9: Admin user list page

**Files:**
- Create: `src/routes/(main)/admin/users/index.tsx`

**Interfaces:**
- Consumes: `lambdaClient.admin.listUsers`, `lambdaClient.admin.banUser`, `lambdaClient.admin.unbanUser`, `lambdaClient.admin.updateUserRole`
- Produces: `AdminUsersPage` default export

- [ ] **Step 1: Create the user list page**

Create `src/routes/(main)/admin/users/index.tsx`:

```typescript
'use client';

import { ActionIcon, Flexbox, Input } from '@lobehub/ui';
import { App, Button, Table, Tag } from 'antd';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminUsersPage: FC = () => {
  const { t } = useTranslation('common');
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(
    ['admin-users', page, search],
    () => lambdaClient.admin.listUsers.query({ page, pageSize, search: search || undefined }),
  );

  const ban = async (userId: string) => {
    const reason = window.prompt(t('admin.banReasonPrompt', { defaultValue: 'Ban reason:' }));
    if (reason === null) return;
    await lambdaClient.admin.banUser.mutate({ reason: reason || 'N/A', userId });
    message.success(t('admin.banned', { defaultValue: 'User banned' }));
    mutate();
  };

  const unban = async (userId: string) => {
    await lambdaClient.admin.unbanUser.mutate({ userId });
    message.success(t('admin.unbanned', { defaultValue: 'User unbanned' }));
    mutate();
  };

  const toggleRole = async (userId: string, current: string | null) => {
    const role = current === 'admin' ? 'user' : 'admin';
    modal.confirm({
      content: t('admin.confirmRole', { defaultValue: `Set role to ${role}?`, role }),
      onOk: async () => {
        await lambdaClient.admin.updateUserRole.mutate({ role, userId });
        message.success(t('admin.roleUpdated', { defaultValue: 'Role updated' }));
        mutate();
      },
    });
  };

  const columns = [
    {
      dataIndex: 'email',
      key: 'email',
      render: (email: string, row: any) => <Link to={`/admin/users/${row.id}`}>{email || row.username || row.id}</Link>,
      title: t('admin.email', { defaultValue: 'Email' }),
    },
    {
      dataIndex: 'role',
      key: 'role',
      render: (role: string | null) => <Tag color={role === 'admin' ? 'gold' : 'default'}>{role || 'user'}</Tag>,
      title: t('admin.role', { defaultValue: 'Role' }),
    },
    {
      dataIndex: 'banned',
      key: 'banned',
      render: (banned: boolean | null) =>
        banned ? <Tag color="red">{t('admin.bannedTag', { defaultValue: 'Banned' })}</Tag> : null,
      title: t('admin.status', { defaultValue: 'Status' }),
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={8}>
          {row.banned ? (
            <Button size="small" onClick={() => unban(row.id)}>
              {t('admin.unban', { defaultValue: 'Unban' })}
            </Button>
          ) : (
            <Button danger size="small" onClick={() => ban(row.id)}>
              {t('admin.ban', { defaultValue: 'Ban' })}
            </Button>
          )}
          <Button size="small" onClick={() => toggleRole(row.id, row.role)}>
            {row.role === 'admin'
              ? t('admin.demote', { defaultValue: 'Demote' })
              : t('admin.promote', { defaultValue: 'Promote' })}
          </Button>
        </Flexbox>
      ),
      title: t('admin.actions', { defaultValue: 'Actions' }),
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Input
        placeholder={t('admin.searchPlaceholder', { defaultValue: 'Search email or username' })}
        style={{ maxWidth: 320 }}
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
      />
      <Table
        columns={columns}
        dataSource={data?.users ?? []}
        loading={isLoading}
        pagination={{
          current: page,
          onChange: setPage,
          pageSize,
          total: data?.total ?? 0,
        }}
        rowKey="id"
      />
    </Flexbox>
  );
};

export default AdminUsersPage;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(main)/admin/users/index.tsx"
git commit -m "feat: add admin user list page"
```

---

## Task 10: Admin user detail page

**Files:**
- Create: `src/routes/(main)/admin/users/[id]/index.tsx`

**Interfaces:**
- Consumes: `lambdaClient.admin.getUserDetail`, route param `id`
- Produces: `AdminUserDetailPage` default export

- [ ] **Step 1: Create the detail page**

Create `src/routes/(main)/admin/users/[id]/index.tsx`:

```typescript
'use client';

import { Descriptions, Tag } from 'antd';
import { Flexbox } from '@lobehub/ui';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { lambdaClient } from '@/libs/trpc/client';

const AdminUserDetailPage: FC = () => {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useSWR(id ? ['admin-user', id] : null, () =>
    lambdaClient.admin.getUserDetail.query({ userId: id! }),
  );

  if (isLoading || !data) return <Loading debugId="AdminUserDetail" />;

  return (
    <Flexbox padding={24}>
      <Descriptions bordered column={1} title={data.email || data.username || data.id}>
        <Descriptions.Item label={t('admin.email', { defaultValue: 'Email' })}>{data.email}</Descriptions.Item>
        <Descriptions.Item label={t('admin.username', { defaultValue: 'Username' })}>{data.username}</Descriptions.Item>
        <Descriptions.Item label={t('admin.role', { defaultValue: 'Role' })}>
          <Tag color={data.role === 'admin' ? 'gold' : 'default'}>{data.role || 'user'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('admin.emailVerified', { defaultValue: 'Email verified' })}>
          {data.emailVerified ? '✓' : '✗'}
        </Descriptions.Item>
        <Descriptions.Item label={t('admin.status', { defaultValue: 'Status' })}>
          {data.banned ? <Tag color="red">{data.banReason || 'Banned'}</Tag> : t('admin.active', { defaultValue: 'Active' })}
        </Descriptions.Item>
        <Descriptions.Item label={t('admin.createdAt', { defaultValue: 'Registered' })}>
          {new Date(data.createdAt).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label={t('admin.lastActive', { defaultValue: 'Last active' })}>
          {new Date(data.lastActiveAt).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>
    </Flexbox>
  );
};

export default AdminUserDetailPage;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(main)/admin/users/[id]/index.tsx"
git commit -m "feat: add admin user detail page"
```

---

## Task 11: Register admin routes in the SPA router

**Files:**
- Modify: `src/spa/router/desktopRouter.config.tsx`

**Interfaces:**
- Consumes: the admin layout + pages from Tasks 7-10
- Produces: `/admin`, `/admin/users`, `/admin/users/:id` routes under the main layout

- [ ] **Step 1: Add the admin route block**

In `src/spa/router/desktopRouter.config.tsx`, find the `// Memory routes` block (the object with `path: 'memory'`). Immediately after that object (as a sibling in the same children array), insert:

```typescript
  // Admin routes
  {
    children: [
      {
        element: dynamicElement(() => import('@/routes/(main)/admin'), 'Desktop > Admin > Dashboard'),
        index: true,
      },
      {
        element: dynamicElement(
          () => import('@/routes/(main)/admin/users'),
          'Desktop > Admin > Users',
        ),
        path: 'users',
      },
      {
        element: dynamicElement(
          () => import('@/routes/(main)/admin/users/[id]'),
          'Desktop > Admin > User Detail',
        ),
        path: 'users/:id',
      },
    ],
    element: dynamicLayout(() => import('@/routes/(main)/admin/_layout'), 'Desktop > Admin > Layout'),
    errorElement: <ErrorBoundary />,
    path: 'admin',
  },
```

- [ ] **Step 2: Typecheck**

Run: `pnpm type-check`
Expected: `error TS: 0`

- [ ] **Step 3: Verify the sync test still passes**

Run: `cd /Users/a1234/project/lobehub && npx vitest run src/spa/router/desktopRouter.sync.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "src/spa/router/desktopRouter.config.tsx"
git commit -m "feat: register admin routes in SPA router"
```

---

## Task 12: Bootstrap admin + manual acceptance

**Files:** none (operational)

- [ ] **Step 1: Promote yourself to admin**

```bash
docker exec -i lobe-postgres psql -U postgres -d lobechat -c "UPDATE users SET role='admin' WHERE email='344485634@qq.com';"
```

(Adjust DB name / container / email as needed. Confirm the container name via `docker ps`.)

- [ ] **Step 2: Restart dev server so SMTP + feature-flag env load**

```bash
# stop the running dev server, then:
pnpm dev
```

- [ ] **Step 3: Manual acceptance checklist**

1. Hard-refresh → user panel shows an **Admin** entry (you're admin) ✓
2. Click Admin → `/admin` dashboard shows total/banned user counts ✓
3. `/admin/users` → list renders, search works, pagination works ✓
4. Ban a *different* test user → they see the ban message on next login ✓
5. Promote/demote a *different* user → role tag updates ✓
6. Try to ban yourself → blocked with "cannot act on your own account" ✓
7. Register a brand-new email → verification email arrives via SMTP → click link → lands in app ✓
8. Register but don't verify → blocked from app (verification required) ✓
9. Log in as a non-admin → `/admin` (typed directly) redirects to `/`, and `admin.listUsers` returns FORBIDDEN ✓

- [ ] **Step 4: Full typecheck + affected tests**

```bash
pnpm type-check
cd apps/server && npx vitest run src/routers/lambda/admin.test.ts
cd packages/database && npx vitest run src/models/__tests__/user.listUsers.test.ts
```
Expected: all pass, `error TS: 0`

---

## Self-Review Notes

- **Spec §1 (auth/SMTP):** already built → Task 1 (env) + Task 12 (verify). ✓
- **Spec §2 (admin routes/guard):** Tasks 7 (client guard) + 11 (routing) + 4 (server guard). Corrected: guard is client-layout + tRPC, NOT `(backend)/middleware/auth` (that's API-only). ✓
- **Spec §2 (nav entry):** Task 6 — placed in user-panel `useMenu` (role-gated), not settings `useCategory`, since `/admin` is its own route, not a settings tab. ✓
- **Spec §2 (bootstrap admin):** Task 12. ✓
- **Spec §3 (admin API + UserModel.listUsers):** Tasks 3 + 4 + 5. ✓
- **Spec §3 (frontend useSWR, no zustand):** Tasks 8-10 use `useSWR` + `lambdaClient.admin.*`. ✓
- **Spec §4 (error handling):** self-ban 400 (Task 4), non-admin FORBIDDEN (Task 4) + redirect (Task 7), banned login (Better Auth built-in). ✓
- **Spec §5 (tests):** Task 3 (model), Task 4 (router guard + self-ban), Task 12 (manual). ✓
- **Type consistency:** `AdminUserListItem` shape defined in Task 3 is consumed unchanged in Tasks 8-10; `isAdmin`/`role` defined Task 2, consumed Tasks 6-7. ✓
