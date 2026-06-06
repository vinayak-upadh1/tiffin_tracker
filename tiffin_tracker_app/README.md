# Tiffin Tracker — Frontend

React + TypeScript dashboard for tiffin operators.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in VITE_API_URL and VITE_GOOGLE_CLIENT_ID
npm run dev            # runs at http://localhost:5173
```

See [docs/setup.md](docs/setup.md) for full setup and Vercel deployment instructions.

## Tech Stack

- **React 18** + **TypeScript** — UI framework
- **Vite** — build tool and dev server
- **TailwindCSS** — styling
- **TanStack Query** — server state / data fetching
- **React Router v6** — client-side routing
- **React Hook Form** + **Zod** — form validation
- **@react-oauth/google** — Google Sign-In button
- **Axios** — HTTP client with JWT interceptor
- **Lucide React** — icons
- **date-fns** — date utilities

## Pages

| Route | Description |
|---|---|
| `/login` | Google OAuth sign-in |
| `/` | Dashboard (Week 2: delivery + payment summary) |
| `/subscribers` | Subscriber list with status filters, add/edit drawer |
| `/plans` | Meal plan cards with add/edit modal |
