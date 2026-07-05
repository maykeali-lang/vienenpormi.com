import { useEffect, useRef } from "react";
import gsap from "gsap";
import { enter } from "../audio/useConductor";
import { useApp } from "../state/store";
import { SONG } from "../config/song";
import { useT, useLang } from "../i18n";

/** Gate de entrada + landing con identidad «Estatica» (lockup de barra). */
export function Landing() {
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const bpm = useApp((s) => s.bpm);
  const plays = useApp((s) => s.plays);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);
  const rootRef = useRef<HTMLDivElement>(null);

  const loading = phase === "loading" || phase === "idle";
  const ready = phase === "ready";
  const visible = phase !== "playing" && phase !== "ended";

  // Intro con GSAP: lockup desliza, metadatos y boton aparecen escalonados.
  useEffect(() => {
    if (!visible || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".lk-line", { y: 40, opacity: 0, duration: 0.7, stagger: 0.12 })
        .from(".lk-bar", { scaleX: 0, transformOrigin: "left center", duration: 0.5 }, "-=0.3")
        .from(
          ".landing__meta, .enterBtn, .landing__disclaimer, .landing__foot",
          { y: 14, opacity: 0, duration: 0.5, stagger: 0.08 },
          "-=0.2",
        );
    }, rootRef);
    return () => ctx.revert();
  }, [visible]);

  // Cuando el tema queda "listo", late el boton de reproducir para invitar.
  useEffect(() => {
    if (!ready) return;
    const tw = gsap.fromTo(
      ".enterBtn.is-ready",
      { scale: 0.96 },
      { scale: 1, duration: 0.5, ease: "back.out(2)" },
    );
    return () => {
      tw.kill();
    };
  }, [ready]);

  if (!visible) return null;

  return (
    <div className="landing" ref={rootRef}>
      <div className="landing__topbar mono">
        <span>
          vienen por mi <span className="dot">●</span>
        </span>
        <button
          className="landing__lang mono"
          onClick={toggleLang}
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          {lang === "es" ? "es → en" : "en → es"}
        </button>
      </div>

      <div className="landing__inner">
        {/* Lockup: "vienen / por mi" con barra (identidad de marca) */}
        <div className="lockup">
          <span className="lk-line disp">vienen</span>
          <span className="lk-line disp">
            <span className="lk-bar">por mi</span>
          </span>
        </div>

        <div className="landing__meta mono">
          <span>{t.ld_track}</span>
          <span className="landing__song">{SONG.title}</span>
          {bpm > 0 && <span className="landing__bpm">{Math.round(bpm)} BPM</span>}
          {plays > 0 && (
            <span className="landing__plays">
              ▶ {plays.toLocaleString(lang === "es" ? "es-VE" : "en-US")} {t.ld_plays}
            </span>
          )}
        </div>

        {error ? (
          <div className="landing__error mono">
            ⚠ {error}
            <p className="landing__hint">
              Verifica <code>mixdown.mp3/ogg</code> y <code>envelopes.json</code> en{" "}
              <code>/public/{SONG.basePath}</code>.
            </p>
          </div>
        ) : (
          <button
            className={`enterBtn ${ready ? "is-ready" : "is-loading"}`}
            disabled={!ready}
            onClick={() => enter()}
          >
            {loading ? t.ld_loading : t.ld_play}
          </button>
        )}

        <p className="landing__disclaimer mono">{t.ld_demo}</p>
        <p className="landing__foot mono">{t.ld_foot}</p>

        {/* crédito del video de grafiti que corre en la pantalla del escenario:
            arte de angel d leiva («tacos») — icono enlaza a su web */}
        <p className="landing__graffiti mono">
          {t.ld_graffiti}{" "}
          <a href="https://angeldleiva.com" target="_blank" rel="noopener noreferrer">
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9.2" />
              <path d="M3 12h18M12 2.8c2.6 2.5 2.6 15.9 0 18.4M12 2.8c-2.6 2.5-2.6 15.9 0 18.4" />
            </svg>
            {t.ld_graffiti_by} ↗
          </a>
        </p>
      </div>
    </div>
  );
}
