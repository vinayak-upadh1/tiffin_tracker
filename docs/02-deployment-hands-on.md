# Deploy Tiffin Tracker: Hands-On Step-by-Step Guide

> **Companion to:** [Deployment & CI/CD: The Complete Fundamentals Guide](./01-deployment-fundamentals.md)
>
> **Goal:** Get Tiffin Tracker live on Railway (backend + MySQL) + Vercel (frontend) with a full GitHub Actions CI/CD pipeline, from scratch, using only free-tier services.
>
> **Time estimate:** 2–3 hours for the first time. Future deploys: a git push.

---

## Table of Contents

- [Phase 0 — Pre-Deployment Checklist](#phase-0--pre-deployment-checklist)
- [Phase 1 — Deploy the Database (Railway MySQL)](#phase-1--deploy-the-database-railway-mysql)
- [Phase 2 — Deploy the Backend (Railway FastAPI)](#phase-2--deploy-the-backend-railway-fastapi)
- [Phase 3 — Deploy the Frontend (Vercel)](#phase-3--deploy-the-frontend-vercel)
- [Phase 4 — Wire CORS and Cookies](#phase-4--wire-cors-and-cookies)
- [Phase 5 — Build the CI/CD Pipeline (GitHub Actions)](#phase-5--build-the-cicd-pipeline-github-actions)
- [Phase 6 — Branch Protection + PR Workflow](#phase-6--branch-protection--pr-workflow)
- [Phase 7 — Database Migration Safety in CI/CD](#phase-7--database-migration-safety-in-cicd)
- [Phase 8 — Verifying the Full Pipeline](#phase-8--verifying-the-full-pipeline)
- [Phase 9 — Monitoring & Observability](#phase-9--monitoring--observability)
- [Phase 10 — Custom Domain (Optional but Recommended)](#phase-10--custom-domain-optional-but-recommended)

---

## Phase 0 — Pre-Deployment Checklist

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: Environments & Env Vars (Doc 1, §2)           │
│  What you're doing here: Verifying the app is production-    │
│  ready before introducing deployment complexity.             │
│  Standard practice: A pre-deploy checklist or "Definition    │
│  of Done" that every engineer runs before merging to main.   │
│  Our approach: Manual checklist on your first deploy; later  │
│  the CI pipeline enforces the important parts automatically. │
└──────────────────────────────────────────────────────────────┘
```

Work through every item. Don't skip.

### 0.1 — Verify the backend starts locally

```bash
cd tiffin_tracker_backend

# Create a virtual environment if you don't have one
python3.11 -m venv venv
source venv/bin/activate

# Install all dependencies
pip install -r requirements.txt

# Verify your .env file has all required variables
# (see the list below — any missing variable will cause startup to fail)
cat .env
```

Your `.env` must have these variables set (with real or test values):

```dotenv
DATABASE_URL=mysql+aiomysql://root:@localhost:3306/tiffin_dev
SECRET_KEY=your-256-bit-hex-string-here
ALGORITHM=HS256
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=
CORS_ORIGINS=["http://localhost:5173"]
RAZORPAY_KEY_ID=rzp_test_yourkeyhere
RAZORPAY_KEY_SECRET=your_razorpay_test_secret
DEBUG=true
```

Start the server:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Confirm in another terminal:
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","app":"Tiffin Tracker API"}
```

If this fails, **fix it before proceeding**. Deployment doesn't fix broken code — it just makes broken code inaccessible to users instead of developers.

### 0.2 — Verify the frontend builds without errors

```bash
cd tiffin_tracker_app
npm install
npm run build
```

This runs `tsc -b && vite build`. You must see `✓ built in Xms` with no errors. TypeScript type errors will fail this build — fix them all. The `dist/` folder must be created.

```bash
ls dist/
# Should show: index.html  assets/
```

### 0.3 — Confirm migrations exist and are in order

```bash
cd tiffin_tracker_backend
ls alembic/versions/
```

You should see your four migration files:
```
220dc9fb7dc7_initial.py
b3e4f5a6b7c8_add_operator_sessions.py
c1d2e3f4a5b6_payment_delivery_changes.py
d2e3f4a5b6c7_move_billing_type_to_subscription.py
```

Verify the chain is intact (no broken `down_revision` pointers):
```bash
alembic history --verbose
```

Each migration should list its `Rev` and `Parent Rev`. If any migration says `Parent: None` when it shouldn't, the chain is broken.

### 0.4 — Confirm `railway.toml` is correct

```bash
cat railway.toml
```

Expected content (already correct in your repo):
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### 0.5 — Add a `.python-version` file

Nixpacks needs to know your Python version explicitly:

```bash
echo "3.11" > tiffin_tracker_backend/.python-version
git add tiffin_tracker_backend/.python-version
git commit -m "chore: pin Python version for Nixpacks"
```

### 0.6 — Verify `.gitignore` covers everything sensitive

Check your root `.gitignore`. It must contain at minimum:

```gitignore
# Python
.env
*.env
__pycache__/
*.pyc
venv/
env/
.venv/

# Node
node_modules/
dist/

# OS
.DS_Store
```

Verify nothing sensitive is tracked:
```bash
git status
# Ensure .env files are NOT listed here
```

If you ever see a `.env` file listed in `git status` as "Untracked" rather than ignored, fix the `.gitignore` before proceeding. If it's already tracked (in git history), remove it:

```bash
git rm --cached tiffin_tracker_backend/.env
git commit -m "chore: remove accidentally tracked .env file"
# Then rotate your SECRET_KEY and any other credentials in that file
```

### 0.7 — Generate a strong SECRET_KEY

Do not use a weak secret key in production. Generate one now:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
# Outputs: a64f8b2c1d... (64 hex characters = 256 bits)
```

Save this value. You'll enter it into Railway in Phase 2. Use a different value than your local dev `SECRET_KEY`.

---

## Phase 1 — Deploy the Database (Railway MySQL)

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: Databases in Production (Doc 1, §3)           │
│  What you're doing here: Provisioning a managed MySQL        │
│  instance in Railway's cloud.                                │
│  Standard practice: Separate database server with automated  │
│  backups, read replicas, and monitoring.                     │
│  Our approach: Railway's managed MySQL plugin on free tier — │
│  single instance, no automated backups, but zero config.     │
└──────────────────────────────────────────────────────────────┘
```

### 1.1 — Create a Railway account

1. Go to [railway.app](https://railway.app)
2. Click **Login** → **Login with GitHub**
3. Authorize Railway to access your GitHub account
4. You're on the free **Starter plan** — $5 of credits/month, no credit card required

### 1.2 — Create a new project

1. In the Railway dashboard, click **New Project**
2. Select **Empty project**
3. Name it `tiffin-tracker` (click the project name to rename)

### 1.3 — Add the MySQL plugin

1. In your project, click **+ New** → **Database** → **Add MySQL**
2. Railway provisions a MySQL 8 instance. This takes about 30 seconds.
3. You'll see a MySQL service card appear in your project dashboard.

### 1.4 — Find your DATABASE_URL

1. Click the MySQL service card
2. Click the **Variables** tab
3. You'll see auto-generated variables:
   ```
   MYSQLHOST     = containers-us-west-123.railway.app
   MYSQLPORT     = 6584
   MYSQLUSER     = root
   MYSQLPASSWORD = AbCdEfGhIjKlMnOp...
   MYSQLDATABASE = railway
   MYSQL_URL     = mysql://root:AbCdEf...@containers-us-west-123.railway.app:6584/railway
   ```

4. The `MYSQL_URL` Railway provides uses the `mysql://` scheme (for the synchronous driver). Your app uses `aiomysql` (the async driver), so the scheme must be `mysql+aiomysql://`.

**Your actual `DATABASE_URL` value:**

Copy `MYSQL_URL` and change the scheme:
```
mysql://root:PASSWORD@HOST:PORT/railway
        ↓ change to:
mysql+aiomysql://root:PASSWORD@HOST:PORT/railway
```

Example result:
```
mysql+aiomysql://root:AbCdEfGhIjKlMnOp@containers-us-west-123.railway.app:6584/railway
```

Save this — you'll need it in Phase 2.

### 1.5 — Why not run migrations yet?

Do **not** run migrations now. Alembic needs to connect to MySQL using your `DATABASE_URL`. That means Alembic must run in an environment where:
1. The Railway `DATABASE_URL` is available as an environment variable
2. The `aiomysql` driver is installed
3. The `alembic/` directory and `alembic.ini` are present

The correct place for this is after deploying the backend service (Phase 2), using Railway's "one-off command" feature.

---

## Phase 2 — Deploy the Backend (Railway FastAPI)

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: Serving a FastAPI App in Production (Doc 1,   │
│  §4), Environment Variables (§2)                             │
│  What you're doing here: Deploying your FastAPI service to   │
│  Railway, wiring in all environment variables.               │
│  Standard practice: Docker image deployed to a container     │
│  registry, pulled by an orchestrator.                        │
│  Our approach: Nixpacks auto-builds from source on Railway;  │
│  zero Dockerfile needed.                                     │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 — Add a GitHub service to Railway

1. In your Railway project, click **+ New** → **GitHub Repo**
2. If this is your first time, click **Configure GitHub App** — this installs the Railway GitHub App and lets Railway pull your repo
3. Select your `tiffin_tracker` repository
4. Railway asks: **root directory** — set this to `tiffin_tracker_backend`
   - This is important: Railway must know to treat the backend subdirectory as the project root, not the monorepo root
5. Click **Deploy** — Railway will start its first build immediately (it will probably fail because env vars are missing; that's expected)

### 2.2 — Set all environment variables

Before the first successful deploy, set every required env var:

1. Click your backend service card
2. Click the **Variables** tab
3. Click **RAW Editor** (makes it faster to paste multiple variables at once)
4. Paste the following, replacing all placeholders with real values:

```
DATABASE_URL=mysql+aiomysql://root:YOUR_PASSWORD@YOUR_RAILWAY_MYSQL_HOST:PORT/railway
SECRET_KEY=your-generated-256-bit-hex-key
ALGORITHM=HS256
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
COOKIE_SECURE=true
COOKIE_SAMESITE=none
COOKIE_DOMAIN=
CORS_ORIGINS=["http://placeholder.vercel.app"]
RAZORPAY_KEY_ID=rzp_test_yourkeyhere
RAZORPAY_KEY_SECRET=your_razorpay_test_secret
DEBUG=false
ACCESS_TOKEN_EXPIRE_MINUTES=15
SESSION_LIFETIME_DAYS=30
REFRESH_TOKEN_ROTATION_ENABLED=true
```

Notes:
- `DATABASE_URL`: Use the `mysql+aiomysql://` URL you constructed in step 1.4
- `COOKIE_SECURE=true`: HTTPS is available on Railway (required for `SameSite=None`)
- `COOKIE_SAMESITE=none`: Required for cross-domain cookie sending (Railway domain ≠ Vercel domain). Note: Railway env var value should be `none` (lowercase) — your `config.py` passes this directly to FastAPI's cookie settings
- `CORS_ORIGINS`: Use a placeholder for now — you'll update it after the Vercel deploy in Phase 4
- `RAZORPAY_KEY_ID/SECRET`: Use test keys until you're ready for real payments

5. Click **Save** — Railway triggers a new deploy automatically

### 2.3 — Watch the build log

Click **Deployments** on your service, then click the latest deployment. You'll see the Nixpacks build log in real time:

```
=== Nixpacks v1.x.x ===
Detected: Python 3.11 (from .python-version)
  
Installing Python packages...
  pip install -r requirements.txt
  Collecting fastapi==0.115.5...
  Collecting uvicorn[standard]==0.32.1...
  ...
  Successfully installed fastapi-0.115.5 uvicorn-0.32.1 ...

Starting application...
  uvicorn app.main:app --host 0.0.0.0 --port 8080
  INFO:     Started server process [1]
  INFO:     Waiting for application startup.
  INFO:     Application startup complete.
  INFO:     Uvicorn running on http://0.0.0.0:8080

Checking health: GET /health
  ✓ Health check passed (200 OK)
```

If the build fails, the logs will tell you exactly why. Common failures:
- **`ModuleNotFoundError`**: A package in your code isn't in `requirements.txt`
- **`sqlalchemy.exc.OperationalError`**: Database connection failed — check `DATABASE_URL`
- **`pydantic_core.ValidationError`**: A required env var is missing — check all variables are set
- **`OSError: Address already in use`**: Make sure you're using `$PORT`, not a hardcoded port

### 2.4 — Get the Railway backend URL

Once the health check passes:
1. Click the **Settings** tab on your backend service
2. Under **Networking** → **Public Networking**, click **Generate Domain**
3. Railway gives you a URL like `https://tiffin-tracker-backend.up.railway.app`

Test it:
```bash
curl https://tiffin-tracker-backend.up.railway.app/health
# Expected: {"status":"ok","app":"Tiffin Tracker API"}
```

Save this URL — you'll need it for Vercel's `VITE_API_URL`.

### 2.5 — Run Alembic migrations

Now that the backend is deployed, run migrations against the production database.

**Option A: Using the Railway CLI (recommended)**

Install the Railway CLI:
```bash
# macOS/Linux
curl -fsSL https://railway.app/install.sh | sh

# Or via npm
npm install -g @railway/cli
```

Login and link to your project:
```bash
railway login
railway link  # follow the prompts to select your project and service
```

Run the migration:
```bash
cd tiffin_tracker_backend
railway run alembic upgrade head
```

`railway run` executes the command in an environment that has all your Railway environment variables injected — including `DATABASE_URL`. It connects directly from your local machine to the Railway MySQL instance.

Expected output:
```
INFO  [alembic.runtime.migration] Context impl MySQLImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 220dc9fb7dc7, initial
INFO  [alembic.runtime.migration] Running upgrade 220dc9fb7dc7 -> b3e4f5a6b7c8, add_operator_sessions
INFO  [alembic.runtime.migration] Running upgrade b3e4f5a6b7c8 -> c1d2e3f4a5b6, payment_delivery_changes
INFO  [alembic.runtime.migration] Running upgrade c1d2e3f4a5b6 -> d2e3f4a5b6c7, move_billing_type_to_subscription
```

**Option B: Using Railway's web console**

1. In your Railway service, click **Settings** → **Deploy** → **Custom Start Command** (temporarily override)
2. Enter: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Redeploy — migrations run, then the server starts
4. After migration runs successfully, change the start command back to just the uvicorn command

Option A (Railway CLI) is cleaner — use it.

### 2.6 — What the health check does

Your `railway.toml`:
```toml
healthcheckPath = "/health"
healthcheckTimeout = 30
```

After every deploy, Railway sends `GET /health` to your app. If it gets a `200 OK` response within 30 seconds, the deploy is considered successful and Railway routes traffic to the new container. If it fails, Railway stops the new container and keeps serving from the previous version.

This means: if your code has an import error that crashes the process at startup, the health check will time out, the deploy will be marked as failed, and users will continue hitting the previous (working) version. Your deploy cannot take down your app.

What happens when health check fails:
1. You get an email from Railway
2. The deployment status shows "Failed"
3. The previous deployment is still active
4. You check the build logs to find the error

---

## Phase 3 — Deploy the Frontend (Vercel)

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: Serving a React/Vite App (Doc 1, §5),         │
│  Build-time vs. Runtime Env Vars (§5)                        │
│  What you're doing here: Deploying the compiled React app    │
│  to Vercel's global CDN.                                     │
│  Standard practice: Docker image with Nginx serving static   │
│  files behind a CDN (Cloudfront, Fastly).                    │
│  Our approach: Vercel handles the CDN, TLS, and SPA routing  │
│  automatically. Zero config.                                 │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 — Create a Vercel account

1. Go to [vercel.com](https://vercel.com)
2. Click **Start Deploying** → **Continue with GitHub**
3. Authorize Vercel to access your GitHub account
4. You're on the free **Hobby plan** — unlimited deployments, 100GB bandwidth/month

### 3.2 — Import the repository

1. In the Vercel dashboard, click **Add New** → **Project**
2. Find your `tiffin_tracker` repository and click **Import**

### 3.3 — Configure the project settings

Vercel will try to auto-detect your framework. You need to override some settings:

**Framework Preset:** Select `Vite`

**Root Directory:** Click **Edit** next to "Root Directory" → enter `tiffin_tracker_app`

> This is critical. Your repo root contains both `tiffin_tracker_app/` and `tiffin_tracker_backend/`. Vercel needs to know the frontend is in `tiffin_tracker_app/`.

**Build Command:** `tsc -b && vite build`

**Output Directory:** `dist`

**Install Command:** `npm ci`

> `npm ci` (clean install) is the correct command for CI/CD — it installs exactly what's in `package-lock.json` and fails if `package.json` and `package-lock.json` are out of sync. `npm install` can silently update packages and produce different results on different machines.

### 3.4 — Set the environment variable

Still on the "Configure Project" screen, expand **Environment Variables**:

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://tiffin-tracker-backend.up.railway.app` |

Replace the value with your actual Railway backend URL from Phase 2.4.

**Critical reminder (from Doc 1, §5):** This value is baked into the JavaScript bundle at build time. If you change it later, you must redeploy the frontend for the new value to take effect.

### 3.5 — Deploy

Click **Deploy**. Watch the build log:

```
Running "npm ci"
  added 347 packages in 18s

Running "tsc -b && vite build"
  vite v8.0.12 building for production...
  ✓ 847 modules transformed.
  dist/index.html        0.50 kB │ gzip:  0.32 kB
  dist/assets/index-Bk3X9abc.css  42.35 kB │ gzip: 8.12 kB
  dist/assets/index-Cp4Y8def.js  312.45 kB │ gzip: 89.23 kB
  ✓ built in 4.23s

Deploying to Vercel CDN...
  ✓ Deployed to https://tiffin-tracker-app.vercel.app
```

### 3.6 — Verify — and expect a CORS error

Open `https://tiffin-tracker-app.vercel.app` in your browser.

Try to log in. Open the browser DevTools (F12) → **Network** tab.

You will see a red request with an error like:
```
Access to XMLHttpRequest at 'https://tiffin-tracker-backend.up.railway.app/auth/login'
from origin 'https://tiffin-tracker-app.vercel.app' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**This is expected.** Your backend's `CORS_ORIGINS` still has the placeholder value `["http://placeholder.vercel.app"]` from Phase 2.2. You'll fix this in Phase 4.

---

## Phase 4 — Wire CORS and Cookies

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: CORS (Doc 1, §6), HTTPS & Cookies (§7)        │
│  What you're doing here: Connecting frontend and backend by  │
│  configuring allowed origins and production cookie settings. │
│  Standard practice: Automated via infrastructure-as-code     │
│  (Terraform, Pulumi) when both services are deployed.        │
│  Our approach: Manual env var update in Railway dashboard.   │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 — Update CORS_ORIGINS in Railway

1. Go to your Railway backend service → **Variables** tab
2. Find `CORS_ORIGINS` and update its value:

```
CORS_ORIGINS=["https://tiffin-tracker-app.vercel.app"]
```

Replace `tiffin-tracker-app` with your actual Vercel subdomain.

If you have both a Vercel URL and a custom domain, list both:
```
CORS_ORIGINS=["https://tiffin-tracker-app.vercel.app","https://app.yourdomain.in"]
```

3. Save — Railway redeploys automatically.

### 4.2 — Verify cookie settings

Your current Railway variables should have:
```
COOKIE_SECURE=true
COOKIE_SAMESITE=none
COOKIE_DOMAIN=
```

**Why `COOKIE_SAMESITE=none`?** Your frontend (`vercel.app`) and backend (`railway.app`) are on entirely different domains. With `SameSite=Lax` (the default), the refresh token cookie set by `railway.app` would not be sent in cross-site requests from `vercel.app`. `SameSite=None` explicitly allows cross-site cookie sending. It requires `Secure=true` (HTTPS), which you have.

**Why `COOKIE_DOMAIN=` (blank)?** `COOKIE_DOMAIN` is used to share a cookie across subdomains of the same domain (e.g., `.yourdomain.in` shares cookies between `app.yourdomain.in` and `api.yourdomain.in`). Since your frontend and backend are on completely different domains (`vercel.app` vs `railway.app`), `COOKIE_DOMAIN` is irrelevant — leave it blank. When you move to a custom domain (Phase 10), you'll set this to `.yourdomain.in`.

### 4.3 — Verify FastAPI cookie settings in the auth router

Find where your auth router sets the refresh token cookie. It should look something like this in `app/routers/auth.py`:

```python
response.set_cookie(
    key="refresh_token",
    value=session_token,
    httponly=True,
    secure=settings.COOKIE_SECURE,
    samesite=settings.COOKIE_SAMESITE,
    domain=settings.COOKIE_DOMAIN if settings.COOKIE_DOMAIN else None,
    max_age=settings.SESSION_LIFETIME_DAYS * 24 * 60 * 60,
    path="/auth",
)
```

The `path="/auth"` restriction is good security practice — the cookie is only sent to `/auth` routes (your refresh endpoint), not every request. Verify this is in your code.

### 4.4 — Test login end-to-end

1. Go to your Vercel URL
2. Attempt to log in with a test account
3. Open DevTools → **Network** tab
4. Look for the `POST /auth/login` request — it should return `200 OK`
5. Look for the `Set-Cookie` header in the response:
   ```
   Set-Cookie: refresh_token=eyJ...; Path=/auth; HttpOnly; Secure; SameSite=None
   ```
6. Open DevTools → **Application** tab → **Cookies** → select your Railway domain
7. You should see `refresh_token` listed with `HttpOnly: true` and `Secure: true`

### 4.5 — What to look for in the browser Network tab for `/auth/refresh`

When the access token expires (after 15 minutes), your Axios interceptor in `src/api/client.ts` silently calls `/auth/refresh`. In the Network tab:

- The request to `/auth/refresh` should include the `Cookie: refresh_token=...` header
- The response should include a new `Set-Cookie` header (rotating the session)
- The original failed request should be retried automatically

If you see `401` responses on `/auth/refresh` followed by a redirect to `/login`, the cookie is not being sent. Causes:
1. `COOKIE_SAMESITE` is not `none` (case-insensitive in config, must be `none` not `None` for FastAPI's `set_cookie`)
2. `COOKIE_SECURE` is not `true`
3. The Axios client does not have `withCredentials: true` set

---

## Phase 5 — Build the CI/CD Pipeline (GitHub Actions)

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: What Is CI/CD? (Doc 1, §8), GitHub Actions    │
│  Fundamentals (§9)                                           │
│  What you're doing here: Automating linting, type checking,  │
│  and deployment on every push.                               │
│  Standard practice: Full test suite (unit + integration +    │
│  E2E) in CI before deploy.                                   │
│  Our approach: Lint + type check in CI (fast feedback),      │
│  automated deploy on push to main. Tests come next.          │
└──────────────────────────────────────────────────────────────┘
```

Create the directory structure:
```bash
mkdir -p .github/workflows
```

### 5a — CI Workflow

Create `.github/workflows/ci.yml`. This runs on every push and every PR.

```yaml
name: CI

on:
  push:
    branches: ["**"]          # every branch
  pull_request:
    branches: [main]          # PRs targeting main

jobs:
  # ─────────────────────────────────────────────────
  # Backend: lint + type check
  # ─────────────────────────────────────────────────
  backend-ci:
    name: Backend CI
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        # Clones your repo into the runner. Always the first step.

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
        # Installs Python 3.11 on the runner.

      - name: Cache pip dependencies
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          # Key is a hash of requirements.txt. If requirements.txt hasn't
          # changed since the last run, restore the cached packages instead
          # of downloading them again. Saves 30-60 seconds per run.
          key: pip-${{ hashFiles('tiffin_tracker_backend/requirements.txt') }}
          restore-keys: pip-

      - name: Install dependencies
        working-directory: tiffin_tracker_backend
        run: |
          pip install -r requirements.txt
          pip install ruff mypy

      - name: Run ruff (linter)
        working-directory: tiffin_tracker_backend
        run: ruff check app/
        # ruff is an extremely fast Python linter (written in Rust).
        # It catches style issues, unused imports, and common mistakes.
        # It does NOT do type checking — that's mypy's job.

      - name: Run mypy (type checker)
        working-directory: tiffin_tracker_backend
        run: mypy app/ --ignore-missing-imports
        # mypy performs static type analysis. It reads your type hints
        # and checks that you're using types correctly. This catches
        # bugs like passing a str where an int is expected, accessing
        # attributes that don't exist on a type, etc.
        # --ignore-missing-imports: skip type errors for libraries that
        # don't have type stubs (common for smaller packages).

  # ─────────────────────────────────────────────────
  # Frontend: lint + type check + build
  # ─────────────────────────────────────────────────
  frontend-ci:
    name: Frontend CI
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Cache npm dependencies
        uses: actions/cache@v4
        with:
          path: ~/.npm
          # Keyed on package-lock.json hash. npm ci is deterministic
          # when package-lock.json is unchanged.
          key: npm-${{ hashFiles('tiffin_tracker_app/package-lock.json') }}
          restore-keys: npm-

      - name: Install dependencies
        working-directory: tiffin_tracker_app
        run: npm ci
        # npm ci (clean install) vs npm install:
        # - npm ci: installs EXACTLY what's in package-lock.json, fails
        #   if package.json and package-lock.json are out of sync.
        #   Reproducible. Correct for CI.
        # - npm install: may update package-lock.json, installs latest
        #   compatible versions. For local development only.

      - name: Run ESLint
        working-directory: tiffin_tracker_app
        run: npm run lint
        # Checks TypeScript/React code style and common mistakes.
        # Your eslint.config.js is already configured with react-hooks
        # and react-refresh rules.

      - name: Build (TypeScript compile + Vite build)
        working-directory: tiffin_tracker_app
        run: npm run build
        # This is tsc -b && vite build.
        # tsc -b performs the TypeScript type check (authoritative TS check).
        # vite build compiles and bundles the app.
        # If either step fails, CI fails. This catches:
        # - TypeScript type errors
        # - Import errors (module not found)
        # - Syntax errors in TS/JSX
        # - vite.config.ts misconfigurations
        env:
          VITE_API_URL: https://placeholder.railway.app
          # A placeholder value is required because VITE_API_URL is
          # referenced at build time. We're not deploying here, just
          # checking the build succeeds. The real value is set in Vercel.
```

### 5b — Deploy Workflow

There are two approaches to ensure CI passes before deploy. We'll use Option A (single file with `needs:`), with Option B documented for reference.

**Why not just use two separate files?** If you have `ci.yml` and `deploy.yml` as separate files, GitHub will trigger both when you push to main. The deploy could start before CI finishes. The `needs:` approach in a single file makes the dependency explicit.

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
    # Only triggers on pushes to main. When you merge a PR, this fires.

jobs:
  # ─────────────────────────────────────────────────
  # Run CI checks first (reuse the same logic)
  # ─────────────────────────────────────────────────
  backend-ci:
    name: Backend CI
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: pip-${{ hashFiles('tiffin_tracker_backend/requirements.txt') }}
          restore-keys: pip-
      - name: Install dependencies
        working-directory: tiffin_tracker_backend
        run: pip install -r requirements.txt && pip install ruff mypy
      - name: Ruff
        working-directory: tiffin_tracker_backend
        run: ruff check app/
      - name: Mypy
        working-directory: tiffin_tracker_backend
        run: mypy app/ --ignore-missing-imports

  frontend-ci:
    name: Frontend CI
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: actions/cache@v4
        with:
          path: ~/.npm
          key: npm-${{ hashFiles('tiffin_tracker_app/package-lock.json') }}
          restore-keys: npm-
      - name: Install
        working-directory: tiffin_tracker_app
        run: npm ci
      - name: Lint
        working-directory: tiffin_tracker_app
        run: npm run lint
      - name: Build
        working-directory: tiffin_tracker_app
        run: npm run build
        env:
          VITE_API_URL: https://placeholder.railway.app

  # ─────────────────────────────────────────────────
  # Deploy backend to Railway
  # Only runs if BOTH CI jobs above pass.
  # ─────────────────────────────────────────────────
  deploy-backend:
    name: Deploy Backend (Railway)
    runs-on: ubuntu-latest
    needs: [backend-ci, frontend-ci]
    # The `needs:` key creates a dependency. This job will not start
    # until both backend-ci and frontend-ci have completed successfully.
    # If either fails, this job is skipped entirely.

    steps:
      - name: Trigger Railway deploy
        run: curl -X POST "${{ secrets.RAILWAY_DEPLOY_HOOK_URL }}"
        # Railway deploy hooks are unique URLs. When you POST to one,
        # Railway pulls the latest commit from your linked GitHub branch
        # and starts a new deployment.
        #
        # The secret RAILWAY_DEPLOY_HOOK_URL is stored in GitHub Secrets
        # (see section 5c below).
        #
        # What Railway does after receiving this webhook:
        # 1. Pull latest code from GitHub (main branch)
        # 2. Run Nixpacks build
        # 3. Send GET /health to the new container
        # 4. If healthy: route traffic to new container, stop old one
        # 5. If unhealthy: fail the deployment, keep old container running

  # ─────────────────────────────────────────────────
  # Frontend: Vercel deploys automatically
  # ─────────────────────────────────────────────────
  # NOTE: Vercel's GitHub App watches your repo independently of
  # GitHub Actions. When you push to main, Vercel ALSO gets notified
  # and starts its own build pipeline. You do NOT need a GitHub
  # Actions step to deploy to Vercel — it happens automatically.
  #
  # If you want explicit control over when Vercel deploys (e.g., only
  # after CI passes), you have two options:
  #
  # OPTION 1 (Current setup): Keep Vercel auto-deploy enabled (default).
  # Vercel deploys in parallel with GitHub Actions. If CI fails and you
  # want to block the Vercel deploy, see Option 2.
  #
  # OPTION 2: Disable Vercel's auto-deploy and trigger it explicitly:
  #   1. In Vercel project settings → Git → disable "Auto Deployments"
  #   2. Add this job to deploy.yml (after the needs: check):
  #
  # deploy-frontend:
  #   name: Deploy Frontend (Vercel)
  #   runs-on: ubuntu-latest
  #   needs: [backend-ci, frontend-ci]
  #   steps:
  #     - uses: actions/checkout@v4
  #     - uses: actions/setup-node@v4
  #       with:
  #         node-version: "20"
  #     - name: Install Vercel CLI
  #       run: npm install -g vercel
  #     - name: Deploy to Vercel Production
  #       working-directory: tiffin_tracker_app
  #       run: vercel --prod --yes
  #       env:
  #         VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
  #         VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  #         VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  #
  # For now, use Option 1 (simpler). The risk is Vercel may deploy a
  # build that would have failed CI, but since Vercel also runs
  # `tsc -b && vite build`, it will fail the Vercel deploy on the
  # same TypeScript errors that would have failed CI anyway.
```

### 5c — Getting the Railway Deploy Hook URL

1. In Railway, click your backend service → **Settings** tab
2. Scroll to **Deploy Hooks**
3. Click **+ Create Deploy Hook**
4. Name it `github-actions` and select the `main` branch
5. Copy the generated URL — it looks like:
   ```
   https://backboard.railway.app/webhooks/deploy/AbCdEfGhIjKl...
   ```

### 5d — Adding secrets to GitHub Actions

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** for each:

| Secret name | Value |
|-------------|-------|
| `RAILWAY_DEPLOY_HOOK_URL` | The Railway deploy hook URL from step 5c |

If you opt into explicit Vercel deploys (Option 2 above), you also need:

| Secret name | Where to find it |
|-------------|-----------------|
| `VERCEL_TOKEN` | Vercel dashboard → Settings → Tokens → Create token |
| `VERCEL_ORG_ID` | Vercel dashboard → Settings → General → Team ID (or your username for personal accounts) |
| `VERCEL_PROJECT_ID` | Vercel project → Settings → General → Project ID |

**Security properties of GitHub Secrets:**
- Secrets are encrypted at rest
- Secrets appear as `***` in all logs
- Secrets are NOT available to workflows triggered by pull requests from forks of your repository (protection against malicious PRs that try to print your secrets)
- Secrets are scoped to the repository (not shared across repos)

### 5e — Option B: Separate CI and Deploy files with branch protection

The alternative to `needs:` is two separate files + a branch protection rule.

`ci.yml` (triggers on every push and PR, as written in 5a).

`deploy.yml` (triggers only on push to main):
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Railway deploy
        run: curl -X POST "${{ secrets.RAILWAY_DEPLOY_HOOK_URL }}"
```

Then in GitHub Settings → Branches → Branch protection rules → Add rule for `main`:
- Enable **Require status checks to pass before merging**
- Add `Backend CI` and `Frontend CI` as required status checks

With this rule, GitHub prevents any push from being merged to `main` unless the CI checks have passed on that commit. The deploy workflow then fires on the merge commit, which is guaranteed to have passed CI.

**Recommendation:** Use Option A (single file with `needs:`) for simplicity. The `needs:` approach is self-documenting and doesn't require branch protection rules to enforce the ordering.

---

## Phase 6 — Branch Protection + PR Workflow

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: CI/CD pipeline concept (Doc 1, §8), Deploy    │
│  strategies (§10)                                            │
│  What you're doing here: Enforcing that no code merges to    │
│  main without passing CI, and establishing the daily dev     │
│  workflow.                                                   │
│  Standard practice: Branch protection + required reviews +   │
│  CI status checks + staging gate before prod.                │
│  Our approach: Branch protection with CI required, no        │
│  reviewer requirement (solo developer).                      │
└──────────────────────────────────────────────────────────────┘
```

### 6.1 — Enable branch protection on main

1. GitHub repo → **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Branch name pattern: `main`
4. Enable:
   - ✅ **Require a pull request before merging**
   - ✅ **Require status checks to pass before merging**
     - Under "Status checks that are required", search for and add:
       - `Backend CI`
       - `Frontend CI`
   - ✅ **Require branches to be up to date before merging** (prevents merge when main has advanced)
5. Click **Create**

### 6.2 — The complete developer workflow

Here is what your development cycle looks like after this setup:

```
1. Create a feature branch
   git checkout -b feature/add-whatsapp-reminders

2. Make your changes, commit normally
   git add .
   git commit -m "feat: add WhatsApp reminder scheduling"
   git push origin feature/add-whatsapp-reminders

3. CI runs automatically on push
   → GitHub Actions runs backend-ci and frontend-ci on your branch
   → You see pass/fail badges in the GitHub repo

4. Open a Pull Request
   gh pr create --title "Add WhatsApp reminder scheduling" --base main
   → CI results are shown directly on the PR
   → A green checkmark means CI passed
   → A red X means CI failed — click it to see which step failed

5. Fix any CI failures, push again
   → CI re-runs on the new commit
   → You cannot merge until CI is green

6. Merge the PR
   → GitHub merges your branch into main
   → The deploy.yml workflow triggers on the push to main
   → backend-ci and frontend-ci run again (on the merge commit)
   → If both pass: deploy-backend fires, Railway redeploys
   → Vercel also detects the push to main and rebuilds automatically

7. Verify the deploy
   → Watch Railway's deployment log
   → Hit /health on your Railway URL
   → Open the Vercel URL and confirm the change is live
```

### 6.3 — Trunk-based development

This workflow is called **trunk-based development**: everyone works on short-lived branches, merges to `main` (the "trunk") frequently, and `main` is always deployable.

The key discipline: keep branches short-lived (hours to days, not weeks). Long-lived branches accumulate merge conflicts and make integration painful — which is exactly what CI/CD is designed to prevent.

### 6.4 — Staging gate callout

The standard practice for production deployments is:
```
feature branch → staging environment → manual verification → production
```

With Vercel: every branch gets a preview URL (e.g., `https://tiffin-tracker-app-git-feature-xyz.vercel.app`). This gives you a staging URL for the frontend for free. Use it — share the preview URL in the PR description to let yourself (or a future teammate) verify the frontend change before merging.

For the backend: Railway preview environments are available on paid plans. On free tier, your only staging is local dev. This is the primary trade-off of free-tier deployments.

---

## Phase 7 — Database Migration Safety in CI/CD

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: Databases in Production (Doc 1, §3),          │
│  specifically the migration safety section.                  │
│  What you're doing here: Establishing a safe, manual         │
│  migration process that prevents data loss.                  │
│  Standard practice: Automated migration as part of the       │
│  deploy pipeline, gated by a staging test.                   │
│  Our approach: Manual migration via Railway CLI before each  │
│  deploy that requires schema changes.                        │
└──────────────────────────────────────────────────────────────┘
```

### 7.1 — Why NOT automating migrations is correct for now

The temptation: add `alembic upgrade head` to the Railway start command so migrations run automatically on every deploy:

```toml
# RISKY: do not do this yet
startCommand = "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT"
```

The problem: if a migration fails halfway through (e.g., a `ALTER TABLE` on a large table times out, or a constraint violation on existing data), your app may start in a partially-migrated state. Your code expects the new schema; the database has a broken intermediate state. The result can be a production outage that requires manual database surgery.

The safe requirement for automated migrations: **a staging environment where you test the migration against a copy of production data first**. You don't have that yet.

### 7.2 — The safe manual migration process

Follow this process for every deploy that includes schema changes:

```bash
# 1. Check current migration state in production
cd tiffin_tracker_backend
railway run alembic current
# Shows: d2e3f4a5b6c7 (head)

# 2. Verify the migration you're about to run
alembic history --verbose
# Read the upgrade() function of each new migration
# Ask: does this migration DROP or ALTER anything that old code uses?
# If yes: ensure old code is compatible with both old and new schema

# 3. Run the migration (railway run injects production DATABASE_URL)
railway run alembic upgrade head

# 4. Verify the migration succeeded
railway run alembic current
# Should show the new head revision

# 5. Deploy the application code
# (triggers the deploy workflow, or push to main)
```

### 7.3 — Writing safe migrations

**Safe (additive):** Always safe to run:
```python
def upgrade():
    op.add_column('subscribers', sa.Column('notes', sa.Text(), nullable=True))
    op.create_table('reminder_logs', ...)
    op.create_index('idx_deliveries_date', 'deliveries', ['delivery_date'])
```

**Requires care (two-deploy strategy):**
```python
# Step 1 deploy: add new column, keep old column
def upgrade():
    op.add_column('subscriptions', sa.Column('new_billing_type', sa.String(20)))
    # Old code still writes to old_billing_type; new code writes to both

# Step 2 deploy (after verifying Step 1): remove old column
def upgrade():
    op.drop_column('subscriptions', 'old_billing_type')
    # New code only uses new_billing_type; safe to remove old
```

**Never do in a single migration on a live system:**
- `op.drop_column()` when current code still reads that column
- `op.rename_table()` or `op.rename_column()` while the app is running
- `ALTER COLUMN` that changes data type on a large table (MySQL locks the table)

### 7.4 — When to automate migrations

Only automate when you have:
1. A staging environment with production-like data
2. The migration runs successfully in staging
3. A rollback plan (the `downgrade()` function is tested)
4. A backup taken before the migration

At that point, the automation looks like:
```yaml
# In deploy.yml, after CI but before deploying the app:
- name: Run database migrations
  run: railway run alembic upgrade head
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

---

## Phase 8 — Verifying the Full Pipeline

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: The pipeline concept (Doc 1, §8)              │
│  What you're doing here: Smoke-testing every layer of the    │
│  system to confirm the pipeline works end-to-end.            │
│  Standard practice: Automated smoke tests run in CI after    │
│  deploy, with alerting on failure.                           │
│  Our approach: Manual smoke test checklist.                  │
└──────────────────────────────────────────────────────────────┘
```

### 8.1 — Make a trivial but observable change

In `tiffin_tracker_backend/app/main.py`, update the `/health` endpoint:

```python
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": "1.0.1"}
```

Commit and push to a feature branch, then merge to main.

### 8.2 — Watch GitHub Actions

1. Go to your GitHub repo → **Actions** tab
2. You should see a new workflow run triggered by your push to main
3. Watch the jobs: `Backend CI`, `Frontend CI`, `Deploy Backend`
4. Each step should show green checkmarks

If a step fails, click it to see the full log output.

### 8.3 — Watch Railway redeploy

1. Go to Railway → your backend service → **Deployments** tab
2. You should see a new deployment triggered (the deploy hook fired)
3. Watch the build log and health check

Timeline after the GitHub Actions deploy job fires:
- ~0s: Railway receives the deploy hook request
- ~30s: Nixpacks builds the new image (pip cache usually warms this up)
- ~35s: New container starts, Uvicorn initializes
- ~36s: Railway sends `GET /health`
- ~37s: Health check passes, traffic routes to new container

### 8.4 — Watch Vercel redeploy

1. Go to Vercel → your project → **Deployments** tab
2. You should see a deployment triggered by the push to main (Vercel watches independently)
3. Build time is typically 20–40 seconds

### 8.5 — Smoke test checklist

Run through each item after both Railway and Vercel show successful deploys:

```
□ Hit /health on the live backend URL:
  curl https://tiffin-tracker-backend.up.railway.app/health
  Expected: {"status":"ok","app":"Tiffin Tracker API","version":"1.0.1"}
  ← confirms your code change is live, not a cached version

□ Open the frontend URL:
  https://tiffin-tracker-app.vercel.app
  ← confirms Vercel served the new build

□ Log in with a test account
  ← confirms CORS is working, auth endpoint is reachable

□ Inspect the cookie after login:
  DevTools → Application → Cookies → railway.app domain
  Should show: refresh_token with HttpOnly=true, Secure=true, SameSite=None
  ← confirms cookie config is correct

□ Navigate to a page (e.g., /subscribers)
  ← confirms React Router SPA routing works (no 404 on refresh)

□ Refresh the page at /subscribers
  ← Vercel must route this to index.html (SPA routing)
  ← confirms Vercel's SPA routing fallback is active

□ Wait 15 minutes, then perform an action that hits the API
  ← the access token will have expired; the silent refresh should fire
  ← you should NOT be logged out (the refresh token renews the session)
  ← check Network tab: should see a POST /auth/refresh followed by the
     original request being retried

□ Check Railway logs for any ERROR lines:
  Railway → service → Logs tab
  ← should see uvicorn access logs, no tracebacks
```

---

## Phase 9 — Monitoring & Observability

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: Standard Industry Practices (Doc 1, §11),     │
│  monitoring row.                                             │
│  What you're doing here: Adding visibility into production   │
│  errors and performance before customers report problems.    │
│  Standard practice: Datadog/New Relic with distributed       │
│  tracing, custom dashboards, and PagerDuty alerting.         │
│  Our approach: Sentry (free, 5K errors/month) + Railway      │
│  built-in metrics + Vercel analytics.                        │
└──────────────────────────────────────────────────────────────┘
```

### 9.1 — Railway built-in metrics

No setup required. In Railway → your service:
- **Metrics** tab: CPU usage, memory usage, network I/O over time
- **Logs** tab: real-time log streaming from Uvicorn

Check the Logs tab when something goes wrong. Uvicorn logs every request:
```
INFO:     192.168.1.1:54321 - "POST /auth/login HTTP/1.1" 200 OK
INFO:     192.168.1.1:54321 - "GET /subscribers HTTP/1.1" 200 OK
ERROR:    Exception in ASGI application
Traceback (most recent call last):
  ...
```

### 9.2 — Sentry (error tracking)

Sentry catches unhandled exceptions in both backend and frontend, sends you email alerts, and groups errors by type. The free tier allows 5,000 errors/month.

**Sign up:** [sentry.io](https://sentry.io) → Create account → Create project

**Backend setup (FastAPI + sentry-sdk):**

Add to `requirements.txt`:
```
sentry-sdk[fastapi]==2.19.2
```

In `app/main.py`, add after imports:
```python
import sentry_sdk

# Initialize Sentry before creating the FastAPI app
sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    traces_sample_rate=0.1,  # capture 10% of transactions for performance
    environment="production" if not settings.DEBUG else "development",
)
```

Add to `app/config.py` Settings class:
```python
SENTRY_DSN: str = ""  # blank disables Sentry; set in Railway env vars
```

Add to Railway env vars:
```
SENTRY_DSN=https://abc123@o1234567.ingest.sentry.io/1234567
```

**Frontend setup (Vite + @sentry/react):**

```bash
cd tiffin_tracker_app
npm install @sentry/react
```

In `src/main.tsx`, add before `ReactDOM.createRoot`:
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});
```

Add to Vercel env vars:
```
VITE_SENTRY_DSN=https://def456@o1234567.ingest.sentry.io/5678901
```

Sentry now catches any unhandled exception in the frontend and groups them by error message, showing you the stack trace, the user's browser, and the sequence of events leading up to the error.

### 9.3 — Vercel Analytics

Add a single file to `tiffin_tracker_app`:

Create `vercel.json` in `tiffin_tracker_app/`:
```json
{
  "analytics": {
    "enabled": true
  }
}
```

This enables Vercel's basic web vitals tracking (LCP, FID, CLS) and page view counts in the Vercel dashboard. No SDK install required.

### 9.4 — UptimeRobot (external uptime monitoring)

Go to [uptimerobot.com](https://uptimerobot.com) → free account → **Add New Monitor**:

- Monitor Type: HTTPS
- Friendly Name: `Tiffin Tracker API`
- URL: `https://tiffin-tracker-backend.up.railway.app/health`
- Monitoring Interval: 5 minutes

UptimeRobot pings your `/health` endpoint every 5 minutes and emails you when it goes down. This is the most important monitoring you can add — you want to know about outages before your customers tell you.

---

## Phase 10 — Custom Domain (Optional but Recommended)

```
┌─ Concept Reference ──────────────────────────────────────────┐
│  This maps to: HTTPS & Cookies (Doc 1, §7), CORS (§6)        │
│  What you're doing here: Replacing auto-generated platform   │
│  URLs with a professional custom domain that also solves     │
│  cross-domain cookie issues.                                 │
│  Standard practice: All production services behind a single  │
│  domain with subdomains (api.yourdomain.in, app.yourdomain.in│
│  Our approach: Same — when revenue justifies the domain cost.│
└──────────────────────────────────────────────────────────────┘
```

### 10.1 — Why a custom domain matters for Razorpay

Razorpay's webhook configuration (where Razorpay sends payment events after a transaction completes) requires a publicly accessible HTTPS URL. Razorpay **strongly recommends** using your own domain rather than `*.railway.app` for production webhooks, because:

1. If you switch hosting providers, your Railway URL changes and your webhook breaks
2. A custom domain signals to Razorpay (and customers) that this is a real production product
3. `*.railway.app` URLs can occasionally be blocked by corporate firewalls

Your Razorpay webhook URL should be:
```
https://api.tiffin-tracker.in/payments/webhook
```

### 10.2 — Get a domain

Options (cheapest to most convenient):
- **Namecheap:** `.in` domains cost ~₹700–800/year. Most reliable budget option.
- **GoDaddy:** Similar pricing.
- **Freenom (.tk/.ml):** Free but unreliable — domains are sometimes reclaimed without notice. Not recommended for a real product.

Recommendation: Buy a `.in` domain for ₹800/year. For a ₹299+/month SaaS, this is the best ROI you'll spend.

### 10.3 — Connect custom domain to Vercel (frontend)

Assume you bought `tiffin-tracker.in`. Plan:
- `app.tiffin-tracker.in` → Vercel (frontend)
- `api.tiffin-tracker.in` → Railway (backend)

In Vercel:
1. Project → **Settings** → **Domains**
2. Enter `app.tiffin-tracker.in` → **Add**
3. Vercel shows you the DNS records to add:
   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```
4. Log in to your domain registrar (Namecheap), add the CNAME record
5. DNS propagation takes 5–30 minutes (up to 24 hours worldwide)
6. Vercel auto-provisions a Let's Encrypt TLS certificate

### 10.4 — Connect custom domain to Railway (backend)

In Railway:
1. Backend service → **Settings** → **Networking** → **Custom Domain**
2. Enter `api.tiffin-tracker.in` → **Add**
3. Railway shows the DNS record:
   ```
   Type: CNAME
   Name: api
   Value: your-service.up.railway.app
   ```
4. Add the CNAME record in your registrar
5. Railway auto-provisions TLS

### 10.5 — Update all configuration after domain change

After both domains are live and TLS is working:

**Update Railway env vars:**
```
CORS_ORIGINS=["https://app.tiffin-tracker.in"]
COOKIE_DOMAIN=.tiffin-tracker.in
COOKIE_SAMESITE=lax
```

**Why `COOKIE_DOMAIN=.tiffin-tracker.in` changes things:**

The leading dot means the cookie is valid for all subdomains of `tiffin-tracker.in`. A cookie set by `api.tiffin-tracker.in` with `Domain=.tiffin-tracker.in` will be sent by `app.tiffin-tracker.in` to `api.tiffin-tracker.in`. This is the clean cross-subdomain cookie sharing pattern.

With this in place, you can change `COOKIE_SAMESITE` back to `lax` — the domains share a parent domain, so it's no longer cross-site.

**Update Vercel env vars:**
```
VITE_API_URL=https://api.tiffin-tracker.in
```
Then redeploy (this bakes the new URL into the bundle).

**Update Razorpay webhook URL** in the Razorpay dashboard:
```
https://api.tiffin-tracker.in/payments/webhook
```

**Verify:**
```bash
# Backend health
curl https://api.tiffin-tracker.in/health

# Frontend
open https://app.tiffin-tracker.in

# Check cookie domain in DevTools:
# Application → Cookies → api.tiffin-tracker.in
# Should show: Domain=.tiffin-tracker.in, SameSite=Lax
```

---

## Appendix: Quick Reference

### Environment variables quick reference

| Variable | Local `.env` | Railway (production) |
|----------|-------------|---------------------|
| `DATABASE_URL` | `mysql+aiomysql://root:@localhost:3306/tiffin_dev` | `mysql+aiomysql://root:PASSWORD@HOST:PORT/railway` |
| `SECRET_KEY` | any string | 64-char hex (rotate from dev) |
| `ALGORITHM` | `HS256` | `HS256` |
| `GOOGLE_CLIENT_ID` | test client ID | production client ID |
| `GOOGLE_CLIENT_SECRET` | test secret | production secret |
| `COOKIE_SECURE` | `false` | `true` |
| `COOKIE_SAMESITE` | `lax` | `none` (before custom domain) / `lax` (after) |
| `COOKIE_DOMAIN` | `` (blank) | `` (blank before custom domain) / `.yourdomain.in` (after) |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | `["https://your-app.vercel.app"]` |
| `RAZORPAY_KEY_ID` | `rzp_test_...` | `rzp_live_...` (when going live) |
| `RAZORPAY_KEY_SECRET` | test secret | live secret |
| `DEBUG` | `true` | `false` |
| `SENTRY_DSN` | `` (blank) | Sentry project DSN |

### Common failure modes and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `CORS policy` error in browser | `CORS_ORIGINS` doesn't include the Vercel URL | Update `CORS_ORIGINS` in Railway, redeploy |
| Login works but refresh fails | `COOKIE_SAMESITE` is `lax` on cross-domain setup | Set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` |
| Railway health check fails | App crashes at startup | Check Railway deploy logs for the exception |
| Alembic migration fails | Database connection refused | Verify `DATABASE_URL` uses `mysql+aiomysql://` not `mysql://` |
| Vercel shows old version | `VITE_API_URL` changed but no redeploy | Trigger a new Vercel deployment |
| `ModuleNotFoundError` in Railway | Package not in `requirements.txt` | Add it to requirements.txt, push again |
| `pydantic_core.ValidationError` | Required env var missing | Check all required vars are set in Railway |
| GitHub Actions CI fails | Lint or type error | Read the Actions log, fix the error, push again |
| Railway deploy doesn't trigger | Deploy hook URL wrong/expired | Regenerate deploy hook in Railway settings |

### Files created by this guide

```
tiffin_tracker/
├── .github/
│   └── workflows/
│       ├── ci.yml          ← runs on every push and PR
│       └── deploy.yml      ← runs on push to main, deploys to Railway
├── tiffin_tracker_backend/
│   └── .python-version     ← tells Nixpacks to use Python 3.11
└── tiffin_tracker_app/
    └── vercel.json         ← enables Vercel Analytics
```

---

*Reference: [Deployment & CI/CD: The Complete Fundamentals Guide](./01-deployment-fundamentals.md)*
