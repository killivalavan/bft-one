This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

> **Windows note:** PowerShell may block `npm.ps1`. Run scripts via `cmd /c "npm run typecheck"` (or `cmd /c "npm run dev"`).

## Authentication & Super Admin Security (CounterCub)

### Account types and where they sign in

| Account | Sign-in URL | Controlled by (`public.profiles`) |
|---|---|---|
| Platform Super Admin | `https://app.countercub.com/super-admin-login` (password + mandatory TOTP 2FA) | `is_super_admin = true`, `business_id = null` |
| Store Admin | `https://<store-slug>.countercub.com/login` | `is_admin = true`, `is_super_admin = false`, `business_id = <store id>` |
| Staff / Employee | `https://<store-slug>.countercub.com/login` | `is_admin = false`, `business_id = <store id>` |

- Passwords live in Supabase Auth (`auth.users`, hashed — they cannot be read back, only reset).
- Roles come **only** from `public.profiles` flags — there are no hardcoded admin emails.
- **Use separate accounts for Super Admin and store work.** Store login pages deliberately block any account with `is_super_admin = true` and send it to the platform portal. If a store owner sees the "Platform Administrator" card on their store login, their account has `is_super_admin = true` — set it to `false`.
- If a Store Admin sees the staff "Employee Hub" instead of the Command Center, check that `profiles.is_admin = true` for that user.

### Super Admin 2FA (mandatory)

Login flow (`app/super-admin/login/page.tsx`):
1. Email + password → Supabase Auth.
2. `is_super_admin` verified via `/api/user/me`.
3. **Verified TOTP device exists** → 6-digit code required → session becomes **AAL2**.
4. **No verified device** → QR enrollment is forced; dashboard stays locked until a code is verified. Abandoned (unverified) enrollments are deleted automatically.

Enforcement layers:
- **Server (authoritative):** `lib/auth/serverAuth.ts` → `authenticateRequest({ requireSuperAdmin: true })` rejects non-AAL2 tokens with `403 { mfaRequired: true }`. Every privileged `/api/super-admin/*` route uses it. Never pass `requireAAL2: false` on a route that changes data.
- **UI:** `app/(protected)/layout.tsx` and `app/(protected)/super-admin/page.tsx` redirect AAL1 sessions to `/super-admin-login`.
- **Routing:** `middleware.ts` / `lib/tenant/wildcardRouter.ts` block `/api/super-admin/*` on store subdomains.

> Supabase quirk: `auth.mfa.listFactors().totp` returns **only verified** factors. To find unverified/abandoned factors use `listFactors().all` filtered by `factor_type === "totp"`.

### Managing 2FA devices (backup authenticator)

In `app.countercub.com`, open the top-right account menu (`Support`) and click **Manage 2FA** (`components/super-admin/ManageMfaModal.tsx`):
- **Add Device** — name it, scan the QR with a second phone or password manager, verify its 6-digit code. **Always keep at least two devices.**
- **Remove a device** — requires a fresh code from a *different* device, and the last device can never be removed (2FA cannot be switched off from the app).

### Lost authenticator (all devices lost)

There is intentionally **no** in-app/login-screen 2FA reset (a stolen password alone must never disable 2FA). Recovery is out-of-band:
1. Supabase Dashboard → **Authentication → Users** → select the Super Admin.
2. Delete the user's MFA factor(s).
3. Sign in at `/super-admin-login` → the QR enrollment screen appears → set up the new device, then add a backup via **Manage 2FA**.

### Passwords

- **Change (signed in):** Super Admin → top-right account menu → **Change Password** (policy: ≥10 chars, upper, lower, digit, symbol). Store users → `/profile`.
- **Forgot password:** "Forgot password?" link on both login pages emails a reset link to `/reset-password` (`app/reset-password/page.tsx`). After resetting, Super Admins still must pass 2FA.
- **Required Supabase setting:** Dashboard → Authentication → URL Configuration → Redirect URLs must include `https://app.countercub.com/reset-password` and `https://*.countercub.com/reset-password`.
- **Admin resets:** Super Admin can reset a Store Admin's password from the dashboard; Store Admins reset staff passwords in **Users & Roles**.

### Changing which account is Super Admin

1. Create the new user in Supabase Dashboard → Authentication → Users (tick *Auto Confirm User*).
2. In `public.profiles` for that user set `is_super_admin = true`, `is_admin = true`, `business_id = null`.
3. Sign in at `/super-admin-login` and complete 2FA enrollment.
4. Only after confirming the new account works, set `is_super_admin = false` on the old account.

Admin scripts that touch Supabase must use `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` **server-side/locally only** — never in browser code.

### Security tests

```bash
node --test tests/security/phase7-super-admin-mfa.test.mjs tests/security/phase1-auth-and-hostname.test.mjs tests/security/phase4-wildcard-routing.test.mjs tests/security/phase5-rebranding-and-ui.test.mjs
cmd /c "npm run typecheck"
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
