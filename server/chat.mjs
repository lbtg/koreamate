import { randomUUID } from "node:crypto";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const active = [
  "awaiting_payment",
  "confirmed",
  "in_service",
  "completion_pending",
  "completed",
];
export function createChat({ db, q, one, run, transaction, notify, log }) {
  db.exec(`CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS conversation_reads(conversation_id TEXT REFERENCES conversations(id),user_id TEXT REFERENCES users(id),last_seq INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(conversation_id,user_id));
 CREATE TABLE IF NOT EXISTS message_requests(conversation_id TEXT REFERENCES conversations(id),sender_id TEXT REFERENCES users(id),client_id TEXT,message_id TEXT REFERENCES messages(id),PRIMARY KEY(conversation_id,sender_id,client_id));
 CREATE INDEX IF NOT EXISTS messages_booking_created ON messages(booking_id,created);
 CREATE INDEX IF NOT EXISTS messages_sender_created ON messages(user_id,created);`);
  const ensure = (bid) => {
    run(
      "INSERT OR IGNORE INTO conversations VALUES(?,?,?)",
      randomUUID(),
      bid,
      Date.now(),
    );
    return one("SELECT id FROM conversations WHERE booking_id=?", bid).id;
  };
  // Preserve conversations of already accepted bookings when upgrading an existing database.
  for (const b of q(
    "SELECT id FROM bookings WHERE status IN ('awaiting_payment','confirmed','in_service','completion_pending','completed') OR EXISTS(SELECT 1 FROM messages m WHERE m.booking_id=bookings.id)",
  ))
    ensure(b.id);
  const byBooking = (bid) =>
    one("SELECT id FROM conversations WHERE booking_id=?", bid)?.id || null;
  const get = (cid, u) => {
    if (!u) fail("请先登录", 401);
    const c = one(
      `SELECT c.id,c.booking_id,c.created,b.guest_id,g.user_id guide_user,b.status,b.start,b.end,b.city,b.meeting,
     gu.name guide_name,tu.name guest_name FROM conversations c JOIN bookings b ON b.id=c.booking_id
     JOIN guides g ON g.id=b.guide_id JOIN users gu ON gu.id=g.user_id JOIN users tu ON tu.id=b.guest_id WHERE c.id=?`,
      cid,
    );
    if (!c) fail("会话不存在", 404);
    if (u.id !== c.guest_id && u.id !== c.guide_user)
      fail("只有本次预约的游客与地陪可以进入此会话", 403);
    return c;
  };
  const describe = (c, u) => ({
    id: c.id,
    bookingId: c.booking_id,
    status: c.status,
    start: c.start,
    end: c.end,
    city: c.city,
    meeting: c.meeting,
    peerName: u.id === c.guest_id ? c.guide_name : c.guest_name,
    peerRole: u.id === c.guest_id ? "guide" : "guest",
    writable: active.includes(c.status),
  });
  const marker = (cid, uid) =>
    one(
      "SELECT last_seq FROM conversation_reads WHERE conversation_id=? AND user_id=?",
      cid,
      uid,
    )?.last_seq || 0;
  const list = (u) => {
    if (!u) fail("请先登录", 401);
    const rows = q(
      `SELECT c.id,c.booking_id,c.created,b.guest_id,g.user_id guide_user,b.status,b.start,b.end,b.city,b.meeting,
     gu.name guide_name,tu.name guest_name FROM conversations c JOIN bookings b ON b.id=c.booking_id
     JOIN guides g ON g.id=b.guide_id JOIN users gu ON gu.id=g.user_id JOIN users tu ON tu.id=b.guest_id
     WHERE b.guest_id=? OR g.user_id=?`,
      u.id,
      u.id,
    );
    return rows
      .map((c) => {
        const last = one(
          "SELECT body,created,user_id FROM messages WHERE booking_id=? ORDER BY rowid DESC LIMIT 1",
          c.booking_id,
        );
        return {
          ...describe(c, u),
          lastMessage: last?.body || "",
          lastMessageAt: last?.created || c.created,
          unread: one(
            "SELECT COUNT(*) n FROM messages WHERE booking_id=? AND user_id!=? AND rowid>?",
            c.booking_id,
            u.id,
            marker(c.id, u.id),
          ).n,
        };
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  };
  const messages = (cid, u, params) => {
    const c = get(cid, u),
      before = params.get("before"),
      after = params.get("after");
    if (before && after) fail("不能同时指定向前与向后翻页");
    const value = before || after;
    if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))))
      fail("消息分页参数无效");
    const cursor = value ? Number(value) : null;
    let rows = q(
      `SELECT m.rowid seq,m.id,m.user_id senderId,m.body,m.created,u.name senderName
     FROM messages m JOIN users u ON m.user_id=u.id WHERE m.booking_id=? ${cursor !== null ? `AND m.rowid ${before ? "<" : ">"} ?` : ""}
     ORDER BY m.rowid ${after ? "ASC" : "DESC"} LIMIT 101`,
      c.booking_id,
      ...(cursor !== null ? [cursor] : []),
    );
    const hasMore = rows.length > 100;
    rows = rows.slice(0, 100);
    if (!after) rows.reverse();
    return {
      conversation: describe(c, u),
      messages: rows,
      hasMore,
      peerReadSequence: marker(
        cid,
        u.id === c.guest_id ? c.guide_user : c.guest_id,
      ),
    };
  };
  const read = (cid, u, seq) => {
    const c = get(cid, u);
    if (!Number.isSafeInteger(seq) || seq < 1) fail("已读位置无效");
    if (
      !one(
        "SELECT id FROM messages WHERE booking_id=? AND rowid=?",
        c.booking_id,
        seq,
      )
    )
      fail("消息不属于此会话");
    run(
      "INSERT INTO conversation_reads VALUES(?,?,?) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_seq=MAX(last_seq,excluded.last_seq)",
      cid,
      u.id,
      seq,
    );
    return { ok: true };
  };
  const send = (cid, u, data) =>
    transaction(() => {
      const c = get(cid, u),
        body = typeof data.body === "string" ? data.body.trim() : "",
        clientId = String(data.clientId || "");
      if (!body || body.length > 2000) fail("消息需为1至2000个字符");
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(clientId))
        fail("消息编号无效，请刷新后重试");
      const existing = one(
        "SELECT message_id FROM message_requests WHERE conversation_id=? AND sender_id=? AND client_id=?",
        cid,
        u.id,
        clientId,
      );
      if (existing) {
        const msg = one(
          "SELECT rowid seq,id,user_id senderId,body,created FROM messages WHERE id=?",
          existing.message_id,
        );
        if (msg.body !== body) fail("该消息编号已用于不同内容", 409);
        return { ...msg, senderName: u.name };
      }
      if (!active.includes(c.status))
        fail("预约已关闭，会话保留为只读记录", 409);
      if (
        one(
          "SELECT COUNT(*) n FROM messages WHERE user_id=? AND created>?",
          u.id,
          Date.now() - 60000,
        ).n >= 30
      )
        fail("发送过于频繁，请稍后再试", 429);
      const mid = randomUUID(),
        created = Date.now();
      run(
        "INSERT INTO messages VALUES(?,?,?,?,?)",
        mid,
        c.booking_id,
        u.id,
        body,
        created,
      );
      run(
        "INSERT INTO message_requests VALUES(?,?,?,?)",
        cid,
        u.id,
        clientId,
        mid,
      );
      const peer = u.id === c.guest_id ? c.guide_user : c.guest_id;
      notify(peer, "预约会话有新消息", c.booking_id);
      return {
        ...one(
          "SELECT rowid seq,id,user_id senderId,body,created FROM messages WHERE id=?",
          mid,
        ),
        senderName: u.name,
      };
    });
  const auditRead = (cid, u, data) => {
    if (!u || !["admin", "support"].includes(u.role))
      fail("无客服调阅权限", 403);
    const c = one("SELECT * FROM conversations WHERE id=?", cid);
    if (!c) fail("会话不存在", 404);
    const reason = String(data.reason || "").trim();
    if (reason.length < 5 || reason.length > 500)
      fail("请填写5至500字的调阅原因");
    if (
      !one(
        "SELECT id FROM cases WHERE booking_id=? AND status='open'",
        c.booking_id,
      )
    )
      fail("仅有待处理售后的订单可以调阅沟通记录", 403);
    log(u, "conversation.audit_read", cid, reason);
    return {
      messages: q(
        "SELECT m.id,m.body,m.created,u.name senderName FROM messages m JOIN users u ON u.id=m.user_id WHERE booking_id=? ORDER BY m.rowid DESC LIMIT 500",
        c.booking_id,
      ).reverse(),
      limit: 500,
    };
  };
  return { ensure, byBooking, list, messages, read, send, auditRead };
}
