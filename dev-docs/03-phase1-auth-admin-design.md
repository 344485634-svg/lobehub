# Phase 1 Design: User Auth + Admin Management

**Date**: 2026-07-20
**Product**: LM Studio (LobeChat fork)
**Approach**: Enable + Extend (Approach A)
**Estimated effort**: 1–1.5 weeks

---

## Overview

Enable open registration with mandatory email verification using the existing Better Auth
infrastructure, and add a minimal `/admin` route for user management (list, ban, role).
No auth logic is rebuilt; we wire SMTP, activate email verification config, and add new
admin-only routes/API on top of what already exists.

---

## 1. Authentication Flow

### What already exists (no rebuild needed)

- `getVerificationEmailTemplate` email template (`src/libs/better-auth/email-templates/`)
- `AUTH_EMAIL_VERIFICATION` env var defined in `authEnv`
- `emailOTP` and `magicLink` plugins imported in `define-config.ts`
- Login/registration UI at `src/features/Auth/`
- Auth middleware checking `user.emailVerified` at `src/app/(backend)/middleware/auth/`

### Changes required

**1a. SMTP transport — `apps/server/src/services/email.ts`**

Add Nodemailer SMTP transport alongside any existing transport. Read new env vars:

```
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@your-domain.com
SMTP_PASS=<password>
SMTP_FROM="LM Studio <noreply@your-domain.com>"
```

Expose a `sendVerificationEmail(to: string, verificationUrl: string)` method that
uses `getVerificationEmailTemplate`.

**1b. Enable email verification — `src/libs/better-auth/define-config.ts`**

Add `emailVerification` config block inside `betterAuth({...})`:

```typescript
emailVerification: {
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  sendVerificationEmail: async ({ user, url }) => {
    await emailService.sendVerificationEmail(user.email, url);
  },
}
```

**1c. New env vars in `.env.local`**

```
ENABLE_BUSINESS_FEATURES=1
AUTH_EMAIL_VERIFICATION=1
SMTP_HOST=...
SMTP_PORT=...
SMTP_SECURE=...
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

### Registration flow (end-to-end)

```
User submits email + password
  → Better Auth creates user (emailVerified = false)
  → Sends verification email via SMTP
  → UI shows "Please check your inbox" screen

User clicks link in email
  → Better Auth marks emailVerified = true, signs user in
  → Redirects to main app (/)

Unverified user attempts to access protected route
  → Existing auth middleware detects emailVerified = false
  → Redirects to /signin?reason=unverified with explanatory banner
```

---

## 2. Admin Route Structure

### Directory layout (new files)

```
src/routes/(main)/admin/
├── _layout/
│   ├── index.tsx         # Admin layout wrapper with role guard
│   └── Sidebar.tsx       # Admin sidebar nav
├── index.tsx             # Dashboard (stats cards — minimal for Phase 1)
└── users/
    ├── index.tsx         # User list (search + pagination + actions)
    └── [id]/
        └── index.tsx     # User detail view
```

### Permission guard (two layers)

**Server-side** — `src/app/(backend)/middleware/auth/index.ts`
Add a check for `/admin/*` paths: if `user.role !== 'admin'`, return 403 and redirect
to `/`. Check is `ctx.user.role === 'admin'` (the `admin` Better Auth plugin is already
imported but does not directly expose a `requireAdmin` helper — validate role inline).

**Client-side** — `admin/_layout/index.tsx`
Read session; if `user.role !== 'admin'`, call `router.push('/')` immediately.
This prevents flash-of-admin-content before the server middleware runs.

### Navigation entry point

In `src/routes/(main)/settings/hooks/useCategory.tsx`, add a single Admin item
inside the System group, gated by `user.role === 'admin'`. Invisible to regular users,
zero impact on existing navigation.

### Bootstrapping the first admin

After deployment, run once:
```sql
UPDATE users SET role = 'admin' WHERE email = '<your-email>';
```

Subsequent admin promotions are done through the admin UI.

---

## 3. Admin tRPC API

### New file: `apps/server/src/routers/lambda/admin.ts`

All procedures use `adminProcedure` (extends `wsCompatProcedure`, validates
`ctx.user.role === 'admin'` before execution).

| Procedure | Input | Output | Notes |
|---|---|---|---|
| `listUsers` | `{ page, pageSize, search?, bannedOnly? }` | `{ users, total }` | Search on email + username |
| `getUserDetail` | `{ userId }` | `{ user, emailVerified, lastActiveAt }` | |
| `banUser` | `{ userId, reason, expiresAt? }` | `{ success }` | Sets `banned=true`, `ban_reason`, `ban_expires` |
| `unbanUser` | `{ userId }` | `{ success }` | Clears ban fields |
| `updateUserRole` | `{ userId, role: 'admin'\|'user' }` | `{ success }` | |

**Safety invariants**:
- All write procedures check `input.userId !== ctx.user.id` (cannot act on yourself)
- All reads/writes go through `UserModel` in `packages/database/src/models/user.ts`.
  Note: a `listUsers(page, pageSize, search?, bannedOnly?)` method does not yet exist
  and must be added to `UserModel` as part of this phase.
- Router is registered in `apps/server/src/routers/lambda/index.ts` under the key `admin`

### Frontend data layer

Use `useSWR` + `lambdaClient.admin.*` directly in page components — no new zustand
slice needed for Phase 1. Keeps the admin frontend lightweight and easy to reason about.

---

## 4. Error Handling

| Scenario | Handling |
|---|---|
| Unverified email on protected route | Auth middleware → `/signin?reason=unverified` + banner |
| Non-admin accesses `/admin/*` | Server-side 403 → redirect `/`, no admin route revealed |
| SMTP send failure | Registration still succeeds; user sees "Email failed, please contact support"; Better Auth supports resend |
| Banned user attempts login | Better Auth `banned` check returns `"Account suspended: {reason}"`, blocked at auth layer |
| Admin tries to act on own account | Server-side: `userId !== ctx.userId` check → 400 error |

---

## 5. Testing

### Unit tests
- `admin.listUsers`: mock `UserModel.listUsers`, verify pagination/search
- `admin.banUser`: assert banned fields set; assert 400 when acting on self
- `admin.updateUserRole`: assert 400 when acting on self

### Integration tests
- Email verification: mock SMTP transport, assert `sendVerificationEmail` called with
  correct args when user registers
- Banned user login: create banned user fixture, attempt session creation, assert blocked

### Manual acceptance checklist
1. Register with new email → receive verification email → click link → access main app ✓
2. Register but do not verify → attempt to access `/` → redirected with banner ✓
3. Promote user to admin via SQL → navigate to `/admin` → see user list ✓
4. Ban a user from admin UI → log in as that user → see ban message ✓
5. Non-admin visits `/admin` directly → redirected to home, no admin UI visible ✓

---

## 6. Files Changed / Created

| File | Action |
|---|---|
| `apps/server/src/services/email.ts` | Modify — add SMTP transport |
| `src/libs/better-auth/define-config.ts` | Modify — add `emailVerification` block |
| `.env.local` | Modify — add SMTP vars + `ENABLE_BUSINESS_FEATURES=1` + `AUTH_EMAIL_VERIFICATION=1` |
| `packages/business/const/src/index.ts` | Modify — read `ENABLE_BUSINESS_FEATURES` from env instead of hardcoding `false` |
| `src/app/(backend)/middleware/auth/index.ts` | Modify — add admin role check for `/admin/*` |
| `src/routes/(main)/settings/hooks/useCategory.tsx` | Modify — add Admin nav item (role-gated) |
| `apps/server/src/routers/lambda/admin.ts` | Create — admin tRPC router |
| `apps/server/src/routers/lambda/index.ts` | Modify — register admin router |
| `src/routes/(main)/admin/_layout/index.tsx` | Create |
| `src/routes/(main)/admin/_layout/Sidebar.tsx` | Create |
| `src/routes/(main)/admin/index.tsx` | Create |
| `src/routes/(main)/admin/users/index.tsx` | Create |
| `src/routes/(main)/admin/users/[id]/index.tsx` | Create |

---

## 7. Out of Scope (Phase 1)

- Subscription / billing / credits (Phase 2)
- Payment integration (Phase 3)
- API key management (Phase 4)
- Skill / Agent management in admin (Phase 5)
- Bulk user operations or audit log
- Password reset flow (Better Auth has it built-in; just needs SMTP working — verify
  after SMTP wiring, no extra code needed)
