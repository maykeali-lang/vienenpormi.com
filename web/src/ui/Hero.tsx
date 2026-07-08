import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { enter } from "../audio/useConductor";
import { useApp } from "../state/store";
import { useT, useLang } from "../i18n";
import { mountCloth, type ClothHandle } from "./cloth";
import { Player } from "./Player";

const BASE = import.meta.env.BASE_URL || "/";
const link = (p: string) => `${BASE}${p}`.replace(/\/{2,}/g, "/");

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Duración real del mixdown de «Orgullo» (tema 03; fallback si no cargan los metadatos).
const ORGULLO_DUR = 239;
// Duración del outro (el tema del intro suena bajo el collage de UAPs).
const OUTRO_DUR = 142;

// flag de «disclaimer ya visto» (solo se muestra la primera visita)
const GATE_KEY = "vpm-gate-v1";

/**
 * HOME / HERO de «vienen por mi»: el LOGO de la banda ondea como tela al
 * centro (click = abre el about); abajo, el setlist minimal en orden:
 * 01 ira (el directo instrumental low poly — se entra desde aquí) ·
 * 02 libreta (el juego de nave) · 03 orgullo (barquito de papel) ·
 * 04 envidia (preview en el reproductor) · 05 outro (collage de UAPs).
 * La portada de Galue vive ahora solo en el music player.
 */
export function Hero() {
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const setHeroDone = useApp((s) => s.setHeroDone);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);

  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const clothRef = useRef<ClothHandle | null>(null);
  const [exiting, setExiting] = useState(false);
  const [orgulloDur, setOrgulloDur] = useState(ORGULLO_DUR);
  // hint «about» bajo el logo-tela: aparece al pasar el cursor por encima
  const [logoHover, setLogoHover] = useState(false);
  // modo del home: experiencia (tela + setlist) o music player (carrusel)
  const [playerMode, setPlayerMode] = useState(false);
  // carta inicial del player (el atajo «04 · envidia» abre en su preview)
  const [playerStart, setPlayerStart] = useState(0);
  // disclaimer de entrada: SOLO la primera visita (localStorage)
  const [gateOpen, setGateOpen] = useState(() => {
    try {
      return !localStorage.getItem(GATE_KEY);
    } catch {
      return true;
    }
  });

  const ready = phase === "ready";

  // duración real del tema 03 (solo metadatos, no descarga el audio entero)
  useEffect(() => {
    const b = import.meta.env.BASE_URL || "/";
    const a = new Audio();
    a.preload = "metadata";
    // ?v=2026.2 = corte con el ruido de tierra filtrado (immutable 30d)
    a.src = `${b}assets/songs/orgullo/mixdown.mp3`.replace(/\/{2,}/g, "/") + "?v=2026.2";
    const onMeta = () => {
      if (isFinite(a.duration) && a.duration > 0) setOrgulloDur(a.duration);
    };
    a.addEventListener("loadedmetadata", onMeta);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.src = "";
    };
  }, []);

  // tela ondeante (three.js) con el LOGO; click sobre él → abre el about
  useEffect(() => {
    if (!bgRef.current) return;
    const cloth = mountCloth(
      bgRef.current,
      () => useApp.getState().setAboutOpen(true),
      (over) => setLogoHover(over),
    );
    clothRef.current = cloth;
    return () => cloth.dispose();
  }, []);

  // cambia entre experiencia y music player
  const togglePlayerMode = () => setPlayerMode((v) => !v);

  // el player tapa la tela: pausa su render (GPU) mientras esté abierto;
  // ESC vuelve del player a la experiencia
  useEffect(() => {
    clothRef.current?.setPaused(playerMode);
    if (!playerMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !useApp.getState().aboutOpen) setPlayerMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerMode]);

  // intro del home: setlist con stagger desde el centro + chips de la
  // esquina con un back.out sutil (el logo-tela hace su propia entrada)
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".hero__tracks .hero__track",
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          delay: 0.15,
          ease: "power3.out",
          stagger: { each: 0.07, from: "center" },
          clearProps: "opacity,transform",
        },
      );
      gsap.fromTo(
        [".hero__mode", ".hero__lang"],
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.55, delay: 0.35, ease: "back.out(1.4)", stagger: 0.1, clearProps: "opacity,transform" },
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  // entrada al directo instrumental «ira»: la tela se rasga y arranca la escena
  const onEnter = () => {
    if (!ready || exiting) return;
    setExiting(true);
    // arranca ya la experiencia en vivo (audio + escena) por detrás de la tela
    enter();

    // se desvanece la interfaz del home mientras la tela sale volando
    const overlay = rootRef.current?.querySelectorAll(
      ".hero__tracks, .hero__abouthint, .hero__mode, .hero__lang, .hero__error",
    );
    if (overlay?.length) gsap.to(overlay, { opacity: 0, duration: 0.3, ease: "power2.out" });

    // destello: el comienzo de la transición mete al usuario en el directo
    if (flashRef.current) {
      gsap.fromTo(
        flashRef.current,
        { opacity: 0 },
        {
          opacity: 0.9,
          duration: 0.5,
          delay: 0.32,
          ease: "power2.in",
          onComplete: () =>
            gsap.to(flashRef.current, { opacity: 0, duration: 0.6, ease: "power2.out" }),
        },
      );
    }

    // la tela se rasga y sale volando; al terminar cerramos el home
    const cloth = clothRef.current;
    if (cloth) cloth.exit(() => setHeroDone(true));
    else setHeroDone(true);
  };

  return (
    <div className={`hero${exiting ? " is-exiting" : ""}`} ref={rootRef}>
      <div className="hero__cloth" ref={bgRef} />
      <div className="hero__flash" ref={flashRef} />

      {/* hint bajo el logo-tela: el logo ES el botón del about */}
      <span className={`hero__abouthint mono${logoHover ? " is-on" : ""}`} aria-hidden="true">
        {t.about_hint}
      </span>

      {/* toggle de modo (arriba a la derecha):
          music player ⇄ experiencia */}
      <button className="hero__mode mono" onClick={togglePlayerMode}>
        {playerMode ? t.mode_exp : t.mode_player}
      </button>

      {/* idioma: ES por defecto para nuestra región; el click alterna */}
      <button
        className="hero__lang mono"
        onClick={toggleLang}
        aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
      >
        <span className={lang === "es" ? "is-on" : ""}>es</span>
        <i>/</i>
        <span className={lang === "en" ? "is-on" : ""}>en</span>
      </button>

      {playerMode && (
        <div className="hero__player">
          <span className="hero__demo mono">demo</span>
          <Player key={playerStart} initialIdx={playerStart} />
          {/* la portada de Galue vive aquí: su crédito también */}
          <p className="hero__playercredit mono">
            {t.credit_by}{" "}
            <a href="https://johangalue.com" target="_blank" rel="noopener noreferrer">
              johan galue ↗
            </a>
          </p>
        </div>
      )}

      {error && <div className="hero__error mono">⚠ {error}</div>}

      {/* setlist minimal, en orden, en la parte inferior:
          01 ira (directo, intro/primera pista) … 05 outro (última pista) */}
      <nav className="hero__tracks mono" aria-label="setlist">
        <button
          className={`hero__track${ready ? "" : " is-soon"}`}
          onClick={onEnter}
          disabled={!ready || exiting}
          aria-label={t.aria_ira}
        >
          <span className="hero__track-name">01 · ira</span>
          <span className="hero__track-meta">{t.track_live}</span>
          <span className="hero__track-go">{ready ? t.track_enter : t.track_soon}</span>
        </button>

        <a className="hero__track" href={link("libreta")} aria-label={t.aria_libreta}>
          <span className="hero__track-name">02 · libreta</span>
          <span className="hero__track-meta">{t.meta_game}</span>
          <span className="hero__track-go">{t.track_game}</span>
        </a>

        <a className="hero__track" href={link("orgullo")} aria-label={t.aria_orgullo}>
          <span className="hero__track-name">03 · orgullo</span>
          <span className="hero__track-meta">{fmt(orgulloDur)}</span>
          <span className="hero__track-go">{t.track_sail}</span>
        </a>

        <button
          className="hero__track"
          onClick={() => {
            setPlayerStart(3); // carta de envidia (preview)
            setPlayerMode(true);
          }}
          aria-label={t.aria_envidia}
        >
          <span className="hero__track-name">04 · envidia</span>
          <span className="hero__track-meta">{t.track_soon}</span>
          <span className="hero__track-go">{t.track_preview}</span>
        </button>

        <a className="hero__track" href={link("outro")} aria-label={t.aria_outro}>
          <span className="hero__track-name">05 · outro</span>
          <span className="hero__track-meta">{fmt(OUTRO_DUR)}</span>
          <span className="hero__track-go">{t.track_watch}</span>
        </a>
      </nav>

      {/* disclaimer de entrada: toda la página es música (solo la 1ª visita) */}
      {gateOpen && (
        <button
          className="hero__gate mono"
          onClick={(e) => {
            const el = e.currentTarget;
            try {
              localStorage.setItem(GATE_KEY, "1");
            } catch {
              /* modo incógnito: se mostrará de nuevo */
            }
            gsap.to(el, {
              opacity: 0,
              duration: 0.55,
              ease: "power2.out",
              onComplete: () => setGateOpen(false),
            });
          }}
        >
          <span className="hero__gate-title disp">{t.gate_title}</span>
          <span className="hero__gate-sub">{t.gate_sub}</span>
          <span className="hero__gate-cta">{t.gate_cta}</span>
        </button>
      )}
    </div>
  );
}
