import React, { useEffect, useState } from "react";
import {
  Search,
  ClipboardList,
  MessageCircle,
  UserRound,
  Download,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  WifiOff,
} from "lucide-react";
import {
  nativeApp,
  installPrompt,
  clearInstallPrompt,
} from "./mobile-runtime.js";
export function MobileNavigation({ route, user, navigate, unread, t }) {
  const guide = user?.role === "guide";
  const items = [
    [
      guide ? "/guide" : "/",
      guide ? LayoutDashboard : Search,
      guide ? t("工作台", "관리") : t("发现", "탐색"),
    ],
    ["/orders", ClipboardList, t("预约", "예약")],
    ["/messages", MessageCircle, t("消息", "메시지")],
    ["/account", UserRound, t("我的", "내 정보")],
  ];
  return (
    <nav
      className="mobile-tabs"
      aria-label={t("App 主导航", "앱 기본 내비게이션")}
    >
      {items.map(([path, Icon, label]) => (
        <button
          key={path}
          aria-current={
            route === path || (path !== "/" && route.startsWith(path + "/"))
              ? "page"
              : undefined
          }
          onClick={() => navigate(path)}
        >
          <span>
            <Icon size={21} />
            {path === "/messages" && unread > 0 && (
              <b className="tab-badge">{unread > 99 ? "99+" : unread}</b>
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
export function InstallCard({ t }) {
  const [prompt, setPrompt] = useState(installPrompt),
    [installed, setInstalled] = useState(
      () =>
        nativeApp ||
        matchMedia("(display-mode: standalone)").matches ||
        navigator.standalone,
    ),
    [hint, setHint] = useState(false);
  useEffect(() => {
    const onPrompt = () => setPrompt(installPrompt);
    const onInstall = () => {
      setInstalled(true);
      clearInstallPrompt();
      setPrompt(null);
    };
    window.addEventListener("km-install-ready", onPrompt);
    window.addEventListener("appinstalled", onInstall);
    return () => {
      window.removeEventListener("km-install-ready", onPrompt);
      window.removeEventListener("appinstalled", onInstall);
    };
  }, []);
  if (installed)
    return (
      <p className="muted">
        KoreaMate · {t("手机 App 模式", "모바일 앱 모드")}
      </p>
    );
  return (
    <section className="install-card">
      <Download size={23} />
      <div>
        <b>{t("把 KoreaMate 放到手机桌面", "KoreaMate 를 홈 화면에 추가")}</b>
        <p>
          {t(
            "随时查看预约，与同行随行翻译保持联系。",
            "언제든 예약을 확인하고 담당 통역사와 연락하세요.",
          )}
        </p>
        <button
          className="button"
          onClick={async () => {
            if (prompt) {
              await prompt.prompt();
              await prompt.userChoice;
              clearInstallPrompt();
              setPrompt(null);
            } else setHint(!hint);
          }}
        >
          {t("安装 / 添加到桌面", "설치 / 홈 화면에 추가")}
        </button>
        {hint && (
          <p className="install-help">
            {t(
              "iPhone：用 Safari 打开，点击“分享”→“添加到主屏幕”。Android：用 Chrome 打开，在浏览器菜单中选择“安装应用”或“添加到主屏幕”。如果在微信中打开，请先选择在系统浏览器打开。",
              "iPhone: Safari 에서 열고 「공유」 → 「홈 화면에 추가」를 누르세요. Android: Chrome 에서 열고 메뉴에서 「앱 설치」 또는 「홈 화면에 추가」를 선택하세요. 위챗 안에서 열었다면 먼저 기본 브라우저로 열어 주세요.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
export function AccountPage({ user, navigate, logout, t }) {
  return (
    <div className="page account-page">
      <div className="account-hero">
        <div className="account-avatar">
          <UserRound size={32} />
        </div>
        <div>
          <span className="eyebrow">MY KOREAMATE</span>
          <h1>
            {user ? user.name : t("你的韩国同行伙伴", "한국 여행의 동반자")}
          </h1>
          <p>
            {user
              ? user.email
              : t(
                  "登录后管理预约、付款和专属聊天。",
                  "로그인하면 예약, 결제, 전용 대화를 관리할 수 있습니다.",
                )}
          </p>
        </div>
      </div>
      <div className="account-actions">
        {!user && (
          <>
            <button onClick={() => navigate("/login")}>
              {t("游客登录 / 注册", "이용자 로그인 / 가입")}
              <ChevronRight />
            </button>
            <button onClick={() => navigate("/guide/login")}>
              {t("随行翻译登录", "통역사 로그인")}
              <ChevronRight />
            </button>
            <button onClick={() => navigate("/join")}>
              {t("申请成为随行翻译", "통역사 지원하기")}
              <ChevronRight />
            </button>
          </>
        )}
        {user && (
          <>
            <button onClick={() => navigate("/orders")}>
              <ClipboardList />
              {t("我的预约", "내 예약")}
              <ChevronRight />
            </button>
            <button onClick={() => navigate("/messages")}>
              <MessageCircle />
              {t("我的消息", "내 메시지")}
              <ChevronRight />
            </button>
            {user.role === "guide" && (
              <button onClick={() => navigate("/guide")}>
                <LayoutDashboard />
                {t("档期、接单与收入", "일정 · 예약 · 수입")}
                <ChevronRight />
              </button>
            )}
            <button onClick={logout}>
              <LogOut />
              {t("退出登录", "로그아웃")}
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      <InstallCard t={t} />
      <p className="small muted">
        {t(
          "购物 · 手续 · 商务 · 就医 · 医美 · 活动",
          "쇼핑 · 행정 · 비즈니스 · 의료 · 미용 · 행사",
        )}
        <br />
        {t(
          "服务时间均为韩国时间（UTC+9）。",
          "모든 서비스 시간은 한국 시간(UTC+9) 기준입니다.",
        )}
      </p>
    </div>
  );
}
export function ConnectionNotice({ t }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  return (
    !online && (
      <div className="offline-bar" role="status">
        <WifiOff size={16} />
        {t(
          "网络已断开，预约、支付及聊天需要联网。",
          "네트워크가 끊겼습니다. 예약, 결제, 대화에는 인터넷 연결이 필요합니다.",
        )}
      </div>
    )
  );
}
export function PaymentHandoff({ failed, navigate, t }) {
  const params = new URLSearchParams(location.search);
  params.delete("client");
  return (
    <div className="page narrow">
      <h1>
        {t("返回 KoreaMate 完成支付核对", "KoreaMate 로 돌아가 결제 확인")}
      </h1>
      <p>
        {t(
          "请返回 App，由服务器核对这笔付款。此页面不代表付款成功。",
          "앱으로 돌아가면 서버가 이 결제를 확인합니다. 이 화면은 결제 성공을 뜻하지 않습니다.",
        )}
      </p>
      <a
        className="button"
        href={
          "koreamate://payments/" + (failed ? "fail" : "success") + "?" + params
        }
      >
        {t("打开 KoreaMate App", "KoreaMate 앱 열기")}
      </a>
      <p>
        {t(
          "如果没有自动打开，请点击上面的按钮。",
          "자동으로 열리지 않으면 위 버튼을 눌러 주세요.",
        )}
      </p>
      <button
        className="text-button"
        onClick={() =>
          window.location.assign(
            "/payments/" + (failed ? "fail" : "success") + "?" + params,
          )
        }
      >
        使用网页版继续
      </button>
    </div>
  );
}
