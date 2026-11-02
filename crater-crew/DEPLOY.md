# Broker LLM deployment

Crater Crew offers two clearly labeled opponent drivers. **Local algorithm** remains playable without network access. **Broker LLM** requests a model decision for every AI action, including the second shotgun shot. If Broker is unavailable, the turn stops with Retry, Pass AI Turn and Use Local AI controls. Local AI is never invoked automatically in Broker mode.

## Vercel

The repository is a static site with two Node functions under `api/ai/`. Import it as a Vercel project. The functions submit a short Broker job and poll it in separate invocations. The game pauses its AI turn while polling and preserves a signed job ticket for retry.

`GET /api/ai/health` reports only whether the required configuration is present. `POST /api/ai/turn` accepts a bounded snapshot and legal candidates. `GET /api/ai/turn?ticket=...` polls a signed, expiring ticket. The server checks the model's JSON plan against candidate IDs. The browser validates and applies the choice to the current turn. Keys never enter browser code or responses.

## Subscription-only Broker route

The adapter stays disabled unless `BROKER_GAME_ENABLED=true`, `BROKER_PROJECT_KEY` is set, and `BROKER_SUBSCRIPTION_MODEL` is one exact `claude-sub/...` or `codex-sub/...` model ID. Before each job it checks authenticated `GET /v1/models` for that exact ID, `available: true`, `billing_type: subscription`, `chat:fast`, and JSON-schema support. It submits `POST /v1/jobs?capability=chat:fast` pinned to that ID. It never requests a generic provider chain. Poll completion must attest the same route, provider, subscription billing and null variable cost; otherwise the game displays an error. These checks do not replace Broker's authorization policy.

Before enabling, confirm a dedicated Webworms Broker project with **$0/day** paid API cost cap, bounded request cap, `llm:chat` and `llm:agent` scopes, and an exact model in `AGENT_SUBSCRIPTION_VERIFIED_MODELS`. Set `AGENT_PROJECT_POLICY` for that project ID, one permitted model and subscription account. Do not grant wildcard models/accounts. The Codex subscription additionally needs a separately approved worker route and canary. A $0 paid API cap is not a promise that an existing subscription is free: subscription fees are excluded from per-token cost, while requests can consume its allowance. A public game endpoint also consumes Broker's request allowance, so establish appropriate access control before enabling it.

Only after those conditions and deployment authorization are confirmed, store `BROKER_PROJECT_KEY` as a Vercel secret, set `BROKER_SUBSCRIPTION_MODEL` to the approved exact ID, and then set `BROKER_GAME_ENABLED=true`. `BROKER_URL` defaults to `https://aib.zapleo.com` and must use HTTPS. Redeploy after settings change. Never put the key in Git, browser JavaScript, URLs or logs. Existing generic keys do not authorize use by this game.

The model receives map, round, wind, water, fighters, terrain samples and bounded legal candidate descriptions. It returns strict JSON `{ "turn_id": "...", "candidate_id": "..." }`. Local physics proposes and validates moves; the LLM selects one. Difficulty changes candidate sets and instructions without damage or health bonuses. Subscription jobs do not support custom generation temperature or max-token values, so the adapter omits both. No tools or arbitrary code are offered to the model.

## Current status

The Broker project, actual subscription model availability, scopes, policy and quota have not been verified for this game. No live model call was made while preparing this adapter. Mocked tests verify its request contract and fail-closed behavior, not live account authorization. A ChatGPT or Claude subscription is not automatically a Broker credential.
