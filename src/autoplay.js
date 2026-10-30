import { useEffect, useState } from "react";

// WeChat's in-app browser does not autoplay video the way every other browser does.
// On Android it runs Tencent's X5 kernel, which both blocks the first play() and wants
// to take a <video> fullscreen; on iOS it blocks until the page has seen a gesture or
// until WeChat's own bridge reports ready. Both of our videos sit behind text as
// decoration, so they have to stay inline and start on their own — otherwise the
// reader just sees the poster, which is what a shared link looks like today.
//
// None of this affects other browsers: the first play() succeeds there and every
// listener below unsubscribes.
export const INLINE_VIDEO_ATTRS = {
  playsInline: true,
  muted: true,
  // Older iOS WebViews read the vendor-prefixed spelling.
  "webkit-playsinline": "true",
  // X5: stay inside the page instead of opening Tencent's own player.
  "x5-playsinline": "true",
  "x5-video-player-type": "h5-page",
  "x5-video-player-fullscreen": "false",
};

// `ready` lets a caller mount the element later — the hero only renders a <video>
// once it has decided the reader wants motion, and the effect has to run again then.
// Returns whether the element is actually playing, so the caller can keep a CSS
// fallback on screen until it is. Autoplay can be refused outright, and the reader
// should see motion either way.
export function useInlineAutoplay(ref, ready = true) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!ready || !ref.current) return;
    const el = ref.current;
    let started = false;

    const attempt = () => {
      if (started || !ref.current) return;
      // Muted is what makes an unattended play() allowed at all. React sets it as a
      // DOM property only, and the older WebViews that need this code read the HTML
      // attribute, so write both.
      ref.current.muted = true;
      ref.current.setAttribute("muted", "");
      ref.current.play?.()?.then?.(noop, noop);
    };
    const noop = () => {};
    // The element itself is the authority on whether anything is moving.
    const onPlay = () => {
      started = true;
      setPlaying(true);
    };
    const onStop = () => setPlaying(false);
    el.addEventListener("playing", onPlay);
    el.addEventListener("pause", onStop);
    el.addEventListener("ended", onStop);

    attempt();

    // Any gesture anywhere on the page lifts the block, so listen broadly and stop as
    // soon as one play() resolves.
    const gestures = ["touchstart", "touchend", "click", "scroll"];
    for (const name of gestures)
      document.addEventListener(name, attempt, { passive: true });
    document.addEventListener("visibilitychange", attempt);

    // WeChat only allows playback once its bridge is up; if it is already up the event
    // has been and gone, so try immediately instead of waiting for it.
    if (window.WeixinJSBridge) attempt();
    else document.addEventListener("WeixinJSBridgeReady", attempt, false);

    return () => {
      el.removeEventListener("playing", onPlay);
      el.removeEventListener("pause", onStop);
      el.removeEventListener("ended", onStop);
      for (const name of gestures) document.removeEventListener(name, attempt);
      document.removeEventListener("visibilitychange", attempt);
      document.removeEventListener("WeixinJSBridgeReady", attempt);
    };
  }, [ref, ready]);
  return playing;
}
