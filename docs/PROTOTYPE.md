# Running the prototype locally

No Docker needed. Requires Node 22+. Deploying instead? See [DEPLOYMENT.md](DEPLOYMENT.md).

```bash
npm install
npm run demo:local   # for presenting: builds everything as in production (~2 min), then every page is fast
npm run dev:local    # for editing: hot reload, but each page compiles on its first visit
```

Run one or the other, not both: they share the web app's build folder. Either starts:

- a disposable Postgres under `.local/pg`, bound to 127.0.0.1:54329
- migrations
- user, study and analytics services, the gateway, and the web app

Everything binds to 127.0.0.1 only. It generates its own secrets in `.local/` and never reads `.env`.

Open **http://localhost:3000**. Use `localhost`, not `127.0.0.1`, so the session cookie matches. Press Ctrl+C in that terminal to stop everything.

## Admin console

The console is separate from the student app:

- Sign in at **http://localhost:3000/admin/login**. Only verified, active admin accounts can sign in there. Everyone else gets the same "Invalid admin credentials" message.
- An admin session lasts 12 hours.
- The normal student sign-in never grants admin access, even for an admin account. Admin APIs require both the stored ADMIN role and a session started at `/admin/login`.
- Visiting any `/admin` page without that session redirects to the admin sign-in. The console never renders.

What admins can see and do:

- **Overview:** live account counts, plus daily sign-ups, active users, study minutes and quiz attempts (14 or 30 days).
- **Traffic:** live request counters from the API gateway (counts only, no IP addresses). This includes requests per minute, error rate, rate-limited requests, failed sign-ins, and a breakdown by area.
- **Users:** search, filter and paginate. Each user page shows the account, security state, study plans and quiz scores.
- **Controls:**
  - change role
  - deactivate or reactivate
  - sign out everywhere
  - send a reset or verification link
  - mark an email as verified (with a warning)
  - delete permanently (only after deactivation, and only after typing the email to confirm)
- **Audit log:** every admin sign-in and action, and every time an admin opens someone's account (once per 10 minutes). Entries record who acted and what changed, never secrets or study content.

First admin, on a fresh database. With the stack running:

```bash
npm run admin:bootstrap -- you@example.com
```

This refuses if:

- an active admin already exists (use the console instead)
- the account is unverified or deactivated
- the database isn't on loopback
- `NODE_ENV` is `production`

## Demo script (about 5 minutes)

1. **Sign up.**
   - The "Check your email" screen opens and no session exists yet: `/dashboard` redirects to sign-in.
   - Signing in now shows "Verify your email first".
2. **Verify.**
   - Open `/dev/mailbox` (labelled *captured, not delivered*) and click the link.
   - The token moves from the address bar into memory. Nothing is sent until you enter your password and submit.
3. **Sign in.** The dashboard shows empty states, not sample numbers.
4. **Plan.**
   - Go to Study plans → New plan, then add topics and schedule a session.
   - Mark a topic done; it joins the revision queue for tomorrow.
   - Complete the session.
5. **Practice.**
   - Take a sample set; the server grades it.
   - The dashboard now shows real minutes, streak, plan progress and the quiz score.
6. **Admin.**
   - Sign in at `/admin/login`. The overview shows live counts and activity charts; Traffic updates every 10 seconds.
   - In Users, search, open a student and deactivate them (with a confirmation step).
   - The audit log records only who did what and the changed field.
   - Your own role and status controls are disabled.

## What is real, sample, or offline

| Area | Status |
|---|---|
| Accounts, verification, sessions, admin | Real, backed by Postgres |
| Dashboard figures | Real, derived from the student's own sessions, quizzes and reviews |
| Practice sets | **Sample question bank**, labelled in the UI. Scores are real results graded on the server |
| AI tutor, AI quiz, AI plan drafting | **Real, when a key is configured.** study-service calls any OpenAI-compatible API set in `.local/ai.env` (git-ignored; template in `scripts/dev/ai.env.example`). Currently Gemini's free tier, with a fallback model when the main one is busy. `npm run ai:check` tests the key without printing it. With no key, the UI says the tutor is unavailable and never invents answers. Quizzes are generated per topic, graded on the server and labelled AI-generated |
| Email | **Captured in the dev mailbox, not delivered.** SMTP delivery is implemented but untested without credentials |
| Analytics service | Starts, but the dashboard does not depend on it |
| Phones | Bottom tab bar for the main sections, 44 px tap targets, full-height tutor chat; checked at 375 and 360 px wide |
| Landing and sign-in 3D scene | Decorative. The pointer moves the light, a click changes the mood, and you can drag to spin it. Under reduced motion it stops animating on its own |

## Tests

```bash
npm test -w apps/user-service     # 36 integration tests on a throwaway Postgres
npm test -w apps/study-service    # 27 integration tests (AI against a fake local provider, streaming included)
npm run smoke:local               # 54 end-to-end checks against the running stack, real AI included
```

Orchestrator auth tests (5) need FastAPI, PyJWT, httpx and pytest in a virtualenv. Run them from `apps/ai-orchestrator`:

```bash
python -m pytest tests
```

Each Node suite starts its own Postgres in a temporary folder under `.local/` and deletes it afterwards.

## Known limits

- **Stale role claims in some services.**
  - Access tokens last 15 minutes.
  - user-service and study-service re-check the stored role and account status on every request.
  - analytics-service and the orchestrator trust the token until it expires.
- **Production deployment not exercised.** Docker and docker-compose were not run in this environment.
- **Legacy accounts must verify.** Password accounts created before the verification migration stay unverified and must use "Send a new verification link".
- **No browser automation suite.** UI flows were checked manually in a browser; there are no automated end-to-end UI tests.
