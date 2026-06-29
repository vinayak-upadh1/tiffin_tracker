# Deployment & CI/CD: The Complete Fundamentals Guide

> **Who this is for:** You've built a real full-stack SaaS app (FastAPI + React). You understand the code deeply. You've never deployed it or built a pipeline. This document teaches the *why* behind every decision, so when something breaks at 2 AM you understand what you're looking at — not just what commands to type.

---

## Table of Contents

1. [What Is Deployment?](#1-what-is-deployment)
2. [Environments & Environment Variables](#2-environments--environment-variables)
3. [Databases in Production](#3-databases-in-production)
4. [Serving a FastAPI App in Production](#4-serving-a-fastapi-app-in-production)
5. [Serving a React/Vite App](#5-serving-a-reactvite-app)
6. [CORS — Why It Exists and How to Get It Right](#6-cors--why-it-exists-and-how-to-get-it-right)
7. [HTTPS & Cookies in Production](#7-https--cookies-in-production)
8. [What Is CI/CD?](#8-what-is-cicd)
9. [GitHub Actions Fundamentals](#9-github-actions-fundamentals)
10. [Deployment Strategies (Theory)](#10-deployment-strategies-theory)
11. [Standard Industry Practices vs. Free-Tier Alternatives](#11-standard-industry-practices-vs-free-tier-alternatives)

---

## 1. What Is Deployment?

### The simplest possible definition

Deployment is the act of making your application accessible to users who are not you, on hardware that is not your laptop, running continuously even when you close your terminal.

Right now, Tiffin Tracker lives only on your machine. When you close VS Code, the app stops. When someone in Mumbai tries to reach it, they can't — there's no address to reach. Deployment solves all three of those problems.

### Local vs. Staging vs. Production

Every serious project has multiple **environments** — copies of the application running in different contexts with different purposes:

| Environment | Purpose | Who uses it | Data |
|-------------|---------|-------------|------|
| **Local (dev)** | Active development | Just you | Fake/seed data |
| **Staging** | Final verification before release | You + teammates | Copy of production data or realistic fake data |
| **Production (prod)** | Serving real users | Real customers | Real user data |

The reason this matters: **you can't safely test changes directly against production**. If you `DROP TABLE subscribers` on prod while testing a migration, your customers' data is gone. Staging gives you a place to catch that mistake first.

For an MVP on free tier, you'll start with just local + production. That's fine — but you need to be careful, because every deploy goes straight to users.

### What "going live" actually means technically

When you type `https://tiffin-tracker.in` into a browser, this is what happens:

1. **DNS resolution** — Your browser asks a DNS server: "What IP address is `tiffin-tracker.in`?" The DNS server returns something like `151.101.1.195`. DNS is essentially a global phone book mapping human-readable names to IP addresses.

2. **TCP connection** — Your browser opens a TCP connection to that IP address on port 443 (HTTPS).

3. **TLS handshake** — The server proves its identity by presenting a TLS certificate (the padlock in your browser). This establishes an encrypted channel.

4. **HTTP request** — Your browser sends `GET / HTTP/1.1` over the encrypted connection.

5. **Server process responds** — On that machine, a process (your Uvicorn server) is listening on port 443 (or on a port behind a reverse proxy). It processes the request and returns a response.

6. **Browser renders** — The browser receives HTML/JS/CSS and renders the page.

"Going live" means: pointing DNS at a machine that is always on, with your app process running, listening for connections, with TLS configured.

### Bare metal vs. VPS vs. PaaS vs. Serverless

These are the four main options for where your app runs. Understanding the tradeoffs helps you explain your choices and graduate to the next tier when revenue demands it.

**Bare Metal**
You rent a physical server. Full control, maximum performance, maximum complexity. You configure the OS, network, security, everything from scratch. Used by large companies with dedicated infrastructure teams (Google, Cloudflare). Not for you at this stage.

**VPS (Virtual Private Server)**
A virtual machine on shared hardware. Providers: DigitalOcean, Linode, Hetzner. You get root access to a Linux machine. You install Python, Nginx, configure systemd, manage SSL certificates with Certbot. More control and more work than PaaS. Cost: $6–$20/month. Good choice when you have 50+ paying customers and need more control or cost efficiency.

**PaaS (Platform as a Service)**
The platform manages the server, OS, patching, networking, and scaling. You give it your code; it runs it. Examples: Railway, Render, Heroku, Fly.io. You lose some control but gain enormous simplicity. **This is where Tiffin Tracker starts.** Railway handles everything below the application layer.

**Serverless**
Your code runs in stateless functions that spin up on-demand and shut down after the request. Examples: Vercel Functions, AWS Lambda, Cloudflare Workers. Perfect for stateless request/response — which is why your React app is deployed on Vercel (it's just static files). Not ideal for long-running processes or persistent connections (like your background session cleanup task in `main.py`).

**The graduation path:**
```
MVP (free PaaS) → Small business (paid PaaS or small VPS) → Growth (multi-region, containers on Kubernetes)
```

You are at step one. That's correct.

---

## 2. Environments & Environment Variables

### Why env vars exist

Imagine you hardcode your database password in `database.py`:

```python
# NEVER do this
engine = create_async_engine("mysql+aiomysql://root:mypassword123@localhost:3306/tiffin")
```

Problems:
1. You push this to GitHub and the password is now public forever (git history is hard to fully purge)
2. Your local password and your production password are different — now you need two versions of the file
3. Your CI pipeline needs the password — so it must be in the repo

Environment variables solve all three problems. They are values passed to a process from its surrounding environment, not baked into the code. The process reads them at startup.

In your app, `pydantic-settings` handles this beautifully in `app/config.py`:

```python
class Settings(BaseSettings):
    DATABASE_URL: str  # pydantic reads DATABASE_URL from the environment
    SECRET_KEY: str
    ...

    model_config = SettingsConfigDict(env_file=".env", ...)
```

When `get_settings()` is called, pydantic-settings looks for these values in:
1. Actual environment variables (set by the OS or the PaaS platform)
2. A `.env` file in the working directory (for local development convenience)

In production, Railway sets these as real environment variables. The `.env` file never leaves your machine.

### The 12-Factor App Principle

The [12-Factor App](https://12factor.net/) is a set of principles published in 2012 by Heroku engineers. Most of them are now standard practice. The most important one for this conversation is **Factor III: Config**.

> **Config:** Store config in the environment.

The full principle: *"Strict separation of config from code. Config varies substantially across deploys, code does not."*

This means your code should be **identically the same binary/bundle** across all environments. What changes between environments is only the config — injected at startup time via environment variables. This is why you can build your FastAPI app once and run it in dev, staging, and prod without modifying any Python file.

Your app follows this correctly. `app/config.py` reads everything from env vars. The only thing that changes between your laptop and Railway is the values of those variables.

### Development / Staging / Production: what differs and why all three matter

| Variable | Local Dev | Staging | Production |
|----------|-----------|---------|------------|
| `DATABASE_URL` | `mysql+aiomysql://root:@localhost/tiffin_dev` | `mysql+aiomysql://...railway-staging...` | `mysql+aiomysql://...railway-prod...` |
| `DEBUG` | `true` | `false` | `false` |
| `COOKIE_SECURE` | `false` | `true` | `true` |
| `COOKIE_DOMAIN` | `""` | `""` or `.yourdomain.com` | `.yourdomain.com` |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | `["https://staging.yourdomain.com"]` | `["https://yourdomain.com"]` |
| `RAZORPAY_KEY_ID` | Test key | Test key | Live key |

Notice `DEBUG=true` is only for local. In your `main.py`:

```python
app = FastAPI(
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)
```

This means `/docs` (the Swagger UI) is disabled in production. That's correct security hygiene — you don't want strangers browsing your API documentation and trying to call endpoints without authentication.

**Why all three environments matter:**

- **Local**: Fast iteration. You break things constantly. That's fine.
- **Staging**: You verify that the production-like configuration (real DB, HTTPS, real Razorpay test keys) works *before* your paying customers see it. A deploy that works locally but fails in prod is a terrible experience for users.
- **Production**: Real users, real money, real data. Changes here must be tested first.

At MVP stage, your "staging" is your local machine running with production-like env vars. That's an acceptable compromise — just be careful.

### How secrets should and shouldn't be handled

**Never:**
- Commit `.env` files to git
- Put credentials in code
- Put credentials in comments
- Use the same secret key in dev and prod
- Share credentials over Slack or email (use a password manager)

**Always:**
- List `.env` in `.gitignore`
- Rotate secrets if they're ever accidentally exposed
- Use different credentials for dev and prod (especially for Razorpay — use test keys in dev, live keys in prod)
- Store secrets in the platform's secret store (GitHub Secrets, Railway env vars, Vercel env vars)

**Check your `.gitignore`:**
```gitignore
# These should already be in your .gitignore
.env
.env.local
.env.production
*.env
```

If you ever accidentally committed a `.env` file, the password is in your git history forever even after you delete the file. The correct response is to rotate the secret (change the password/key), not just remove the file.

---

## 3. Databases in Production

### Why prod DB ≠ dev DB

Your local MySQL has:
- Fake seed data you created while testing
- Schema changes you applied by hand ("I just ran this SQL directly")
- No backups (you can drop everything and recreate it)
- A root password of `""` or `"password"`
- No connection limits

Your production MySQL needs:
- Real user data (irreplaceable)
- All schema changes applied through versioned, reviewed migrations
- Regular backups
- Strong credentials
- Connection pooling (many requests share a limited pool of connections)

The most dangerous mistake beginners make is manually editing the production database schema (running `ALTER TABLE` directly in a database client). **Never do this.** Every schema change must go through Alembic migrations, committed to git, and applied through the standard deployment process.

### What database migrations are and why Alembic is the right tool

A **migration** is a version-controlled script that transforms your database schema from one state to another. Think of it like git for your database schema.

Alembic generates Python scripts in `alembic/versions/`. You have four:
```
alembic/versions/
├── 220dc9fb7dc7_initial.py               ← created the base tables
├── b3e4f5a6b7c8_add_operator_sessions.py ← added the sessions table
├── c1d2e3f4a5b6_payment_delivery_changes.py
└── d2e3f4a5b6c7_move_billing_type_to_subscription.py
```

Each migration has:
- A unique revision ID
- An `upgrade()` function (apply the change)
- A `downgrade()` function (reverse the change)
- A `down_revision` pointer (forming a linked list of changes)

When you run `alembic upgrade head`, Alembic checks a table called `alembic_version` in your database, sees which revision was last applied, and runs all migrations from that point to `head` (the latest).

On a fresh database (like your new Railway MySQL), `alembic upgrade head` runs all four migrations in order, creating all your tables from scratch. This is reproducible and predictable — the opposite of "I ran some SQL by hand last Tuesday."

### Migration safety: before or after deploy?

This is one of the most important questions in backend deployments and the source of many production incidents.

**The core problem:**
```
Scenario A: Deploy code first, then migrate
  - New code runs against old schema
  - If new code expects a column that doesn't exist yet → crash

Scenario B: Migrate first, then deploy code
  - New schema runs against old code
  - If old code doesn't understand new columns → might be fine (if additive)
  - If migration dropped a column old code uses → crash
```

**The industry-standard answer: migration-first, backward-compatible migrations.**

The strategy:
1. Write migrations that are **additive** (add columns, add tables) — never destructively modify in a single step
2. Run the migration against the live database
3. Deploy the new code

For destructive changes (removing a column, renaming a column), use a two-deploy process:
1. **Deploy 1:** Add the new column, update code to write to both old and new, keep old column
2. **Wait:** Verify everything works
3. **Deploy 2:** Remove reads from old column, then migrate to drop it

**The blue/green mental model:**
Blue/green deployment means you have two identical environments. The "blue" environment is live. You deploy to "green" (which is identical to blue plus your new code). Once green is verified healthy, you switch traffic from blue to green. If anything is wrong with green, you instantly switch back to blue. The migration question in this model: run the migration against the shared database before switching traffic, so both blue and green are compatible with the new schema.

**For Tiffin Tracker at MVP stage:** Run `alembic upgrade head` manually before or immediately after each deploy. Railway gives you a "run command" interface for exactly this. Never automate migrations until you have a staging environment where you've tested the migration first.

### Connection pooling and why `pool_recycle` matters

Your `database.py` has:
```python
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_recycle=3600,
)
```

**What is a connection pool?**

Opening a database connection is expensive — it involves TCP handshaking, authentication, and allocating resources on both ends. It takes 10–50ms. Your API might handle 100 requests/second. You can't open a new connection for every request.

A **connection pool** is a cache of open connections. Your application maintains, say, 5 open connections. When a request comes in, it borrows a connection, uses it, and returns it to the pool. The next request reuses that same connection.

SQLAlchemy's default pool size is 5, with a maximum overflow of 10. For Railway's free tier MySQL, that's fine.

**What is `pool_recycle=3600`?**

MySQL closes idle connections after a period (the `wait_timeout` setting, often 8 hours on managed databases, sometimes less). If your pool holds a connection that MySQL has closed server-side, the next request that borrows it will get a "Connection lost" error.

`pool_recycle=3600` tells SQLAlchemy: "Recycle (close and reopen) any connection that is older than 3600 seconds (1 hour)." This ensures you never use a stale connection. On PaaS platforms like Railway, setting this is especially important because the database might also restart when Railway does maintenance. `3600` is a conservative, safe value.

---

## 4. Serving a FastAPI App in Production

### Why you don't just run `python main.py` in production

`python app/main.py` (if you had that entry point) starts a single Python process. Python has the Global Interpreter Lock (GIL), which means a single Python process can only execute one thread at a time. Under any real load, every request queues behind every other.

More practically: if an unhandled exception crashes that process, your app is down. There's nothing to restart it. There's no way to reload code without downtime. There's no concurrency.

FastAPI is an ASGI framework (Asynchronous Server Gateway Interface). To run it, you need an ASGI server.

### Uvicorn vs. Gunicorn vs. Uvicorn workers

**Uvicorn** is an ASGI server — it handles HTTP connections and dispatches them to your FastAPI app. Your `railway.toml` uses it directly:

```toml
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
```

`--host 0.0.0.0` means "accept connections on all network interfaces" (not just localhost). If you use `127.0.0.1`, external traffic can't reach it. On Railway, the platform routes external traffic to your container's `$PORT`.

`--port $PORT` — Railway assigns a random port and injects it as `$PORT`. Your app must bind to it.

**What about Gunicorn?** Gunicorn is a WSGI process manager (originally for synchronous frameworks like Django/Flask). It can manage multiple worker processes. A common production setup:

```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

This runs 4 Uvicorn worker processes managed by Gunicorn. If one worker crashes, Gunicorn restarts it. This is better than a single Uvicorn process.

**For Railway free tier:** A single Uvicorn process is fine. Railway's restart policy (`restartPolicyType = "on_failure"`) handles crashes by restarting the container. You don't need Gunicorn yet. When you're on a paid plan with more resources and handling real traffic (hundreds of concurrent users), add Gunicorn workers.

**FastAPI is async, so concurrency works differently:**

Your FastAPI endpoints use `async def`, which means they use Python's event loop (asyncio). A single Uvicorn process can handle many concurrent requests because while one request awaits a database query, the event loop runs other requests. This is I/O concurrency, not CPU parallelism. For a database-heavy app like Tiffin Tracker, this is excellent.

### Process managers, health checks, and graceful restarts

Your `railway.toml` configures all of these:

```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Health check:** Railway sends a `GET /health` request to your app. If it gets a 200 response, the app is healthy. If it fails (timeout or non-200), Railway considers the deploy failed and rolls back to the previous version. This is your safety net — Railway won't route traffic to a broken deploy.

Your `/health` endpoint in `main.py`:
```python
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
```

This is good. For a more robust health check, you could also test the database connection, but for now this is sufficient.

**Graceful restart:** When Railway deploys a new version, it sends a SIGTERM signal to your Uvicorn process. Uvicorn handles this by stopping accepting new requests and finishing the requests already in flight, then exiting. Railway then starts the new version. This is "graceful" — no requests get dropped mid-flight.

### What Nixpacks does and how Railway uses it

When you push code to Railway, it needs to figure out how to build and run it. You don't have a `Dockerfile`. Enter **Nixpacks**.

Nixpacks is an open-source build system created by Railway. It automatically detects your language and framework, generates a build plan, and creates a container image. For your Python app:

1. **Detection:** Nixpacks sees `requirements.txt` → Python project
2. **Python version:** Nixpacks reads the Python version from `.python-version` file (if present) or defaults to a recent version. Add a `.python-version` file containing `3.11` to be explicit.
3. **Install phase:** `pip install -r requirements.txt`
4. **Start command:** From `railway.toml`: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Result:** A Docker image is built and pushed to Railway's registry. Railway runs a container from this image.

You never write a Dockerfile, but a container still runs your app. Nixpacks creates the Dockerfile for you. The trade-off: less control over the exact image, but zero Docker expertise required.

---

## 5. Serving a React/Vite App

### What `vite build` produces

When you run `tsc -b && vite build`:

1. TypeScript compiles (type-checking only — Vite handles the actual transpilation)
2. Vite bundles all your JS/TS/CSS into a small number of optimized files
3. Output goes to `dist/`:

```
dist/
├── index.html
├── assets/
│   ├── index-Bk3X9abc.js    ← your entire React app, minified
│   ├── index-Cp4Y8def.css   ← all your CSS, minified
│   └── hero-Dq5Z9ghi.png    ← your images, renamed with content hash
```

Notice the content hashes in filenames (e.g., `index-Bk3X9abc.js`). This is **cache-busting**. When you deploy a new version, the filename changes, so browsers download the new file instead of serving the cached old one. The `index.html` always references the latest hashes.

The result is **entirely static** — HTML, CSS, JavaScript, and image files. No server-side computation needed to serve them.

### Why static apps can be served from a CDN

A CDN (Content Delivery Network) is a network of servers distributed globally. When a user in Chennai visits your site, they connect to the nearest CDN node (maybe in Mumbai) rather than a server in the US. The CDN serves cached static files with very low latency.

Your React app can be served from a CDN because:
- Every file is static (the same content for every user)
- There's no server-side computation — no Python, no database
- Files can be cached indefinitely (the content hash changes when content changes)

Vercel is, at its core, a CDN for static files with a build pipeline attached. When you deploy, Vercel:
1. Runs your build command (`tsc -b && vite build`)
2. Takes the `dist/` output
3. Distributes those files across its global CDN edge network
4. Configures routing rules (for SPA routing — more below)

### What Vercel does under the hood (CDN edge, build pipeline, SPA routing)

**SPA routing:** Your React app uses client-side routing (React Router v7). The browser handles routes like `/subscribers`, `/dashboard` entirely in JavaScript — no server requests are made for route changes. But what if a user refreshes the page at `https://your-app.vercel.app/subscribers`?

The CDN receives a request for `/subscribers`. There's no `subscribers.html` in `dist/`. Without special configuration, the CDN would return a 404.

Vercel knows this. For apps with a single-page app pattern, Vercel routes all requests to `index.html`, which loads your React bundle, which handles the `/subscribers` route in the browser. This is configured automatically when Vercel detects a Vite/React build.

**Preview deployments:** Every push to any branch (not just `main`) gets its own unique URL like `https://tiffin-tracker-app-git-feature-xyz-yourname.vercel.app`. This is your lightweight staging environment for the frontend. You can share this URL with someone to review before merging.

### Build-time vs. runtime env vars: the `VITE_` prefix

This is one of the most important concepts to understand about frontend deployments. **It will bite you if you don't understand it.**

Server-side apps (FastAPI) read environment variables at **runtime** — when the process starts, it reads the current value of `DATABASE_URL`. You can change the env var and restart the server; it picks up the new value.

Frontend apps are different. `vite build` is a **build-time** process. The JavaScript bundle is compiled once and served as a static file. There is no "process" running when a user visits your site — the browser just downloads static files.

Vite's solution: variables prefixed with `VITE_` are **inlined into the bundle at build time**. When Vite processes `import.meta.env.VITE_API_URL`, it replaces that entire expression with the actual string value (e.g., `"https://tiffin-tracker.up.railway.app"`).

**What this means for you:**

If you change `VITE_API_URL` on Vercel, the existing bundle is unaffected. You must trigger a new build (redeploy) for the new value to take effect. The new bundle will then have the new URL baked in.

**What `VITE_API_URL` becomes in your code:**

In your Axios client (`src/api/client.ts`), you probably have something like:
```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});
```

After `vite build`, the bundle contains something like:
```javascript
const apiClient = axios.create({
  baseURL: "https://tiffin-tracker.up.railway.app",
  withCredentials: true,
});
```

The `import.meta.env.VITE_API_URL` is gone. The string is baked in.

**Security implication:** Never put secrets in `VITE_` variables. They end up in the JavaScript bundle, which anyone can read by opening DevTools. Only use `VITE_` variables for public, non-secret configuration like API URLs.

---

## 6. CORS — Why It Exists and How to Get It Right

### The browser same-origin policy

Web browsers implement the **Same-Origin Policy (SOP)**: JavaScript running on `https://tiffin-tracker.vercel.app` cannot make HTTP requests to `https://tiffin-tracker.up.railway.app` by default.

Why? Security. Without SOP, malicious JavaScript on `https://evil.com` could make requests to `https://your-bank.com/transfer` using the victim's session cookies. The browser's same-origin policy prevents this by blocking cross-origin requests at the browser level.

An "origin" is defined as: **protocol + domain + port**. `https://app.vercel.app` and `https://api.railway.app` are different origins. `http://localhost:5173` and `http://localhost:8000` are also different origins (different ports).

### What CORS actually is

**CORS (Cross-Origin Resource Sharing)** is the mechanism that lets a server explicitly say: "I'm okay with JavaScript from *this specific origin* making requests to me."

CORS is implemented via HTTP headers. The server adds headers to its responses that the browser reads. If the headers say the requesting origin is allowed, the browser lets the JavaScript see the response. If not, the browser blocks it (even though the server processed the request).

**The key response headers:**
```
Access-Control-Allow-Origin: https://tiffin-tracker.vercel.app
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

**Preflight requests:** Before making a "non-simple" request (POST with JSON body, PUT, DELETE, or requests with custom headers), the browser first sends an `OPTIONS` request to the server to ask: "Can I make this request?" This is called a **preflight**. The server responds with the CORS headers above. If the origin is allowed, the browser proceeds with the real request.

Simple GET requests with standard headers don't trigger preflights. POST requests with JSON (`Content-Type: application/json`) do trigger preflights.

### How FastAPI's CORS middleware works

In `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # reads from env var
    allow_credentials=True,               # allows cookies to be sent
    allow_methods=["*"],                  # allow all HTTP methods
    allow_headers=["*"],                  # allow all request headers
)
```

`allow_credentials=True` is required for your app because the browser sends the HttpOnly refresh token cookie with requests. If credentials are not allowed, the browser won't include cookies in cross-origin requests.

**Critical constraint:** When `allow_credentials=True`, you **cannot** use `allow_origins=["*"]` (the wildcard). You must explicitly list allowed origins. FastAPI will raise an error if you try. This is why `settings.CORS_ORIGINS` must be set to the exact Vercel URL in production.

### CORS across environments

| Environment | `CORS_ORIGINS` value |
|------------|---------------------|
| Local dev | `["http://localhost:5173"]` |
| Production | `["https://tiffin-tracker-app.vercel.app"]` |
| With custom domain | `["https://app.tiffin-tracker.in"]` |

If you have both a Vercel URL and a custom domain in production, list both:
```
CORS_ORIGINS=["https://tiffin-tracker-app.vercel.app","https://app.tiffin-tracker.in"]
```

The most common CORS debugging mistake: getting a CORS error in the browser and assuming the CORS configuration is the problem, when actually the server crashed before it could add the CORS headers to the response. Always check the backend logs first.

---

## 7. HTTPS & Cookies in Production

### Why HTTPS is non-negotiable in prod

HTTPS is HTTP over TLS (Transport Layer Security). Without it:
- Passwords, JWT tokens, and all API data travel in plaintext over the network
- Any router or ISP between the user and your server can read it (man-in-the-middle)
- Browsers actively warn users about non-HTTPS sites and block certain features

With HTTPS, the connection is encrypted. Even if someone captures the network packets, they see encrypted gibberish.

Both Railway and Vercel provide HTTPS automatically at no cost, using Let's Encrypt certificates. You do not configure TLS manually — it just works.

### How Railway and Vercel handle TLS automatically

- **Vercel:** Every deployment gets a `*.vercel.app` subdomain with a Vercel-managed TLS certificate. Custom domains also get auto-provisioned Let's Encrypt certificates.
- **Railway:** Every service gets a `*.up.railway.app` subdomain. Railway provisions a TLS certificate and terminates TLS at its edge (the request arrives at your Uvicorn process as plain HTTP internally, but external users see HTTPS). Custom domains also get auto-provisioned certs.

"TLS termination at the edge" means: the TLS encryption/decryption happens at Railway's load balancer before the request reaches your container. Inside Railway's network, traffic between the load balancer and your container is plain HTTP. This is standard PaaS behavior and perfectly secure.

### HttpOnly + Secure + SameSite cookies

Your auth system uses an HttpOnly cookie to store the refresh token. Let's understand each flag and why they're essential in production.

**HttpOnly:** The cookie cannot be accessed by JavaScript (`document.cookie` won't show it). This protects against XSS attacks — if malicious JavaScript somehow runs on your page, it cannot steal the refresh token.

**Secure:** The cookie is only sent over HTTPS connections. This prevents the refresh token from being transmitted in plaintext over HTTP. **This must be `true` in production and `false` in local dev** (because local dev uses `http://localhost`).

**SameSite:** Controls when the browser sends the cookie with cross-site requests.
- `Strict`: Cookie only sent for same-site requests (extremely restrictive)
- `Lax`: Cookie sent for same-site requests and top-level cross-site navigations (e.g., clicking a link) — this is the default and generally correct
- `None`: Cookie sent in all cross-site contexts, but requires `Secure=true`

Your `config.py` defaults:
```python
COOKIE_SECURE: bool = True   # override to False in local .env
COOKIE_SAMESITE: str = "lax"
COOKIE_DOMAIN: str = ""      # blank for localhost; ".yourdomain.com" in prod
```

### The cross-domain cookie problem in production

This is a subtlety that will affect your production deployment. Your frontend is on `*.vercel.app` and your backend is on `*.railway.app`. **These are completely different domains.**

With `SameSite=Lax`, cookies set by `railway.app` are not automatically sent in cross-site requests from `vercel.app`. This means your refresh token cookie won't be included in `/auth/refresh` calls.

**Solutions:**

**Option A (Recommended for MVP):** Use `SameSite=None; Secure=true`. This explicitly allows the cookie to be sent cross-site. Requires HTTPS (which you have). Set in Railway:
```
COOKIE_SAMESITE=none
COOKIE_SECURE=true
```

**Option B (Better long-term):** Use a custom domain for both frontend and backend under the same domain (e.g., `app.tiffin-tracker.in` for frontend and `api.tiffin-tracker.in` for backend). With `COOKIE_DOMAIN=.tiffin-tracker.in`, cookies set by `api.tiffin-tracker.in` will be sent by `app.tiffin-tracker.in`. Use `SameSite=Lax` which is more restrictive and more secure.

Option B requires a paid domain (~₹800/year for a `.in` domain), but it's the right architecture and will also satisfy Razorpay's requirement for a real domain on production webhooks.

For the initial deploy, Option A works. Phase 10 of the hands-on guide covers custom domains.

---

## 8. What Is CI/CD?

### CI — Continuous Integration

**Continuous Integration (CI)** is the practice of merging code changes from all developers into a shared main branch frequently (multiple times per day), with automated checks running on every merge.

The "integration" in CI refers to integrating code from multiple developers. In the pre-CI era, developers would work in isolation for weeks, then try to merge everything — resulting in massive, painful conflicts and broken code. CI makes integration a routine, small event rather than a catastrophic one.

**What CI catches:**
- Syntax errors and type errors (before they reach production)
- Linting violations (code style inconsistencies)
- Test failures (logic errors, regressions)
- Build failures (your TypeScript won't compile)
- Import errors (you deleted a module another file depends on)

CI runs in a fresh, isolated environment. This matters because it catches "works on my machine" bugs — code that works locally because of a globally installed package or a manually configured environment variable that isn't in the repo.

**Key CI principle:** If CI fails, the branch does not merge. Period. The developer fixes the issue before merging.

### CD — Continuous Delivery vs. Continuous Deployment

These terms are often confused:

**Continuous Delivery** means every commit that passes CI is *ready* to deploy at the push of a button. Deployment requires a human action (a button click, an approval). This is appropriate for systems where you want human oversight on every release (financial systems, regulated industries).

**Continuous Deployment** means every commit that passes CI is *automatically* deployed to production without human intervention. This is what most modern web apps do. If tests pass, it ships.

Tiffin Tracker will use Continuous Deployment: push to `main` → CI passes → automatic deploy to Railway + Vercel.

### The pipeline concept: trigger → build → test → deploy

A pipeline is a sequence of automated steps, each depending on the previous. Visually:

```
                   ┌─────────────┐
  git push    ──►  │   TRIGGER   │
                   └──────┬──────┘
                          │
                   ┌──────▼──────┐
                   │    BUILD    │  (install dependencies, compile)
                   └──────┬──────┘
                          │ fail → stop, notify
                   ┌──────▼──────┐
                   │    TEST     │  (lint, type check, unit tests)
                   └──────┬──────┘
                          │ fail → stop, notify
                   ┌──────▼──────┐
                   │   DEPLOY    │  (send to Railway / Vercel)
                   └─────────────┘
```

If any step fails, the pipeline stops and reports the failure. The developer sees the failure in the GitHub PR or Actions tab, fixes it, and pushes again.

### Why the pipeline runs in a fresh, isolated environment

Your pipeline runs on a **GitHub-hosted runner** — a VM that GitHub spins up fresh for every run, then destroys after. This means:

- No state carries over between runs (no "I ran this manually last week and it's still cached")
- Your code must be self-contained (all dependencies listed in `requirements.txt` or `package.json`)
- You can't blame "the CI environment is weird" — it's always fresh
- Multiple pipelines can run in parallel

The fresh environment also means you must explicitly install everything. A common beginner mistake: forgetting to add a package to `requirements.txt` and only noticing in CI when it says `ModuleNotFoundError`.

### Artifacts

An **artifact** is a file produced by the build process that is preserved for later use. In CI/CD:

- Your compiled Python app doesn't produce a standalone artifact (Python is interpreted)
- Your React app produces a `dist/` folder — this is the artifact
- Docker images are artifacts (built once, deployed many times)
- Test reports are artifacts (HTML reports, coverage data)

For Tiffin Tracker: GitHub Actions can upload `dist/` as an artifact (for inspection or download). We don't use this pattern here because Vercel rebuilds from source on every deploy, but it's useful to know for larger projects where the build is expensive and you want to build once and deploy the same artifact to staging and then production.

---

## 9. GitHub Actions Fundamentals

### Workflows, jobs, steps, runners — the mental model

GitHub Actions has a clear hierarchy:

```
Workflow (.github/workflows/ci.yml)
└── Job (backend-ci)
    ├── Step (Checkout code)
    ├── Step (Set up Python 3.11)
    ├── Step (Cache pip dependencies)
    ├── Step (Install dependencies)
    └── Step (Run ruff)
└── Job (frontend-ci)          ← runs in PARALLEL with backend-ci
    ├── Step (Checkout code)
    ├── Step (Set up Node 20)
    └── Step (npm ci + lint + build)
```

**Workflow:** A YAML file in `.github/workflows/`. Defines when to run and what to do.

**Job:** A set of steps that run on a single runner. Jobs within a workflow run in parallel by default (unless you add `needs:` to create dependencies).

**Step:** A single action — either a shell command (`run:`) or a reusable action (`uses:`).

**Runner:** The VM that executes a job. `runs-on: ubuntu-latest` provisions a fresh Ubuntu VM. GitHub also offers `windows-latest` and `macos-latest`.

Each job gets its own fresh runner. Jobs don't share filesystem state with each other (this is why both `backend-ci` and `frontend-ci` jobs both start with `Checkout code`).

### Triggers: push, pull_request, workflow_dispatch, schedule

```yaml
on:
  push:
    branches: [main, develop]    # run when pushing to these branches
  pull_request:
    branches: [main]             # run when PRs target main
  workflow_dispatch:             # run manually from GitHub UI
  schedule:
    - cron: '0 2 * * *'        # run daily at 2 AM UTC
```

For Tiffin Tracker, you'll use:
- `push: branches: [main]` — triggers the deploy workflow
- `pull_request: branches: [main]` — triggers CI on PR (so you see CI results before merging)
- `push` (all branches) — triggers CI on every push (catches errors early)

### Secrets in GitHub Actions

Secrets are encrypted key-value pairs stored in GitHub, accessible to your workflow as environment variables. They are masked in logs (replaced with `***`).

Where to add them: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Access in workflow:
```yaml
env:
  RAILWAY_DEPLOY_HOOK_URL: ${{ secrets.RAILWAY_DEPLOY_HOOK_URL }}
# or directly:
- run: curl -X POST ${{ secrets.RAILWAY_DEPLOY_HOOK_URL }}
```

**Security model:** Secrets are available to workflows triggered by pushes to the repo. For pull requests from **forks**, secrets are NOT passed (to prevent a malicious PR from printing your secrets). This is important if you ever open-source the repo.

### Environment protection rules

GitHub Environments are named deployment targets (e.g., "production") with optional protection rules:

- **Required reviewers:** A human must approve the deploy before it runs
- **Wait timer:** Add a delay between the CI passing and the deploy starting
- **Deployment branches:** Only allow certain branches to deploy to this environment

For your setup, you don't strictly need environments — the deploy workflow just runs when CI passes. But if you add a "production" environment with required reviewers, a person must click "Approve" in GitHub before the deploy fires. Useful when you're handling real financial transactions and want a second pair of eyes.

### Matrix builds

A matrix builds the same job with multiple configurations:

```yaml
strategy:
  matrix:
    python-version: ["3.10", "3.11", "3.12"]
```

This runs the job three times in parallel, once for each Python version. Used for library authors who need to support multiple versions. For Tiffin Tracker, you only target Python 3.11, so no matrix needed.

### Caching dependencies

Installing packages on every CI run is slow. `pip install -r requirements.txt` takes 30–60 seconds. `npm ci` takes 20–40 seconds. On 10 PRs per day, that's a meaningful amount of wasted time.

GitHub Actions has a `cache` action that stores a directory between runs and restores it on the next run, keyed by a hash of the file that determines what's in the cache.

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: pip-${{ hashFiles('tiffin_tracker_backend/requirements.txt') }}
    restore-keys: pip-
```

- `path`: the directory to cache (pip's download cache)
- `key`: if `requirements.txt` hasn't changed, this key matches the cache from the last run → restore and skip installing
- `restore-keys`: fallback keys if exact match fails → restore a partial cache (still faster than nothing)

Cache hits save 30–90 seconds per run. Across hundreds of CI runs, this matters.

---

## 10. Deployment Strategies (Theory)

### Rolling deploy

Traffic gradually shifts from the old version to the new version. At any moment, some users hit the old version and some hit the new version. This is the simplest strategy requiring no additional infrastructure.

```
Old: [v1] [v1] [v1] [v1]
         ↓  (rolling update)
         [v1] [v2] [v1] [v1]
         [v2] [v2] [v1] [v1]
         [v2] [v2] [v2] [v1]
         [v2] [v2] [v2] [v2]
```

**Risk:** Two versions are live simultaneously. If v1 writes a DB record in a format v2 can't read (backward-incompatible schema change), some requests will fail during the rollout.

**Mitigation:** Make schema changes backward-compatible (see §3 on migrations).

### Blue/Green deploy

Two identical production environments: "blue" (currently live) and "green" (new version). Deploy to green, run health checks and smoke tests, then switch all traffic from blue to green in one atomic operation. Blue stays running as instant rollback.

**Advantage:** Zero downtime, instant rollback.

**Disadvantage:** Requires 2x infrastructure (expensive). Not practical on free tier.

### Canary deploy

Route a small percentage of traffic (1–5%) to the new version. Monitor error rates and latency. If metrics look good, gradually increase the percentage. If not, roll back.

**Advantage:** Gradual rollout reduces the blast radius of bugs.

**Disadvantage:** Requires traffic splitting infrastructure and good observability.

### What Railway actually does when you push

Railway uses a rolling restart:

1. You trigger a deploy (via deploy hook or direct push)
2. Railway pulls your latest code from GitHub
3. Nixpacks builds a new container image
4. Railway starts the new container alongside the old one
5. Railway sends `GET /health` to the new container
6. If `/health` returns 200 within `healthcheckTimeout` (30 seconds per your `railway.toml`), Railway routes traffic to the new container and stops the old one
7. If `/health` fails, Railway keeps the old container running and marks the deploy as failed

**What you give up on free tier:** True zero-downtime deploys require both the old and new versions to be compatible with each other during the overlap window. For Tiffin Tracker, the overlap is very short (seconds), and your migrations are run before deploy, so in practice downtime is negligible.

### Zero-downtime deploys: what it takes

True zero-downtime requires:
1. **Health checks** (you have these)
2. **Backward-compatible migrations** (you must enforce this discipline)
3. **Graceful shutdown** (Uvicorn handles SIGTERM correctly)
4. **Connection draining** — the old instance finishes in-flight requests before shutdown (Railway supports this)

What Railway's free tier cannot guarantee:
- If your app takes more than 30 seconds to start (e.g., a large ML model loading), the health check times out and the deploy fails
- If your startup has a one-time task that takes resources, it may interfere with health check response times

For Tiffin Tracker: startup is fast (no heavy initialization), so this is not a concern.

---

## 11. Standard Industry Practices vs. Free-Tier Alternatives

| Concern | Industry Standard | Our Free-Tier Approach | What We Give Up | When the Trade-off Stops Being Acceptable |
|---------|------------------|----------------------|-----------------|------------------------------------------|
| **Containerization** | Docker — every team member and CI environment runs the exact same image, eliminating "works on my machine" | Nixpacks on Railway — auto-builds a container without you writing a Dockerfile | Reproducibility: Nixpacks could pick a slightly different Python version on different builds; less control over base image, installed tools, and build cache behavior | When you need precise control over the environment (e.g., adding system libraries, matching exact production dependencies in CI), or when deploying to a platform that requires a Dockerfile (most Kubernetes setups) |
| **Orchestration** | Kubernetes — manages hundreds of containers, auto-scales, handles node failures, rolling updates | Railway managed containers — Railway's own scheduler runs your container, handles restarts, and provides basic scaling | Horizontal scaling, complex multi-service orchestration, fine-grained resource limits, deployment strategies like canary | When your app needs more than 1 instance (sustained traffic beyond ~100 rps), or when you add services (Redis, workers, ML inference) that need independent scaling |
| **Staging environment** | A fully separate environment identical to production, with production-like data, used to verify every release before it reaches users | Railway preview environments (paid) / Vercel preview URLs (free) — Vercel auto-deploys every branch to a unique URL; Railway preview environments require a paid plan | Full end-to-end staging test of the backend + database together. Vercel previews test only the frontend against prod backend, which can mask backend-specific issues | As soon as you have paying customers and any team members beyond yourself. The cost of a production incident is higher than the cost of a $5/month Railway staging environment |
| **Secret management** | AWS Secrets Manager, HashiCorp Vault — centralized, audited, rotatable secrets with fine-grained access control and automatic rotation | GitHub Secrets + Railway/Vercel env var dashboards — easy UI, secrets masked in logs, not exposed to PRs from forks | Secret rotation automation, audit log of who accessed which secret, cross-service secret sharing, secret versioning | When you have more than one developer, when compliance audits require access logs, or when you handle PCI/PII data under regulation |
| **Test coverage in CI** | Full unit + integration + E2E test suite — catches regressions, enables confident refactoring, serves as living documentation | Lint + type check only (ruff + mypy for backend, tsc + eslint for frontend) | Regressions in business logic won't be caught automatically. A bug in `deliveries.py` could ship to production undetected | The moment you have a customer whose data you might corrupt, or when you start refactoring. Add `pytest` with database fixtures in Week 2 of operations. The investment pays off immediately |
| **Monitoring & alerting** | Datadog, New Relic — distributed tracing, custom metrics, alerting, SLOs, dashboards | Railway built-in metrics + Vercel Analytics + Sentry free tier (5K errors/month) | Distributed tracing (seeing a request across multiple services), custom business metrics, on-call alerting (PagerDuty), historical metrics beyond 7 days | When you have paying customers and need to proactively detect issues before customers report them. Sentry covers errors. The next free addition is UptimeRobot (external uptime monitoring) |
| **Database redundancy** | Multi-region primary + replicas, automated failover, point-in-time recovery | Single-region Railway MySQL with manual backup | If Railway's Mumbai region has an outage, your database is inaccessible. No automated backups unless you script them. No read replicas for scaling | When your SLA requires >99.9% uptime, when you have users across multiple continents who need low-latency DB reads, or when you have any customer data you cannot afford to lose. At ₹299/month pricing and <50 subscribers, a 1-hour outage per month is acceptable |

### The path forward

The right time to upgrade each of these is when the pain of not having it is greater than the cost of implementing it. For an MVP with no paying customers yet:
- Free tier is correct
- Write the tests (that's free — just discipline)
- Add Sentry (free and 10 minutes to set up)

After your first 5 paying customers:
- Seriously consider a Railway paid plan for staging + database backups

After 20 paying customers:
- Custom domain (₹800/year)
- Proper staging environment
- Weekly manual database backups (or automated with a Railway cron job)

After 100 paying customers:
- Evaluate VPS (Hetzner CX21 = €5/month, significantly more control and power than free PaaS)
- Consider a managed MySQL service (PlanetScale has a generous free tier)
- Add pytest to your CI pipeline

---

*Continue to Document 2: [Deploy Tiffin Tracker: Hands-On Step-by-Step Guide](./02-deployment-hands-on.md)*
