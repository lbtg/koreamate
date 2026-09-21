import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, ArrowLeft, Send, CheckCheck } from "lucide-react";
const time = (n) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(n));
const statuses = {
  awaiting_payment: "待付款",
  confirmed: "预约已确认",
  in_service: "服务中",
  completion_pending: "待确认完成",
  completed: "已完成",
  cancelled: "已取消",
  expired: "已超时",
  rejected: "未接受",
};
export default function ChatCenter({ api, id, user, navigate, refresh }) {
  const [conversations, setConversations] = useState([]),
    [info, setInfo] = useState(null),
    [messages, setMessages] = useState([]),
    [failure, setFailure] = useState(""),
    [draft, setDraft] = useState(""),
    [sending, setSending] = useState(false),
    [failedSend, setFailedSend] = useState(null),
    [older, setOlder] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false),
    [peerRead, setPeerRead] = useState(0),
    [connected, setConnected] = useState(false);
  const scroll = useRef(null),
    latest = useRef(0),
    readSeq = useRef(0),
    follow = useRef(true),
    restore = useRef(null),
    pending = useRef(null);
  const merge = (rows) =>
    setMessages((old) =>
      [...new Map([...old, ...rows].map((m) => [m.id, m])).values()].sort(
        (a, b) => a.seq - b.seq,
      ),
    );
  async function markRead() {
    if (
      !id ||
      !latest.current ||
      readSeq.current >= latest.current ||
      document.visibilityState !== "visible" ||
      !follow.current
    )
      return;
    const seq = latest.current;
    try {
      await api(`/conversations/${id}/read`, "POST", { lastSequence: seq });
      readSeq.current = seq;
      setConversations((old) =>
        old.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
      );
      refresh();
    } catch {
      /* A later poll will retry the read marker. */
    }
  }
  useEffect(() => {
    let active = true,
      busy = false;
    async function load() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const list = await api("/conversations");
        if (!active) return;
        setConversations(list);
        if (id) {
          const after = latest.current;
          const data = await api(
            `/conversations/${id}/messages` + (after ? "?after=" + after : ""),
          );
          if (!active) return;
          setInfo(data.conversation);
          setPeerRead(data.peerReadSequence);
          if (!after) setOlder(data.hasMore);
          merge(data.messages);
          latest.current = Math.max(
            latest.current,
            ...data.messages.map((m) => m.seq),
          );
        }
        setConnected(true);
        setFailure("");
      } catch (e) {
        if (active) {
          setFailure(e.message);
          setConnected(false);
        }
      } finally {
        busy = false;
      }
    }
    load();
    const timer = setInterval(load, 5000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [id]);
  useEffect(() => {
    if (!scroll.current) return;
    if (restore.current) {
      scroll.current.scrollTop =
        scroll.current.scrollHeight -
        restore.current.height +
        restore.current.top;
      restore.current = null;
    } else if (follow.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
    void markRead();
  }, [messages]);
  async function loadOlder() {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await api(
        `/conversations/${id}/messages?before=${messages[0].seq}`,
      );
      restore.current = {
        height: scroll.current.scrollHeight,
        top: scroll.current.scrollTop,
      };
      follow.current = false;
      merge(data.messages);
      setOlder(data.hasMore);
    } catch (e) {
      setFailure(e.message);
    } finally {
      setLoadingOlder(false);
    }
  }
  async function deliver(body, clientId) {
    if (sending || !body) return;
    setSending(true);
    setFailedSend(null);
    pending.current = { body, clientId };
    try {
      const msg = await api(`/conversations/${id}/messages`, "POST", {
        body,
        clientId,
      });
      follow.current = true;
      merge([msg]);
      setDraft("");
      pending.current = null;
      refresh();
    } catch (e) {
      setFailedSend({ body, clientId, error: e.message });
    } finally {
      setSending(false);
    }
  }
  const onScroll = () => {
    const e = scroll.current;
    follow.current = e.scrollHeight - e.scrollTop - e.clientHeight < 64;
    if (follow.current) void markRead();
  };
  return (
    <section className="page chat-page">
      <div className="section-top">
        <div>
          <span className="eyebrow">YOUR CONVERSATIONS</span>
          <h1>预约消息</h1>
          <p>每笔预约一个独立会话，行程安排和沟通记录集中保存。</p>
        </div>
        <button className="text-button" onClick={() => navigate("/orders")}>
          返回我的订单
        </button>
      </div>
      {failure && (
        <div className="notice error" role="alert">
          {failure} · 将自动尝试重新连接
        </div>
      )}
      <div className={"chat-shell " + (id ? "has-thread" : "")}>
        <aside className="chat-inbox" aria-label="预约会话列表">
          <h3>全部会话</h3>
          {conversations.length ? (
            conversations.map((c) => (
              <button
                className={"thread-card " + (id === c.id ? "selected" : "")}
                key={c.id}
                onClick={() => navigate("/messages/" + c.id)}
              >
                <div className="thread-avatar">{c.peerName.slice(0, 1)}</div>
                <div className="thread-copy">
                  <div className="row">
                    <strong>{c.peerName}</strong>
                    <small>{time(c.lastMessageAt)}</small>
                  </div>
                  <p>{c.lastMessage || "地陪已接单，可以开始沟通了。"}</p>
                  <small>
                    {statuses[c.status]} · 订单 {c.bookingId.slice(0, 8)}
                  </small>
                </div>
                {c.unread > 0 && (
                  <span
                    className="unread-pill"
                    aria-label={`${c.unread}条未读`}
                  >
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="empty">
              <MessageCircle />
              <p>地陪确认接单后，会话会自动出现在这里。</p>
            </div>
          )}
        </aside>
        <div className="chat-thread">
          {!id ? (
            <div className="chat-welcome">
              <MessageCircle size={44} />
              <h2>选择一次同行，开始沟通</h2>
              <p>这里可以确认集合地点、路线、时间与服务范围。</p>
              <p className="small muted">新预约不会与之前的聊天混在一起。</p>
            </div>
          ) : (
            <>
              <header className="thread-header">
                <button
                  className="icon-btn"
                  aria-label="返回会话列表"
                  onClick={() => navigate("/messages")}
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h2>{info?.peerName || "正在加载会话…"}</h2>
                  <small>
                    {info
                      ? `${info.peerRole === "guide" ? "你的地陪" : "预约游客"} · ${statuses[info.status]} · `
                      : ""}
                    {connected ? "每5秒同步消息" : "正在重新连接"}
                  </small>
                </div>
                {info && (
                  <button
                    className="text-button"
                    onClick={() => navigate("/orders/" + info.bookingId)}
                  >
                    查看订单
                  </button>
                )}
              </header>
              {info && (
                <div className="thread-booking">
                  <strong>服务安排</strong>
                  <span>
                    {time(info.start)} — {time(info.end)} · 韩国时间
                  </span>
                  <span>集合地点：{info.meeting || "待双方确认"}</span>
                </div>
              )}
              <div
                className="chat-transcript"
                ref={scroll}
                onScroll={onScroll}
                role="log"
                aria-label="聊天记录"
                aria-live="polite"
              >
                {older && (
                  <button
                    className="older-messages"
                    disabled={loadingOlder}
                    onClick={loadOlder}
                  >
                    {loadingOlder ? "加载中…" : "查看更早消息"}
                  </button>
                )}
                {messages.length ? (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        "chat-message " +
                        (m.senderId === user.id ? "outgoing" : "incoming")
                      }
                    >
                      <small>
                        {m.senderName} · {time(m.created)}
                      </small>
                      <p>{m.body}</p>
                      {m.senderId === user.id && (
                        <small className="message-receipt">
                          {m.seq <= peerRead ? (
                            <>
                              <CheckCheck size={13} />
                              已读
                            </>
                          ) : (
                            "已发送"
                          )}
                        </small>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="conversation-start">
                    <MessageCircle />
                    <p>会话已为本次预约自动开启。</p>
                    <span>打个招呼，确认一下当天的安排吧。</span>
                  </div>
                )}
              </div>
              <div className="chat-compose">
                {failedSend && (
                  <div className="notice error" role="alert">
                    <p>消息未确认送达：{failedSend.error}</p>
                    <button
                      className="text-button"
                      disabled={sending}
                      onClick={() =>
                        deliver(failedSend.body, failedSend.clientId)
                      }
                    >
                      重试同一条消息
                    </button>
                    <span className="small"> 重试不会重复发送。</span>
                  </div>
                )}
                {info?.writable ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!failedSend)
                        void deliver(draft.trim(), crypto.randomUUID());
                    }}
                  >
                    <label className="sr-only" htmlFor="chat-draft">
                      发送给预约对方的消息
                    </label>
                    <textarea
                      id="chat-draft"
                      value={draft}
                      disabled={sending || !!failedSend}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength="2000"
                      placeholder="输入集合地点、行程安排或想确认的问题…"
                      required
                    />
                    <div className="compose-bottom">
                      <small>
                        {draft.length}/2000 · 仅本次预约双方可发送消息
                      </small>
                      <button
                        className="button"
                        disabled={sending || !draft.trim() || !!failedSend}
                      >
                        <Send size={16} />
                        {sending ? "发送中…" : "发送消息"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="notice">
                    预约已关闭或尚未加载，此会话暂为只读。历史消息仍会保留。
                  </p>
                )}
                <small className="muted">
                  有售后问题时，授权客服可在记录调阅原因后查看相关沟通；财务不能查看聊天内容。
                </small>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
