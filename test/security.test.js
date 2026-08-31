import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeBearerHeader,
  isAllowedHostname,
  isBlockedNetworkHost,
  validatePdfUrl,
} from "../security.js";

process.env.NODE_ENV = "test";
process.env.AI_API_BEARER_TOKEN = "test-secret";
process.env.AI_REVIEW_PDF_ALLOWED_HOSTS = "storage.example.com";

const { app } = await import("../index.js");

async function withServer(run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("bearer authorization uses exact token match", () => {
  assert.equal(authorizeBearerHeader("Bearer test-secret", "test-secret"), true);
  assert.equal(authorizeBearerHeader("Bearer wrong", "test-secret"), false);
  assert.equal(authorizeBearerHeader(undefined, "test-secret"), false);
});

test("hostname allowlist supports exact and explicit wildcard rules", () => {
  assert.equal(isAllowedHostname("storage.example.com", ["storage.example.com"]), true);
  assert.equal(isAllowedHostname("a.storage.example.com", ["*.storage.example.com"]), true);
  assert.equal(isAllowedHostname("storage.example.com.evil.test", ["storage.example.com"]), false);
});

test("private and loopback network targets are blocked", () => {
  for (const host of ["localhost", "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.5", "169.254.1.1", "::1"]) {
    assert.equal(isBlockedNetworkHost(host), true, host);
  }
  assert.equal(isBlockedNetworkHost("8.8.8.8"), false);
});

test("PDF URL validator rejects unsafe schemes, credentials and unallowlisted hosts", () => {
  assert.throws(() => validatePdfUrl("http://storage.example.com/a.pdf", ["storage.example.com"]));
  assert.throws(() => validatePdfUrl("https://user:pass@storage.example.com/a.pdf", ["storage.example.com"]));
  assert.throws(() => validatePdfUrl("https://evil.example/a.pdf", ["storage.example.com"]));
  assert.equal(validatePdfUrl("https://storage.example.com/a.pdf", ["storage.example.com"]).hostname, "storage.example.com");
});

test("statistical interpretation rejects unauthenticated requests", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/interpret-statistics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysis: { method: "correlation" } }),
    });
    assert.equal(response.status, 401);
  });
});

test("AI review rejects unauthenticated requests", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/ai-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submission_id: "s-1", pdf_url: "https://storage.example.com/a.pdf" }),
    });
    assert.equal(response.status, 401);
  });
});

test("AI review rejects SSRF-style localhost URL before fetching", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/ai-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-secret",
      },
      body: JSON.stringify({ submission_id: "s-2", pdf_url: "https://127.0.0.1/private.pdf" }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.match(payload.error, /blocked|allowlisted|PDF URL/i);
  });
});
