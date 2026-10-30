import React, { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { INLINE_VIDEO_ATTRS, useInlineAutoplay } from "./autoplay.js";

const SEEN = "km-intro-seen";
export const INTRO_ROUTE = "/intro";

const prefersStill = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

// A full-screen film is the wrong thing to push at someone who is returning to an
// order, on a metered connection, or on a page other than the front door.
export function shouldShowIntro(route) {
  // /intro is the shareable promo address: asked for by name, so always play it.
  if (route === INTRO_ROUTE) return true;
  if (route !== "/") return false;
  if (prefersStill()) return false;
  try {
    if (navigator.connection?.saveData) return false;
    return sessionStorage.getItem(SEEN) !== "1";
  } catch {
    return true;
  }
}

function markIntroSeen() {
  try {
    sessionStorage.setItem(SEEN, "1");
  } catch {
    /* private mode: the intro simply shows again next navigation */
  }
}

export default function Intro({ onDone, t }) {
  const [leaving, setLeaving] = useState(false);
  const video = useRef(null);
  const cta = useRef(null);
  const playing = useInlineAutoplay(video);
  const done = useRef(false);

  const leave = () => {
    if (done.current) return;
    done.current = true;
    markIntroSeen();
    setLeaving(true);
    // Matches the .intro transition; the site is already mounted behind it.
    setTimeout(onDone, 620);
  };

  useEffect(() => {
    const key = (e) => {
      if (["Escape", "Enter", " "].includes(e.key)) leave();
    };
    window.addEventListener("keydown", key);
    video.current?.play?.()?.catch?.(() => {});
    // The site is mounted underneath; without this it scrolls behind the film.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cta.current?.focus?.({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className={leaving ? "intro leaving" : "intro"}
      onClick={leave}
      role="presentation"
    >
      <div className="intro-still drifting" />
      <video
        ref={video}
        className={playing ? "intro-video playing" : "intro-video"}
        src="/media/intro.mp4"
        autoPlay
        loop
        preload="auto"
        aria-hidden="true"
        {...INLINE_VIDEO_ATTRS}
      />
      <div className="intro-scrim" />
      <div className="intro-body">
        <span className="intro-kicker">SEOUL · BUSAN · JEJU · AND 22 MORE</span>
        <h1>
          {t(
            "在韩国，\n有人替你开口。",
            "한국에서,\n당신의 말이 되어 드립니다.",
          )}
        </h1>
        <p>
          {t(
            "按小时预约中韩双语随行翻译 —— 购物、手续、商务、就医、医美、活动。",
            "시간 단위로 예약하는 한·중 통역 동행 — 쇼핑, 행정, 비즈니스, 의료, 미용, 행사.",
          )}
        </p>
        <button
          ref={cta}
          className="intro-cta"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            leave();
          }}
        >
          {t("开始预约", "예약 시작하기")}
          <ArrowRight size={19} />
        </button>
        <span className="intro-skip">
          {t("点击任意位置进入", "아무 곳이나 눌러 들어가기")}
        </span>
      </div>
    </div>
  );
}
