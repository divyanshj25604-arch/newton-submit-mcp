import { NewtonAuthInput } from "./auth.js";

type StoredSessionAuth = {
  auth: NewtonAuthInput;
  expiresAt: number;
};

export interface SessionAuthStore {
  get(sessionId: string): Promise<NewtonAuthInput | undefined>;
  set(sessionId: string, auth: NewtonAuthInput): Promise<void>;
  delete(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

export class MemorySessionAuthStore implements SessionAuthStore {
  private readonly ttlMs: number;
  private readonly data = new Map<string, StoredSessionAuth>();

  constructor(ttlSeconds: number) {
    this.ttlMs = Math.max(1, ttlSeconds) * 1000;
  }

  async get(sessionId: string): Promise<NewtonAuthInput | undefined> {
    const current = this.data.get(sessionId);
    if (!current) return undefined;

    if (Date.now() > current.expiresAt) {
      this.data.delete(sessionId);
      return undefined;
    }

    return current.auth;
  }

  async set(sessionId: string, auth: NewtonAuthInput): Promise<void> {
    this.data.set(sessionId, {
      auth,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.data.delete(sessionId);
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}

export class RedisSessionAuthStore implements SessionAuthStore {
  private readonly client: any;
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  constructor(client: any, ttlSeconds: number, keyPrefix: string) {
    this.client = client;
    this.ttlSeconds = Math.max(1, ttlSeconds);
    this.keyPrefix = keyPrefix;
  }

  private key(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  async get(sessionId: string): Promise<NewtonAuthInput | undefined> {
    const raw = await this.client.get(this.key(sessionId));
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      const sessionCookie = typeof parsed?.sessionCookie === "string"
        ? parsed.sessionCookie
        : undefined;
      const authToken = typeof parsed?.authToken === "string"
        ? parsed.authToken
        : undefined;
      return { sessionCookie, authToken };
    } catch {
      return undefined;
    }
  }

  async set(sessionId: string, auth: NewtonAuthInput): Promise<void> {
    await this.client.set(
      this.key(sessionId),
      JSON.stringify(auth),
      "EX",
      this.ttlSeconds
    );
  }

  async delete(sessionId: string): Promise<void> {
    await this.client.del(this.key(sessionId));
  }

  async close(): Promise<void> {
    if (this.client?.quit) {
      await this.client.quit();
    }
  }
}

export async function createSessionAuthStore(): Promise<SessionAuthStore> {
  const ttlSeconds = Number(process.env.NEWTON_SESSION_TTL_SECONDS ?? "21600");
  const redisUrl = process.env.REDIS_URL?.trim();
  const keyPrefix = process.env.REDIS_SESSION_PREFIX?.trim() || "newton-submit-mcp:auth:";

  if (!redisUrl) {
    return new MemorySessionAuthStore(ttlSeconds);
  }

  const mod = await import("ioredis");
  const RedisCtor = mod.default;
  const client = new RedisCtor(redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  return new RedisSessionAuthStore(client, ttlSeconds, keyPrefix);
}
