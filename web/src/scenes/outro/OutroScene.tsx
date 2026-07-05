import { useEffect, useRef, useState } from "react";
import { bumpPlay } from "../../state/plays";
import "./outro.css";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const VIDEO = `${BASE}/assets/outro/collage.mp4`;
const POSTER = `${BASE}/assets/outro/poster.jpg`;
// el «outro» suena el tema del intro por debajo del collage de UAPs
const AUDIO = `${BASE}/assets/songs/intro/intro.mp3`;

// geometría del radar (SVG viewBox 100x100)
const R = 44; // radio del anillo de progreso
const CIRC = 2 * Math.PI * R;

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * /outro — el cierre del proyecto: al entrar se ven varios videos de UAPs a
 * pantalla completa mientras suena el tema del intro. La barra del tiempo de
 * la canción y los controles están dispuestos como si fueran un RADAR: un
 * scope circular con barrido, el progreso como anillo y los botones repartidos
 * como blips alrededor.
 */
export default function OutroScene() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const bumpedRef = useRef(false);

  const bump = () => {
    if (!bumpedRef.current) {
      bumpedRef.current = true;
      void bumpPlay("outro");
    }
  };

  // El video (muted) autoarranca y se ve de una; el audio del tema intenta
  // sonar, y si el navegador lo bloquea queda listo para el botón de play.
  // El estado se sincroniza con los eventos del audio (sin listener global,
  // así el click del play no compite con un gesto de arranque).
  useEffect(() => {
    const a = new Audio(AUDIO);
    a.preload = "auto";
    a.volume = 0.9;
    audioRef.current = a;
    const v = videoRef.current;

    void v?.play().catch(() => {});
    void a
      .play()
      .then(() => bump())
      .catch(() => setPlaying(false));

    const onPlay = () => {
      setPlaying(true);
      void v?.play().catch(() => {});
    };
    const onPause = () => {
      if (!a.ended) setPlaying(false);
    };
    const onEnded = () => {
      setPlaying(false);
      v?.pause();
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.pause();
      a.src = "";
      audioRef.current = null;
    };
  }, []);

  // anillo de progreso + tiempo (fuera de React, a rAF)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const a = audioRef.current;
      if (a) {
        const dur = a.duration || 0;
        const frac = dur ? Math.min(1, a.currentTime / dur) : 0;
        if (ringRef.current) ringRef.current.style.strokeDashoffset = `${CIRC * (1 - frac)}`;
        if (timeRef.current) timeRef.current.textContent = `${fmt(a.currentTime)} / ${fmt(dur)}`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (!a) return;
    if (a.paused) {
      if (a.ended || a.currentTime >= (a.duration || Infinity) - 0.05) a.currentTime = 0;
      void a.play();
      void v?.play();
      if (!bumpedRef.current) {
        bumpedRef.current = true;
        void bumpPlay("outro");
      }
      setPlaying(true);
    } else {
      a.pause();
      v?.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(a.muted);
  };

  // seek circular: click sobre el anillo → ángulo → tiempo
  const seekAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let ang = Math.atan2(e.clientY - cy, e.clientX - cx) + Math.PI / 2; // 0 = arriba
    if (ang < 0) ang += 2 * Math.PI;
    a.currentTime = (ang / (2 * Math.PI)) * a.duration;
  };

  return (
    <div className="outro">
      <video
        ref={videoRef}
        className="outro__video"
        src={VIDEO}
        poster={POSTER}
        muted
        loop
        playsInline
        autoPlay
      />
      <div className="outro__scan" aria-hidden="true" />
      <div className="outro__vignette" aria-hidden="true" />

      <a className="outro__back mono" href={`${BASE}/` || "/"}>
        ← vienen por mi
      </a>
      <div className="outro__label mono">
        01 · outro <span className="outro__dot">●</span> uap collage
      </div>

      {/* RADAR: scope circular, barrido, progreso como anillo, botones-blip */}
      <div className="outro__radar">
        <svg className="outro__scope" viewBox="0 0 100 100" onPointerDown={seekAt}>
          <defs>
            <radialGradient id="rg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(125,255,176,0.10)" />
              <stop offset="100%" stopColor="rgba(125,255,176,0)" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" className="outro__scope-bg" fill="url(#rg)" />
          <circle cx="50" cy="50" r="33" className="outro__scope-ring" />
          <circle cx="50" cy="50" r="22" className="outro__scope-ring" />
          <line x1="50" y1="6" x2="50" y2="94" className="outro__scope-cross" />
          <line x1="6" y1="50" x2="94" y2="50" className="outro__scope-cross" />
          {/* pista del anillo de progreso */}
          <circle cx="50" cy="50" r={R} className="outro__ring-track" />
          {/* progreso de la canción */}
          <circle
            ref={ringRef}
            cx="50"
            cy="50"
            r={R}
            className="outro__ring"
            style={{ strokeDasharray: CIRC, strokeDashoffset: CIRC }}
            transform="rotate(-90 50 50)"
          />
          {/* barrido del radar */}
          <g className="outro__sweep">
            <path d={`M50 50 L50 ${50 - R} A ${R} ${R} 0 0 1 ${50 + R * Math.sin(0.5)} ${50 - R * Math.cos(0.5)} Z`} />
          </g>
        </svg>

        {/* botón central: play/pausa */}
        <button
          className="outro__blip outro__blip--play"
          onClick={togglePlay}
          aria-label={playing ? "Pausa" : "Reproducir"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <polygon points="6 3 20 12 6 21" />
            </svg>
          )}
        </button>

        {/* blip mute (derecha) */}
        <button
          className="outro__blip outro__blip--mute"
          onClick={toggleMute}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
              <line x1="16" y1="9.5" x2="21" y2="14.5" />
              <line x1="21" y1="9.5" x2="16" y2="14.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            </svg>
          )}
        </button>

        {/* tiempo de la canción (abajo, como lectura del radar) */}
        <span ref={timeRef} className="outro__time mono">
          0:00 / 0:00
        </span>
      </div>
    </div>
  );
}
