# Frontend Setup Guide

## Prerequisites
- Node.js 20+ (installed via nvm)
- Backend running on port 8000

## Local Development

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
```

Required values:
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL, e.g. `http://localhost:8000` |
| `VITE_GOOGLE_CLIENT_ID` | Same Client ID as backend `.env` |

### 3. Start the dev server
```bash
npm run dev
```

App runs at: `http://localhost:5173`

## Vercel Deployment

1. Push to GitHub
2. Import repo in [vercel.com](https://vercel.com/new)
3. Set environment variables in Vercel dashboard:
   - `VITE_API_URL` = your Railway backend URL
   - `VITE_GOOGLE_CLIENT_ID` = your Google Client ID
4. Add your Vercel URL to Google OAuth authorized origins

## Project Structure

```
src/
├── api/           # Axios API functions (one file per resource)
│   ├── client.ts  # Axios instance + JWT interceptor
│   ├── auth.ts    # /auth endpoints
│   ├── subscribers.ts
│   └── plans.ts
├── components/    # Reusable UI components
│   ├── Layout.tsx        # Sidebar + mobile nav + outlet
│   ├── StatusBadge.tsx   # active/paused/cancelled badge
│   ├── SubscriberDrawer.tsx
│   └── PlanModal.tsx
├── hooks/
│   └── useAuth.ts   # JWT token state (localStorage)
└── pages/
    ├── LoginPage.tsx
    ├── DashboardPage.tsx
    ├── SubscribersPage.tsx
    └── PlansPage.tsx
```
