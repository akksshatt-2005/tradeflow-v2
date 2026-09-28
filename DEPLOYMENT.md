# Trade Flow v2 — Deployment & Operations Guide (Phase 0: Foundation)

This document provides step-by-step instructions for deploying and running **Trade Flow v2** on **Render**, **Supabase (PostgreSQL)**, and **Vercel** with zero-downtime, database-backed authentication, Prisma migrations, and free-tier optimization.

---

## 🗺️ Architecture & Free-Tier Plan Facts

| Service | Tier | Region (Rule A2 & F7) | Purpose | Operational Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Render** | Free (Dev/Test) / Starter (Prod) | **Singapore** (`singapore`) | Node.js Express + TypeScript API | Free sleeps after 15m idle; pre-warmed on load + cron-job during shop hours |
| **Supabase** | Free (Dev/Test) / Pro (Prod) | **Singapore** (`ap-southeast-1`) or **Mumbai** (`ap-south-1`) | PostgreSQL Database | Pooled (`DATABASE_URL`, `pgbouncer=true`) + Direct (`DIRECT_URL`) |
| **Vercel** | Hobby (Dev/Test) / Pro (Prod) | Global Edge | React + Vite + TypeScript Frontend | Pure static build; direct single-hop `VITE_API_URL` |

---

## 1. Database Creation (Supabase PostgreSQL)

1. Open **[Supabase Dashboard](https://supabase.com)** and log in.
2. Click **New Project**:
   - **Name:** `tradeflow-v2-db`
   - **Database Password:** *(Save this password securely)*
   - **Region:** `Singapore (ap-southeast-1)` or `Mumbai (ap-south-1)` *(Cannot be changed later)*
   - **Plan:** Free
3. Wait for the database to provision.
4. Go to **Project Settings** -> **Database** -> **Connection string**:
   - **Pooled connection string (for `DATABASE_URL`):**
     - Mode: **Transaction** (Port `6543`)
     - Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - **Direct connection string (for `DIRECT_URL`):**
     - Mode: **Session** (Port `5432`)
     - Format: `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`

---

## 2. Render Web Service Deployment (Backend)

1. Open **[Render Dashboard](https://render.com)** and log in.
2. Click **New +** -> **Web Service**.
3. Select your repository (`medicine data base sooftware` / `tradeflow-v2`).
4. Configure service parameters:
   - **Name:** `tradeflow-api`
   - **Region:** `Singapore` (Rule A2 & F7)
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build` (Rule D1)
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` (or `Starter` for production)
5. Click **Advanced** -> **Add Environment Variable**:

| Variable Name | Example / Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres.[REF]:[PW]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | Pooled Postgres connection (Rule A3) |
| `DIRECT_URL` | `postgresql://postgres.[REF]:[PW]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` | Direct Postgres connection for Prisma migrations (Rule A3 & D1) |
| `JWT_SECRET` | `[A_STRONG_RANDOM_SECRET_KEY]` | Secret key for 15-minute access JWT verification (Rule B2) |
| `HEARTBEAT_KEY` | `[A_SECRET_HEARTBEAT_KEY]` | Key to authorize Supabase anti-pause heartbeats (Rule F4) |
| `ALLOWED_ORIGINS` | `https://tradeflow.vercel.app,http://localhost:3000` | Exact origins allowed by CORS (Rule B7) |
| `NODE_ENV` | `production` | Production environment |
| `PORT` | `10000` | Render listening port |

6. Click **Deploy Web Service**.
7. Copy your backend service URL (e.g., `https://tradeflow-api.onrender.com`).

---

## 3. Vercel Frontend Deployment (Rule A4 & F8)

1. Open **[Vercel Dashboard](https://vercel.com)** and log in.
2. Click **Add New...** -> **Project** and import your repository.
3. Configure project settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Expand **Environment Variables**:

| Variable Name | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://tradeflow-api.onrender.com` | Direct backend API URL (Rule A4 - Build fails if missing) |

5. Click **Deploy**.
6. Note your frontend URL (e.g. `https://tradeflow.vercel.app`) and add it to `ALLOWED_ORIGINS` in Render!

---

## 4. cron-job.org Setup for Free Plans (Rule F5)

To conserve the shared 750 free Render hours while eliminating cold starts during shop hours:

### Job 1: Pre-Warm & Keep-Alive (Shop Hours: 9:00 to 21:00 IST)
1. Go to **[cron-job.org](https://cron-job.org)** and click **Create Cronjob**.
2. **Title:** `TradeFlow Render Shop Hours Keep-Alive`
3. **URL:** `https://tradeflow-api.onrender.com/health`
4. **Schedule:** Cron expression `*/10 3-15 * * *` *(Every 10 min between 03:30 UTC and 15:30 UTC = 09:00 to 21:00 IST)*.
5. **Request Method:** `GET`
6. Click **Create**.

### Job 2: Supabase Daily Anti-Pause Heartbeat (Rule F4 & F5)
1. Click **Create Cronjob**.
2. **Title:** `TradeFlow Supabase Heartbeat`
3. **URL:** `https://tradeflow-api.onrender.com/health/heartbeat`
4. **Schedule:** `Every day at 10:00 AM IST` (Expression: `30 4 * * *`).
5. **Request Method:** `GET`
6. Click **Headers** -> **Add Header**:
   - **Header Name:** `x-heartbeat-key`
   - **Header Value:** `[YOUR_HEARTBEAT_KEY]`
7. Click **Create**.

---

## 5. Laptop Database Backups & CLI Utilities (Rule B6 & F6)

### Weekly Database Backup
Run this on your laptop once a week:
```bash
npm run db:backup
```
- Exports all tables to timestamped files in `./backups/`.
- Summary table shows row counts.

### Database Restore
To restore into a fresh database:
```bash
npm run db:restore
```

### Password Reset & Session Revocation CLI (Rule B6)
To reset a user password without emailing or hardcoding secrets:
```bash
# Prompts for new password interactively, updates DB, and revokes all active sessions
npm run user:reset-password -- <username>

# Revokes all active refresh tokens for a user
npm run user:revoke-sessions -- <username>
```

> [!CAUTION]
> **🔒 Security Reminder:** Your GitHub repository MUST remain **PRIVATE** to protect schemas, database connection strings, and backups.

---

## 6. Verification on Live URLs (Phase 0 Definition of Done)

Once deployed, verify the live installation:
1. **Sign Up & Login:** Sign up as a new user, log out, log in, refresh the page -> user remains logged in.
2. **Multi-Company:** Create two companies and switch between them -> switcher shows active company across refreshes.
3. **Isolation:** Log in as a second user -> verify they cannot see the first user's companies.
4. **Rate Limit:** Enter wrong password 5 times -> locked message appears with minutes remaining.
5. **Cold-start test:** Leave site idle for 20+ minutes, reload -> server wake-up banner appears with progress bar and request succeeds without error.
6. **Health Check:** `GET /health` version matches the latest commit on GitHub.

---

## 7. Upgrade Checklist (Going Live / Commercial Use) (Rule F9)

When transitioning to commercial production:

### Step 1: Render Starter ($7/month)
- Upgrade Render instance from `Free` to `Starter`.
- **Action:** Delete Job 1 in cron-job.org (pings are no longer needed).

### Step 2: Supabase Pro ($25/month)
- Upgrade Supabase project to `Pro`.
- **Benefit:** Automated backups with 7-day point-in-time recovery; no 7-day inactivity pause.
- **Action:** Delete Job 2 in cron-job.org.

### Step 3: Vercel Pro ($20/month) or Cloudflare Pages (Free)
- Upgrade Vercel to Pro or deploy static `dist` to Cloudflare Pages.

### 📝 Code Changes Required
**Zero code changes.** Only delete the pings on cron-job.org.
