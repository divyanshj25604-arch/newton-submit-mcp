export class MemorySessionAuthStore {
    constructor(ttlSeconds) {
        this.data = new Map();
        this.ttlMs = Math.max(1, ttlSeconds) * 1000;
    }
    async get(sessionId) {
        const current = this.data.get(sessionId);
        if (!current)
            return undefined;
        if (Date.now() > current.expiresAt) {
            this.data.delete(sessionId);
            return undefined;
        }
        return current.auth;
    }
    async set(sessionId, auth) {
        this.data.set(sessionId, {
            auth,
            expiresAt: Date.now() + this.ttlMs,
        });
    }
    async delete(sessionId) {
        this.data.delete(sessionId);
    }
    async close() {
        this.data.clear();
    }
}
export class RedisSessionAuthStore {
    constructor(client, ttlSeconds, keyPrefix) {
        this.client = client;
        this.ttlSeconds = Math.max(1, ttlSeconds);
        this.keyPrefix = keyPrefix;
    }
    key(sessionId) {
        return `${this.keyPrefix}${sessionId}`;
    }
    async get(sessionId) {
        const raw = await this.client.get(this.key(sessionId));
        if (!raw)
            return undefined;
        try {
            const parsed = JSON.parse(raw);
            const sessionCookie = typeof parsed?.sessionCookie === "string"
                ? parsed.sessionCookie
                : undefined;
            const authToken = typeof parsed?.authToken === "string"
                ? parsed.authToken
                : undefined;
            return { sessionCookie, authToken };
        }
        catch {
            return undefined;
        }
    }
    async set(sessionId, auth) {
        await this.client.set(this.key(sessionId), JSON.stringify(auth), "EX", this.ttlSeconds);
    }
    async delete(sessionId) {
        await this.client.del(this.key(sessionId));
    }
    async close() {
        if (this.client?.quit) {
            await this.client.quit();
        }
    }
}
export async function createSessionAuthStore() {
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
//# sourceMappingURL=sessionStore.js.map