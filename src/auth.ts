type HeaderMap = Record<string, string>;
export type NewtonAuthInput = {
  sessionCookie?: string;
  authToken?: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function normalizeSessionCookie(cookieOrToken: string): string {
  return cookieOrToken.includes("=")
    ? cookieOrToken
    : `auth-token=${cookieOrToken}`;
}

function extractAuthTokenFromCookie(cookie?: string): string | undefined {
  if (!cookie) return undefined;
  const normalized = normalizeSessionCookie(cookie);
  const match = normalized.match(/(?:^|;\s*)auth-token=([^;]+)/i);
  const token = match?.[1]?.trim();
  return token || undefined;
}

export function getEnvNewtonAuth(): NewtonAuthInput {
  return {
    sessionCookie: readEnv("NEWTON_SESSION_COOKIE"),
    authToken: readEnv("NEWTON_AUTH_TOKEN"),
  };
}

function pickAuth(input?: NewtonAuthInput): NewtonAuthInput {
  const auth = input ?? getEnvNewtonAuth();
  return {
    sessionCookie: auth.sessionCookie?.trim(),
    authToken: auth.authToken?.trim(),
  };
}

export function hasNewtonAuth(input?: NewtonAuthInput): boolean {
  const auth = pickAuth(input);
  return Boolean(auth.sessionCookie || auth.authToken);
}

export function getNewtonAuthHeaders(input?: NewtonAuthInput): HeaderMap {
  const auth = pickAuth(input);
  const sessionCookie = auth.sessionCookie;
  const bearerToken = auth.authToken ?? extractAuthTokenFromCookie(sessionCookie);

  if (!sessionCookie && !bearerToken) {
    throw new Error(
      "Missing auth. Use auth_login tool (recommended) or set NEWTON_SESSION_COOKIE / NEWTON_AUTH_TOKEN."
    );
  }

  const headers: HeaderMap = {};
  if (sessionCookie) headers.Cookie = normalizeSessionCookie(sessionCookie);
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  return headers;
}

export function validateNewtonAuthConfig(): void {
  if (!hasNewtonAuth()) return;
  getNewtonAuthHeaders();
}
