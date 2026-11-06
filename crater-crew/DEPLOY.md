# Broker LLM deployment

Crater Crew offers two clearly labeled opponent drivers. **Local algorithm** remains playable without network access. **Broker LLM** requests a model decision for every AI action, including the second shotgun shot. If Broker is unavailable, the turn stops with Retry, Pass AI Turn and Use Local AI controls. Local AI is never invoked automatically in Broker mode.

## Vercel

The repository is a static site with two Node functions under `api/ai/`. Import it as a Vercel project. The functions submit a short Broker job and poll it in separate invocations. The game pauses its AI turn while polling and preserves a signed job ticket for retry.

`GET /api/ai/health` reports only whether the required configuration is present. `POST /api/ai/turn` accepts a bounded snapshot and legal candidates. `GET /api/ai/turn?ticket=...` polls a signed, expiring ticket. The server checks the model's JSON plan against candidate IDs. The browser validates and applies the choice to the current turn. Keys never enter browser code or responses.

## Broker model and route

The adapter stays disabled unless `BROKER_GAME_ENABLED=true`, `BROKER_PROJECT_KEY` is set, and a model is chosen: the admin panel's **AI model** (`ai.model` in the settings document) or else env `BROKER_SUBSCRIPTION_MODEL`. The model is one exact catalog ID (`provider/model`); each function instance caches the setting for 30 s. Before each job it checks authenticated `GET /v1/models` for that exact ID with `available: true`, `chat:fast` and JSON-schema support, and submits `POST /v1/jobs?capability=chat:fast` pinned to that ID. It never requests a generic provider chain. Poll completion must attest that the job ran on exactly the requested model; when the catalog lists the model as `billing_type: subscription`, it must also come back as a subscription run from that provider with null variable cost. **An API-billed model is allowed and costs money per token**: Broker's project cost cap is what limits it. These checks do not replace Broker's authorization policy.

The admin panel lists the catalog (`GET /api/admin/models`, trimmed; the key is never returned) with live search, badges (subscription/API, usable, JSON, intelligence index, price) and a **Test** button (`POST /api/admin/models/test`): one tiny JSON-schema job on that exact model with a fresh idempotency key, polled up to 25 s, reporting latency, reply and billing. Tests are limited to 6 per 10 minutes per function instance and run real jobs (an API-billed model is charged).

Each model submit carries a stable project-scoped `Idempotency-Key` derived on the server from the unique match/turn ID. Broker returns the same job for a repeated key and identical payload, including a completed result; a different payload for that turn conflicts instead of starting another run. The browser freezes the request before the first submit, so a lost HTTP response and Retry reuse the same body and key. Match IDs use browser cryptographic randomness, and rematches get fresh IDs.

A signed poll ticket is limited to eight hours, tied to one Broker job, model, turn and offered candidate IDs. It contains no project key and is sent with `Cache-Control: no-store`. The browser stores the pending ticket, frozen request and enough match state in **sessionStorage** so a page refresh can show Retry and continue polling that same job. A refresh with no ticket after a lost submit response resubmits the frozen request with the same idempotency key. Invalid or stale recovery data is discarded; a new match, completed move, Pass or Use Local AI clears it. After ticket expiry the game reports an error and offers Pass or Local AI; it does not start another subscription job. Browser storage is local to the origin and tab, but a script running on that origin could read the bounded ticket, so protect the deployment before enabling Broker mode.

Before enabling, confirm a dedicated Webworms Broker project with **$0/day** paid API cost cap, bounded request cap, `llm:chat` and `llm:agent` scopes, and an exact model in `AGENT_SUBSCRIPTION_VERIFIED_MODELS`. Set `AGENT_PROJECT_POLICY` for that project ID, one permitted model and subscription account. Do not grant wildcard models/accounts. The Codex subscription additionally needs a separately approved worker route and canary. A $0 paid API cap is not a promise that an existing subscription is free: subscription fees are excluded from per-token cost, while requests can consume its allowance. A public game endpoint also consumes Broker's request allowance, so establish appropriate access control before enabling it.

Only after those conditions and deployment authorization are confirmed, store `BROKER_PROJECT_KEY` as a Vercel secret, set `BROKER_SUBSCRIPTION_MODEL` to the approved exact ID, and then set `BROKER_GAME_ENABLED=true`. `BROKER_URL` defaults to `https://aib.zapleo.com` and must use HTTPS. Redeploy after settings change. Never put the key in Git, browser JavaScript, URLs or logs. Existing generic keys do not authorize use by this game.

The model receives map, round, wind, water, fighters, terrain samples and bounded legal candidate descriptions. It returns strict JSON `{ "turn_id": "...", "candidate_id": "..." }`. Local physics proposes and validates moves; the LLM selects one. Difficulty changes candidate sets and instructions without damage or health bonuses. Subscription jobs do not support custom generation temperature or max-token values, so the adapter omits both. No tools or arbitrary code are offered to the model.

## Current status

The Broker project, actual subscription model availability, scopes, policy and quota have not been verified for this game. No live model call was made while preparing this adapter. Mocked tests verify its request contract and fail-closed behavior, not live account authorization. A ChatGPT or Claude subscription is not automatically a Broker credential.

# Admin panel and sponsors

`/admin.html` edits the game settings (turn time, teleports, props, sudden death and water, wind, maps, default players and offered AI levels, audio defaults) and sponsor placements (billboards on the terrain, logo on health crates, "Presented by" strip, and in battle: blimp, crate parachute canopy, flags, airstrike plane, water buoy; sponsors saved before the in-battle placements existed get them all when they show on billboards). The game reads `GET /api/settings` once at startup and falls back to its built-in defaults if that fails, so it still works from a file or without the API.

Vercel setup:

1. Storage → create a **Blob** store and connect it to this project; Vercel then sets `BLOB_READ_WRITE_TOKEN`. Settings live in `settings/game.json` and logos in `sponsors/<id>.<ext>` (both public, no secrets).
2. Set `ADMIN_SESSION_SECRET` (random, 32+ characters). Redeploy.
3. **Right after the deploy**, open `/admin.html` and choose the admin password (see *First run* below). Alternatively set `ADMIN_PASSWORD` (long, random) as an env variable; it then always wins.

### First run: choosing the admin password in the browser

When neither `ADMIN_PASSWORD` (12+ characters) nor a stored password exists, and both the Blob store and `ADMIN_SESSION_SECRET` are configured, `/admin.html` shows **Create admin password** instead of the sign-in. `GET /api/admin/session` then reports `setupRequired: true`, and every other admin route answers `403 {"error":"setup required"}`. `POST /api/admin/setup {password}` (12–200 characters, same-origin only) stores a scrypt record (`N=2^15, r=8, p=1`, random salt) and signs the browser in; from then on setup answers 409 and the screen is gone.

- **Where it lives.** The Blob store is public, so the record sits at `auth/admin-<HMAC-SHA256(ADMIN_SESSION_SECRET, "admin-auth-path")>.json`: the name cannot be derived without the secret, and the file holds only the salted scrypt hash. The record and the hash are never returned by an API nor logged.
- **Race risk.** Until a password is chosen, **the first visitor to `/admin.html` can claim the admin**. Do it immediately after the deploy that connects the Blob store and the secret, and check that you are signed in afterwards (if setup answers "already set" and you did not set it, recover as below).
- **Changing it.** Settings → *Admin password* (`POST /api/admin/password {current, next}`). A new password ends every other session: sessions from a stored password are signed with a short fingerprint of the record. The control is hidden when `ADMIN_PASSWORD` is in use.
- **Recovery** (forgotten password or someone else claimed it): set `ADMIN_PASSWORD` in Vercel and redeploy — the env password overrides the stored one. To return to the browser flow, delete the `auth/admin-….json` blob (Vercel → Storage → Blob → browse `auth/`) and remove `ADMIN_PASSWORD`; the next visit offers setup again. Rotating `ADMIN_SESSION_SECRET` also orphans the old record (it is looked up under a new name), which reopens setup, so set the password again right after such a rotation.
- Without `ADMIN_SESSION_SECRET` the browser setup is refused (503 naming the variable); `ADMIN_PASSWORD` alone still works as before.

Without either password source and without a way to set one, the admin API answers 503; without the Blob token it shows the defaults and refuses to save (503). Sessions are a signed HttpOnly, SameSite=Strict cookie valid 12 h; logout clears the cookie (a copied cookie stays valid until it expires; changing the secret or the password, when no secret is set, ends all sessions). Login is limited to 5 failures per IP per 10 minutes per function instance (best effort). Logos: PNG, JPEG, WebP or plain SVG (no scripts, links or external resources), up to 512 KB, checked by content.

Local dev: `ADMIN_PASSWORD=... node server.mjs` keeps settings and logos in `./.local-store` (git-ignored) when no Blob token is set. `ADMIN_SESSION_SECRET=... node server.mjs` (no `ADMIN_PASSWORD`) exercises the first-run setup; the record is written to `./.local-store/auth/`.

### Admin: known limits
- The settings document lives in the public Blob store, so anything in it is readable by anyone who knows the store host — including sponsors that are switched off. Keep unannounced sponsors out of it.
- Logging out clears the cookie in that browser but does not revoke an already issued session token; to end every session, rotate `ADMIN_SESSION_SECRET` and redeploy.
- The admin stays closed (503) until `ADMIN_PASSWORD` is at least 12 characters or a password was chosen at first run (which needs `ADMIN_SESSION_SECRET` and the Blob store). Failed logins are capped per IP per function instance (best effort on serverless).
