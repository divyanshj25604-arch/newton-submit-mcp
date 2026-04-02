import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";
import {
  getCurrentUser,
  fetchProblem,
  getSubmissionStatus,
  listAssignmentQuestions,
  submitSolution,
} from "./newtonApi.js";
import {
  getEnvNewtonAuth,
  hasNewtonAuth,
  NewtonAuthInput,
} from "./auth.js";
import { createSessionAuthStore, SessionAuthStore } from "./sessionStore.js";

type SessionState = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
};

type ToolExtra = {
  sessionId?: string;
};

let sessionAuthStore: SessionAuthStore;
let defaultAuth: NewtonAuthInput | undefined = loadPersistedAuth();

function shouldUseHttpMode() {
  const mode = (process.env.MCP_MODE ?? "").toLowerCase();
  const transport = (process.env.MCP_TRANSPORT ?? "").toLowerCase();
  const hasHttpArg = process.argv.some((arg) => arg === "--http");
  return mode === "http" || transport === "http" || hasHttpArg;
}

function authStorePath(): string {
  const configured = process.env.NEWTON_AUTH_STORE_PATH?.trim();
  if (configured) {
    if (configured === "~") return os.homedir();
    if (configured.startsWith("~/")) return path.join(os.homedir(), configured.slice(2));
    return configured;
  }
  return path.join(os.homedir(), ".newton-submit-mcp", "auth.json");
}

function shouldPersistAuthByDefault(): boolean {
  const configured = (process.env.NEWTON_PERSIST_AUTH ?? "true").toLowerCase();
  return configured !== "0" && configured !== "false" && configured !== "no";
}

function canPersistInCurrentMode(): boolean {
  if (!shouldUseHttpMode()) return true;
  const configured = (process.env.NEWTON_HTTP_ALLOW_PERSIST ?? "false").toLowerCase();
  return configured === "1" || configured === "true" || configured === "yes";
}

function normalizeAuthInput(input?: NewtonAuthInput): NewtonAuthInput {
  return {
    sessionCookie: input?.sessionCookie?.trim(),
    authToken: input?.authToken?.trim(),
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toPublicUser(user: Record<string, unknown>) {
  return {
    username: pickString(user.username),
    uid: pickString(user.uid),
    first_name: pickString(user.first_name),
    last_name: pickString(user.last_name),
    email: pickString(user.email),
  };
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadPersistedAuth(): NewtonAuthInput | undefined {
  try {
    const filePath = authStorePath();
    if (!fs.existsSync(filePath)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const normalized = normalizeAuthInput({
      sessionCookie: pickString(parsed?.sessionCookie),
      authToken: pickString(parsed?.authToken),
    });
    return hasNewtonAuth(normalized) ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function persistAuth(auth: NewtonAuthInput) {
  const normalized = normalizeAuthInput(auth);
  if (!hasNewtonAuth(normalized)) return;
  const filePath = authStorePath();
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), { encoding: "utf8", mode: 0o600 });
}

function clearPersistedAuth() {
  const filePath = authStorePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function readAuthFromCodexConfig(): NewtonAuthInput | undefined {
  try {
    const cfgPath = path.join(os.homedir(), ".codex", "config.toml");
    if (!fs.existsSync(cfgPath)) return undefined;
    const text = fs.readFileSync(cfgPath, "utf8");

    const cookieMatch = text.match(/^\s*NEWTON_SESSION_COOKIE\s*=\s*"([^"]+)"/m);
    const tokenMatch = text.match(/^\s*NEWTON_AUTH_TOKEN\s*=\s*"([^"]+)"/m);
    const auth = normalizeAuthInput({
      sessionCookie: cookieMatch?.[1],
      authToken: tokenMatch?.[1],
    });
    return hasNewtonAuth(auth) ? auth : undefined;
  } catch {
    return undefined;
  }
}

async function resolveAuth(extra?: ToolExtra): Promise<{
  source: "session" | "saved" | "env" | "none";
  auth?: NewtonAuthInput;
}> {
  const sid = extra?.sessionId;
  if (sid && sessionAuthStore) {
    const session = await sessionAuthStore.get(sid);
    if (session && hasNewtonAuth(session)) {
      return { source: "session", auth: session };
    }
  }

  if (defaultAuth && hasNewtonAuth(defaultAuth)) {
    return { source: "saved", auth: defaultAuth };
  }

  if (hasNewtonAuth(getEnvNewtonAuth())) {
    return { source: "env" };
  }

  return { source: "none" };
}

async function authForApi(extra?: ToolExtra): Promise<NewtonAuthInput | undefined> {
  const resolved = await resolveAuth(extra);
  if (resolved.source === "session" || resolved.source === "saved") {
    return resolved.auth;
  }
  return undefined; // undefined => fallback to env auth in API client
}

async function storeAuth(
  extra: ToolExtra | undefined,
  auth: NewtonAuthInput,
  remember: boolean
) {
  const normalized = normalizeAuthInput(auth);
  if (!hasNewtonAuth(normalized)) {
    throw new Error("Missing auth values. Provide sessionCookie/authToken or enable useCodexConfig.");
  }

  const sid = extra?.sessionId;
  if (sid && sessionAuthStore) {
    await sessionAuthStore.set(sid, normalized);
  } else {
    defaultAuth = normalized;
  }

  if (remember && shouldPersistAuthByDefault() && canPersistInCurrentMode()) {
    defaultAuth = normalized;
    persistAuth(normalized);
  }
}

async function clearAuth(extra: ToolExtra | undefined, clearSaved: boolean) {
  const sid = extra?.sessionId;
  if (sid && sessionAuthStore) {
    await sessionAuthStore.delete(sid);
  } else {
    defaultAuth = undefined;
  }

  if (clearSaved) {
    defaultAuth = undefined;
    clearPersistedAuth();
  }
}

function createServer(): McpServer {
  const server = new McpServer({ name: "newton-submit-mcp", version: "1.1.0" });

  server.registerTool(
    "auth_login",
    {
      description:
        "Authenticate this MCP session. Pass sessionCookie/authToken, or set useCodexConfig=true to import from ~/.codex/config.toml.",
      inputSchema: z.object({
        sessionCookie: z.string().optional(),
        authToken: z.string().optional(),
        useCodexConfig: z.boolean().optional(),
        remember: z.boolean().optional(),
      }),
    },
    async ({ sessionCookie, authToken, useCodexConfig, remember }, extra: ToolExtra) => {
      try {
        let auth = normalizeAuthInput({ sessionCookie, authToken });
        if (!hasNewtonAuth(auth) && useCodexConfig) {
          auth = normalizeAuthInput(readAuthFromCodexConfig());
        }
        if (!hasNewtonAuth(auth)) {
          throw new Error(
            "No auth received. Provide sessionCookie/authToken, or set useCodexConfig=true."
          );
        }

        const me = await getCurrentUser({ auth });
        await storeAuth(extra, auth, remember ?? true);
        return toolSuccess({
          ok: true,
          remember: remember ?? true,
          auth_source: extra?.sessionId ? "session" : "default",
          user: toPublicUser(me),
        });
      } catch (err) {
        throw wrapError(err);
      }
    }
  );

  server.registerTool(
    "auth_status",
    {
      description: "Check whether this MCP session is authenticated with Newton.",
      inputSchema: z.object({}),
    },
    async (_args, extra: ToolExtra) => {
      try {
        const resolved = await resolveAuth(extra);
        if (resolved.source === "none") {
          return toolSuccess({
            authenticated: false,
            auth_source: "none",
            message: "Run auth_login first (or configure NEWTON_SESSION_COOKIE / NEWTON_AUTH_TOKEN).",
          });
        }

        const me = await getCurrentUser({ auth: await authForApi(extra) });
        return toolSuccess({
          authenticated: true,
          auth_source: resolved.source,
          user: toPublicUser(me),
        });
      } catch (err) {
        const resolved = await resolveAuth(extra);
        return toolSuccess({
          authenticated: false,
          auth_source: resolved.source,
          error: wrapError(err).message,
        });
      }
    }
  );

  server.registerTool(
    "auth_logout",
    {
      description:
        "Clear auth for this session. Set clearSaved=true to also remove persisted local auth file.",
      inputSchema: z.object({
        clearSaved: z.boolean().optional(),
      }),
    },
    async ({ clearSaved }, extra: ToolExtra) => {
      await clearAuth(extra, clearSaved ?? false);
      return toolSuccess({
        ok: true,
        cleared_session: Boolean(extra?.sessionId),
        cleared_saved: clearSaved ?? false,
      });
    }
  );

  server.registerTool(
    "get_problem",
    {
      description:
        "Fetch a Newton playground problem (coding/react/frontend/project-newton-box). problemId can be playground hash, assignment-question hash, or course/assignment/question reference.",
      inputSchema: z.object({
        problemId: z.string(),
        courseHash: z.string().optional(),
        assignmentHash: z.string().optional(),
      }),
    },
    async ({ problemId, courseHash, assignmentHash }, extra: ToolExtra) => {
      try {
        const auth = await authForApi(extra);
        return toolSuccess(
          await fetchProblem(problemId, {
            courseHash,
            assignmentHash,
            auth,
          })
        );
      } catch (err) {
        throw wrapError(err);
      }
    }
  );

  server.registerTool(
    "submit_solution",
    {
      description:
        "Submit code to Newton playgrounds (coding/react/frontend/project-newton-box). problemId can be playground hash or assignment-question hash.",
      inputSchema: z.object({
        problemId: z.string(),
        language: z.string(),
        code: z.string(),
        courseHash: z.string().optional(),
        assignmentHash: z.string().optional(),
        playgroundType: z.string().optional(),
      }),
    },
    async ({ problemId, language, code, courseHash, assignmentHash, playgroundType }, extra: ToolExtra) => {
      try {
        const auth = await authForApi(extra);
        return toolSuccess(
          await submitSolution(problemId, language, code, {
            courseHash,
            assignmentHash,
            playgroundType,
            auth,
          })
        );
      } catch (err) {
        throw wrapError(err);
      }
    }
  );

  server.registerTool(
    "check_submission",
    {
      description: "Check submission status by submission id",
      inputSchema: z.object({
        submissionId: z.string(),
      }),
    },
    async ({ submissionId }, extra: ToolExtra) => {
      try {
        const auth = await authForApi(extra);
        return toolSuccess(
          await getSubmissionStatus(submissionId, {
            auth,
          })
        );
      } catch (err) {
        throw wrapError(err);
      }
    }
  );

  server.registerTool(
    "list_assignment_questions",
    {
      description:
        "List assignment question hashes for a course (useful for Semester 2 bulk solving flows).",
      inputSchema: z.object({
        courseHash: z.string().optional(),
      }),
    },
    async ({ courseHash }, extra: ToolExtra) => {
      try {
        const auth = await authForApi(extra);
        return toolSuccess(
          await listAssignmentQuestions(courseHash, {
            auth,
          })
        );
      } catch (err) {
        throw wrapError(err);
      }
    }
  );

  return server;
}

function wrapError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function toolSuccess<T>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function unauthorized(res: any) {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

function enforceApiKeyIfNeeded(req: any, res: any): boolean {
  const configured = process.env.MCP_API_KEY?.trim();
  if (!configured) return true;

  const provided = (req.header("x-api-key") ?? req.query.api_key ?? "").toString();
  if (provided === configured) return true;

  unauthorized(res);
  return false;
}

function createRateLimiter() {
  const enabled = (process.env.MCP_RATE_LIMIT_ENABLED ?? "true").toLowerCase();
  if (enabled === "0" || enabled === "false" || enabled === "no") {
    return (_req: any, _res: any, next: any) => next();
  }

  const windowMs = Number(process.env.MCP_RATE_LIMIT_WINDOW_MS ?? "60000");
  const maxRequests = Number(process.env.MCP_RATE_LIMIT_MAX ?? "120");
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: any, res: any, next: any) => {
    const forwarded = req.header("x-forwarded-for");
    const firstForwarded = typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : undefined;
    const key = firstForwarded || req.ip || req.socket?.remoteAddress || "unknown";

    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32029, message: "Too many requests" },
        id: null,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

async function startHttpServer() {
  const host = process.env.HOST?.trim() || "0.0.0.0";
  const port = Number(process.env.PORT ?? "3000");
  const sessions: Record<string, SessionState> = {};
  const rateLimiter = createRateLimiter();
  const app = createMcpExpressApp({ host });

  app.use((req: any, res: any, next: any) => {
    if (req.path === "/health") {
      if (!enforceApiKeyIfNeeded(req, res)) return;
      next();
      return;
    }

    if (req.path === "/mcp") {
      if (!enforceApiKeyIfNeeded(req, res)) return;
      rateLimiter(req, res, next);
      return;
    }

    res.status(404).json({ error: "Not found" });
  });

  app.get("/health", (_req: any, res: any) => {
    res.status(200).json({
      ok: true,
      mode: "http",
      name: "newton-submit-mcp",
      version: "1.1.0",
      store: process.env.REDIS_URL ? "redis" : "memory",
    });
  });

  app.all("/mcp", async (req: any, res: any) => {
    try {
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId =
        typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

      let state: SessionState | undefined;
      if (sessionId && sessions[sessionId]) {
        state = sessions[sessionId];
      } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions[sid] = {
              transport,
              server,
            };
          },
        });

        state = { transport, server };
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions[sid]) delete sessions[sid];
          if (sid && sessionAuthStore) {
            void sessionAuthStore.delete(sid);
          }
        };
        transport.onerror = (err) => {
          console.error("MCP transport error:", err);
        };

        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: invalid or missing MCP session" },
          id: null,
        });
        return;
      }

      await state.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling /mcp request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.listen(port, host, () => {
    console.error(`newton-submit-mcp running on HTTP ${host}:${port} (/mcp)`);
  });
}

async function main() {
  sessionAuthStore = await createSessionAuthStore();

  process.on("SIGINT", () => {
    void sessionAuthStore.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    void sessionAuthStore.close();
    process.exit(0);
  });

  if (shouldUseHttpMode()) {
    await startHttpServer();
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("newton-submit-mcp running on stdio");
}

main().catch((err) => {
  console.error("Failed to start MCP server", err);
  process.exit(1);
});
