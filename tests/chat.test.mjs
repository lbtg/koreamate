import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.mjs";
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "km-chat-")),
    dbPath = join(dir, "db.sqlite");
  let app = createApp({ dbPath, secure: false }),
    base;
  const password = "Chat-test-password-987!";
  for (const role of ["guest", "guide", "admin", "finance"])
    app.createUser(role + "@example.test", password, role, role);
  app.createUser("other@example.test", password, "Other", "guest");
  async function start() {
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    base = "http://127.0.0.1:" + app.server.address().port;
  }
  await start();
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });
  function client() {
    let cookie = "",
      csrf = "";
    return async (path, method = "GET", body, expected = 200) => {
      const res = await fetch(base + "/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-CSRF-Token": csrf,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      const result = await res.json();
      assert.equal(res.status, expected, JSON.stringify({ path, result }));
      if (result.csrf) csrf = result.csrf;
      return result;
    };
  }
  const guest = client(),
    guide = client(),
    admin = client(),
    finance = client(),
    other = client();
  for (const [role, c] of [
    ["guest", guest],
    ["guide", guide],
    ["admin", admin],
    ["finance", finance],
    ["other", other],
  ])
    await c(
      ["admin", "finance"].includes(role) ? "/admin/login" : "/login",
      "POST",
      { email: role + "@example.test", password },
    );
  await guide("/guide/profile", "POST", {
    city: "seoul",
    purposes: ["tourism"],
    bio: "Chat guide",
    languages: "中文",
    chineseLevel: "fluent",
    style: "friendly",
    rate: 35000,
    capacity: 4,
  });
  const g = await guide("/guide/profile");
  await admin("/admin/guide", "POST", {
    id: g.id,
    status: "approved",
    reason: "Approved",
  });
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await guide("/guide/availability", "POST", { date, start: 0, end: 1440 });
  async function book(time = "10:00", accept = true) {
    const b = await guest("/bookings", "POST", {
      guideId: g.id,
      date,
      time,
      hours: 1,
      adults: 1,
      children: 0,
      purposes: ["tourism"],
    });
    if (accept) await guide("/bookings/" + b.id + "/accept", "POST", {});
    return guest("/bookings/" + b.id);
  }
  return {
    guest,
    guide,
    admin,
    finance,
    other,
    client,
    book,
    db: () => app.db,
    restart: async () => {
      await new Promise((r) => app.server.close(r));
      app = createApp({ dbPath, secure: false });
      await start();
    },
  };
}
test("guide acceptance creates one private conversation per booking; no access before login or acceptance", async (t) => {
  const s = await setup(t),
    pending = await s.book("10:00", false);
  assert.equal(pending.conversationId, null);
  await s.guest(
    "/bookings/" + pending.id + "/messages",
    "POST",
    { body: "Too early" },
    409,
  );
  await s.guide("/bookings/" + pending.id + "/accept", "POST", {});
  const accepted = await s.guest("/bookings/" + pending.id),
    cid = accepted.conversationId;
  assert.ok(cid);
  assert.equal((await s.guide("/conversations"))[0].id, cid);
  await s.client()("/conversations/" + cid + "/messages", "GET", null, 401);
  for (const c of [s.other, s.admin, s.finance]) {
    await c("/conversations/" + cid + "/messages", "GET", null, 403);
    await c(
      "/conversations/" + cid + "/messages",
      "POST",
      { body: "No", clientId: randomUUID() },
      403,
    );
  }
  const second = await s.book("12:00");
  assert.notEqual(second.conversationId, cid);
  assert.equal((await s.guest("/conversations")).length, 2);
});
test("messages persist across restart, unread and read receipts are per participant, retries deduplicate", async (t) => {
  const s = await setup(t),
    b = await s.book(),
    cid = b.conversationId;
  const data = { body: "请在弘大地铁站见面。", clientId: randomUUID() };
  const m = await s.guest("/conversations/" + cid + "/messages", "POST", data);
  const retry = await s.guest(
    "/conversations/" + cid + "/messages",
    "POST",
    data,
  );
  assert.equal(m.id, retry.id);
  await s.guest(
    "/conversations/" + cid + "/messages",
    "POST",
    { ...data, body: "Changed" },
    409,
  );
  assert.equal((await s.guide("/conversations"))[0].unread, 1);
  assert.equal((await s.guest("/conversations"))[0].unread, 0);
  await s.guide("/conversations/" + cid + "/read", "POST", {
    lastSequence: m.seq,
  });
  assert.equal((await s.guide("/conversations"))[0].unread, 0);
  assert.equal(
    (await s.guest("/conversations/" + cid + "/messages")).peerReadSequence,
    m.seq,
  );
  await s.restart();
  assert.equal(
    (await s.guide("/conversations/" + cid + "/messages")).messages[0].body,
    data.body,
  );
  assert.equal((await s.guide("/conversations"))[0].unread, 0);
});
test("cancelled conversations become read-only; finance cannot read legacy order chat; support access requires audited dispute", async (t) => {
  const s = await setup(t),
    b = await s.book(),
    cid = b.conversationId;
  await s.guest("/conversations/" + cid + "/messages", "POST", {
    body: "Meeting confirmation",
    clientId: randomUUID(),
  });
  assert.equal((await s.finance("/bookings/" + b.id)).messages.length, 0);
  assert.equal((await s.admin("/bookings/" + b.id)).messages.length, 0);
  await s.admin(
    "/admin/conversations/" + cid + "/audit",
    "POST",
    { reason: "Resolve complaint" },
    403,
  );
  await s.guest("/bookings/" + b.id + "/case", "POST", {
    kind: "complaint",
    body: "Please help resolve our route question",
  });
  const audit = await s.admin(
    "/admin/conversations/" + cid + "/audit",
    "POST",
    { reason: "Resolve route question" },
  );
  assert.equal(audit.messages.length, 1);
  assert.ok(
    (await s.admin("/admin/audit")).some(
      (a) => a.action === "conversation.audit_read",
    ),
  );
  await s.finance(
    "/admin/conversations/" + cid + "/audit",
    "POST",
    { reason: "Resolve complaint" },
    403,
  );
  await s.admin(
    "/bookings/" + b.id + "/messages",
    "POST",
    { body: "Cannot impersonate" },
    403,
  );
  await s.guest("/bookings/" + b.id + "/cancel", "POST", {
    reason: "Plans changed",
  });
  await s.guide(
    "/conversations/" + cid + "/messages",
    "POST",
    { body: "No longer active", clientId: randomUUID() },
    409,
  );
  const history = await s.guest("/conversations/" + cid + "/messages");
  assert.equal(history.conversation.writable, false);
  assert.equal(history.messages.length, 1);
});
test("cursor pagination has no gaps; unrelated message cannot be marked read", async (t) => {
  const s = await setup(t),
    b = await s.book(),
    b2 = await s.book("12:00"),
    cid = b.conversationId;
  const user = (await s.guest("/session")).user.id;
  for (let i = 0; i < 105; i++)
    s.db()
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?)")
      .run(randomUUID(), b.id, user, "Message " + i, Date.now() - 120000 + i);
  const page = await s.guide("/conversations/" + cid + "/messages");
  assert.equal(page.messages.length, 100);
  assert.equal(page.hasMore, true);
  const older = await s.guide(
    "/conversations/" + cid + "/messages?before=" + page.messages[0].seq,
  );
  assert.equal(older.messages.length, 5);
  const all = [...older.messages, ...page.messages];
  assert.equal(new Set(all.map((m) => m.seq)).size, 105);
  const other = await s.guest(
    "/conversations/" + b2.conversationId + "/messages",
    "POST",
    { body: "Other booking", clientId: randomUUID() },
  );
  await s.guide(
    "/conversations/" + cid + "/read",
    "POST",
    { lastSequence: other.seq },
    400,
  );
  const next = await s.guide(
    "/conversations/" + cid + "/messages?after=" + all[102].seq,
  );
  assert.equal(next.messages.length, 2);
  await s.guide("/conversations/" + cid + "/read", "POST", {
    lastSequence: all[104].seq,
  });
  await s.guide("/conversations/" + cid + "/read", "POST", {
    lastSequence: all[0].seq,
  });
  assert.equal(
    (await s.guest("/conversations/" + cid + "/messages")).peerReadSequence,
    all[104].seq,
  );
});
