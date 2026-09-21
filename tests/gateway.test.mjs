import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/gateway.mjs";
const response = () => ({
  statusCode: 200,
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  end(v) {
    this.body = String(v);
  },
});
test("gateway fails closed without backend and distinguishes setup from outage", async () => {
  const saved = process.env.BACKEND_ORIGIN;
  delete process.env.BACKEND_ORIGIN;
  try {
    const res = response();
    await handler(
      { url: "/api/gateway?route=session", method: "GET", headers: {} },
      res,
    );
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).code, "BACKEND_NOT_CONFIGURED");
  } finally {
    if (saved) process.env.BACKEND_ORIGIN = saved;
  }
});
test("gateway preserves cookies/CSRF and never accepts an arbitrary outbound URL", async () => {
  const saved = process.env.BACKEND_ORIGIN,
    original = globalThis.fetch;
  process.env.BACKEND_ORIGIN = "https://backend.example";
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    assert.equal(url.origin, "https://backend.example");
    assert.equal(url.pathname, "/api/admin/login");
    assert.equal(opts.headers["x-csrf-token"], "csrf");
    assert.equal(opts.headers.cookie, "km_session=fake");
    return new Response('{"ok":true}', {
      headers: {
        "Set-Cookie": "km_session=new; HttpOnly; Secure; SameSite=Lax; Path=/",
      },
    });
  };
  try {
    const res = response();
    await handler(
      {
        url: "/api/gateway?route=admin/login",
        method: "POST",
        headers: { cookie: "km_session=fake", "x-csrf-token": "csrf" },
        body: { email: "a@example.test" },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Set-Cookie"].length, 1);
    const bad = response();
    await handler(
      {
        url: "/api/gateway?route=https://attacker.test",
        method: "GET",
        headers: {},
      },
      bad,
    );
    assert.equal(bad.statusCode, 400);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    if (saved) process.env.BACKEND_ORIGIN = saved;
    else delete process.env.BACKEND_ORIGIN;
  }
});
