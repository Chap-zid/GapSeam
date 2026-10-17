import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function jwtSecret() {
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!secret && process.env.K_SERVICE) throw new Error("ONLYOFFICE JWT secret is not configured");
  return secret;
}

export function signOnlyOfficeConfig<T extends object>(config: T): T & { token?: string } {
  const secret = jwtSecret();
  if (!secret) return config;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(config)).toString("base64url");
  const data = header + "." + payload;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return { ...config, token: data + "." + signature };
}

type Callback = { key?: string; status?: number; url?: string; token?: string };

export function authenticatedOnlyOfficeCallback(request: Request, body: Callback): Callback {
  const secret = jwtSecret();
  if (!secret) return body;
  const token = body.token || request.headers.get("AuthorizationJwt")?.replace(/^Bearer\s+/i, "");
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error("Missing callback signature");
  const [header, payload, signature] = token.split(".");
  if (JSON.parse(Buffer.from(header, "base64url").toString()).alg !== "HS256") throw new Error("Invalid callback algorithm");
  const expected = createHmac("sha256", secret).update(header + "." + payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid callback signature");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  const now = Math.floor(Date.now() / 1000);
  if ((claims.exp !== undefined && (typeof claims.exp !== "number" || claims.exp <= now)) || (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > now))) throw new Error("Expired or inactive callback token");
  const callback = claims.payload ?? claims;
  if (!callback || typeof callback !== "object" || typeof callback.key !== "string" || typeof callback.status !== "number" || (callback.url !== undefined && typeof callback.url !== "string")) throw new Error("Invalid callback payload");
  return callback as Callback;
}
