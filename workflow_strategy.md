# Tiffin Tracker — Zero to First Paying Customer in 4 Weeks

---

## Tech Stack (Final, No Debate)

| Layer | Choice | Reason |
|---|---|---|
| Backend runtime | FastAPI + Uvicorn | Given. Async, fast, auto OpenAPI docs for free |
| ORM | SQLAlchemy 2.0 (async) + Alembic | Type-safe, migrations built-in, works perfectly with FastAPI |
| Auth | JWT via `python-jose` + `passlib[bcrypt]` | Stateless, no Redis needed in week 1 |
| Database | MySQL 8 on Railway | Given. Railway's managed add-on = zero ops |
| Frontend | React (Vite, not CRA) | Faster builds, modern default |
| Styling | TailwindCSS | No design decisions. Utility-first = ship faster |
| Data fetching | TanStack Query (React Query) | Cache + loading states for free, eliminates boilerplate |
| Forms | React Hook Form + Zod | Pair well, Zod schemas reusable for validation |
| HTTP client | Axios with an interceptor | Auto-attach JWT, redirect on 401 |
| Icons | Lucide React | Lightweight, consistent |
| Dates | `date-fns` | Smaller than moment, tree-shakeable |
| Backend deploy | Railway (FastAPI service + MySQL add-on) | ~$5–10/month, no cold starts on Hobby plan |
| Frontend deploy | Vercel | Free tier, GitHub push-to-deploy |
| Payments | Razorpay | Indian market, UPI/GPay, payment links, webhooks |

**What you are NOT using:** Redis (not needed until v2), Celery (APScheduler in-process is enough for MVP reminders), Docker (Railway handles it with a `railway.toml`), Nginx (Railway proxy handles it).

---

## Folder Structure

```
tiffin_tracker_backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, router includes
│   ├── config.py            # Settings via pydantic-settings
│   ├── database.py          # SQLAlchemy async engine + session
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── routers/             # auth, operators, subscribers, plans,
│   │                        # subscriptions, deliveries, payments
│   ├── services/            # Business logic (payment reminders, billing)
│   └── dependencies.py      # get_current_operator, get_db
├── alembic/
├── requirements.txt
└── railway.toml

tiffin_tracker_app/
├── src/
│   ├── api/                 # Axios instance + per-resource API functions
│   ├── components/          # Shared UI (StatusBadge, EmptyState, etc.)
│   ├── pages/               # Dashboard, Subscribers, Deliveries, Payments
│   ├── hooks/               # useSubscribers, useDeliveries, usePayments
│   └── main.tsx
├── index.html
├── vite.config.ts
└── package.json
```

---

## Database Schema (MySQL)

```sql
-- The paying SaaS customer
CREATE TABLE operators (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  phone         VARCHAR(15)  NOT NULL UNIQUE,
  email         VARCHAR(150) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  business_name VARCHAR(150),
  upi_id        VARCHAR(100),           -- shown in reminder messages
  plan          ENUM('trial','basic') DEFAULT 'trial',
  plan_expires_at DATETIME,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Operator's meal subscribers
CREATE TABLE subscribers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operator_id INT UNSIGNED NOT NULL,
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(15)  NOT NULL,
  address     TEXT,
  notes       TEXT,
  status      ENUM('active','paused','cancelled') DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES operators(id),
  INDEX idx_operator_status (operator_id, status)
);

-- Meal plans offered by the operator
CREATE TABLE plans (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operator_id          INT UNSIGNED NOT NULL,
  name                 VARCHAR(100) NOT NULL,   -- "Lunch Only", "Lunch+Dinner"
  meal_type            ENUM('lunch','dinner','both') NOT NULL,
  price_per_month      DECIMAL(8,2) NOT NULL,
  deliveries_per_month TINYINT UNSIGNED NOT NULL,  -- 22, 26, 30
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id) REFERENCES operators(id)
);

-- Which subscriber is on which plan
CREATE TABLE subscriptions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subscriber_id INT UNSIGNED NOT NULL,
  plan_id       INT UNSIGNED NOT NULL,
  operator_id   INT UNSIGNED NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE,
  status        ENUM('active','paused','cancelled') DEFAULT 'active',
  pause_start   DATE,
  pause_end     DATE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id),
  FOREIGN KEY (plan_id)       REFERENCES plans(id),
  FOREIGN KEY (operator_id)   REFERENCES operators(id)
);

-- Daily delivery log
CREATE TABLE deliveries (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operator_id     INT UNSIGNED NOT NULL,
  subscriber_id   INT UNSIGNED NOT NULL,
  subscription_id INT UNSIGNED NOT NULL,
  delivery_date   DATE NOT NULL,
  meal_type       ENUM('lunch','dinner') NOT NULL,
  status          ENUM('delivered','skipped','paused') DEFAULT 'delivered',
  notes           VARCHAR(255),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_delivery (subscriber_id, delivery_date, meal_type),
  INDEX idx_operator_date (operator_id, delivery_date),
  FOREIGN KEY (operator_id)   REFERENCES operators(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

-- Monthly payment record per subscriber
CREATE TABLE payments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operator_id     INT UNSIGNED NOT NULL,
  subscriber_id   INT UNSIGNED NOT NULL,
  subscription_id INT UNSIGNED,
  billing_month   DATE NOT NULL,          -- always 1st of month: 2026-06-01
  amount_due      DECIMAL(8,2) NOT NULL,
  amount_paid     DECIMAL(8,2) DEFAULT 0,
  payment_method  ENUM('gpay','cash','upi','razorpay','other'),
  status          ENUM('pending','partial','paid') DEFAULT 'pending',
  paid_at         DATETIME,
  notes           VARCHAR(255),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sub_month (subscriber_id, billing_month),
  INDEX idx_operator_month (operator_id, billing_month),
  FOREIGN KEY (operator_id)   REFERENCES operators(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

-- Audit trail for sent WhatsApp reminders
CREATE TABLE reminder_logs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operator_id   INT UNSIGNED NOT NULL,
  subscriber_id INT UNSIGNED NOT NULL,
  payment_id    INT UNSIGNED,
  message       TEXT,
  sent_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operator_id)   REFERENCES operators(id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);
```

**Key design decisions:**
- `billing_month` is always the 1st of the month — simple to query (`WHERE billing_month = '2026-06-01'`)
- `deliveries` has a `UNIQUE` constraint so bulk-mark is idempotent (INSERT ... ON DUPLICATE KEY UPDATE)
- `upi_id` on operator is used to pre-fill WhatsApp reminder messages — no payment API needed for subscriber reminders
- No `users` table separate from `operators` — keep it simple; each operator is their own account

---

## Prioritized Feature List

### Non-negotiable MVP (ship by end of Week 2)
1. Operator login / JWT auth
2. Subscriber CRUD + status management (active / paused / cancelled)
3. Plan CRUD
4. Assign subscriber to a plan (create subscription)
5. Daily delivery log — bulk-mark all active subscribers, then uncheck skipped ones
6. Monthly payment tracking — mark paid/amount/method per subscriber
7. WhatsApp reminder deep-link — opens `wa.me` with pre-written message including amount + UPI ID
8. Dashboard home — 3 numbers: active subscribers, delivered today, unpaid this month
9. Mobile-responsive layout (operators use phones)

### Required by Week 3 (before charging)
10. Operator Razorpay billing — ₹299/month subscription, webhook activates account
11. Subscription pause/resume with date range
12. Onboarding checklist (add plan → add subscriber → log first delivery)
13. Trial mode with hard limit: 5 subscribers max, no billing features until paid

### Cut to v2 (do not touch in 4 weeks)
- Customer-facing payment portal
- Automated WhatsApp/SMS via API (Twilio, WATI, Interakt)
- Bulk CSV import of subscribers
- Delivery route map
- Multi-user (operator + assistant)
- Inventory / grocery tracking
- GST/accounting reports
- Mobile app (PWA or React Native)
- AI delivery predictions or smart reminders
- Subscriber self-service portal

---

## Week-by-Week Plan

---

### Week 1 — June 2–8 | Foundation + Core CRUD
**Available hours: ~26h**

**Goal:** By Sunday night, there is a live URL where you can log in, see a subscriber list, add/edit subscribers, and it's deployed.

**What to build (in order):**

*Day 1–2 (weekdays, ~5h total):*
- Scaffold `tiffin_tracker_backend`: FastAPI app, `pydantic-settings` config, SQLAlchemy async engine, Alembic, Railway project + MySQL add-on, `railway.toml`, first migration (all 7 tables), deploy
- Scaffold `tiffin_tracker_app`: Vite + React + TypeScript + Tailwind, Axios instance with JWT interceptor, React Router, Vercel project connected to GitHub, deploy (blank shell)

*Day 3–5 (weekdays, ~7.5h total):*
- Backend: Auth endpoints (`POST /auth/login` → JWT, `GET /auth/me`)
- Backend: Operator seed script (one test operator in DB)
- Backend: `GET/POST/PUT/DELETE /subscribers` with operator scoping on every query
- Backend: `GET/POST/PUT /plans`

*Weekend (Saturday–Sunday, ~12h):*
- Frontend: Login page → stores JWT in localStorage, redirect to dashboard
- Frontend: Subscribers list page — table with name, phone, status badge (green/yellow/red), status filter tabs
- Frontend: Add/Edit subscriber drawer or modal with React Hook Form + Zod
- Frontend: Plans page — list + add form
- Wire it all up; fix CORS, Railway env vars, Vercel env vars

**What to ship:** Live URL (yourapp.railway.app / vercel.app). You can log in, see an empty subscriber list, add Subscriber #1, change their status.

**What to validate:** Show this to one person who knows a tiffin operator. Get their reaction to the subscriber list UI. Is the status concept clear without explanation?

---

### Week 2 — June 9–15 | Delivery Logging + Payment Tracking
**Available hours: ~26h**

**Goal:** The full daily workflow is functional. An operator can do her morning routine entirely in the app.

**What to build (in order):**

*Weekdays (~12.5h):*
- Backend: `POST /deliveries/bulk` — accepts `{date, subscriber_ids[], status}`, idempotent via `INSERT ... ON DUPLICATE KEY UPDATE`
- Backend: `GET /deliveries?date=YYYY-MM-DD` — returns today's delivery list pre-populated with all active subscribers
- Backend: `GET/POST/PATCH /payments` — monthly payment records; `PATCH` marks paid + logs method + amount
- Backend: `GET /dashboard/summary` — single endpoint returning: `{active_count, delivered_today, unpaid_this_month, unpaid_total_amount}`
- Backend: Auto-create payment records when a subscription is created (create one row in `payments` for current month)

*Weekend (~14h):*
- Frontend: Dashboard home — 3 stat cards (active subscribers, delivered today, total unpaid ₹). Tap "2 unpaid" → jumps to Payments tab
- Frontend: Deliveries page — date picker (defaults today), list of active subscribers each with a toggle (delivered ✓ / skipped ✗). One "Mark All Delivered" button at top. Save button calls bulk endpoint
- Frontend: Payments page — table filtered to current month. Columns: Name, Plan, Amount Due, Paid, Status, Actions. "Mark Paid" button opens a small modal (amount, method: GPay/Cash/UPI, notes). "Remind" button generates WhatsApp deep-link
- WhatsApp reminder link format: `https://wa.me/91{phone}?text={encodeURIComponent(message)}` where message = `"Hi {name}, your tiffin bill for {month} is ₹{amount}. Please send on GPay: {operator_upi_id}. Thank you! 🙏"`
- Log each reminder click to `reminder_logs`

**What to ship:** The core daily loop is complete. Add 5 test subscribers, log 3 days of deliveries, mark 2 as paid, send 1 WhatsApp reminder.

**What to validate:** Find 1 real tiffin operator (see acquisition section below). Do a 20-minute live demo over a video call or in person. Watch where she gets confused. Fix the top 2 friction points before Week 3.

---

### Week 3 — June 16–22 | Mobile Polish + Razorpay + First Paying Customer
**Available hours: ~26h**

**Goal:** Charging ₹299 by Friday June 19. First paid operator live.

**What to build (in order):**

*Weekdays (~12.5h):*
- Mobile responsive audit: every page must work on a 375px wide screen. Tailwind `sm:` breakpoints. Hamburger nav for mobile. Test on your own phone
- Subscription pause/resume: `PATCH /subscriptions/{id}` with `{status: 'paused', pause_start, pause_end}`. Frontend: button on subscriber detail page
- Onboarding checklist: if operator has 0 plans → show banner "Add your first plan →". If 0 subscribers → show "Add your first subscriber →". Disappears once both are done
- Trial enforcement: middleware checks if `operator.plan == 'trial'` and `subscriber_count > 5` → return 402 on create subscriber. Frontend shows upgrade banner

*Weekend (~14h):*
- Razorpay operator billing: Create a Razorpay subscription plan (₹299/month) via Razorpay dashboard (do this manually once). In your app: "Upgrade" button → `POST /billing/create-subscription` → backend creates Razorpay subscription → returns `subscription_id + payment_link` → redirect operator to Razorpay hosted page → on success, Razorpay webhook hits `POST /billing/webhook` → backend sets `operator.plan='basic'` and `plan_expires_at = now + 30 days`
- Razorpay webhook: verify signature with `razorpay-python`, update operator plan status
- "Upgrade to Pro" page in frontend with feature list and ₹299/month CTA

**What to ship:** One real operator is using the app and you've collected ₹299 from her.

**What to validate:** Did the Razorpay payment flow work end-to-end on a real phone? Did the operator actually log deliveries for 2+ days this week?

---

### Week 4 — June 23–30 | Retention + Scale to 3 Paying Customers
**Available hours: ~26h**

**Goal:** 3 paying operators (₹897/month ARR). App stable enough for operators to use independently.

**What to build (in order):**

*Weekdays (~12.5h):*
- Monthly rollover: `POST /payments/generate-monthly` — creates payment records for next month for all active subscriptions. Run manually via a protected admin endpoint or trigger from a simple cron on Railway (`railway cron`)
- Subscriber payment history: on subscriber detail page, show last 3 months' payment records
- Basic CSV export: `GET /payments/export?month=2026-06&format=csv` — returns Name, Phone, Amount Due, Paid, Method. Operators love this for their own records
- Bug fixes from operator feedback week 3

*Weekend (~14h):*
- Landing page (separate static page, can be a single `index.html` on Vercel): Problem statement → 3 screenshots → ₹299/month → "Start Free Trial" → links to `/register`
- Operator registration endpoint + page (previously you seeded manually; now self-serve): `POST /auth/register` — creates operator with `plan=trial`, sends a WhatsApp welcome message via your personal number (just manual for now)
- Password reset (email via Resend.com — free tier, dead simple, 3000 emails/month free)
- Outreach: contact 10 more operators this week (see acquisition section)

**What to ship:** 3 paying operators. Landing page live. Self-serve registration working.

---

## What to Cut If You're Running Behind

**If Week 1 is late:** Cut plans CRUD from the frontend. Hard-code 3 plan options in the DB seed. Add the plans UI in Week 2.

**If Week 2 is late:** Cut the WhatsApp reminder logging (don't write to `reminder_logs`). The wa.me link still works, just no audit trail.

**If Week 3 is late:** Do Razorpay billing manually. Create the subscription from the Razorpay dashboard, mark operator as paid in the DB directly. Ship billing automation in Week 4. Do NOT delay charging — collect ₹299 via UPI manually and update the DB.

**If Week 4 is late:** Cut CSV export. Cut self-serve registration (keep doing manual onboarding). 3 paying customers is the goal, not feature completeness.

**Non-negotiable (never cut):** Auth, subscriber CRUD, delivery log, payment tracking, WhatsApp reminder link, mobile responsiveness, Razorpay billing.

---

## First Customer Acquisition (Specific, Not Generic)

This is where most solo builders fail. Here is exactly what to do, in order.

**Week 1–2: Find candidates (takes 2–3h total, do this in parallel with building)**

1. **Your own network first.** Send this WhatsApp message to 20 people in your contact list: *"Hey, building a small app for home tiffin operators — do you know anyone who runs a tiffin service (home-cooked, 20–50 customers)? Just need 20 mins of their time. Happy to help them for free initially."* In urban India, most people know at least one. This is your fastest path.

2. **Facebook Groups.** Search: "tiffin service Pune", "home food Bangalore", "tiffin wali Mumbai", "homemade tiffin Hyderabad". Every group has 5–20 operators advertising. Message them directly: *"Hi, I'm building a free tool to track tiffin deliveries and payments — looking for 3 operators to try it free for a month. Interested?"* Send to 15 operators across 3 cities. Expect 3–5 replies.

3. **Google Maps.** Search "home tiffin service" in Pune / Bangalore / Hyderabad. Call or WhatsApp the mobile numbers listed. These operators are already digitally discoverable — higher intent.

4. **JustDial / Sulekha.** Search "tiffin service near me" in any city. Same outreach message.

**Week 2: Qualify and demo**

From your 5–8 replies, pick the 3 who are actively running (20+ subscribers). Do a 20-minute screen-share demo. The goal of the demo: show her the WhatsApp reminder flow. That is the moment every operator goes "oh this is exactly what I need." Don't pitch — just ask: *"Does this save you time?"*

Offer: *"Use it free for 2 weeks. After that it's ₹299/month. If it doesn't save you 30 minutes a day, don't pay."*

**Week 3: Convert to paid**

After 2 weeks of use, call each operator: *"Are you still using it? What would you change?"* If she's used it, she'll pay. The ask: *"I'm going to start charging ₹299/month from next week. You can pay on my app directly or send on GPay."* If she hesitates: offer ₹199 for the first month.

**Week 4: Get to 3 paying**

With 1 paying customer, ask her: *"Do you know other tiffin operators?"* Word of mouth in this community is strong — operators talk in the same WhatsApp groups and local women's networks. One happy operator will introduce you to 2 more.

---

## MVP: What Day 1 Looks Like for a Real Operator

When Meena opens the app for the first time on a Monday morning, she sees a clean dashboard with three numbers: **32 active subscribers, 32 delivered today** (she taps "Mark All Delivered" and it's done in one tap), and **4 unpaid this month — ₹7,200 outstanding** in red. She taps the unpaid card and sees Priya, Sunita, Kavya, and Ritu listed with their amounts. She taps "Remind" next to Priya's name and WhatsApp opens on her phone with a message already written: *"Hi Priya, your tiffin bill for June is ₹1,800. Please send on GPay: 9876543210. Thank you! 🙏"* — she hits send in 2 seconds. She comes back to the app, marks Sunita as paid (₹2,200 via cash), and she's done. Total time: 4 minutes. Her previous workflow with her notebook and manual WhatsApp messages took 40.

---

## Critical Path (what must be true each Sunday)

| Date | Must be true |
|---|---|
| June 8 | Live URL deployed. Login works. Can add a subscriber |
| June 15 | Delivery log + payment tracking + WhatsApp reminder working. 1 real operator has seen a demo |
| June 22 | App is mobile-responsive. ₹299 collected from first paying operator |
| June 30 | 3 paying operators. Self-serve registration live |

---

## Bootstrap Commands

```bash
mkdir tiffin_tracker_backend tiffin_tracker_app
cd tiffin_tracker_backend && python -m venv venv && source venv/bin/activate
pip install fastapi uvicorn[standard] sqlalchemy[asyncio] aiomysql alembic \
    python-jose[cryptography] passlib[bcrypt] pydantic-settings python-dotenv razorpay
```
