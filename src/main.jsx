import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  CalendarDays,
  Clock3,
  Users,
  Search,
  Star,
  ShieldCheck,
  Menu,
  X,
  Globe2,
  Bell,
  Check,
  ChevronRight,
  LogOut,
  MessageCircle,
  LayoutDashboard,
  HeartHandshake,
  BriefcaseBusiness,
  Stethoscope,
  Music2,
  Wallet,
  ClipboardList,
  Settings,
  UserRound,
  Plus,
  Trash2,
} from "lucide-react";
import "./platform.css";
const purposes = {
  tourism: ["旅游", "관광"],
  business: ["商业", "비즈니스"],
  medical: ["医疗", "의료 동행"],
  concert: ["演唱会", "콘서트"],
};
const cities = {
  seoul: ["首尔", "서울"],
  busan: ["釜山", "부산"],
  incheon: ["仁川", "인천"],
  jeju: ["济州", "제주"],
};
const levels = {
  basic: ["基础交流", "기초 회화"],
  fluent: ["流利", "유창함"],
  native: ["接近母语", "원어민 수준"],
};
const styles = {
  friendly: ["活泼友好", "밝고 친근함"],
  quiet: ["安静细致", "차분하고 세심함"],
  professional: ["专业高效", "전문적이고 효율적"],
};
const statusLabels = {
  requested: ["待地陪确认", "수락 대기"],
  awaiting_payment: ["待付款", "결제 대기"],
  confirmed: ["预约已确认", "예약 확정"],
  rejected: ["未被接受", "거절됨"],
  cancelled: ["已取消", "취소됨"],
  expired: ["已超时", "기한 만료"],
  in_service: ["服务中", "서비스 중"],
  completion_pending: ["待游客确认完成", "완료 확인 대기"],
  completed: ["已完成", "완료"],
  pending: ["待审核", "심사 대기"],
  approved: ["已通过", "승인"],
  needs_changes: ["待补充资料", "보완 필요"],
  suspended: ["已下架", "노출 중단"],
  open: ["待处理", "처리 대기"],
  resolved: ["已处理", "처리 완료"],
};
const payLabels = {
  unpaid: "未付款",
  paid: "已核实到账",
  partially_refunded: "部分退款",
  refunded: "已全额退款",
};
const settleLabels = {
  not_eligible: "未进入结算",
  pending: "待结算",
  paid: "已登记结算",
};
const roles = {
  guest: "游客",
  guide: "地陪",
  admin: "管理员",
  support: "客服",
  finance: "财务",
  reviewer: "审核人员",
};
const money = (n) => "₩" + Number(n || 0).toLocaleString("ko-KR");
const kst = (n) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(n));
const day = (offset = 1) =>
  new Date(Date.now() + 32400000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const hm = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const mins = (s) =>
  s.split(":").reduce((a, v, i) => a + Number(v) * (i ? 1 : 60), 0);
let csrf = "";
async function api(path, method = "GET", body) {
  if (import.meta.env.MODE === "showcase") return (await import("./showcase.js")).showcaseApi(path, method, body);
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("服务连接失败，请稍后重试");
  }
  if (!r.ok) throw Error(data.error || "请求失败");
  return data;
}
function useLoad(path, revision = 0) {
  const [state, set] = useState({ data: null, loading: true, error: "" });
  useEffect(() => {
    let active = true;
    set((s) => ({ ...s, loading: true, error: "" }));
    const load = () =>
      api(path)
        .then((data) => active && set({ data, loading: false, error: "" }))
        .catch(
          (e) =>
            active && set((s) => ({ ...s, loading: false, error: e.message })),
        );
    load();
    const timer = path.startsWith("/bookings")
      ? setInterval(load, 15000)
      : null;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [path, revision]);
  return state;
}
function Button({ children, secondary = false, danger = false, ...props }) {
  return (
    <button
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Select({ options, value, onChange, ...props }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}
function State({ loading, error, empty = false, children }) {
  if (loading) return <div className="empty">正在加载…</div>;
  if (error)
    return (
      <div className="notice error" role="alert">
        {error}
      </div>
    );
  if (empty)
    return (
      <div className="empty">
        <Search size={28} />
        <h3>暂时没有记录</h3>
        <p>可以调整条件，或稍后再查看。</p>
      </div>
    );
  return children;
}
function Badge({ status, t }) {
  return (
    <span className={`badge ${status}`}>
      {statusLabels[status] ? t(...statusLabels[status]) : status}
    </span>
  );
}
function Avatar({ src, name }) {
  return src ? (
    <img
      className="avatar"
      src={src}
      alt={name}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  ) : (
    <span className="avatar initials">{name?.slice(0, 1) || "K"}</span>
  );
}
function App() {
  const [lang, setLang] = useState(localStorage.getItem("km-language") || "zh"),
    [route, setRoute] = useState(location.pathname),
    [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [sessionError, setSessionError] = useState(""),
    [revision, setRevision] = useState(0),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState(false),
    [notifications, setNotifications] = useState([]);
  const [search, setSearch] = useState(() => {
    const p = new URLSearchParams(location.search);
    return {
      city: p.get("city") || "seoul",
      date: p.get("date") || day(),
      time: p.get("time") || "10:00",
      hours: Number(p.get("hours") || 3),
      adults: Number(p.get("adults") || 1),
      children: Number(p.get("children") || 0),
      purposes: (p.get("purposes") || "tourism")
        .split(",")
        .filter((v) => v in purposes),
      budget: p.get("budget") || "",
      chinese: p.get("chinese") || "",
      style: p.get("style") || "",
      sort: "recommended",
    };
  });
  const t = (zh, ko) => (lang === "ko" ? ko || zh : zh),
    labels = (obj) =>
      Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, t(...v)]));
  const navigate = (path) => {
    history.pushState({}, "", path);
    setRoute(new URL(path, location.origin).pathname);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const refresh = () => setRevision((v) => v + 1);
  const message = (s) => {
    setToast(s);
    setTimeout(() => setToast(""), 5000);
  };
  async function reloadSession() {
    try {
      const s = await api("/session");
      csrf = s.csrf || "";
      setSession(s);
      setSessionError("");
    } catch (e) {
      setSessionError(e.message);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    const f = () => setRoute(location.pathname);
    window.addEventListener("popstate", f);
    reloadSession();
    return () => window.removeEventListener("popstate", f);
  }, []);
  useEffect(() => {
    localStorage.setItem("km-language", lang);
    document.documentElement.lang = lang === "ko" ? "ko" : "zh-CN";
  }, [lang]);
  useEffect(() => {
    if (!session?.user) {
      setNotifications([]);
      return;
    }
    let stopped = false;
    const load = () =>
      api("/notifications")
        .then((v) => !stopped && setNotifications(v))
        .catch(() => {});
    load();
    const timer = setInterval(load, 20000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [session?.user?.id, revision]);
  const user = session?.user,
    staff =
      user && ["admin", "support", "finance", "reviewer"].includes(user.role);
  const ctx = {
    t,
    labels,
    navigate,
    user,
    session,
    search,
    setSearch,
    revision,
    refresh,
    message,
    reloadSession,
  };
  async function logout() {
    try {
      await api("/logout", "POST", {});
      csrf = "";
      await reloadSession();
      navigate("/");
    } catch (e) {
      message(e.message);
    }
  }
  return (
    <>
      {import.meta.env.MODE === "showcase" && <div className="showcase-bar"><strong>界面预览 · 示例资料，不接受真实预约或付款</strong><div>{[["guest","游客端","/"],["guide","地陪端","/guide"],["admin","管理后台","/admin"]].map(([role,label,path]) => <button key={role} onClick={async()=>{await api("/showcase/role","POST",{role});await reloadSession();navigate(path);refresh();}}>{label}</button>)}</div></div>}
      <header className="header">
        <div className="nav-wrap">
          <button className="brand" onClick={() => navigate("/")}>
            Korea<span>Mate</span>
            <span className="brand-dot">✦</span>
          </button>
          <nav className={mobile ? "nav open" : "nav"}>
            <button
              className={route === "/" ? "active" : ""}
              onClick={() => navigate("/")}
            >
              {t("寻找地陪", "메이트 찾기")}
            </button>
            {user && (
              <button onClick={() => navigate("/orders")}>
                {t("我的订单", "내 예약")}
              </button>
            )}
            {user?.role === "guide" && (
              <button onClick={() => navigate("/guide")}>
                {t("地陪工作台", "메이트 관리")}
              </button>
            )}
            {staff && (
              <button onClick={() => navigate("/admin")}>
                {t("管理后台", "관리자")}
              </button>
            )}
            {!user && (
              <button onClick={() => navigate("/join")}>
                {t("成为地陪", "메이트 지원")}
              </button>
            )}
          </nav>
          <div className="nav-right">
            <button
              className="language"
              onClick={() => setLang(lang === "zh" ? "ko" : "zh")}
            >
              <Globe2 size={16} />
              {lang === "zh" ? "한국어" : "中文"}
            </button>
            {user ? (
              <>
                <button
                  className="icon-btn"
                  aria-label="通知"
                  onClick={() => {
                    setNotice(!notice);
                    api("/notifications", "POST", {})
                      .then(refresh)
                      .catch(() => {});
                  }}
                >
                  <Bell size={19} />
                  {notifications.some((n) => !n.is_read) && <i />}
                </button>
                <button
                  className="user-name"
                  onClick={() => navigate("/orders")}
                >
                  {user.name}
                </button>
                <button className="icon-btn" aria-label="退出" onClick={logout}>
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <Button onClick={() => navigate("/login")}>
                {t("登录 / 注册", "로그인 / 가입")}
              </Button>
            )}
            <button
              className="hamburger icon-btn"
              aria-label="菜单"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {notice && (
        <aside className="notifications">
          <div className="row">
            <h3>{t("通知", "알림")}</h3>
            <button
              className="icon-btn"
              aria-label="关闭通知"
              onClick={() => setNotice(false)}
            >
              <X size={18} />
            </button>
          </div>
          {!notifications.length ? (
            <p>暂无通知</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setNotice(false);
                  if (n.booking_id) navigate("/orders/" + n.booking_id);
                }}
              >
                <span>{n.body}</span>
                <small>{kst(n.created)}</small>
              </button>
            ))
          )}
        </aside>
      )}
      {!ready ? (
        <div className="empty">正在连接平台…</div>
      ) : sessionError ? (
        <div className="page">
          <div className="notice error">
            {sessionError} <button onClick={reloadSession}>重试</button>
          </div>
        </div>
      ) : (
        <main>
          {route === "/" ? (
            <Home {...ctx} />
          ) : route === "/login" || route === "/join" ? (
            <Auth {...ctx} joining={route === "/join"} />
          ) : route.startsWith("/guides/") ? (
            <GuideDetail {...ctx} id={route.split("/")[2]} />
          ) : !user ? (
            <Auth {...ctx} />
          ) : route === "/orders" ? (
            <Orders {...ctx} />
          ) : route.startsWith("/orders/") ? (
            <OrderDetail {...ctx} id={route.split("/")[2]} />
          ) : route === "/guide" && user.role === "guide" ? (
            <GuideWorkspace {...ctx} />
          ) : route === "/admin" && staff ? (
            <Admin {...ctx} />
          ) : (
            <div className="empty">
              页面不存在或没有访问权限
              <Button onClick={() => navigate("/")}>返回首页</Button>
            </div>
          )}
        </main>
      )}
      <footer>
        <div>
          <b className="brand">
            Korea<span>Mate</span>
          </b>
          <p>
            {t("让每一次同行，都有明确的约定。", "함께하는 시간, 분명한 약속.")}
          </p>
        </div>
        <div>
          <span>Seoul · Busan · Incheon · Jeju</span>
          <small>
            © {new Date().getFullYear()} KoreaMate ·{" "}
            {t("所有服务时间均为韩国时间", "모든 시간은 한국 시간 기준")}
          </small>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
function PurposePicker({ value, onChange, t }) {
  const icons = {
    tourism: HeartHandshake,
    business: BriefcaseBusiness,
    medical: Stethoscope,
    concert: Music2,
  };
  return (
    <div className="purpose-picker">
      {Object.entries(purposes).map(([k, v]) => {
        const I = icons[k];
        return (
          <label key={k} className={value.includes(k) ? "chosen" : ""}>
            <input
              type="checkbox"
              checked={value.includes(k)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, k]
                    : value.filter((x) => x !== k),
                )
              }
            />
            <I size={18} />
            {t(...v)}
            {value.includes(k) && <Check size={14} />}
          </label>
        );
      })}
    </div>
  );
}
function SearchFields({ search, setSearch, t, labels }) {
  const change = (k, v) => setSearch((s) => ({ ...s, [k]: v }));
  return (
    <>
      <div className="search-grid">
        <Field label={t("服务城市", "도시")}>
          <Select
            options={labels(cities)}
            value={search.city}
            onChange={(v) => change("city", v)}
          />
        </Field>
        <Field label={t("服务日期", "날짜")}>
          <input
            type="date"
            min={day(0)}
            required
            value={search.date}
            onChange={(e) => change("date", e.target.value)}
          />
        </Field>
        <Field label={t("开始时间 · 韩国时间", "시작 시간 · 한국 시간")}>
          <input
            type="time"
            required
            value={search.time}
            onChange={(e) => change("time", e.target.value)}
          />
        </Field>
        <Field label={t("服务时长", "이용 시간")}>
          <Select
            value={search.hours}
            onChange={(v) => change("hours", Number(v))}
            options={Object.fromEntries(
              Array.from({ length: 12 }, (_, i) => [
                i + 1,
                `${i + 1} ${t("小时", "시간")}`,
              ]),
            )}
          />
        </Field>
        <Field label={t("成人", "성인")}>
          <input
            type="number"
            min="1"
            max="12"
            value={search.adults}
            onChange={(e) => change("adults", Number(e.target.value))}
          />
        </Field>
        <Field label={t("儿童", "어린이")}>
          <input
            type="number"
            min="0"
            max="12"
            value={search.children}
            onChange={(e) => change("children", Number(e.target.value))}
          />
        </Field>
      </div>
      <p className="label">
        {t("出行目的 · 可多选，需全部满足", "목적 · 복수 선택, 모두 충족")}
      </p>
      <PurposePicker
        value={search.purposes}
        onChange={(v) => change("purposes", v)}
        t={t}
      />
      <details className="filters">
        <summary>
          {t(
            "更多偏好：预算、中文水平、服务风格",
            "추가 조건: 예산, 중국어, 스타일",
          )}
        </summary>
        <div className="form-grid three">
          <Field label={t("本次服务预算上限（韩元）", "총 예산 한도 (원)")}>
            <input
              type="number"
              min="1"
              placeholder={t("不限", "제한 없음")}
              value={search.budget}
              onChange={(e) => change("budget", e.target.value)}
            />
          </Field>
          <Field label={t("中文水平", "중국어 수준")}>
            <Select
              value={search.chinese}
              onChange={(v) => change("chinese", v)}
              options={{ "": t("不限", "전체"), ...labels(levels) }}
            />
          </Field>
          <Field label={t("服务风格", "서비스 스타일")}>
            <Select
              value={search.style}
              onChange={(v) => change("style", v)}
              options={{ "": t("不限", "전체"), ...labels(styles) }}
            />
          </Field>
        </div>
      </details>
    </>
  );
}
function Home(ctx) {
  const { t, labels, search, setSearch, navigate, session } = ctx;
  const [results, setResults] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function find(e) {
    e.preventDefault();
    if (!search.purposes.length) {
      setError("请选择至少一种出行目的");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let qs = new URLSearchParams({
        ...search,
        purposes: search.purposes.join(","),
      });
      setResults(await api("/guides?" + qs));
      setTimeout(
        () =>
          document
            .getElementById("results")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <section className="hero">
        <div className="hero-image" />
        <div className="hero-shade" />
        <div className="hero-inner">
          <span className="eyebrow light">YOUR KOREA, YOUR PACE</span>
          <h1>
            {t(
              session.settings.heroTitle,
              "현지 메이트와 함께\n나만의 한국을 만나세요",
            )}
          </h1>
          <p>
            {t(
              session.settings.heroSubtitle,
              "시간과 목적에 맞는 현지 메이트를 찾아보세요.",
            )}
          </p>
          <span className="hero-location">
            <MapPin size={15} /> SEOUL, SOUTH KOREA
          </span>
        </div>
      </section>
      <section className="search-shell">
        <form className="search-card" onSubmit={find}>
          <div className="row">
            <div>
              <span className="eyebrow">FIND YOUR MATE</span>
              <h2>
                {t(
                  "这次来韩国，想做什么？",
                  "이번 한국 방문, 무엇을 함께할까요?",
                )}
              </h2>
            </div>
            <span className="verified">
              <ShieldCheck size={18} />
              {t("审核通过后上架", "심사 후 등록")}
            </span>
          </div>
          <SearchFields {...ctx} />
          <div className="search-bottom">
            <span>
              {t(
                "先选择地陪，确认接单后再付款。",
                "메이트 수락 후 결제합니다.",
              )}
            </span>
            <Button disabled={loading} type="submit">
              <Search size={18} />
              {loading
                ? t("正在匹配…", "검색 중…")
                : t("寻找合适的地陪", "메이트 찾기")}
            </Button>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
        </form>
      </section>
      {results !== null && (
        <section className="page results" id="results">
          <div className="section-top">
            <div>
              <span className="eyebrow">YOUR MATCHES</span>
              <h2>
                {t("符合你行程的地陪", "일정에 맞는 메이트")}{" "}
                <span className="count">{results.length}</span>
              </h2>
              <p>
                {t(
                  import.meta.env.MODE === "showcase" ? "以下为筛选效果演示；日期和时段不代表真实可预约档期。" : "已核对完整时段、接待人数和所选出行目的。",
                  "시간, 인원, 선택 목적을 모두 확인했습니다.",
                )}
              </p>
            </div>
            <Select
              value={search.sort}
              onChange={(v) => {
                setSearch((s) => ({ ...s, sort: v }));
                setResults((r) =>
                  [...r].sort((a, b) =>
                    v === "price"
                      ? a.total - b.total
                      : (b.rating || 0) - (a.rating || 0),
                  ),
                );
              }}
              options={{
                recommended: t("评价优先", "평점순"),
                price: t("价格从低到高", "가격 낮은순"),
              }}
            />
          </div>
          {results.length ? (
            <div className="guide-grid">
              {results.map((g) => (
                <article className="guide-card" key={g.id}>
                  <div className="portrait">
                    {g.image ? (
                      <img
                        src={g.image}
                        alt={g.name}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="portrait-initial">
                        {g.name.slice(0, 1)}
                      </div>
                    )}
                    <span className="portrait-tag">
                      <ShieldCheck size={14} />
                      {g.isDemo ? "演示资料" : t("平台已审核", "심사 완료")}
                    </span>
                  </div>
                  <div className="guide-body">
                    <div className="row">
                      <h3>{g.name}</h3>
                      <span className="rating">
                        <Star size={14} />
                        {g.rating ? g.rating.toFixed(1) : t("新入驻", "신규")}
                        {!!g.reviewCount && <small>({g.reviewCount})</small>}
                      </span>
                    </div>
                    <p>
                      <MapPin size={14} />
                      {labels(cities)[g.city]} · {g.languages}
                    </p>
                    <div className="tags">
                      {g.purposes.map((p) => (
                        <span key={p}>{labels(purposes)[p]}</span>
                      ))}
                    </div>
                    <p className="bio-short">{g.bio}</p>
                    <div className="guide-price">
                      <div>
                        <small>{t("本次服务总价", "선택 일정 총액")}</small>
                        <strong>{money(g.total)}</strong>
                        <small>
                          {search.hours}
                          {t("小时", "시간")} ·{" "}
                          {Number(search.adults) + Number(search.children)}
                          {t("人", "명")}
                        </small>
                      </div>
                      <button
                        className="circle-button"
                        aria-label={`${t("查看", "보기")} ${g.name}`}
                        onClick={() =>
                          navigate(
                            "/guides/" +
                              g.id +
                              "?" +
                              new URLSearchParams({
                                ...search,
                                purposes: search.purposes.join(","),
                              }),
                          )
                        }
                      >
                        <ArrowUpRight size={22} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <CalendarDays size={32} />
              <h3>
                {t(
                  "这个时段暂时没有合适的地陪",
                  "조건에 맞는 메이트가 없습니다",
                )}
              </h3>
              <p>
                {t(
                  "请调整日期或偏好。你也可以联系平台寻求帮助。",
                  "날짜나 조건을 변경하거나 플랫폼에 문의하세요.",
                )}
              </p>
              <span>{session.settings.support}</span>
            </div>
          )}
        </section>
      )}
      <section className="page how">
        <div>
          <span className="eyebrow">A LITTLE MORE LOCAL</span>
          <h2>
            {t(
              "把陌生的城市，\n变成熟悉的一天。",
              "낯선 도시에서,\n편안한 하루를.",
            )}
          </h2>
        </div>
        <div className="how-grid">
          {[
            [
              Search,
              "01",
              t("按需求寻找", "조건 검색"),
              t(
                "选择日期、时间和目的，查看真实可用档期。",
                "날짜와 목적에 맞는 가능 시간을 확인하세요.",
              ),
            ],
            [
              HeartHandshake,
              "02",
              t("双方确认安排", "함께 일정 확정"),
              t(
                "地陪接受预约后，再确认付款与集合安排。",
                "수락 후 결제하고 만날 장소를 정하세요.",
              ),
            ],
            [
              MessageCircle,
              "03",
              t("有记录的同行", "기록이 남는 동행"),
              t(
                "行程沟通、订单进度与售后集中在同一处。",
                "메시지, 예약 상태, 문의를 한 곳에서.",
              ),
            ],
          ].map(([I, n, title, desc]) => (
            <div key={n}>
              <span className="step-no">{n}</span>
              <I size={23} />
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="page info-section">
        <details>
          <summary>{t("预约与服务规则", "예약 및 서비스 안내")}</summary>
          <p>{session.settings.rules}</p>
        </details>
        <details>
          <summary>{t("常见问题", "자주 묻는 질문")}</summary>
          <p>{session.settings.faq}</p>
        </details>
      </section>
    </>
  );
}
function Auth({ t, navigate, reloadSession, message, joining = false, user }) {
  const [register, setRegister] = useState(joining),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => setRegister(joining), [joining]);
  if (user)
    return (
      <div className="page empty">
        {t("你已经登录", "이미 로그인했습니다")}
        <Button
          onClick={() => navigate(user.role === "guide" ? "/guide" : "/orders")}
        >
          进入工作区
        </Button>
      </div>
    );
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(register ? "/register" : "/login", "POST", data);
      await reloadSession();
      message(t("欢迎来到 KoreaMate", "KoreaMate에 오신 것을 환영합니다"));
      navigate(data.role === "guide" ? "/guide" : "/orders");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-photo">
        <div>
          <span className="eyebrow light">PEOPLE MAKE THE PLACE</span>
          <h1>
            {t(
              "好旅程，\n从认识一个人开始。",
              "좋은 여행은,\n한 사람을 만나는 데서.",
            )}
          </h1>
        </div>
      </div>
      <div className="auth-panel">
        <span className="eyebrow">WELCOME TO KOREAMATE</span>
        <h2>
          {register
            ? t("创建你的账户", "계정 만들기")
            : t("很高兴再次见到你", "다시 만나 반가워요")}
        </h2>
        <p>
          {t(
            "游客、地陪和平台各自拥有独立账户。",
            "여행자와 메이트는 개별 계정으로 이용합니다.",
          )}
        </p>
        <form onSubmit={submit}>
          {register && (
            <>
              <Field label={t("姓名", "이름")}>
                <input
                  name="name"
                  required
                  maxLength="60"
                  autoComplete="name"
                />
              </Field>
              <Field label={t("账户类型", "계정 유형")}>
                <select name="role" defaultValue={joining ? "guide" : "guest"}>
                  <option value="guest">{t("游客", "여행자")}</option>
                  <option value="guide">{t("地陪", "메이트")}</option>
                </select>
              </Field>
            </>
          )}
          <Field label={t("邮箱", "이메일")}>
            <input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label={t("密码（至少10位）", "비밀번호 (10자 이상)")}>
            <input
              name="password"
              type="password"
              required
              minLength="10"
              maxLength="128"
              autoComplete={register ? "new-password" : "current-password"}
            />
          </Field>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "…" : register ? t("注册", "가입") : t("登录", "로그인")}
            <ArrowRight size={17} />
          </Button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? t("已有账户？登录", "이미 계정이 있나요? 로그인")
            : t("没有账户？注册", "계정 만들기")}
        </button>
      </div>
    </section>
  );
}
function GuideDetail(ctx) {
  const { id, t, labels, search, navigate, user, message } = ctx,
    { data: g, loading, error } = useLoad("/guides/" + id);
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function book() {
    if (!user) {
      navigate("/login");
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const b = await api("/bookings", "POST", {
        ...search,
        guideId: id,
        note,
        expectedTotal: g.rate * search.hours,
      });
      message(t("预约申请已提交，等待地陪确认", "예약 신청 완료"));
      navigate("/orders/" + b.id);
    } catch (e) {
      setFailure(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page">
      <button className="text-button" onClick={() => navigate("/")}>
        ← {t("返回搜索", "검색으로")}
      </button>
      <State loading={loading} error={error}>
        {g && (
          <div className="detail-layout">
            <div>
              <div className="profile-hero">
                <Avatar src={g.image} name={g.name} />
                <div>
                  <span className="eyebrow">YOUR LOCAL MATE</span>
                  <h1>{g.name}</h1>
                  <p>
                    <MapPin size={16} />
                    {labels(cities)[g.city]} · {g.languages}
                  </p>
                  <span className="verified">
                    <ShieldCheck size={16} />
                    {g.isDemo ? "演示资料" : t("入驻审核通过", "심사 완료")}
                  </span>
                </div>
              </div>
              <div className="section-block">
                <h3>{t("认识你的地陪", "메이트 소개")}</h3>
                <p className="prose">{g.bio}</p>
                <div className="tags">
                  {g.purposes.map((p) => (
                    <span key={p}>{labels(purposes)[p]}</span>
                  ))}
                </div>
              </div>
              <div className="facts">
                <div>
                  <small>中文水平</small>
                  <strong>{labels(levels)[g.chineseLevel]}</strong>
                </div>
                <div>
                  <small>服务风格</small>
                  <strong>{labels(styles)[g.style]}</strong>
                </div>
                <div>
                  <small>最多接待</small>
                  <strong>{g.capacity}人</strong>
                </div>
                <div>
                  <small>每小时价格</small>
                  <strong>{money(g.rate)}</strong>
                </div>
              </div>
              <div className="section-block">
                <h3>
                  {t("真实订单评价", "실제 예약 후기")}{" "}
                  <span className="count">{g.reviewCount}</span>
                </h3>
                {g.reviews.length ? (
                  g.reviews.map((r, i) => (
                    <div className="review" key={i}>
                      <b>{r.name}</b>
                      <span>{"★".repeat(r.rating)}</span>
                      <p>{r.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    {t("新入驻，暂时没有评价。", "아직 후기가 없습니다.")}
                  </p>
                )}
              </div>
            </div>
            <aside className="panel booking-summary">
              <span className="eyebrow">YOUR RESERVATION</span>
              <h2>{t("确认你的安排", "예약 내용 확인")}</h2>
              <div className="summary-row">
                <CalendarDays size={17} />
                {search.date}
              </div>
              <div className="summary-row">
                <Clock3 size={17} />
                {search.time} · {search.hours}
                {t("小时 · 韩国时间", "시간 · 한국 시간")}
              </div>
              <div className="summary-row">
                <Users size={17} />
                {search.adults}
                {t("位成人", "명 성인")} · {search.children}
                {t("位儿童", "명 어린이")}
              </div>
              <div className="tags">
                {search.purposes.map((p) => (
                  <span key={p}>{labels(purposes)[p]}</span>
                ))}
              </div>
              <Field label={t("特别要求（可选）", "요청사항 (선택)")}>
                <textarea
                  value={note}
                  maxLength="2000"
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t(
                    "集合区域、想去的地点及其他需要提前说明的事项",
                    "희망 지역, 방문 장소 등",
                  )}
                />
              </Field>
              <div className="total-row">
                <span>{t("服务总价", "총 서비스 요금")}</span>
                <strong>{money(g.rate * search.hours)}</strong>
              </div>
              <p className="muted small">
                {t(
                  "按团计费。门票、交通、餐饮等额外费用不包含在本次服务费中，需提前协商。",
                  "그룹 기준. 입장료, 교통비, 식비는 별도 협의합니다.",
                )}
              </p>
              {failure && <div className="notice error">{failure}</div>}
              <Button
                disabled={busy || g.isDemo || user?.role === "guide"}
                onClick={book}
              >
                {busy ? "…" : t("提交预约申请", "예약 신청")}
                <ArrowRight size={17} />
              </Button>
              <p className="small muted">
                {t(
                  "地陪确认后付款。提交时会再次核对档期及价格。",
                  "수락 후 결제. 신청 시 가능 시간을 다시 확인합니다.",
                )}
              </p>
            </aside>
          </div>
        )}
      </State>
    </section>
  );
}
function Orders(ctx) {
  const { t, navigate, revision, user } = ctx,
    { data, loading, error } = useLoad("/bookings", revision);
  return (
    <section className="page">
      <div className="section-top">
        <div>
          <span className="eyebrow">YOUR JOURNEY</span>
          <h1>{t("我的订单", "내 예약")}</h1>
          <p>
            {t(
              "跟进预约，沟通安排，查看服务进度。",
              "예약 진행 상황과 메시지를 확인하세요.",
            )}
          </p>
        </div>
        {user.role === "guest" && (
          <Button onClick={() => navigate("/")}>
            {t("寻找地陪", "메이트 찾기")}
            <Plus size={17} />
          </Button>
        )}
      </div>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <div className="order-list">
          {data?.map((b) => (
            <OrderCard key={b.id} b={b} {...ctx} />
          ))}
        </div>
      </State>
    </section>
  );
}
function OrderCard({ b, t, navigate }) {
  return (
    <button className="order-card" onClick={() => navigate("/orders/" + b.id)}>
      <div className="order-date">
        <CalendarDays size={22} />
        <strong>{kst(b.start).split(" ")[0]}</strong>
      </div>
      <div className="order-main">
        <div className="row">
          <h3>{b.guideName}</h3>
          <Badge status={b.status} t={t} />
        </div>
        <p>
          {cities[b.city]?.[0]} · {kst(b.start)} — {kst(b.end).split(" ")[1]} ·{" "}
          {b.adults + b.children}人
        </p>
        <span className="small muted">
          {b.purposes.map((p) => purposes[p][0]).join(" / ")} ·{" "}
          {b.id.slice(0, 8)}
        </span>
      </div>
      <div className="order-right">
        <strong>{money(b.total)}</strong>
        <ChevronRight size={20} />
      </div>
    </button>
  );
}
function OrderDetail(ctx) {
  const { id, t, user, revision, refresh, message, session, navigate } = ctx,
    { data: b, loading, error } = useLoad("/bookings/" + id, revision);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [text, setText] = useState(""),
    [caseOpen, setCaseOpen] = useState(false);
  async function act(action, data = {}) {
    setBusy(true);
    setFailure("");
    try {
      await api(`/bookings/${id}/${action}`, "POST", data);
      refresh();
      message(t("操作已保存", "저장했습니다"));
      return true;
    } catch (e) {
      setFailure(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const formData = (e) => Object.fromEntries(new FormData(e.currentTarget));
  if (loading && !b)
    return (
      <div className="page">
        <State loading />
      </div>
    );
  if (error) return <div className="page notice error">{error}</div>;
  if (!b) return null;
  const isGuest = b.guest_id === user.id,
    isGuide = b.guide_user === user.id,
    finance = ["admin", "finance"].includes(user.role),
    operator = ["admin", "support"].includes(user.role),
    net = Math.max(
      0,
      b.total -
        b.refund -
        Math.round((b.commission * (b.total - b.refund)) / b.total),
    );
  return (
    <section className="page">
      <button className="text-button" onClick={() => navigate("/orders")}>
        ← {t("订单列表", "예약 목록")}
      </button>
      <div className="section-top">
        <div>
          <span className="eyebrow">
            BOOKING {b.id.slice(0, 8).toUpperCase()}
          </span>
          <h1>
            {b.guideName} · {cities[b.city][0]}
          </h1>
          <p>
            {kst(b.start)} — {kst(b.end)}（韩国时间）
          </p>
        </div>
        <Badge status={b.status} t={t} />
      </div>
      {failure && (
        <div className="notice error" role="alert">
          {failure}
        </div>
      )}
      <div className="detail-layout">
        <div>
          <div className="panel">
            <div className="facts">
              <div>
                <small>游客</small>
                <strong>{b.guestName}</strong>
              </div>
              <div>
                <small>人数</small>
                <strong>
                  {b.adults}成人 / {b.children}儿童
                </strong>
              </div>
              <div>
                <small>目的</small>
                <strong>
                  {b.purposes.map((p) => purposes[p][0]).join(" / ")}
                </strong>
              </div>
              <div>
                <small>集合地点</small>
                <strong>{b.meeting || "请在订单消息中确认"}</strong>
              </div>
            </div>
            <h3>特别要求</h3>
            <p className="prose">{b.note || "无特别要求"}</p>
            {b.expires &&
              ["requested", "awaiting_payment"].includes(b.status) && (
                <div className="notice">
                  {b.status === "requested" ? "地陪响应" : "付款"}截止时间：
                  {kst(b.expires)}。超时后自动关闭。
                </div>
              )}
            <div className="actions">
              {isGuide && b.status === "requested" && (
                <>
                  <Button disabled={busy} onClick={() => act("accept")}>
                    {t("接受预约", "수락")}
                  </Button>
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() => act("reject", { reason: "地陪无法承接" })}
                  >
                    {t("拒绝", "거절")}
                  </Button>
                </>
              )}
              {isGuide && b.status === "confirmed" && (
                <Button disabled={busy} onClick={() => act("start")}>
                  确认服务开始
                </Button>
              )}
              {isGuide && b.status === "in_service" && (
                <Button disabled={busy} onClick={() => act("finish")}>
                  申请结束服务
                </Button>
              )}
              {isGuest && b.status === "completion_pending" && (
                <Button disabled={busy} onClick={() => act("complete")}>
                  确认服务完成
                </Button>
              )}
              <Button secondary onClick={() => setCaseOpen(!caseOpen)}>
                售后 / 问题反馈
              </Button>
            </div>
            {["requested", "awaiting_payment", "confirmed"].includes(
              b.status,
            ) && (
              <details className="action-detail">
                <summary>取消预约</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act("cancel", formData(e));
                  }}
                >
                  <Field label="取消原因">
                    <input name="reason" required />
                  </Field>
                  <p className="small muted">
                    未付款可直接取消；已付款将提交取消申请，退款需平台处理。
                  </p>
                  <Button danger disabled={busy}>
                    提交取消
                  </Button>
                </form>
              </details>
            )}
            {isGuest && b.status === "awaiting_payment" && (
              <div className="section-block">
                <h3>付款安排</h3>
                {!session.manualPayments ||
                !session.settings.paymentInstructions ? (
                  <div className="notice">
                    在线支付尚未接入，人工收款尚未开放。请联系平台确认后续安排，请勿自行转账。预约到期会释放档期。
                  </div>
                ) : (
                  <>
                    <p className="prose">
                      {session.settings.paymentInstructions}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act("payment-report", formData(e));
                      }}
                    >
                      <Field label="实际转账参考号">
                        <input name="reference" required />
                      </Field>
                      <Field label="补充凭证说明">
                        <textarea name="evidence" />
                      </Field>
                      <p className="small muted">
                        提交凭证不会自动确认付款，请及时联系平台在截止时间前核对。
                      </p>
                      <Button disabled={busy}>提交到账核对</Button>
                    </form>
                  </>
                )}
              </div>
            )}
            {b.changes
              .filter((c) => c.status === "pending")
              .map((c) => (
                <div className="notice" key={c.id}>
                  <b>改期方案</b>
                  <p>
                    {kst(c.start)} — {kst(c.end)} ·{" "}
                    {c.meeting || "集合地点另议"}
                  </p>
                  <p>{c.reason}</p>
                  <p>
                    游客：{c.guest_ok ? "已同意" : "待确认"} / 地陪：
                    {c.guide_ok ? "已同意" : "待确认"}
                  </p>
                  {(isGuest || isGuide) && (
                    <div className="actions">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act("respond-change", {
                            changeId: c.id,
                            accept: true,
                          })
                        }
                      >
                        同意改期
                      </Button>
                      <Button
                        secondary
                        disabled={busy}
                        onClick={() =>
                          act("respond-change", {
                            changeId: c.id,
                            accept: false,
                          })
                        }
                      >
                        保留原安排
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            {caseOpen && (
              <form
                className="section-block"
                onSubmit={(e) => {
                  e.preventDefault();
                  act("case", formData(e)).then(
                    (ok) => ok && setCaseOpen(false),
                  );
                }}
              >
                <h3>提交售后申请</h3>
                <Field label="类型">
                  <select name="kind">
                    <option value="complaint">投诉或服务问题</option>
                    <option value="refund">退款申请</option>
                    <option value="review_appeal">评价申诉</option>
                  </select>
                </Field>
                <Field label="问题说明">
                  <textarea name="body" required />
                </Field>
                <Field label="证据说明或链接">
                  <textarea name="evidence" />
                </Field>
                <Button disabled={busy}>提交平台处理</Button>
              </form>
            )}
            {isGuest && b.status === "completed" && !b.review && (
              <form
                className="section-block"
                onSubmit={(e) => {
                  e.preventDefault();
                  act("review", formData(e));
                }}
              >
                <h3>评价这次同行</h3>
                <Field label="评分">
                  <select name="rating">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {"★".repeat(n)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="体验评价">
                  <textarea name="body" required />
                </Field>
                <Button disabled={busy}>发布评价</Button>
              </form>
            )}
            {b.review && (
              <div className="section-block">
                <h3>订单评价</h3>
                <p>
                  {"★".repeat(b.review.rating)} · {b.review.body}
                </p>
                {!b.review.visible && (
                  <p className="notice">
                    该评价已隐藏：{b.review.moderation_note}
                    。可通过售后入口申诉。
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="panel messages">
            <h3>
              <MessageCircle size={19} /> 订单沟通
            </h3>
            <div className="message-list">
              {b.messages.length ? (
                b.messages.map((m) => (
                  <div
                    className={
                      "message " + (m.user_id === user.id ? "mine" : "")
                    }
                    key={m.id}
                  >
                    <small>
                      {m.name} · {kst(m.created)}
                    </small>
                    <p>{m.body}</p>
                  </div>
                ))
              ) : (
                <p className="muted">
                  在这里确认路线、集合地点和服务范围，双方都能查看记录。
                </p>
              )}
            </div>
            {user.role !== "finance" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act("messages", { body: text })) setText("");
                }}
              >
                <textarea
                  aria-label="消息内容"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                  maxLength="2000"
                  placeholder="输入消息…"
                />
                <Button disabled={busy}>发送</Button>
              </form>
            )}
          </div>
          {!!b.cases.length && (
            <div className="panel">
              <h3>售后记录</h3>
              {b.cases.map((c) => (
                <div className="section-block" key={c.id}>
                  <Badge status={c.status} t={t} />
                  <p>{c.body}</p>
                  <small>{c.evidence}</small>
                  {c.resolution && <p>处理结果：{c.resolution}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <aside>
          <div className="panel financial">
            <span className="eyebrow">ORDER SUMMARY</span>
            <h3>费用与进度</h3>
            <div className="total-row">
              <span>订单服务费</span>
              <strong>{money(b.total)}</strong>
            </div>
            <div className="summary-line">
              <span>付款状态</span>
              <b>{payLabels[b.payment_status]}</b>
            </div>
            <div className="summary-line">
              <span>已登记退款</span>
              <b>{money(b.refund)}</b>
            </div>
            {(isGuide || finance) && (
              <>
                <div className="summary-line">
                  <span>原订单平台佣金</span>
                  <b>{money(b.commission)}</b>
                </div>
                <div className="summary-line">
                  <span>退款调整后地陪应收</span>
                  <b>{money(net)}</b>
                </div>
                <div className="summary-line">
                  <span>结算状态</span>
                  <b>{settleLabels[b.settlement_status]}</b>
                </div>
              </>
            )}
            <p className="small muted">
              成交价格已随订单保存。后续资料改价不会改变本单费用。
            </p>
          </div>
          {finance && (
            <div className="panel">
              <h3>财务操作</h3>
              <p className="small muted">
                以下操作仅登记已实际完成的收付款，不会自动扣款、退款或向地陪打款。
              </p>
              {b.status === "awaiting_payment" && session.manualPayments && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act("confirm-payment", formData(e));
                  }}
                >
                  <Field label="实际收款参考号">
                    <input name="reference" required />
                  </Field>
                  <Button disabled={busy}>核实到账并确认预约</Button>
                </form>
              )}
              {["paid", "partially_refunded"].includes(b.payment_status) &&
                b.settlement_status !== "paid" && (
                  <details className="action-detail">
                    <summary>登记实际退款</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = formData(e);
                        d.cancel = d.cancel === "on";
                        act("refund", d);
                      }}
                    >
                      <Field label="退款金额（韩元）">
                        <input
                          name="amount"
                          type="number"
                          min="1"
                          max={b.total - b.refund}
                          required
                        />
                      </Field>
                      <Field label="实际退款参考号">
                        <input name="reference" required />
                      </Field>
                      <Field label="原因">
                        <textarea name="reason" required />
                      </Field>
                      <label className="check-line">
                        <input type="checkbox" name="cancel" />{" "}
                        同时关闭订单并释放档期
                      </label>
                      <Button disabled={busy}>登记退款</Button>
                    </form>
                  </details>
                )}
              {["completed", "cancelled"].includes(b.status) &&
                b.payment_status !== "unpaid" &&
                b.settlement_status !== "paid" && (
                  <details className="action-detail">
                    <summary>登记地陪结算</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act("settle", formData(e));
                      }}
                    >
                      <p>
                        应结算 {money(net)}。售后未解决或未过等待期时无法结算。
                      </p>
                      <Field label="实际打款参考号">
                        <input name="reference" required />
                      </Field>
                      <Button disabled={busy}>登记已结算</Button>
                    </form>
                  </details>
                )}
            </div>
          )}
          {operator && ["requested", "confirmed"].includes(b.status) && (
            <div className="panel">
              <h3>提出改期方案</h3>
              <p className="small muted">
                时长及价格保持不变。双方同意后重新检查档期并生效。
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act("propose-change", formData(e));
                }}
              >
                <Field label="新日期">
                  <input type="date" name="date" min={day(0)} required />
                </Field>
                <Field label="开始时间">
                  <input type="time" name="time" required />
                </Field>
                <Field label="集合地点">
                  <input name="meeting" />
                </Field>
                <Field label="改期原因">
                  <textarea name="reason" required />
                </Field>
                <Button disabled={busy}>发送给双方确认</Button>
              </form>
            </div>
          )}
          {!!b.ledger.length && (
            <div className="panel">
              <h3>收付款记录</h3>
              {b.ledger.map((l, i) => (
                <div className="section-block" key={i}>
                  <b>
                    {
                      { payment: "收款", refund: "退款", settlement: "结算" }[
                        l.kind
                      ]
                    }{" "}
                    · {money(l.amount)}
                  </b>
                  <p className="small break">{l.reference}</p>
                  <small className="muted">{kst(l.created)}</small>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
function GuideWorkspace(ctx) {
  const { t, labels, revision, refresh, message } = ctx,
    [tab, setTab] = useState("profile"),
    { data: profile, loading, error } = useLoad("/guide/profile", revision);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function save(path, data, method = "POST") {
    setBusy(true);
    setFailure("");
    try {
      await api(path, method, data);
      refresh();
      message(t("已保存", "저장했습니다"));
      return true;
    } catch (e) {
      setFailure(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page">
      <div className="section-top">
        <div>
          <span className="eyebrow">MATE WORKSPACE</span>
          <h1>{t("你的地陪工作台", "메이트 관리")}</h1>
          <p>
            {t(
              "管理资料、开放档期，并安排每一次同行。",
              "프로필, 가능 시간, 예약을 관리하세요.",
            )}
          </p>
        </div>
        {profile && (
          <div className="actions">
            <Badge status={profile.status} t={t} />
            <Button
              secondary
              disabled={busy}
              onClick={() => save("/guide/pause", { paused: !profile.paused })}
            >
              {profile.paused
                ? t("恢复接单", "예약 재개")
                : t("暂停接单", "예약 일시 중지")}
            </Button>
          </div>
        )}
      </div>
      <div className="tabs">
        {[
          ["profile", "个人资料", "프로필"],
          ["availability", "档期管理", "가능 시간"],
          ["orders", "预约处理", "예약"],
          ["income", "收入明细", "수입"],
        ].map(([k, z, h]) => (
          <button
            className={tab === k ? "active" : ""}
            key={k}
            onClick={() => setTab(k)}
          >
            {t(z, h)}
          </button>
        ))}
      </div>
      {failure && <div className="notice error">{failure}</div>}
      <State loading={loading && !profile} error={error}>
        {tab === "profile" ? (
          <>
            <div className="notice">
              {profile?.reviewNote ||
                t(
                  "资料提交后由平台审核。修改公开资料需重新审核；已有订单仍可处理。",
                  "제출 후 심사합니다. 프로필 수정 시 재심사하며 기존 예약은 유지됩니다.",
                )}
            </div>
            <ProfileForm
              key={profile?.id + ":" + revision}
              profile={profile}
              {...ctx}
              onSubmit={(d) => save("/guide/profile", d)}
              busy={busy}
            />
          </>
        ) : tab === "availability" ? (
          profile ? (
            <Availability {...ctx} save={save} busy={busy} />
          ) : (
            <div className="empty">请先提交个人资料。</div>
          )
        ) : tab === "orders" ? (
          <Orders {...ctx} />
        ) : (
          <Income {...ctx} />
        )}
      </State>
    </section>
  );
}
function ProfileForm({ profile: p, t, labels, onSubmit, busy }) {
  const [ps, setPs] = useState(p?.purposes || ["tourism"]);
  return (
    <form
      className="panel form-wide"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...Object.fromEntries(new FormData(e.currentTarget)),
          purposes: ps,
        });
      }}
    >
      <div className="form-grid">
        <Field label={t("服务城市", "서비스 도시")}>
          <select name="city" defaultValue={p?.city || "seoul"}>
            {Object.entries(labels(cities)).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("可用语言", "사용 언어")}>
          <input
            name="languages"
            defaultValue={p?.languages || "한국어, 中文"}
            required
            maxLength="100"
          />
        </Field>
        <Field label={t("中文水平", "중국어 수준")}>
          <select
            name="chineseLevel"
            defaultValue={p?.chineseLevel || "fluent"}
          >
            {Object.entries(labels(levels)).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("服务风格", "서비스 스타일")}>
          <select name="style" defaultValue={p?.style || "friendly"}>
            {Object.entries(labels(styles)).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t("每小时价格（韩元，按团）", "시간당 가격 (그룹 기준, 원)")}
        >
          <input
            name="rate"
            type="number"
            min="10000"
            max="1000000"
            defaultValue={p?.rate || 35000}
            required
          />
        </Field>
        <Field label={t("最多接待人数（含儿童）", "최대 인원 (어린이 포함)")}>
          <input
            name="capacity"
            type="number"
            min="1"
            max="12"
            defaultValue={p?.capacity || 4}
            required
          />
        </Field>
      </div>
      <p className="label">{t("可承接的出行目的", "가능 서비스 목적")}</p>
      <PurposePicker value={ps} onChange={setPs} t={t} />
      <Field label={t("自我介绍及具体服务范围", "소개 및 구체적 서비스 범위")}>
        <textarea
          name="bio"
          defaultValue={p?.bio || ""}
          required
          maxLength="2000"
        />
      </Field>
      <Field
        label={t(
          "头像图片网址（HTTPS，可选）",
          "프로필 이미지 URL (HTTPS, 선택)",
        )}
      >
        <input
          name="image"
          type="url"
          defaultValue={p?.image || ""}
          placeholder="https://…"
        />
      </Field>
      <p className="small muted">
        {t(
          "平台通过线下面试核验身份及服务能力，请勿在公开介绍中填写身份证号或银行信息。",
          "신원과 서비스 능력은 면접으로 확인합니다. 공개 소개에 신분증·계좌 정보를 입력하지 마세요.",
        )}
      </p>
      <Button type="submit" disabled={busy || !ps.length}>
        {t("提交资料审核", "심사 신청")}
      </Button>
    </form>
  );
}
function Availability({ t, revision, save, busy }) {
  const { data, loading, error } = useLoad("/guide/availability", revision),
    [mode, setMode] = useState("weekly");
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return (
    <div className="detail-layout">
      <div className="panel">
        <h3>{t("我的开放与关闭时段", "가능 시간 및 휴무")}</h3>
        <p className="muted">
          {t(
            "单日开放时段会替代当天的每周规则；关闭时段优先。已有订单不会被日历修改取消。",
            "특정일 설정은 주간 규칙을 대체하며 차단 시간이 우선합니다. 기존 예약은 유지됩니다.",
          )}
        </p>
        <State loading={loading} error={error} empty={data?.length === 0}>
          {data?.map((r) => (
            <div className="slot-row" key={r.id}>
              <div>
                <b>{r.date || weekdays[r.weekday]}</b>
                <span>
                  {hm(r.start)} — {hm(r.end)}
                </span>
              </div>
              <span className={r.blocked ? "muted" : "available"}>
                {r.blocked ? "关闭" : "开放"}
              </span>
              <button
                className="icon-btn"
                aria-label="删除时段"
                disabled={busy}
                onClick={() =>
                  save("/guide/availability/" + r.id, {}, "DELETE")
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </State>
      </div>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget));
          save("/guide/availability", {
            ...d,
            date: mode === "weekly" ? null : d.date,
            blocked: mode === "blocked",
            start: mins(d.start),
            end: mins(d.end),
          });
        }}
      >
        <h3>{t("添加时段", "시간 추가")}</h3>
        <Field label={t("规则类型", "설정 유형")}>
          <Select
            value={mode}
            onChange={setMode}
            options={{
              weekly: t("每周固定时间", "매주 반복"),
              date: t("指定日期开放", "특정 날짜 가능"),
              blocked: t("指定日期关闭", "특정 날짜 차단"),
            }}
          />
        </Field>
        {mode === "weekly" ? (
          <Field label={t("星期", "요일")}>
            <select name="weekday">
              {weekdays.map((d, i) => (
                <option value={i} key={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={t("日期", "날짜")}>
            <input name="date" type="date" min={day(0)} required />
          </Field>
        )}
        <div className="form-grid">
          <Field label={t("开始", "시작")}>
            <input name="start" type="time" defaultValue="09:00" required />
          </Field>
          <Field label={t("结束", "종료")}>
            <input name="end" type="time" defaultValue="18:00" required />
          </Field>
        </div>
        <Button disabled={busy}>
          保存时段 <Plus size={17} />
        </Button>
      </form>
    </div>
  );
}
function Income(ctx) {
  const { revision } = ctx,
    { data, loading, error } = useLoad("/bookings", revision);
  const paid = data?.filter((b) => b.payment_status !== "unpaid") || [],
    amount = (b) =>
      Math.max(
        0,
        b.total -
          b.refund -
          Math.round((b.commission * (b.total - b.refund)) / b.total),
      );
  return (
    <State loading={loading} error={error}>
      <div className="metrics">
        <Metric
          label="已登记结算"
          value={money(
            paid
              .filter((b) => b.settlement_status === "paid")
              .reduce((a, b) => a + amount(b), 0),
          )}
        />
        <Metric
          label="待结算"
          value={money(
            paid
              .filter((b) => b.settlement_status === "pending")
              .reduce((a, b) => a + amount(b), 0),
          )}
        />
        <Metric label="已付款订单" value={paid.length} />
      </div>
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr>
              <th>订单</th>
              <th>服务费</th>
              <th>原佣金</th>
              <th>退款</th>
              <th>调整后应收</th>
              <th>结算状态</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.id}>
                <td>
                  <button
                    className="text-button"
                    onClick={() => ctx.navigate("/orders/" + b.id)}
                  >
                    {b.id.slice(0, 8)}
                  </button>
                </td>
                <td>{money(b.total)}</td>
                <td>{money(b.commission)}</td>
                <td>{money(b.refund)}</td>
                <td>{money(amount(b))}</td>
                <td>{settleLabels[b.settlement_status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </State>
  );
}
function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Admin(ctx) {
  const { user, revision, refresh, message, t } = ctx;
  const allowed =
    {
      admin: [
        "stats",
        "guides",
        "orders",
        "cases",
        "reviews",
        "settings",
        "users",
        "audit",
      ],
      support: ["stats", "guides", "orders", "cases", "reviews"],
      finance: ["stats", "orders", "cases"],
      reviewer: ["guides"],
    }[user.role] || [];
  const [tab, setTab] = useState(allowed[0]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const names = {
    stats: "运营概览",
    guides: "地陪与档期",
    orders: "订单与财务",
    cases: "售后处理",
    reviews: "评价审核",
    settings: "内容与规则",
    users: "人员权限",
    audit: "操作记录",
  };
  async function save(path, data) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/" + path, "POST", data);
      refresh();
      if (path === "settings") await ctx.reloadSession();
      message("已保存");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-layout">
      <aside className="sidebar">
        <span className="eyebrow">KOREAMATE OPERATIONS</span>
        <h2>运营工作台</h2>
        <span className="role-label">
          {roles[user.role]} · {user.name}
        </span>
        <nav>
          {allowed.map((k) => (
            <button
              key={k}
              className={tab === k ? "active" : ""}
              onClick={() => setTab(k)}
            >
              {names[k]}
              <ChevronRight size={16} />
            </button>
          ))}
        </nav>
        <p className="small muted">所有操作均依据账户权限在服务端校验。</p>
      </aside>
      <div className="admin-content">
        <div className="section-top">
          <div>
            <span className="eyebrow">PLATFORM MANAGEMENT</span>
            <h1>{names[tab]}</h1>
          </div>
          <Button secondary onClick={refresh}>
            刷新
          </Button>
        </div>
        {error && <div className="notice error">{error}</div>}
        {tab === "stats" ? (
          <AdminStats {...ctx} />
        ) : tab === "guides" ? (
          <AdminGuides {...ctx} save={save} busy={busy} />
        ) : tab === "orders" ? (
          <Orders {...ctx} />
        ) : tab === "cases" ? (
          <AdminCases {...ctx} save={save} busy={busy} />
        ) : tab === "reviews" ? (
          <AdminReviews {...ctx} save={save} busy={busy} />
        ) : tab === "settings" ? (
          <AdminSettings {...ctx} save={save} busy={busy} />
        ) : tab === "users" ? (
          <AdminUsers {...ctx} save={save} busy={busy} />
        ) : (
          <AdminAudit {...ctx} />
        )}
      </div>
    </section>
  );
}
function AdminStats({ revision }) {
  const { data: s, loading, error } = useLoad("/admin/stats", revision);
  return (
    <State loading={loading} error={error}>
      {s && (
        <>
          <div className="metrics">
            <Metric
              label="已审核 / 地陪总数"
              value={`${s.approved} / ${s.guides}`}
            />
            <Metric label="累计搜索" value={s.searches} />
            <Metric label="预约申请" value={s.bookings} />
            <Metric label="已付款订单" value={s.paid} />
            <Metric label="已完成订单" value={s.completed} />
            <Metric label="收款扣除退款" value={money(s.revenue)} />
            <Metric label="累计登记退款" value={money(s.refunded)} />
          </div>
          <div className="panel table-wrap">
            <h3>四类出行目的</h3>
            <p className="small muted">
              多选目的分别计数，合计可能大于订单总数。
            </p>
            <table>
              <thead>
                <tr>
                  <th>目的</th>
                  <th>搜索次数</th>
                  <th>预约数量</th>
                </tr>
              </thead>
              <tbody>
                {s.purposes.map((p) => (
                  <tr key={p.purpose}>
                    <td>{purposes[p.purpose][0]}</td>
                    <td>{p.searches}</td>
                    <td>{p.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h3>城市分布</h3>
            {s.cities.map((c) => (
              <div className="summary-line" key={c.city}>
                <span>{cities[c.city][0]}</span>
                <b>{c.count}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </State>
  );
}
function AdminGuides({ revision, save, busy, user, t }) {
  const { data, loading, error } = useLoad("/admin/guides", revision);
  return (
    <State loading={loading} error={error} empty={data?.length === 0}>
      {data?.map((g) => (
        <div className="panel" key={g.id}>
          <div className="row">
            <div className="person">
              <Avatar src={g.image} name={g.name} />
              <div>
                <h3>{g.name}</h3>
                <p>
                  {cities[g.city][0]} · {g.languages} · {money(g.rate)}/小时
                </p>
              </div>
            </div>
            <Badge status={g.status} t={t} />
          </div>
          <div className="tags">
            {g.purposes.map((p) => (
              <span key={p}>{purposes[p][0]}</span>
            ))}
            {g.paused && <span>已暂停接单</span>}
          </div>
          <p>{g.bio}</p>
          <p className="small muted">
            接待上限 {g.capacity}人 · 中文 {levels[g.chineseLevel]?.[0]} ·{" "}
            {styles[g.style]?.[0]}
          </p>
          {g.reviewNote && (
            <div className="notice">上次审核意见：{g.reviewNote}</div>
          )}
          {["admin", "reviewer"].includes(user.role) && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                save("guide", {
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  id: g.id,
                });
              }}
            >
              <Field label="处理结果">
                <select name="status">
                  <option value="approved">批准上架</option>
                  <option value="needs_changes">退回补充资料</option>
                  <option value="rejected">拒绝申请</option>
                  <option value="suspended">下架</option>
                </select>
              </Field>
              <Field label="审核意见 / 原因">
                <input
                  name="reason"
                  required
                  placeholder="请记录实际核验情况"
                />
              </Field>
              <Button disabled={busy}>保存审核结果</Button>
            </form>
          )}
          <details className="action-detail">
            <summary>查看和协助调整档期</summary>
            {g.availability.length ? (
              g.availability.map((a) => (
                <div className="slot-row" key={a.id}>
                  <span>
                    {a.date ||
                      ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
                        a.weekday
                      ]}{" "}
                    {hm(a.start)}—{hm(a.end)}
                  </span>
                  <b>{a.blocked ? "关闭" : "开放"}</b>
                </div>
              ))
            ) : (
              <p>尚未设置档期</p>
            )}
            {["admin", "support"].includes(user.role) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  let d = Object.fromEntries(new FormData(e.currentTarget));
                  save("availability", {
                    ...d,
                    guideId: g.id,
                    start: mins(d.start),
                    end: mins(d.end),
                    blocked: d.blocked === "on",
                  });
                }}
              >
                <div className="form-grid three">
                  <Field label="日期">
                    <input name="date" type="date" required min={day(0)} />
                  </Field>
                  <Field label="开始">
                    <input name="start" type="time" required />
                  </Field>
                  <Field label="结束">
                    <input name="end" type="time" required />
                  </Field>
                </div>
                <Field label="与地陪沟通后的调整原因">
                  <input name="reason" required />
                </Field>
                <label className="check-line">
                  <input type="checkbox" name="blocked" />{" "}
                  关闭该时段（不选则开放）
                </label>
                <Button secondary disabled={busy}>
                  保存并通知地陪
                </Button>
              </form>
            )}
          </details>
        </div>
      ))}
    </State>
  );
}
function AdminCases({ revision, save, busy, navigate, t }) {
  const { data, loading, error } = useLoad("/admin/cases", revision);
  return (
    <State loading={loading} error={error} empty={data?.length === 0}>
      {data?.map((c) => (
        <div className="panel" key={c.id}>
          <div className="row">
            <h3>
              {{
                payment: "付款核对",
                cancellation: "取消申请",
                refund: "退款申请",
                complaint: "投诉",
                review_appeal: "评价申诉",
              }[c.kind] || c.kind}{" "}
              · {c.name}
            </h3>
            <Badge status={c.status} t={t} />
          </div>
          <p className="prose">{c.body}</p>
          {c.evidence && <p className="prose muted">证据：{c.evidence}</p>}
          <button
            className="text-button"
            onClick={() => navigate("/orders/" + c.booking_id)}
          >
            查看相关订单 →
          </button>
          {c.status === "open" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save("case", {
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  id: c.id,
                });
              }}
            >
              <Field label="处理结果（退款请先在订单中登记）">
                <textarea name="resolution" required />
              </Field>
              <Button disabled={busy}>记录结果并通知用户</Button>
            </form>
          ) : (
            <div className="notice">{c.resolution}</div>
          )}
        </div>
      ))}
    </State>
  );
}
function AdminReviews({ revision, save, busy }) {
  const { data, loading, error } = useLoad("/admin/reviews", revision);
  return (
    <State loading={loading} error={error} empty={data?.length === 0}>
      {data?.map((r) => (
        <div className="panel" key={r.id}>
          <h3>
            {r.name} · {"★".repeat(r.rating)}
          </h3>
          <p>{r.body}</p>
          <p className="small muted">
            当前：{r.visible ? "公开" : "隐藏"} · {r.moderation_note}
          </p>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              save("review", {
                ...Object.fromEntries(new FormData(e.currentTarget)),
                id: r.id,
                visible: !r.visible,
              });
            }}
          >
            <Field label="审核原因">
              <input name="reason" required />
            </Field>
            <Button secondary disabled={busy}>
              {r.visible ? "隐藏违规评价" : "恢复公开"}
            </Button>
          </form>
        </div>
      ))}
    </State>
  );
}
function AdminSettings({ session, save, busy }) {
  const s = session.settings;
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        save("settings", Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <h3>首页与帮助内容</h3>
      {[
        ["heroTitle", "首页标题"],
        ["heroSubtitle", "首页说明"],
        ["support", "客服联系方式"],
      ].map(([k, label]) => (
        <Field label={label} key={k}>
          <input name={k} defaultValue={s[k]} required />
        </Field>
      ))}
      {[
        ["rules", "预约规则与取消约定"],
        ["faq", "常见问题"],
        ["paymentInstructions", "人工收款说明（启用前需核实经营与收款安排）"],
      ].map(([k, label]) => (
        <Field label={label} key={k}>
          <textarea name={k} defaultValue={s[k]} />
        </Field>
      ))}
      <h3>运营规则</h3>
      <div className="form-grid">
        {[
          ["commission", "平台佣金比例 %"],
          ["responseHours", "接单响应期限 小时"],
          ["paymentMinutes", "付款期限 分钟"],
          ["bufferMinutes", "两单交通缓冲 分钟"],
          ["settlementHours", "完成后结算等待期 小时"],
        ].map(([k, label]) => (
          <Field label={label} key={k}>
            <input
              name={k}
              type="number"
              min={k === "commission" ? 0 : 1}
              max={k === "commission" ? 40 : k === "bufferMinutes" ? 180 : 168}
              defaultValue={s[k]}
              required
            />
          </Field>
        ))}
      </div>
      <div className="notice">
        在线支付未接入。人工收款还需服务器开启配置，填写说明不会自动启用。佣金修改仅影响新订单。
      </div>
      <Button disabled={busy}>保存内容与规则</Button>
    </form>
  );
}
function AdminUsers({ revision, save, busy, user }) {
  const { data, loading, error } = useLoad("/admin/users", revision);
  return (
    <State loading={loading} error={error}>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>邮箱</th>
              <th>当前权限</th>
              <th>变更</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{roles[u.role]}</td>
                <td>
                  {u.id === user.id ? (
                    "当前账户"
                  ) : (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save("role", {
                          id: u.id,
                          role: new FormData(e.currentTarget).get("role"),
                        });
                      }}
                    >
                      <select name="role" defaultValue={u.role}>
                        {Object.entries(roles).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <Button secondary disabled={busy}>
                        更新
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </State>
  );
}
function AdminAudit({ revision }) {
  const { data, loading, error } = useLoad("/admin/audit", revision);
  return (
    <State loading={loading} error={error}>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>人员</th>
              <th>操作</th>
              <th>原因或详情</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id}>
                <td>{kst(a.created)}</td>
                <td>{a.name || "系统"}</td>
                <td>
                  {a.action}
                  <small className="muted break">{a.target}</small>
                </td>
                <td>{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </State>
  );
}
createRoot(document.getElementById("root")).render(<App />);
