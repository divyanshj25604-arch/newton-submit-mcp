# newton-submit-mcp

Model Context Protocol (MCP) server for Newton playground submissions (coding + React/frontend + project/Newton Box).

Supports:
- `stdio` transport (local)
- Streamable HTTP transport at `/mcp` (cloud-hosted)

## Features
- Tools:
  - Auth: `auth_login`, `auth_status`, `auth_logout`
  - Problem APIs: `get_problem`, `submit_solution`, `check_submission`, `list_assignment_questions`
- Works over stdio or hosted HTTP MCP endpoint
- Uses real Newton endpoints for assignment/question/playground flow (including Semester 2 course hashes).
- Axios-based wrapper with retries, polling, timeout, and session/bearer auth.
- Per-user session auth: each MCP session can login independently without shared global env tokens.
- Optional Redis-backed auth session storage for multi-instance cloud deploys.
- Built-in request rate limiting for `/mcp`.

## Setup
```bash
cd newton-submit-mcp
npm install
```

### Environment
Auth env vars are now optional fallback.

If users login using `auth_login`, no auth env var is required.

Optional fallback auth:
- `NEWTON_SESSION_COOKIE` – full cookie string, e.g. `auth-token=...` (or just token value; auto-normalized)
- `NEWTON_AUTH_TOKEN` – bearer token string (without the `Bearer ` prefix)

Optional:
- `NEWTON_BASE_URL` – defaults to `https://my.newtonschool.co`
  - If you pass `.../api/v1` or `.../api/v2`, it is auto-normalized.
- `NEWTON_COURSE_HASH` – default course hash (useful for S2 assignment-question hashes)
- `NEWTON_USERNAME` – optional, used while reading `latest_submission`
- `NEWTON_SUBMIT_POLL_ATTEMPTS` – default `8`
- `NEWTON_SUBMIT_POLL_INTERVAL_MS` – default `1200`
- `MCP_MODE` – set `http` to run HTTP MCP server (else stdio)
- `MCP_TRANSPORT` – alternative switch; set `http`
- `PORT` – HTTP port (default `3000`)
- `HOST` – HTTP host (default `0.0.0.0`)
- `MCP_API_KEY` – optional; if set, every `/mcp` and `/health` request must send `x-api-key`
- `NEWTON_AUTH_STORE_PATH` – optional local path for persisted auth (`~/.newton-submit-mcp/auth.json` by default)
- `NEWTON_PERSIST_AUTH` – default `true`; controls whether `auth_login remember=true` writes local auth file
- `NEWTON_HTTP_ALLOW_PERSIST` – default `false`; allow persisted auth in shared HTTP mode
- `NEWTON_SESSION_TTL_SECONDS` – default `21600` (6h); auth session TTL
- `REDIS_URL` – optional; if set, auth sessions are stored in Redis (recommended for cloud)
- `REDIS_SESSION_PREFIX` – default `newton-submit-mcp:auth:`
- `MCP_RATE_LIMIT_ENABLED` – default `true`
- `MCP_RATE_LIMIT_WINDOW_MS` – default `60000`
- `MCP_RATE_LIMIT_MAX` – default `120`

You can export these in your shell or add a `.env` if you wire dotenv.

## Run (stdio)
```bash
npx tsx src/server.ts
```
Register with Codex:
```bash
codex mcp add newton-submit -- npx tsx /Users/Apple/Desktop/n8n/extention/newton-submit-mcp/src/server.ts
```

## Run (HTTP MCP server)
```bash
MCP_MODE=http PORT=3000 HOST=0.0.0.0 npx tsx src/server.ts
```

Endpoints:
- `POST/GET/DELETE /mcp`
- `GET /health`

If `MCP_API_KEY` is set, include:
```http
x-api-key: <your-key>
```

## Deploy For Public Use (No Install/Build On Client Machines)

### Option 1: Any Docker Host (Render/Railway/Fly.io)
This repo includes a `Dockerfile`.

Build:
```bash
docker build -t newton-submit-mcp .
```

Run:
```bash
docker run -p 3000:3000 \
  -e MCP_MODE=http \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e MCP_API_KEY='your-secret-key' \
  newton-submit-mcp
```

Then each user authenticates their own session via `auth_login`.

### Option 2: Render Blueprint
`render.yaml` is included.

1. Push repo to GitHub.
2. In Render: New + > Blueprint > select repo.
3. Set secrets/env:
   - `MCP_API_KEY` (recommended)
   - `REDIS_URL` (recommended for multi-instance)
4. Deploy and use `https://<render-domain>/mcp`.

### Option 3: Railway
`railway.json` is included.

1. New Project > Deploy from GitHub Repo.
2. Railway picks Dockerfile automatically.
3. Set env:
   - `MCP_MODE=http`
   - `MCP_API_KEY`
   - `REDIS_URL` (recommended)
4. Use `https://<railway-domain>/mcp`.

## End-User Login Flow
Once server is hosted, each user does:

1. `auth_login` with their own token/cookie
2. `auth_status` to confirm
3. Use normal tools (`list_assignment_questions`, `get_problem`, etc.)

No shared `NEWTON_SESSION_COOKIE` env is required.

After deploy, share only the HTTPS MCP URL:
```text
https://<your-domain>/mcp
```
Consumers use that URL directly in their MCP client.

## Tool behaviors
- `auth_login(sessionCookie?, authToken?, useCodexConfig?, remember?)`
  - Recommended first call.
  - Stores auth for current MCP session.
  - `useCodexConfig=true` imports `NEWTON_SESSION_COOKIE` / `NEWTON_AUTH_TOKEN` from `~/.codex/config.toml`.
  - `remember=true` can persist auth locally (disabled in HTTP mode unless `NEWTON_HTTP_ALLOW_PERSIST=true`).
- `auth_status()`
  - Shows whether this session is authenticated and returns current Newton user.
- `auth_logout(clearSaved?)`
  - Clears current session auth.
  - If `clearSaved=true`, also deletes persisted local auth file.
- `get_problem(problemId, courseHash?, assignmentHash?)`
  - `problemId` can be:
    - playground hash (`vmc8l6qyfh90`, including `project`/Newton Box playground hashes)
    - assignment-question hash (`abc123...`) when `courseHash` is available (argument or env)
    - `assignmentHash:questionHash`
    - `courseHash:assignmentHash:questionHash`
  - For assignment-question hashes, the resolver now auto-falls back from semester/course hash to subject hash when fetching question details.
- `submit_solution(problemId, language, code, courseHash?, assignmentHash?, playgroundType?)`
  - Resolves problem reference, PATCHes the detected playground type (`coding`/`react`/`frontend`/`project`), then polls latest submission.
  - `playgroundType` (optional) can force route selection (`react`, `frontend`, `coding`, `project`) before fallback auto-detection.
  - Newton Box questions map to `project` playground type.
  - For React/frontend questions, `code` can be plain source or a JSON object string (auto-forwarded as `files` payload).
  - Returns `{ submissionId, playgroundHash?, raw? }`, where `submissionId` is encoded as `<playgroundHash>:<submissionHash|latest>` or `<playgroundKind>/<playgroundHash>:<submissionHash|latest>` for non-coding playgrounds.
- `check_submission(submissionId)`
  - Accepts `<playgroundHash>`, `<playgroundHash>:<submissionHash>`, or `<playgroundKind>/<playgroundHash>:<submissionHash>`
  - Fetches latest submission for that playground and normalizes status.
- `list_assignment_questions(courseHash?)`
  - Lists `{ assignmentHash, assignmentTitle?, questionHash, questionTitle?, questionType? }`

Statuses include `Accepted | Wrong Answer | TLE | Runtime Error | Compilation Error | Pending`.

## Example calls (pseudocode)
```json
{
  "name": "list_assignment_questions",
  "arguments": { "courseHash": "8knk0ynm1ain" }
}
{
  "name": "get_problem",
  "arguments": {
    "problemId": "questionHashHere",
    "courseHash": "8knk0ynm1ain"
  }
}
{
  "name": "submit_solution",
  "arguments": {
    "problemId": "questionHashHere",
    "courseHash": "8knk0ynm1ain",
    "language": "javascript",
    "code": "function solve(){ /* ... */ }"
  }
}
{
  "name": "submit_solution",
  "arguments": {
    "problemId": "reactQuestionHashHere",
    "courseHash": "8knk0ynm1ain",
    "language": "react",
    "code": "export default function App(){ return <h1>Hello</h1>; }"
  }
}
{
  "name": "check_submission",
  "arguments": { "submissionId": "vmc8l6qyfh90:latest" }
}
```

## Notes
- Identity verification endpoint used by auth tools: `/api/v1/user/me/`
- Direct playground path used: `/api/v1/playground/{coding|react|frontend|project}/h/{hash}/` (auto-detected with fallback)
- Assignment question resolution path: `/api/v1/course/h/{course_or_subject}/assignment/h/{assignment}/question/h/{question}/details/` (auto-fallback across candidate hashes)
- Assignment list path: `/api/v2/course/h/{course}/assignment/all/?pagination=false&completed=false`
- Submission polling path: `/api/v1/playground/{coding|react|frontend|project}/h/{hash}/latest_submission/` (auto-detected with fallback)
- Calls retry with backoff and 15s timeout; 401 returns a clear auth error.
