# Auth System Strategy — Tiffin Tracker

## 1. Current State (What We Have)

| Component | Status |
|---|---|
| Google OAuth login | ✅ Working |
| JWT access token (7-day) | ✅ Working |
| Protected API endpoints via `get_current_operator` | ✅ Working |
| Frontend token storage in `localStorage` | ✅ Working |
| Refresh token mechanism | ❌ Missing |
| Session / token table in DB | ❌ Missing |
| Logout / token revocation | ❌ Missing |
| Rate limiting on auth endpoints | ❌ Missing |
| Multi-device session management | ❌ Missing |
| Login audit log | ❌ Missing |

---

## 2. Target Architecture

### Token Design: Short Access + Long Refresh

The standard industry pattern is two-token architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│  ACCESS TOKEN (JWT, stateless)                                  │
│  • Expires: 15 minutes                                         │
│  • Stored: in-memory (frontend JS variable / React state)      │
│  • Used: every API request (Authorization: Bearer <token>)     │
│  • Verified: locally, no DB hit needed                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  REFRESH TOKEN (opaque random string, server-side stateful)     │
│  • Expires: 30 days (sliding — resets on each use)             │
│  • Stored: HttpOnly Secure cookie (frontend) + hashed in DB    │
│  • Used: only to get a new access token                        │
│  • Verified: DB lookup (invalidatable → supports real logout)  │
└─────────────────────────────────────────────────────────────────┘
```

**Why short access tokens?**  
If an access token is stolen (XSS, MITM), it's usable for only 15 minutes. The refresh token is in an HttpOnly cookie, so JavaScript (and XSS attackers) can never read it.

**Why opaque refresh tokens (not JWT)?**  
JWT refresh tokens can't be invalidated without a blocklist. Opaque tokens stored in DB give us real logout, per-device revocation, and compromise detection.

---

## 3. Session Table Design

```sql
CREATE TABLE operator_sessions (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    operator_id     INT NOT NULL,              -- FK to operators.id
    token_hash      VARCHAR(64) NOT NULL,      -- SHA-256 of refresh token
    device_label    VARCHAR(200),              -- "Chrome on macOS", "iPhone Safari"
    ip_address      VARCHAR(45),               -- IPv4/IPv6 at login time
    user_agent      VARCHAR(500),
    expires_at      DATETIME NOT NULL,         -- absolute expiry (30 days from last use)
    last_used_at    DATETIME NOT NULL,         -- used for sliding window
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_revoked      BOOLEAN NOT NULL DEFAULT FALSE,

    INDEX idx_token_hash (token_hash),
    INDEX idx_operator_id (operator_id),
    INDEX idx_expires_at (expires_at),

    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE
);
```

**What lives in the session row:**
- `token_hash` — we never store the raw token, only `SHA-256(token)`, same as storing a password hash
- `expires_at` — updated to `NOW() + SESSION_LIFETIME_DAYS` each time the token is used (sliding window)
- `last_used_at` — for analytics and idle session detection
- `is_revoked` — soft-delete; lets us blacklist a token immediately (logout, compromise)

---

## 4. Complete Auth Flows

### 4.1 Login (Google OAuth)

```
Browser                    Backend                    Google
  │                           │                          │
  │── Google Sign-In button ──►│                          │
  │                           │── verify_oauth2_token ──►│
  │                           │◄── {email, google_id} ───│
  │                           │
  │                           │── upsert Operator row
  │                           │── generate refresh_token = secrets.token_urlsafe(32)
  │                           │── INSERT operator_sessions(token_hash, expires_at=now+30d)
  │                           │── generate access_token JWT (exp=15min)
  │                           │
  │◄── access_token (JSON) ───│  (stored in memory/React state)
  │◄── refresh_token (HttpOnly Secure SameSite=Lax cookie) ──│
```

### 4.2 Authenticated API Request (Happy Path)

```
Browser                    Backend
  │                           │
  │── GET /api/... ───────────►│
  │   Authorization: Bearer <access_token>
  │                           │── decode JWT (no DB hit, instant)
  │                           │── inject operator into route
  │◄── 200 OK ────────────────│
```

### 4.3 Access Token Expiry — Silent Refresh

This happens automatically on the frontend via an Axios interceptor:

```
Browser                    Backend
  │── GET /api/... ───────────►│
  │◄── 401 Unauthorized ───────│  (access token expired)
  │
  │── POST /auth/refresh ─────►│  (cookie sent automatically by browser)
  │   [HttpOnly cookie: refresh_token]
  │                           │── hash incoming token → look up session in DB
  │                           │── check: not revoked, expires_at > now()
  │                           │── UPDATE expires_at = now() + 30d  (sliding window!)
  │                           │── UPDATE last_used_at = now()
  │                           │── generate new access_token JWT
  │◄── { access_token } ──────│
  │
  │── GET /api/... ───────────►│  (retry original request with new token)
  │◄── 200 OK ────────────────│
```

### 4.4 Refresh Token Rotation (Recommended, Optional)

On every refresh, issue a new refresh token and revoke the old one. This detects token theft: if the same old token is used again after rotation, something is wrong → revoke all sessions for this operator.

```
On POST /auth/refresh:
  1. Look up session by token_hash
  2. If is_revoked=true → someone is replaying a revoked token → revoke ALL sessions for this operator → return 401
  3. If valid → mark old session revoked, INSERT new session with new token, return new access_token + set new cookie
```

This is called **Refresh Token Rotation with Reuse Detection** — standard in Auth0, Supabase, etc.

### 4.5 Logout

```
Browser                    Backend
  │── POST /auth/logout ──────►│
  │   [HttpOnly cookie: refresh_token]
  │                           │── hash token → find session
  │                           │── UPDATE is_revoked=true
  │                           │── clear cookie (Set-Cookie: expires=past)
  │◄── 200 OK ────────────────│

Browser clears access_token from memory → user is logged out everywhere
```

**Logout all devices:**
```
POST /auth/logout/all
→ UPDATE operator_sessions SET is_revoked=true WHERE operator_id=? 
```

---

## 5. Configuration

All values live in `.env` and are read via `app/config.py`:

```env
# Token lifetimes
ACCESS_TOKEN_EXPIRE_MINUTES=15
SESSION_LIFETIME_DAYS=30

# Refresh token rotation
REFRESH_TOKEN_ROTATION_ENABLED=true

# Cookie settings
COOKIE_SECURE=true          # false in local dev (requires HTTPS)
COOKIE_SAMESITE=Lax         # Lax: works for normal browsing, blocks CSRF from cross-site forms
COOKIE_DOMAIN=              # leave blank for localhost; set to .yourdomain.com in prod

# Rate limiting (on auth endpoints)
LOGIN_RATE_LIMIT=10/minute  # max 10 login attempts per IP per minute
REFRESH_RATE_LIMIT=60/minute
```

`SESSION_LIFETIME_DAYS=30` is the sliding window. As long as the user makes at least one request every 30 days, they never need to log in again. If they go 30+ days without opening the app, they get kicked to the login page — this is the expected behavior.

---

## 6. Backend Implementation Plan

### Phase 1 — Session Infrastructure

**Files to create/modify:**

```
app/
├── models/
│   └── session.py          ← NEW: OperatorSession SQLAlchemy model
├── schemas/
│   └── auth.py             ← UPDATE: add RefreshResponse, LogoutResponse
├── services/
│   └── auth.py             ← UPDATE: add refresh token generation, hashing, rotation
├── routers/
│   └── auth.py             ← UPDATE: add POST /auth/refresh, POST /auth/logout, POST /auth/logout/all, GET /auth/sessions
├── dependencies.py         ← UPDATE: keep existing get_current_operator (no change needed for normal requests)
├── config.py               ← UPDATE: add new config vars
└── main.py                 ← UPDATE: register new auth routes
```

**Alembic migration:** Add `operator_sessions` table.

### Phase 2 — Harden Existing Endpoints

- Add `slowapi` (rate limiting library) to `POST /auth/google` and `POST /auth/refresh`
- Add `X-Request-ID` logging to all auth endpoints
- Clean up expired sessions via a background task on app startup (`asyncio.create_task`)

### Phase 3 — Session Management API (Nice to Have)

```
GET  /auth/sessions         → list active sessions (device, IP, last_used)
DELETE /auth/sessions/{id}  → revoke a specific session (logout one device)
POST /auth/logout/all       → revoke all sessions
```

---

## 7. Frontend Implementation Plan

### Token Storage Strategy

| Token | Storage | Why |
|---|---|---|
| Access token | React state / in-memory | Cleared on tab close; XSS-safe |
| Refresh token | HttpOnly Secure cookie | Browser manages it; JS can't touch it |

**Note:** localStorage for the access token (current approach) is acceptable if XSS risk is low, but moving to in-memory is more secure. We can do this without breaking the UX.

### Axios Interceptor — Silent Refresh

```typescript
// src/api/client.ts — replace the current 401 handler

let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue requests while refresh is in-flight
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post("/auth/refresh");  // cookie sent automatically
        const newToken = data.access_token;
        setAccessToken(newToken);  // update in-memory token
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        processQueue(new Error("Session expired"), null);
        window.location.href = "/login";
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

The `failedQueue` pattern ensures that if 5 requests fire simultaneously when the token is expired, only one refresh call is made and all 5 are retried with the new token.

---

## 8. Security Checklist

| Control | Mechanism |
|---|---|
| Token theft (XSS) | Access token in-memory; refresh token in HttpOnly cookie |
| Token theft (network) | HTTPS in prod; `Secure` cookie flag |
| CSRF on refresh endpoint | `SameSite=Lax` cookie; no state-changing GET requests |
| Brute force / credential stuffing | Rate limit `POST /auth/google` and `POST /auth/refresh` |
| Token reuse after logout | `is_revoked` flag in DB; checked on every refresh |
| Stolen refresh token (replay) | Token rotation + reuse detection → full session revoke |
| Long-lived token risk | 15-min access tokens limit damage window |
| Stale sessions | `expires_at` sliding window; background cleanup job |
| Operator account takeover | Login audit log; alert on new device/IP (future) |

---

## 9. What We Are NOT Doing (and Why)

| Skipped Feature | Reason |
|---|---|
| JWT refresh tokens | Can't be revoked without a blocklist — opaque DB tokens are cleaner |
| Redis for token store | Overkill for MVP; MySQL is fine at our scale |
| 2FA / TOTP | Post-MVP; Google OAuth already provides some second factor |
| Email/password login | Not needed; Google OAuth covers all users |
| Token binding (DPoP) | Advanced; add later if enterprise customers need it |

---

## 10. Implementation Order

```
Week 1 (Core):
  1. Add OperatorSession model + Alembic migration
  2. Update config.py with new settings
  3. Update auth service: token generation, hashing, rotation logic
  4. Add POST /auth/refresh endpoint
  5. Add POST /auth/logout endpoint
  6. Update POST /auth/google to create session row + set cookie

Week 1 (Frontend):
  7. Switch access token to in-memory (React context)
  8. Implement silent refresh interceptor in client.ts
  9. Handle logout cookie clearing

Week 2 (Hardening):
  10. Add slowapi rate limiting
  11. Add background task to purge expired sessions
  12. Add GET /auth/sessions + DELETE /auth/sessions/{id}
  13. Add login_at to OperatorSession for audit trail
```

---

## 11. File Reference Summary

| File | Change |
|---|---|
| `app/models/session.py` | NEW — OperatorSession model |
| `app/config.py` | Add ACCESS_TOKEN_EXPIRE_MINUTES, SESSION_LIFETIME_DAYS, COOKIE_SECURE, etc. |
| `app/services/auth.py` | Add: generate_refresh_token(), hash_token(), verify_refresh_token(), rotate() |
| `app/routers/auth.py` | Add: POST /auth/refresh, POST /auth/logout, POST /auth/logout/all |
| `app/dependencies.py` | No breaking changes; keep get_current_operator as-is |
| `alembic/versions/` | New migration for operator_sessions table |
| `src/api/client.ts` | Replace 401 handler with silent refresh + queue pattern |
| `src/hooks/useAuth.ts` | Switch to in-memory token + expose refresh flow |
| `.env` / `.env.example` | Add new config vars |
