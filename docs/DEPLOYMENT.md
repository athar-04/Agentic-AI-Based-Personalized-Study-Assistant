# Deploying Agentic Study

This is the path from a fresh server to a running site. For local development and demos see
[PROTOTYPE.md](PROTOTYPE.md).

## What runs

```
Browser ──HTTPS──▶ caddy (:80, :443, the only published ports)
                     ├── /api/v1/* ──▶ api-gateway ──▶ user-service ─┐
                     │                              ├─▶ study-service ├─▶ Postgres, Redis
                     │                              └─▶ analytics     ┘
                     └── everything else ──▶ web (Next.js)
                                    study-service ──▶ AI provider (Gemini by default)
```

`docker compose up` starts exactly this: Caddy, Postgres, Redis, a one-off `migrate` job, the four
Node services and the web app. Caddy terminates HTTPS (certificates are automatic), sends API calls
straight to the gateway and pages to the web app. Nothing else is reachable from outside.

The Python agent services, MongoDB, Celery and Flower in `docker-compose.yml` are **not needed**:
the tutor, quizzes and plan drafting run in study-service. They call the paid OpenAI API and only
start with `docker compose --profile agents up`.

## Before you deploy: what you need to have

| Item | Why | Notes |
|---|---|---|
| A server with Docker and Docker Compose v2 | Runs the stack | 2 vCPU / 4 GB RAM is comfortable to start |
| A domain whose DNS points at the server, ports 80 and 443 open | Caddy gets the HTTPS certificate automatically; the app refuses to start without HTTPS | See [HTTPS](#https) below |
| An SMTP account (e.g. Amazon SES, Brevo, Postmark, Google Workspace SMTP relay) | Sign-up verification and password-reset emails | **Real SMTP delivery has never been tested in this project.** Send yourself a sign-up email before inviting anyone. |
| An AI key | Tutor, AI quizzes, plan drafting | Gemini's free tier works; check with `npm run ai:check`. Without a key those features say "unavailable" and nothing else breaks. |
| Your organisation's name and a contact email | Shown on the privacy and terms pages | `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_CONTACT_EMAIL` |
| Legal review of `/privacy` and `/terms` | They are first drafts describing what the app does | Required before offering the service to the public (India's DPDP Act applies to student data) |

## Deploy

```bash
git clone <your repository> agentic-study && cd agentic-study
cp .env.example .env
```

Edit `.env`. Every line marked **REQUIRED IN PRODUCTION** must be set:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SITE_ADDRESS` | `study.example.com` (your domain, no `https://`) |
| `APP_URL` | `https://study.example.com` (your address; email links point here) |
| `ALLOWED_ORIGINS` | the same address |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | two **different** values from `openssl rand -hex 32` |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | long random values (`openssl rand -hex 24`) |
| `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your SMTP account; `MAIL_TRANSPORT=smtp` |
| `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_REASONING_EFFORT`, `AI_FALLBACK_MODEL` | as in `.env.example` (Gemini) |
| `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_CONTACT_EMAIL` | for the privacy and terms pages |
| `DEV_MAILBOX` | `false` (it is ignored in production anyway) |
| `COOKIE_SECURE` | `true` |

Then:

```bash
docker compose up -d --build
docker compose ps        # every service should become "healthy"; migrate shows "exited (0)"
```

**If a service keeps restarting**, read its log: `docker compose logs user-service`. In production
each service checks its settings before it starts and stops with a list such as

```
Refusing to start user-service in production:
  - JWT_SECRET is still the placeholder from .env.example.
  - SMTP_HOST is not set; sign-up verification and password-reset emails cannot be sent.
```

It names the setting, never its value. Fix `.env` and run `docker compose up -d` again.

### HTTPS

Built in. Caddy obtains and renews a certificate for `SITE_ADDRESS` on first start, as long as the
domain's DNS points at the server and ports 80 and 443 are open. `docker compose logs caddy` shows
the certificate being issued. There is no plain-HTTP mode: the app refuses to start in production
without HTTPS. Use a staging subdomain for trials.

**Keep Caddy as the only way in.** The gateway's per-visitor rate limits (sign-in protection
included) depend on Caddy setting `X-Forwarded-For` from the real connection. Next.js passes that
header through unchecked, so publishing the web app or the gateway directly would let anyone pick
their own address and bypass the limits. Compose binds the web app to `127.0.0.1` for that reason.

Caddy ignores any `X-Forwarded-For` that arrives from outside. If you put a cloud load balancer
in front of Caddy, add its address ranges to Caddy's
[`trusted_proxies`](https://caddyserver.com/docs/caddyfile/options#trusted-proxies) option, or every
visitor will appear to be the load balancer.

### The first admin

Admins are never created by sign-up, and there are no built-in credentials.

1. Open the site and sign up normally, then confirm your email from the link you receive.
2. Promote that account (works only while there is no admin yet):

   ```bash
   docker compose run --rm tools npx tsx apps/user-service/scripts/bootstrap-admin.ts --production you@example.com
   ```

3. Sign in at `https://study.example.com/admin/login`. Further admins are granted from the admin
   console, and every change is in its audit log.

### Check it works

- Sign up with a real address and confirm you receive the verification email.
- Ask the AI tutor a question; generate a quiz on a topic.
- Open the admin console, look at Users and Traffic.
- From the server, `npm run ai:check` (with `.local/ai.env`) or the Traffic page shows whether the
  AI is answering.

## Updating

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically (`migrate`) before the services start, and the services
finish requests in flight before stopping. Take a backup first if the update includes a migration
(new folder under `packages/database/prisma/migrations`).

## Backups

The database is the only state that matters (Redis holds rate-limit counters and caches).

```bash
# Back up (run daily from cron, and copy the file off the server)
docker compose exec -T postgres pg_dump -U postgres -Fc agentic_ai_study > backup-$(date +%F).dump

# Restore into an empty database
docker compose exec -T postgres pg_restore -U postgres -d agentic_ai_study --clean --if-exists < backup-YYYY-MM-DD.dump
```

Test a restore once before you rely on the backups.

## Operating it

| Task | Command |
|---|---|
| Status and health | `docker compose ps` |
| Logs | `docker compose logs -f api-gateway` (or any service) |
| Restart one service | `docker compose restart study-service` |
| Is the AI answering? | admin console, or `npm run ai:check` locally with the same key |

Request logs contain IP addresses and URLs (one-time codes and tokens in URLs are redacted). Keep
them only as long as you need them; the privacy notice says so.

### Scaling notes

Run **one** gateway container. Its rate-limit counters and the admin console's traffic counters
are kept in memory, so several gateways would each count separately. Moving the counters to Redis
is the step before scaling out. The other services can run several copies behind the gateway.

## Security defaults, and why

| Default | Reason |
|---|---|
| Only Caddy is published (80/443) | Real client addresses for rate limits, HTTPS everywhere; the web app, gateway and services stay on the private network |
| Startup refuses placeholder/short JWT secrets, `http://` URLs, captured mail, in-memory Redis | Each of these silently breaks security or email in production |
| Rate limits per signed-in account, sign-in limits per account tried | Students often share one IP (campus Wi-Fi, mobile carrier NAT); per-IP limits would lock out a class |
| Request bodies capped at 512 KB | The largest valid request is ~250 KB; also limits validation work per request |
| Timeouts at every hop: browser (30 s, 80 s for AI), gateway to a silent service (30 s / 75 s), a stalled request body (45 s) | Nothing waits forever: a hung connection ends in a "please try again" |
| Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, no `X-Powered-By` | Scripts, fonts and API calls only from the site itself; no framing |
| Next.js image optimizer off | The app doesn't use it, and it was the site of Next.js's most serious advisories |
| `.local/` excluded from Docker builds | It holds the local AI key, generated secrets and the dev database |

## Dependency security

`npm audit --omit=dev` reports two remaining advisories, both reviewed:

| Package | Severity | Decision |
|---|---|---|
| `zod` 3.x (memory use on oversized collections) | high | Fixed only in zod 4, a breaking rewrite of every validator. Mitigated: request bodies are capped at 512 KB and every array a user can send has a maximum length. Plan the zod 4 migration as its own change. |
| `esbuild` (via `tsx`) | low | Affects esbuild's development server on Windows only; production containers run compiled JavaScript with `node`. |

`package.json` overrides pin `postcss` (inside Next.js) and `qs` (inside Express) to patched
versions. Re-run `npm audit --omit=dev` before each release.

## What has and hasn't been verified

Checked on the development machine, November 2026:

- All type checks, lint, builds and test suites (gateway, user-service, study-service).
- A clean `npm ci` from the lockfile, as the Docker build does.
- The services running from their **compiled JavaScript** (as in the containers), with the
  end-to-end smoke test against them, including the live AI.
- The production web build with its Content-Security-Policy, in a browser.
- `docker-compose.yml` parses, and only Caddy publishes public ports.
- 300 back-to-back admin sign-ins through the gateway, and 200 session checks through the web app's
  proxy, with no failures. (Stalls seen during testing all matched the test laptop entering
  standby, in the Windows power log; they weren't the app.)

**Not verified, because Docker wasn't available on that machine:** building the images, running
the compose stack, and the Caddy configuration. Do a full rehearsal on a staging server first: `docker compose up -d --build`,
sign up, receive the email, promote the first admin, ask the tutor, take a backup and restore it.

**Not verified at all:** real SMTP delivery. Google sign-in also exists in the API but has no button in
the app and has never been run; leave `GOOGLE_CLIENT_ID` unset until it is built and tested.
