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
  awaiting_payment: ["待付款", "결제 대기"],
  confirmed: ["预约已确认", "예약 확정"],
  in_service: ["服务中", "서비스 중"],
  completion_pending: ["待确认完成", "완료 확인 대기"],
  completed: ["已完成", "완료"],
  cancelled: ["已取消", "취소됨"],
  expired: ["已超时", "기한 만료"],
  rejected: ["未接受", "거절됨"],
};
// An unknown status still has to read as something, so fall back to its own key.
const statusLabel = (t, key) => (statuses[key] ? t(...statuses[key]) : key);
export default function ChatCenter({ api, id, user, navigate, refresh, t }) {
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
          <h1>{t("预约消息", "예약 메시지")}</h1>
          <p>
            {t(
              "每笔预约一个独立会话，行程安排和沟通记录集中保存。",
              "예약마다 전용 대화가 열리며, 일정과 대화 기록이 함께 보관됩니다.",
            )}
          </p>
        </div>
        <button className="text-button" onClick={() => navigate("/orders")}>
          {t("返回我的订单", "내 예약으로")}
        </button>
      </div>
      {failure && (
        <div className="notice error" role="alert">
          {failure} · {t("将自动尝试重新连接", "자동으로 다시 연결합니다")}
        </div>
      )}
      <div className={"chat-shell " + (id ? "has-thread" : "")}>
        <aside
          className="chat-inbox"
          aria-label={t("预约会话列表", "예약 대화 목록")}
        >
          <h3>{t("全部会话", "전체 대화")}</h3>
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
                  <p>
                    {c.lastMessage ||
                      t(
                        "随行翻译已接单，可以开始沟通了。",
                        "통역사가 예약을 수락했습니다. 대화를 시작하세요.",
                      )}
                  </p>
                  <small>
                    {statusLabel(t, c.status)} · {t("订单", "예약")}{" "}
                    {c.bookingId.slice(0, 8)}
                  </small>
                </div>
                {c.unread > 0 && (
                  <span
                    className="unread-pill"
                    aria-label={t(
                      `${c.unread}条未读`,
                      `읽지 않음 ${c.unread}건`,
                    )}
                  >
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="empty">
              <MessageCircle />
              <p>
                {t(
                  "随行翻译确认接单后，会话会自动出现在这里。",
                  "통역사가 예약을 수락하면 대화가 여기에 나타납니다.",
                )}
              </p>
            </div>
          )}
        </aside>
        <div className="chat-thread">
          {!id ? (
            <div className="chat-welcome">
              <MessageCircle size={44} />
              <h2>{t("选择一次同行，开始沟通", "대화를 선택해 주세요")}</h2>
              <p>
                {t(
                  "这里可以确认集合地点、路线、时间与服务范围。",
                  "만날 장소, 동선, 시간과 서비스 범위를 여기에서 확인하세요.",
                )}
              </p>
              <p className="small muted">
                {t(
                  "新预约不会与之前的聊天混在一起。",
                  "새 예약의 대화는 이전 대화와 섞이지 않습니다.",
                )}
              </p>
            </div>
          ) : (
            <>
              <header className="thread-header">
                <button
                  className="icon-btn"
                  aria-label={t("返回会话列表", "대화 목록으로")}
                  onClick={() => navigate("/messages")}
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h2>
                    {info?.peerName ||
                      t("正在加载会话…", "대화를 불러오는 중…")}
                  </h2>
                  <small>
                    {info
                      ? `${
                          info.peerRole === "guide"
                            ? t("你的随行翻译", "담당 통역사")
                            : t("预约游客", "예약 이용자")
                        } · ${statusLabel(t, info.status)} · `
                      : ""}
                    {connected
                      ? t("每5秒同步消息", "5초마다 동기화")
                      : t("正在重新连接", "다시 연결하는 중")}
                  </small>
                </div>
                {info && (
                  <button
                    className="text-button"
                    onClick={() => navigate("/orders/" + info.bookingId)}
                  >
                    {t("查看订单", "예약 보기")}
                  </button>
                )}
              </header>
              {info && (
                <div className="thread-booking">
                  <strong>{t("服务安排", "서비스 일정")}</strong>
                  <span>
                    {time(info.start)} — {time(info.end)} ·{" "}
                    {t("韩国时间", "한국 시간")}
                  </span>
                  <span>
                    {t("集合地点", "만날 장소")}：
                    {info.meeting || t("待双方确认", "양측 확인 대기")}
                  </span>
                </div>
              )}
              <div
                className="chat-transcript"
                ref={scroll}
                onScroll={onScroll}
                role="log"
                aria-label={t("聊天记录", "대화 기록")}
                aria-live="polite"
              >
                {older && (
                  <button
                    className="older-messages"
                    disabled={loadingOlder}
                    onClick={loadOlder}
                  >
                    {loadingOlder
                      ? t("加载中…", "불러오는 중…")
                      : t("查看更早消息", "이전 메시지 보기")}
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
                              {t("已读", "읽음")}
                            </>
                          ) : (
                            t("已发送", "전송됨")
                          )}
                        </small>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="conversation-start">
                    <MessageCircle />
                    <p>
                      {t(
                        "会话已为本次预约自动开启。",
                        "이번 예약을 위한 대화가 자동으로 열렸습니다.",
                      )}
                    </p>
                    <span>
                      {t(
                        "打个招呼，确认一下当天的安排吧。",
                        "인사를 건네고 당일 일정을 확인해 보세요.",
                      )}
                    </span>
                  </div>
                )}
              </div>
              <div className="chat-compose">
                {failedSend && (
                  <div className="notice error" role="alert">
                    <p>
                      {t("消息未确认送达", "메시지 전송이 확인되지 않았습니다")}
                      ：{failedSend.error}
                    </p>
                    <button
                      className="text-button"
                      disabled={sending}
                      onClick={() =>
                        deliver(failedSend.body, failedSend.clientId)
                      }
                    >
                      {t("重试同一条消息", "같은 메시지 다시 보내기")}
                    </button>
                    <span className="small">
                      {" "}
                      {t(
                        "重试不会重复发送。",
                        "다시 보내도 중복 전송되지 않습니다.",
                      )}
                    </span>
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
                      {t("发送给预约对方的消息", "예약 상대에게 보낼 메시지")}
                    </label>
                    <textarea
                      id="chat-draft"
                      value={draft}
                      disabled={sending || !!failedSend}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength="2000"
                      placeholder={t(
                        "输入集合地点、行程安排或想确认的问题…",
                        "만날 장소, 일정, 확인하고 싶은 내용을 입력하세요…",
                      )}
                      required
                    />
                    <div className="compose-bottom">
                      <small>
                        {draft.length}/2000 ·{" "}
                        {t(
                          "仅本次预约双方可发送消息",
                          "이번 예약의 당사자만 메시지를 보낼 수 있습니다",
                        )}
                      </small>
                      <button
                        className="button"
                        disabled={sending || !draft.trim() || !!failedSend}
                      >
                        <Send size={16} />
                        {sending
                          ? t("发送中…", "보내는 중…")
                          : t("发送消息", "메시지 보내기")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="notice">
                    {t(
                      "预约已关闭或尚未加载，此会话暂为只读。历史消息仍会保留。",
                      "예약이 종료되었거나 아직 불러오지 않아 읽기 전용입니다. 지난 메시지는 그대로 보관됩니다.",
                    )}
                  </p>
                )}
                <small className="muted">
                  {t(
                    "有售后问题时，授权客服可在记录调阅原因后查看相关沟通；财务不能查看聊天内容。",
                    "분쟁이 있을 때에 한해, 권한이 있는 고객지원이 열람 사유를 기록한 뒤 대화를 확인할 수 있습니다. 재무 담당자는 대화를 볼 수 없습니다.",
                  )}
                </small>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
