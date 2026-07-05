// Escena standalone «03 · Orgullo» — barquito de papel en mar papercraft.
// 2D puro (SVG + GSAP), sin Three.js. Lazy-loaded desde la ruta /orgullo.

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Conductor, loadAnalysis, idleFrame } from "./conductor";
import { Stage } from "./stage";
import { Boat, BOAT_Y } from "./boat";
import { LyricEngine } from "./lyricLayer";
import { ORGULLO_LYRICS, alignLyricsToVoice } from "./lyrics";
import { bumpPlay, fetchPlays } from "../../state/plays";
import { useT, useLang } from "../../i18n";
import "./orgullo.css";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const SONG = `${BASE}/assets/songs/orgullo`;

type Phase = "loading" | "ready" | "playing" | "ended" | "error";

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function OrgulloScene() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  // reproducciones GLOBALES de la EXPERIENCIA (contador "orgullo-exp",
  // separado del "orgullo" que suma el music player)
  const [plays, setPlays] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gateRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const durRef = useRef(0);
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;

  useEffect(() => {
    document.title = "VIENEN POR MI — Orgullo";
    void fetchPlays().then((p) => p && setPlays(p["orgullo-exp"] ?? 0));
    const host = stageRef.current!;
    const reduced =
      window.innerWidth < 820 ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

    const stage = new Stage(host, reduced);
    const boat = new Boat(stage.boatLayer);
    const lyricsEngine = new LyricEngine(stage, boat);
    let conductor: Conductor | null = null;

    // ancla el layout a la ventana visible (slice recorta en retrato/ultrawide)
    const onResize = () => {
      stage.setViewport(host.clientWidth, host.clientHeight);
      boat.baseScale = stage.xMax - stage.xMin < 900 ? 0.75 : 1;
    };
    onResize();
    window.addEventListener("resize", onResize);

    // audio: el navegador elige mp3/ogg
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    // ?v= = cache-buster del remaster (audio y análisis van con immutable 30d);
    // subir el sufijo cada vez que cambie el análisis publicado
    for (const [src, type] of [
      [`${SONG}/mixdown.mp3?v=2026.1`, "audio/mpeg"],
      [`${SONG}/mixdown.ogg?v=2026.1`, "audio/ogg"],
    ]) {
      const s = document.createElement("source");
      s.src = src;
      s.type = type;
      audio.appendChild(s);
    }
    audioRef.current = audio;
    host.appendChild(audio); // en DOM (sin controls): no pinta nada

    let cancelled = false;
    Promise.all([
      loadAnalysis(`${SONG}/orgullo.analysis.json?v=2026.1`),
      new Promise<void>((resolve, reject) => {
        audio.addEventListener("canplaythrough", () => resolve(), { once: true });
        audio.addEventListener("error", () => reject(new Error("No se pudo cargar el audio")), { once: true });
        audio.load();
      }),
    ])
      .then(([analysis]) => {
        if (cancelled) return;
        conductor = new Conductor(analysis);
        durRef.current = analysis.duration;
        conductor.onEnterEstribillo = (lvl) => boat.levelUp(lvl);
        // la letra se ancla a los onsets del stem de voz: cae al compás
        lyricsEngine.setLines(alignLyricsToVoice(ORGULLO_LYRICS, analysis.stems?.voice?.onsets));
        setPhase("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setPhase("error");
      });

    audio.addEventListener("ended", () => setPhase("ended"));

    // scroll / rueda = adelantar o volver en la canción (opcional, no compite
    // con escuchar: solo mueve el tiempo)
    const onWheel = (e: WheelEvent) => {
      if (phaseRef.current !== "playing" || !audioRef.current) return;
      e.preventDefault();
      const a = audioRef.current;
      a.currentTime = Math.max(0, Math.min(a.duration - 0.1, a.currentTime + e.deltaY * 0.02));
    };
    host.addEventListener("wheel", onWheel, { passive: false });

    // bucle: todo se anima contra currentTime + análisis (aguanta seek)
    let raf = 0;
    const loop = () => {
      const now = performance.now() / 1000;
      const t = audio.currentTime || 0;
      if (conductor) {
        const f = conductor.frame(t);
        // el barco cruza la ventana visible a lo largo de la canción
        // (izq → der); termina antes del faro para no taparlo
        const vbW = stage.xMax - stage.xMin;
        const x = stage.xMin + vbW * (0.2 + f.progress * 0.38);
        // sol, luna y criaturas miran al barco durante todo el viaje
        stage.lookAt(x, BOAT_Y - 60);
        const e = stage.update(f, now);
        // HUD en tinta clara cuando anochece
        rootRef.current?.classList.toggle("org-night", stage.nightK > 0.5);
        boat.syncLevel(f.prideLevel);
        boat.update(f, now, e, x);
        lyricsEngine.update(f);
        if (timeRef.current && phaseRef.current !== "loading") {
          timeRef.current.textContent = `${fmt(t)} / ${fmt(durRef.current)}`;
        }
        if (barRef.current) barRef.current.style.transform = `scaleX(${f.progress})`;
      } else {
        // aún cargando: el mar respira en reposo
        const idle = idleFrame();
        stage.update(idle, now);
        boat.update(idle, now, 0.1, stage.xMin + (stage.xMax - stage.xMin) * 0.2);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      host.removeEventListener("wheel", onWheel);
      audio.pause();
      audio.innerHTML = "";
      audio.load();
      audioRef.current = null;
      host.innerHTML = "";
    };
  }, []);

  // gate de autoplay: el click en «Zarpar» arranca el audio
  const zarpar = () => {
    const a = audioRef.current;
    if (!a || phase !== "ready") return;
    a.play()
      .then(() => {
        // contador global de la EXPERIENCIA (no del music player)
        void bumpPlay("orgullo-exp").then((p) => p && setPlays(p["orgullo-exp"] ?? 0));
        setPhase("playing");
        if (gateRef.current) {
          gsap.to(gateRef.current, { opacity: 0, duration: 0.9, ease: "power2.out" });
        }
      })
      .catch(() => setError(t.org_audio_err));
  };

  const otraVez = () => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play()
      .then(() => {
        void bumpPlay("orgullo-exp").then((p) => p && setPlays(p["orgullo-exp"] ?? 0));
        setPhase("playing");
      })
      .catch(() => {});
  };

  const gateVisible = phase === "loading" || phase === "ready" || phase === "error";

  return (
    <div className="org-scene" ref={rootRef}>
      <div className="org-stage-host" ref={stageRef} />

      {/* HUD superior */}
      <div className="org-hud mono">
        <a className="org-back" href={BASE || "/"}>
          ← vienen por mi
        </a>
        <span className="org-track">03 · orgullo</span>
        {plays != null && plays > 0 && (
          <span className="org-plays" title={lang === "es" ? "reproducciones de la experiencia" : "experience plays"}>
            ▶ {plays.toLocaleString(lang === "es" ? "es-VE" : "en-US")}
          </span>
        )}
        <span className="org-time" ref={timeRef}>
          {fmt(0)} / {fmt(durRef.current)}
        </span>
      </div>
      <div className="org-progress">
        <div className="org-progress__fill" ref={barRef} />
      </div>

      {/* gate de entrada */}
      {gateVisible && (
        <div className="org-gate" ref={gateRef}>
          <div className="org-gate__inner">
            <span className="org-gate__num mono">03</span>
            <h1 className="org-gate__title disp">ORGULLO</h1>
            <p className="org-gate__sub mono">{t.org_sub}</p>
            {phase === "error" ? (
              <p className="org-gate__error mono">⚠ {error}</p>
            ) : (
              <button
                className={`org-zarpar disp ${phase === "ready" ? "is-ready" : ""}`}
                disabled={phase !== "ready"}
                onClick={zarpar}
              >
                {phase === "ready" ? t.org_sail : t.org_loading}
              </button>
            )}
            <p className="org-gate__hint mono">{t.org_hint}</p>
          </div>
        </div>
      )}

      {phase === "ended" && (
        <div className="org-gate org-gate--end">
          <div className="org-gate__inner">
            <p className="org-gate__sub mono">{t.org_end}</p>
            <div className="org-end__row">
              <button className="org-zarpar is-ready disp" onClick={otraVez}>
                {t.org_again}
              </button>
              <a className="org-zarpar is-ready disp" href={BASE || "/"}>
                {t.org_back}
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="org-grain" />
    </div>
  );
}
