import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
let app, base, dir, admin, guide, guest, other, reviewer, gid, bid;
const date = new Date(Date.now() + 5 * 86400000 + 32400000)
  .toISOString()
  .slice(0, 10);
const password = "Integration-test-948!";
function client() {
  let cookie = "",
    csrf = "";
  return async (path, method = "GET", data, expected = 200, overrides = {}) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        ...overrides,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const result = await r.json();
    if (Array.isArray(expected)) {
      assert.ok(expected.includes(r.status), JSON.stringify({ path, result }));
      result.httpStatus = r.status;
    } else assert.equal(r.status, expected, JSON.stringify({ path, result }));
    if (result.csrf) csrf = result.csrf;
    return result;
  };
}
before(async () => {
  dir = mkdtempSync(join(tmpdir(), "km-test-"));
  app = createApp({
    dbPath: join(dir, "db.sqlite"),
    secure: false,
    manualPayments: true,
  });
  app.createUser("admin@example.test", password, "Admin", "admin");
  app.createUser("review@example.test", password, "Reviewer", "reviewer");
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + app.server.address().port;
  admin = client();
  guide = client();
  guest = client();
  other = client();
  reviewer = client();
  await admin("/admin/login", "POST", {
    email: "admin@example.test",
    password,
  });
  await reviewer("/admin/login", "POST", {
    email: "review@example.test",
    password,
  });
  await guide("/register", "POST", {
    email: "guide@example.test",
    password,
    name: "Real Guide",
    role: "guide",
  });
  await guest("/register", "POST", {
    email: "guest@example.test",
    password,
    name: "Guest One",
    role: "guest",
  });
  await other("/register", "POST", {
    email: "other@example.test",
    password,
    name: "Guest Two",
    role: "guest",
  });
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  rmSync(dir, { recursive: true, force: true });
});
const profile = {
  city: "seoul",
  purposes: ["tourism", "medical"],
  bio: "真实陪同服务范围",
  languages: "한국어, 中文",
  chineseLevel: "fluent",
  style: "professional",
  rate: 35000,
  capacity: 4,
  image: "",
};
const search = (overrides = {}) =>
  "/guides?" +
  new URLSearchParams({
    city: "seoul",
    date,
    time: "10:00",
    hours: 3,
    adults: 2,
    children: 0,
    purposes: "tourism",
    ...overrides,
  });
const request = (overrides) => ({
  guideId: gid,
  date,
  time: "10:00",
  hours: 3,
  adults: 2,
  children: 0,
  purposes: ["tourism"],
  note: "测试预约",
  ...overrides,
});
test("registration rejects administrator self-assignment; roles and CSRF enforced", async () => {
  await client()(
    "/register",
    "POST",
    { email: "evil@example.test", password, name: "No", role: "admin" },
    400,
  );
  await guest("/admin/users", "GET", null, 403);
  await reviewer("/admin/stats", "GET", null, 403);
  await guest("/logout", "POST", {}, 403, { "X-CSRF-Token": "wrong" });
});
test("guide application approval and complete slot matching across separate accounts", async () => {
  await guide("/guide/profile", "POST", profile);
  let g = await guide("/guide/profile");
  gid = g.id;
  assert.equal(g.status, "pending");
  assert.equal((await guest(search())).length, 0);
  await admin("/admin/guide", "POST", {
    id: gid,
    status: "approved",
    reason: "Identity and language checked",
  });
  await guide("/guide/availability", "POST", { date, start: 540, end: 1080 });
  let found = await guest(search());
  assert.equal(found.length, 1);
  assert.equal(found[0].total, 105000);
  assert.equal((await guest(search({ adults: 5 }))).length, 0);
  assert.equal(
    (await guest(search({ purposes: "tourism,concert" }))).length,
    0,
  );
  assert.equal(
    (await guest(search({ purposes: "tourism,medical" }))).length,
    1,
  );
  assert.equal((await guest(search({ time: "17:00" }))).length, 0);
  assert.equal((await guest(search({ budget: 100000 }))).length, 0);
  assert.equal((await guest("/guides/" + gid)).id, gid);
  await guide("/guide/availability", "POST", {
    date,
    start: 900,
    end: 960,
    blocked: true,
  });
  assert.equal((await guest(search({ time: "14:00", hours: 2 }))).length, 0);
});
test("durable order visible to guide; cross-account isolation and overlap locking", async () => {
  bid = (await guest("/bookings", "POST", request())).id;
  const second = (await other("/bookings", "POST", request())).id;
  assert.equal((await guide("/bookings"))[0].guide_id, gid);
  await other("/bookings/" + bid, "GET", null, 403);
  await guest("/bookings/" + bid + "/accept", "POST", {}, 403);
  await guide("/bookings/" + bid + "/accept", "POST", {});
  await guide("/bookings/" + second + "/accept", "POST", {}, 409);
  assert.equal((await guest(search())).length, 0);
  assert.equal((await guest(search({ time: "13:00", hours: 1 }))).length, 0);
  assert.equal((await guest(search({ time: "13:30", hours: 1 }))).length, 1);
  await guest("/bookings/" + bid + "/messages", "POST", {
    body: "Where shall we meet?",
  });
  assert.equal((await guide("/bookings/" + bid)).messages.length, 1);
  assert.ok((await guide("/notifications")).length > 0);
});
test("payment reconciliation is authorized, idempotent and separate from status; immutable quote", async () => {
  await admin("/admin/settings", "POST", {
    paymentInstructions: "Test reconciliation instructions",
  });
  await guest("/bookings/" + bid + "/payment-report", "POST", {
    reference: "receipt-1",
  });
  await guide(
    "/bookings/" + bid + "/confirm-payment",
    "POST",
    { reference: "bank-1" },
    403,
  );
  await admin("/bookings/" + bid + "/confirm-payment", "POST", {
    reference: "bank-1",
  });
  await admin("/bookings/" + bid + "/confirm-payment", "POST", {
    reference: "bank-1",
  });
  let b = await guest("/bookings/" + bid);
  assert.equal(b.status, "confirmed");
  assert.equal(b.payment_status, "paid");
  assert.equal(b.ledger.length, 1);
  await guide("/guide/profile", "POST", { ...profile, rate: 50000 });
  assert.equal((await guest("/bookings/" + bid)).total, 105000);
  await admin("/admin/guide", "POST", {
    id: gid,
    status: "approved",
    reason: "Updated profile checked",
  });
});
test("change requires both participants; cannot force state via administrator", async () => {
  await admin("/bookings/" + bid + "/propose-change", "POST", {
    date,
    time: "13:30",
    meeting: "Station exit 2",
    reason: "Both requested a later start",
  });
  let b = await guest("/bookings/" + bid);
  const original = b.start,
    ch = b.changes[0].id;
  await guest("/bookings/" + bid + "/respond-change", "POST", {
    changeId: ch,
    accept: true,
  });
  assert.equal((await guest("/bookings/" + bid)).start, original);
  await guide(
    "/bookings/" + bid + "/respond-change",
    "POST",
    { changeId: ch, accept: true },
    409,
  ); /* blocked afternoon means approval cannot overbook */
  const slots = await guide("/guide/availability");
  await guide(
    "/guide/availability/" + slots.find((s) => s.blocked).id,
    "DELETE",
    {},
  );
  await guide("/bookings/" + bid + "/respond-change", "POST", {
    changeId: ch,
    accept: true,
  });
  b = await guest("/bookings/" + bid);
  assert.notEqual(b.start, original);
  assert.equal(b.meeting, "Station exit 2");
});
test("service start time, guest completion, review ownership, dispute holds and refund ledger", async () => {
  await guide("/bookings/" + bid + "/start", "POST", {}, 400);
  await guest(
    "/bookings/" + bid + "/review",
    "POST",
    { rating: 5, body: "Too early" },
    400,
  );
  app.db
    .prepare("UPDATE bookings SET start=?,end=? WHERE id=?")
    .run(Date.now() - 7200000, Date.now() - 3600000, bid);
  await guide("/bookings/" + bid + "/start", "POST", {});
  await guide("/bookings/" + bid + "/finish", "POST", {});
  await guide("/bookings/" + bid + "/complete", "POST", {}, 400);
  await guest("/bookings/" + bid + "/complete", "POST", {});
  await guest("/bookings/" + bid + "/review", "POST", {
    rating: 5,
    body: "Helpful guide",
  });
  await guest(
    "/bookings/" + bid + "/review",
    "POST",
    { rating: 5, body: "Duplicate" },
    400,
  );
  await guest("/bookings/" + bid + "/case", "POST", {
    kind: "refund",
    body: "Partial service issue",
    evidence: "Messages in order",
  });
  await admin(
    "/bookings/" + bid + "/settle",
    "POST",
    { reference: "payout-1" },
    400,
  );
  await admin("/bookings/" + bid + "/refund", "POST", {
    amount: 10000,
    reference: "refund-1",
    reason: "Agreed partial refund",
  });
  await admin(
    "/bookings/" + bid + "/refund",
    "POST",
    { amount: 100000, reference: "refund-2", reason: "Excess" },
    400,
  );
  let cases = await admin("/admin/cases");
  for (const c of cases.filter((c) => c.status === "open"))
    await admin("/admin/case", "POST", {
      id: c.id,
      resolution: "Issue resolved and refund registered",
    });
  app.db
    .prepare("UPDATE bookings SET updated=? WHERE id=?")
    .run(Date.now() - 25 * 3600000, bid);
  await admin("/bookings/" + bid + "/settle", "POST", {
    reference: "payout-1",
  });
  const b = await guest("/bookings/" + bid);
  assert.equal(b.settlement_status, "paid");
  assert.equal(b.refund, 10000);
  assert.equal(b.ledger.find((l) => l.kind === "settlement").amount, 76000);
});
test("expired locks release capacity and late payments cannot confirm a closed booking", async () => {
  const b = (
    await guest("/bookings", "POST", request({ time: "10:00", hours: 1 }))
  ).id;
  await guide("/bookings/" + b + "/accept", "POST", {});
  app.db
    .prepare("UPDATE bookings SET expires=? WHERE id=?")
    .run(Date.now() - 1000, b);
  await admin(
    "/bookings/" + b + "/confirm-payment",
    "POST",
    { reference: "late-receipt" },
    409,
  );
  assert.equal((await guest("/bookings/" + b)).status, "expired");
  assert.equal((await guest(search({ hours: 1 }))).length, 1);
});
test("review moderation and four-purpose statistics persist", async () => {
  let rs = await admin("/admin/reviews");
  await admin("/admin/review", "POST", {
    id: rs[0].id,
    visible: false,
    reason: "Under appeal",
  });
  assert.equal((await guest("/guides/" + gid)).reviewCount, 0);
  assert.equal((await admin("/admin/stats")).purposes.length, 4);
  assert.ok(
    (await admin("/admin/audit")).some((a) => a.action === "payment.confirmed"),
  );
});
test("concurrent accepts cannot double-book, quote tampering rejected, guest cancellation releases slot", async () => {
  await guest(
    "/bookings",
    "POST",
    request({ time: "16:00", hours: 1, expectedTotal: 1 }),
    409,
  );
  const a = (
      await guest("/bookings", "POST", request({ time: "16:00", hours: 1 }))
    ).id,
    c = (await other("/bookings", "POST", request({ time: "16:00", hours: 1 })))
      .id;
  const guide2 = client();
  await guide2("/login", "POST", { email: "guide@example.test", password });
  const responses = await Promise.all([
    guide("/bookings/" + a + "/accept", "POST", {}, [200, 409]),
    guide2("/bookings/" + c + "/accept", "POST", {}, [200, 409]),
  ]);
  assert.deepEqual(responses.map((r) => r.httpStatus).sort(), [200, 409]);
  const winner =
    responses[0].httpStatus === 200
      ? { client: guest, id: a }
      : { client: other, id: c };
  await winner.client("/bookings/" + winner.id + "/cancel", "POST", {
    reason: "Plans changed",
  });
  assert.equal((await guest(search({ time: "16:00", hours: 1 }))).length, 1);
});
test("accounts, sessions, orders and ledger survive a server restart", async () => {
  await new Promise((r) => app.server.close(r));
  app = createApp({
    dbPath: join(dir, "db.sqlite"),
    secure: false,
    manualPayments: true,
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + app.server.address().port;
  assert.equal((await guest("/session")).user.name, "Guest One");
  assert.equal((await guest("/bookings/" + bid)).settlement_status, "paid");
  assert.equal((await guest("/bookings/" + bid)).ledger.length, 3);
});
