# newton-submit-mcp

Model Context Protocol (MCP) server for Newton coding playgrounds. It can fetch coding problems, submit code (hidden-test run), and poll submission status via stdio transport.

## Features
- Tools: `get_problem`, `submit_solution`, `check_submission`, `list_assignment_questions`
- Works over stdio with Codex/Claude/Cursor (`codex mcp add newton-submit -- npx tsx src/server.ts`)
- Uses real Newton endpoints for assignment/question/playground flow (including Semester 2 course hashes).
- Axios-based wrapper with retries, polling, timeout, and session/bearer auth.

## Setup
```bash
cd newton-submit-mcp
npm install
```

### Environment
Set at least one auth value:
- `NEWTON_SESSION_COOKIE` – full cookie string, e.g. `session=...`
- `NEWTON_AUTH_TOKEN` – bearer token string (without the `Bearer ` prefix)

Optional:
- `NEWTON_BASE_URL` – defaults to `https://my.newtonschool.co`
- `NEWTON_COURSE_HASH` – default course hash (useful for S2 assignment-question hashes)
- `NEWTON_USERNAME` – optional, used while reading `latest_submission`
- `NEWTON_SUBMIT_POLL_ATTEMPTS` – default `8`
- `NEWTON_SUBMIT_POLL_INTERVAL_MS` – default `1200`

You can export these in your shell or add a `.env` if you wire dotenv.

## Run (stdio for MCP)
```bash
npx tsx src/server.ts
```
Register with Codex:
```bash
codex mcp add newton-submit -- npx tsx /Users/Apple/Desktop/n8n/extention/newton-submit-mcp/src/server.ts
```

## Tool behaviors
- `get_problem(problemId, courseHash?, assignmentHash?)`
  - `problemId` can be:
    - playground hash (`vmc8l6qyfh90`)
    - assignment-question hash (`abc123...`) when `courseHash` is available (argument or env)
    - `assignmentHash:questionHash`
    - `courseHash:assignmentHash:questionHash`
- `submit_solution(problemId, language, code, courseHash?, assignmentHash?)`
  - Resolves problem reference, PATCHes playground with hidden-test run, then polls latest submission.
  - Returns `{ submissionId, playgroundHash?, raw? }`, where `submissionId` is encoded as `<playgroundHash>:<submissionHash|latest>`.
- `check_submission(submissionId)`
  - Accepts `<playgroundHash>` or `<playgroundHash>:<submissionHash>`
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
  "name": "check_submission",
  "arguments": { "submissionId": "vmc8l6qyfh90:latest" }
}
```

## Notes
- Direct playground path used: `/api/v1/playground/coding/h/{hash}/`
- Assignment question resolution path: `/api/v1/course/h/{course}/assignment/h/{assignment}/question/h/{question}/details/`
- Assignment list path: `/api/v2/course/h/{course}/assignment/all/?pagination=false&completed=false`
- Submission polling path: `/api/v1/playground/coding/h/{hash}/latest_submission/`
- Calls retry with backoff and 15s timeout; 401 returns a clear auth error.
