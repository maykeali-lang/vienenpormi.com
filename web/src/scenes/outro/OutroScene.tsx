import { useEffect, useRef, useState } from "react";
import { bumpPlay } from "../../state/plays";
import "./outro.css";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
// ?v=2 = cache-buster del corte sin el logo NASA (los mp4 van con immutable 30d)
const VIDEO = `${BASE}/assets/outro/collage.mp4?v=2`;
const POSTER = `${BASE}/assets/outro/poster.jpg`;
// el «outro» suena el tema del intro por debajo del collage de UAPs
const AUDIO = `${BASE}/assets/songs/intro/intro.mp3`;

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * /outro — el cierre del proyecto: al entrar se ven varios videos de UAPs a
 * pantalla completa mientras suena el tema del intro. HUD MINIMALISTA en el
 * mismo verde fósforo: play/pausa, una barra navegable de duración (click o
 * arrastre = seek) y el sonido (mute + volumen).
 */
export default function OutroScene() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const durRef = useRef<HTMLSpanElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const bumpedRef = useRef(false);
  const draggingRef = useRef(false);

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

  // progreso + tiempos de la barra (fuera de React, a rAF)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const a = audioRef.current;
      if (a) {
        const dur = a.duration || 0;
        const frac = dur ? Math.min(1, a.currentTime / dur) : 0;
        if (fillRef.current) fillRef.current.style.width = `${(frac * 100).toFixed(3)}%`;
        if (timeRef.current) timeRef.current.textContent = fmt(a.currentTime);
        if (durRef.current) durRef.current.textContent = fmt(dur);
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
      bump();
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

  const setVol = (val: number) => {
    setVolume(val);
    const a = audioRef.current;
    if (!a) return;
    a.volume = val;
    if (a.muted && val > 0) {
      a.muted = false;
      setMuted(false);
    }
  };

  // seek en la barra: click o arrastre → fracción del ancho → tiempo
  const seekTo = (clientX: number) => {
    const a = audioRef.current;
    const track = trackRef.current;
    if (!a || !a.duration || !track) return;
    const r = track.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    a.currentTime = frac * a.duration;
    if (fillRef.current) fillRef.current.style.width = `${(frac * 100).toFixed(3)}%`;
  };

  const onSeekDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    seekTo(e.clientX);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer ya liberado: el click simple igual seekea */
    }
  };
  const onSeekMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) seekTo(e.clientX);
  };
  const onSeekUp = () => {
    draggingRef.current = false;
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

      {/* HUD minimalista: play · tiempo · barra navegable · sonido */}
      <div className="outro__hud mono">
        <button
          className="outro__btn outro__btn--play"
          onClick={togglePlay}
          aria-label={playing ? "Pausa" : "Reproducir"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <polygon points="6 3 20 12 6 21" />
            </svg>
          )}
        </button>

        <span ref={timeRef} className="outro__t">
          0:00
        </span>

        <div
          ref={trackRef}
          className="outro__seek"
          role="slider"
          aria-label="Posición de la canción"
          onPointerDown={onSeekDown}
          onPointerMove={onSeekMove}
          onPointerUp={onSeekUp}
          onPointerCancel={onSeekUp}
        >
          <div className="outro__seek-track" />
          <div ref={fillRef} className="outro__seek-fill" />
        </div>

        <span ref={durRef} className="outro__t">
          0:00
        </span>

        <button
          className="outro__btn outro__btn--mute"
          onClick={toggleMute}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
              <line x1="16" y1="9.5" x2="21" y2="14.5" />
              <line x1="21" y1="9.5" x2="16" y2="14.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            </svg>
          )}
        </button>

        <input
          className="outro__vol"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          aria-label="Volumen"
          onChange={(e) => setVol(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
