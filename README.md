# Agentic AI Based Personalized Study Assistant

A study assistant for students: break a subject into topics, schedule sessions, practise with
quizzes, ask an AI tutor, and get reviews back right before you'd forget. Admins have a separate
console for accounts, activity and traffic.

- **Student app:** study plans, sessions, practice quizzes (sample bank and AI-written on any topic),
  an AI tutor that streams its answers, spaced-repetition reviews, and a dashboard built only from
  the student's own records. Works on phones.
- **Admin console:** its own sign-in, account search and controls (role, deactivate, sign out
  everywhere, send links), activity charts, live traffic, and an audit log of every admin action.
- **Accounts:** email verification before first sign-in, password reset, sessions in an HttpOnly
  cookie with CSRF protection.
- **AI:** any OpenAI-compatible API (Gemini's free tier by default), with several fallback models,
  so an overloaded model doesn't stop the tutor. No key, no AI features, and nothing invented.

## Run it locally

Requires Node 22+. No Docker needed.

```bash
npm install
npm run demo:local
```

Open **http://localhost:3000**. The first run takes about two minutes (it builds everything). To
turn on the AI tutor, copy `scripts/dev/ai.env.example` to `.local/ai.env`, add a key, and check it
with `npm run ai:check`. Details, the admin console and the demo walkthrough:
[docs/PROTOTYPE.md](docs/PROTOTYPE.md).

## Deploy

[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Docker Compose, the settings production requires, HTTPS,
creating the first admin, backups and updates. The services refuse to start in production with
unsafe settings, and say which ones.

## Project layout

| Path | What |
|---|---|
| `apps/web` | Next.js 15 app (student app and admin console) |
| `apps/api-gateway` | The only entry point for the browser's API calls: tokens, rate limits, routing |
| `apps/user-service` | Accounts, sessions, email, admin API |
| `apps/study-service` | Plans, sessions, quizzes, revision, the AI tutor and quiz writer |
| `apps/analytics-service` | Optional analytics |
| `packages/database` | Prisma schema and migrations (PostgreSQL) |
| `packages/shared`, `packages/auth` | Validation, errors, production checks; JWT and password hashing |
| `apps/ai-orchestrator`, `agents/*` | Optional Python agents (not needed; see DEPLOYMENT.md) |

## Tests

```bash
npm test --workspace=apps/api-gateway     # gateway: auth at the edge, rate limits, routing
npm test --workspace=apps/user-service    # accounts, sessions, admin (throwaway Postgres)
npm test --workspace=apps/study-service   # study data and the AI client (fake AI provider)
npm run smoke:local                       # end to end against the running local stack, live AI included
```
