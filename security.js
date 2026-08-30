import crypto from "node:crypto";
import net from "node:net";

export function parseCsv(value = "") {
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function authorizeBearerHeader(header, expectedToken) {
  if (!expectedToken || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const provided = header.slice(7);
  const a = Buffer.from(provided);
  const b = Buffer.from(expectedToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isAllowedHostname(hostname, allowedHosts) {
  const host = hostname.toLowerCase();
  return allowedHosts.some((rule) => {
    const normalized = rule.toLowerCase();
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === normalized;
  });
}

export function isBlockedNetworkHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return true;

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }

  if (ipVersion === 6) {
    return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb");
  }

  return false;
}

export function validatePdfUrl(value, allowedHosts) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Invalid PDF URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid PDF URL");
  }
  if (url.protocol !== "https:") throw new Error("PDF URL must use HTTPS");
  if (url.username || url.password) throw new Error("PDF URL credentials are not allowed");
  if (isBlockedNetworkHost(url.hostname)) throw new Error("PDF URL host is blocked");
  if (!allowedHosts.length || !isAllowedHostname(url.hostname, allowedHosts)) throw new Error("PDF URL host is not allowlisted");
  return url;
}

export function createRateLimiter({ windowMs, maxRequests }) {
  const buckets = new Map();
  return function consume(key) {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: Math.max(0, maxRequests - 1) };
    }
    current.count += 1;
    return { allowed: current.count <= maxRequests, remaining: Math.max(0, maxRequests - current.count) };
  };
}

export function safeAuditId(value) {
  if (!value) return "none";
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}
