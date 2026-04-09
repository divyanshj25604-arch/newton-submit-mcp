function readEnv(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
export function normalizeSessionCookie(cookieOrToken) {
    return cookieOrToken.includes("=")
        ? cookieOrToken
        : `auth-token=${cookieOrToken}`;
}
function extractAuthTokenFromCookie(cookie) {
    if (!cookie)
        return undefined;
    const normalized = normalizeSessionCookie(cookie);
    const match = normalized.match(/(?:^|;\s*)auth-token=([^;]+)/i);
    const token = match?.[1]?.trim();
    return token || undefined;
}
export function getEnvNewtonAuth() {
    return {
        sessionCookie: readEnv("NEWTON_SESSION_COOKIE"),
        authToken: readEnv("NEWTON_AUTH_TOKEN"),
    };
}
function pickAuth(input) {
    const auth = input ?? getEnvNewtonAuth();
    return {
        sessionCookie: auth.sessionCookie?.trim(),
        authToken: auth.authToken?.trim(),
    };
}
export function hasNewtonAuth(input) {
    const auth = pickAuth(input);
    return Boolean(auth.sessionCookie || auth.authToken);
}
export function getNewtonAuthHeaders(input) {
    const auth = pickAuth(input);
    const sessionCookie = auth.sessionCookie;
    const bearerToken = auth.authToken ?? extractAuthTokenFromCookie(sessionCookie);
    if (!sessionCookie && !bearerToken) {
        throw new Error("Missing auth. Use auth_login tool (recommended) or set NEWTON_SESSION_COOKIE / NEWTON_AUTH_TOKEN.");
    }
    const headers = {};
    if (sessionCookie)
        headers.Cookie = normalizeSessionCookie(sessionCookie);
    if (bearerToken)
        headers.Authorization = `Bearer ${bearerToken}`;
    return headers;
}
export function validateNewtonAuthConfig() {
    if (!hasNewtonAuth())
        return;
    getNewtonAuthHeaders();
}
//# sourceMappingURL=auth.js.map