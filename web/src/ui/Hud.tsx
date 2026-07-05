import { useEffect, useRef } from "react";
import gsap from "gsap";
import { conductor } from "../audio/conductor";
import { useApp } from "../state/store";
import { recordPlay } from "../state/plays";
import { SONG } from "../config/song";
import { useT } from "../i18n";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtPlays(n: number) {
  return n.toLocaleString("en-US");
}

/** HUD overlay (fuera del canvas) con transporte: play/pausa, seek y volumen. */
export function Hud() {
  const t = useT();
  const phase = useApp((s) => s.phase);
  const muted = useApp((s) => s.muted);
  const volume = useApp((s) => s.volume);
  const plays = useApp((s) => s.plays);
  const toggleMute = useApp((s) => s.toggleMute);
  const setVolume = useApp((s) => s.setVolume);
  const setPhase = useApp((s) => s.setPhase);
  const freeCam = useApp((s) => s.freeCam);
  const toggleFreeCam = useApp((s) => s.toggleFreeCam);
  const setHeroDone = useApp((s) => s.setHeroDone);
  const resume = () => useApp.getState().phase === "ended" && setPhase("playing");

  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const beatRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const wasPaused = useRef<boolean | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const dur = conductor.duration || 1;
      const f = conductor.frame;
      if (barRef.current) barRef.current.style.width = `${(f.t / dur) * 100}%`;
      if (timeRef.current) timeRef.current.textContent = `${fmt(f.t)} / ${fmt(dur)}`;
      if (beatRef.current) {
        const pulse = 1 - f.beatPhase;
        beatRef.current.style.opacity = `${0.25 + pulse * 0.75}`;
        beatRef.current.style.transform = `scale(${0.8 + pulse * 0.5})`;
      }
      // Icono play/pausa sincronizado con el estado real del conductor
      // (incluye la auto-pausa al cambiar de pestana en movil).
      const paused = conductor.isPaused;
      if (paused !== wasPaused.current && playRef.current) {
        wasPaused.current = paused;
        playRef.current.textContent = paused ? "▶" : "❚❚";
        playRef.current.setAttribute("aria-label", paused ? "Play" : "Pause");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Reveal del HUD con GSAP al entrar a reproduccion.
  useEffect(() => {
    if (phase !== "playing") return;
    const ctx = gsap.context(() => {
      gsap.from(topRef.current, { y: -22, opacity: 0, duration: 0.7, ease: "power3.out" });
      gsap.from(bottomRef.current, {
        y: 26,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        delay: 0.05,
      });
    });
    return () => ctx.revert();
  }, [phase === "playing"]);

  // Sincroniza volumen/mute con el conductor.
  useEffect(() => {
    conductor.setVolume(muted ? 0 : volume);
  }, [muted, volume]);

  if (phase !== "playing" && phase !== "ended") return null;

  const onPlayPause = () => {
    if (useApp.getState().phase === "ended") {
      conductor.seek(0);
      void recordPlay();
      setPhase("playing");
      return;
    }
    conductor.toggle();
    if (playRef.current) {
      gsap.fromTo(
        playRef.current,
        { scale: 0.82 },
        { scale: 1, duration: 0.32, ease: "back.out(3)" },
      );
    }
  };

  const goHome = () => {
    conductor.reset();
    setPhase("ready");
    setHeroDone(false); // vuelve al home/hero
  };

  const seekAtX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    conductor.seek(frac * (conductor.duration || 1));
    resume();
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    seekAtX(e.clientX);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekAtX(e.clientX);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <div ref={topRef} className="hud hud--top">
        <button className="hud__btn hud__home" onClick={goHome} aria-label="Back to home">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
          <span>{t.hud_back}</span>
        </button>
        <div className="hud__right">
          <span className="hud__plays" title="Plays on this device">
            <span className="hud__plays-ico">▶</span>
            <span className="hud__plays-n">{fmtPlays(plays)}</span>
          </span>
          <div ref={beatRef} className="hud__beat" title="beat" />
        </div>
      </div>

      <div ref={bottomRef} className="hud hud--bottom">
        <div className="hud__controls">
          <button
            ref={playRef}
            className="hud__btn hud__btn--play"
            onClick={onPlayPause}
            aria-label="Pause"
          >
            ❚❚
          </button>
          <button
            className={`hud__btn hud__btn--cam${freeCam ? " is-active" : ""}`}
            onClick={toggleFreeCam}
            aria-pressed={freeCam}
            title="Explore the stage freely (drag to orbit, wheel to zoom)"
          >
            {freeCam ? t.hud_freecam : t.hud_explore}
          </button>
          <span ref={timeRef} className="hud__time">
            0:00 / 0:00
          </span>
          <div className="hud__vol">
            <button className="hud__btn hud__btn--icon" onClick={toggleMute}>
              {muted || volume <= 0 ? "🔇" : "🔊"}
            </button>
            <input
              className="hud__slider"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="Volume"
            />
          </div>
        </div>
        <div
          ref={trackRef}
          className="hud__track"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          role="slider"
          aria-label="Progress"
        >
          <div className="hud__rail">
            <div ref={barRef} className="hud__bar">
              <div className="hud__knob" />
            </div>
          </div>
        </div>
      </div>

      {phase === "ended" && (
        <div className="endcard">
          <h2 className="glitch" data-text={t.hud_thanks}>
            {t.hud_thanks}
          </h2>
          <p>
            {t.hud_that_was} {SONG.title}.
          </p>
          <div className="endcard__actions">
            <button
              className="enterBtn is-ready"
              onClick={() => {
                conductor.seek(0);
                void recordPlay();
                setPhase("playing");
              }}
            >
              {t.hud_again}
            </button>
            <button
              className="enterBtn enterBtn--ghost"
              onClick={() => {
                conductor.reset();
                setPhase("ready");
                setHeroDone(false); // vuelve al home/hero
              }}
            >
              {t.hud_home}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
