import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { bumpPlay, fetchPlays, type PlayCounts, type TrackId } from "../state/plays";
import { useT } from "../i18n";

/**
 * MUSIC PLAYER mode del home — port técnico del carrusel 3D de
 * AhmedKabbej/MusicPlayer2024 (tarjetas en anillo rotateY+translateZ,
 * drag con umbral para next/prev, ángulo continuo normalizado al camino
 * más corto), reescrito en React y reducido a lo esencial: solo las cartas
 * y el transporte, sin subtítulos redundantes. «ira» está por estrenar.
 */

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
// portada de todas las canciones: «Donde suceden cosas» (Johan Galue)
const COVER = `${BASE}/assets/portada.jpg`;

// envolvente del outro (el tema del intro, ahora bajo el collage de UAPs):
// entra muy suave (~2.5 s) y hace fade out en los últimos ~2.5 s
const OUTRO_FADE_IN = 2.5;
const OUTRO_FADE_OUT = 2.5;

interface Track {
  n: string;
  name: string;
  src: string | null; // null = upcoming (sin audio)
  upcoming?: boolean;
  /** preview corto en loop (tema por estrenar): suena pero no suma plays */
  preview?: boolean;
}

const TRACKS: Track[] = [
  // ira = primera pista (el directo instrumental; su mixdown suena aquí)
  { n: "01", name: "ira", src: `${BASE}/assets/songs/ira/mixdown.mp3` },
  { n: "02", name: "libreta", src: `${BASE}/assets/songs/libreta/mixdown.mp3` },
  // ?v=2026 = cache-buster del remaster (los mp3 van con immutable 30d)
  { n: "03", name: "orgullo", src: `${BASE}/assets/songs/orgullo/mixdown.mp3?v=2026` },
  // envidia por estrenar: suena el preview del audio en loop
  { n: "04", name: "envidia", src: `${BASE}/assets/songs/envidia/preview.mp3`, preview: true },
  // outro = última pista: el tema del intro bajo el collage de UAPs
  { n: "05", name: "outro", src: `${BASE}/assets/songs/intro/intro.mp3` },
];

const STEP = 360 / TRACKS.length;
const DRAG_THRESHOLD = 40; // px: pasar de aquí = next/prev (como el repo)

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Player({ initialIdx = 0 }: { initialIdx?: number } = {}) {
  const t9 = useT();
  const [idx, setIdx] = useState(initialIdx);
  const [playing, setPlaying] = useState(false);
  const [vol, setVol] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const volRef = useRef(0.9);
  volRef.current = muted ? 0 : vol;
  // contadores GLOBALES de reproducciones (backend /api/plays), por tema
  const [counts, setCounts] = useState<PlayCounts | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  // ángulo continuo del carrusel (evita vueltas de 360°, igual que el repo)
  const angleRef = useRef({ value: -STEP * initialIdx });
  const [radius, setRadius] = useState(200);
  const radiusRef = useRef(200);
  radiusRef.current = radius;
  const dragRef = useRef<{ startX: number; lastX: number; moved: number } | null>(null);
  // «acabo de arrastrar»: bloquea el click fantasma tras el drag (como el repo)
  const justDraggedRef = useRef(false);
  const idxRef = useRef(0);
  idxRef.current = idx;

  const track = TRACKS[idx];

  // audio único del player
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    a.volume = 0;
    audioRef.current = a;
    // al abrir el player, trae los contadores globales de todos los temas
    void fetchPlays().then((p) => p && setCounts(p));
    const onPlay = () => {
      setPlaying(true);
      // contador GLOBAL: cada arranque desde el inicio suma una reproducción
      // y refresca los conteos que muestran las cartas
      const t = TRACKS[idxRef.current];
      if (a.currentTime < 0.1 && t.src && !t.upcoming && !t.preview)
        void bumpPlay(t.name as TrackId).then((p) => p && setCounts(p));
    };
    const onPause = () => setPlaying(false);
    // al terminar un tema avanza al siguiente reproducible
    const onEnded = () => {
      let n = (idxRef.current + 1) % TRACKS.length;
      while (TRACKS[n].upcoming) n = (n + 1) % TRACKS.length;
      goRef.current?.(n, true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // radio del anillo según el ancho de carta (adyacentes sin solaparse)
  useEffect(() => {
    const measure = () => {
      const w = Math.min(300, window.innerWidth * 0.62);
      setRadius(Math.round(w * 0.95));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // progreso + tiempo + volumen con envolvente (fuera de React, a rAF).
  // El intro entra muy suave, hace fade out a 2:12 y TERMINA en 2:14,
  // igual que en el modo experience; el resto suena al volumen del slider.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const a = audioRef.current;
      if (a) {
        const t = a.currentTime;
        const isOutro = TRACKS[idxRef.current].name === "outro";
        const dur = a.duration || 0;
        let env = 1;
        if (isOutro && dur) {
          // fade in de entrada + fade out sobre los últimos segundos; el
          // avance al terminar lo maneja el evento 'ended'
          const kIn = Math.min(1, Math.max(0.03, t / OUTRO_FADE_IN));
          const kOut = 1 - Math.min(1, Math.max(0, (t - (dur - OUTRO_FADE_OUT)) / OUTRO_FADE_OUT));
          env = kIn * kOut;
        }
        a.volume = Math.max(0, Math.min(1, volRef.current * env));
        if (timeRef.current && barRef.current) {
          timeRef.current.textContent = `${fmt(Math.min(t, dur || t))} / ${fmt(dur)}`;
          barRef.current.style.width = dur ? `${Math.min(100, (t / dur) * 100)}%` : "0%";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** gira el anillo hasta idx por el camino más corto (misma normalización
   *  del repo: delta a (-180, 180]) */
  const spinTo = (nextIdx: number) => {
    const target = -STEP * nextIdx;
    let delta = target - angleRef.current.value;
    delta = ((delta % 360) + 540) % 360 - 180;
    gsap.to(angleRef.current, {
      value: angleRef.current.value + delta,
      duration: 0.8,
      ease: "power2.out",
      onUpdate: () => {
        if (ringRef.current)
          ringRef.current.style.transform = `translateZ(${-radiusRef.current}px) rotateY(${angleRef.current.value}deg)`;
      },
    });
  };

  // el bucle rAF (efecto de montaje) necesita el `go` fresco de cada render
  const goRef = useRef<((nextIdx: number, autoplay: boolean) => void) | null>(null);

  const go = (nextIdx: number, autoplay: boolean) => {
    setIdx(nextIdx);
    spinTo(nextIdx);
    const a = audioRef.current;
    const t = TRACKS[nextIdx];
    if (!a) return;
    if (t.upcoming || !t.src) {
      a.pause();
      a.removeAttribute("src");
      setPlaying(false);
      return;
    }
    a.loop = !!t.preview; // el preview de envidia suena de fondo en bucle
    a.src = t.src;
    if (autoplay) a.play().catch(() => {});
  };
  goRef.current = go;

  const next = () => go((idx + 1) % TRACKS.length, playing);
  const prev = () => go((idx - 1 + TRACKS.length) % TRACKS.length, playing);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || track.upcoming || !track.src) return;
    a.loop = !!track.preview;
    if (!a.src) a.src = track.src;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  // drag del carrusel: proxy de puntero con umbral, como el Draggable del repo
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, lastX: e.clientX, moved: 0 };
    stageRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = e.clientX - d.lastX;
    d.lastX = e.clientX;
    d.moved = e.clientX - d.startX;
    angleRef.current.value += delta * 0.15;
    if (ringRef.current)
      ringRef.current.style.transform = `translateZ(${-radiusRef.current}px) rotateY(${angleRef.current.value}deg)`;
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (Math.abs(d.moved) > DRAG_THRESHOLD) {
      justDraggedRef.current = true;
      window.setTimeout(() => (justDraggedRef.current = false), 120);
      if (d.moved < 0) next();
      else prev();
    } else {
      spinTo(idx); // recentrar
    }
  };

  const wasDrag = () => justDraggedRef.current;

  const seekAt = (clientX: number) => {
    const a = audioRef.current;
    const el = railRef.current;
    if (!a || !el || !a.duration) return;
    const r = el.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * a.duration;
  };

  // colocar el anillo en su sitio al montar / cambiar radio
  useEffect(() => {
    if (ringRef.current)
      ringRef.current.style.transform = `translateZ(${-radius}px) rotateY(${angleRef.current.value}deg)`;
  }, [radius]);

  return (
    <div className="mp">
      <figure
        className="mp__stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="mp__ring" ref={ringRef}>
          {TRACKS.map((t, i) => (
            <button
              key={t.n}
              className={`mp__card${i === idx ? " is-current" : ""}${
                i === idx && playing ? " is-playing" : ""
              }${t.upcoming ? " is-upcoming" : ""}`}
              style={{
                transform: `rotateY(${i * STEP}deg) translateZ(${radius}px)`,
              }}
              onClick={() => {
                if (wasDrag()) return;
                if (i === idx) toggle();
                else go(i, true);
              }}
              aria-label={t.upcoming ? `${t.name} — ${t9.aria_card_soon}` : `${t9.aria_play} ${t.name}`}
            >
              <span
                className="mp__card-art"
                style={{ backgroundImage: `url(${COVER})` }}
                aria-hidden="true"
              >
                {/* ecualizador: late solo en la carta que está sonando */}
                {i === idx && playing && !t.upcoming && (
                  <span className="mp__card-eq">
                    <i /><i /><i /><i />
                  </span>
                )}
              </span>
              <span className="mp__card-n mono">{t.n}</span>
              <span className="mp__card-name disp">{t.name}</span>
              <span className="mp__card-tag mono">
                {t.upcoming
                  ? t9.tag_soon
                  : t.preview
                    ? t9.tag_preview
                    : `${t9.tag_demo}${counts ? ` · ▶ ${(counts[t.name as TrackId] ?? 0).toLocaleString("en-US")}` : ""}`}
              </span>
              <span className="mp__card-bar" />
            </button>
          ))}
        </div>
      </figure>

      <div className="mp__controls">
        <button className="mp__btn" onClick={prev} aria-label={t9.aria_prev}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="19 20 9 12 19 4" />
            <line x1="5" y1="4" x2="5" y2="20" />
          </svg>
        </button>
        <button
          className="mp__btn mp__btn--play"
          onClick={toggle}
          disabled={!!track.upcoming}
          aria-label={playing ? t9.aria_pause : t9.aria_play}
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
        <button className="mp__btn" onClick={next} aria-label={t9.aria_next}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20" />
            <line x1="19" y1="4" x2="19" y2="20" />
          </svg>
        </button>
      </div>

      <div className="mp__transport">
        <div
          className="mp__rail"
          ref={railRef}
          onPointerDown={(e) => {
            seekAt(e.clientX);
            const move = (ev: PointerEvent) => seekAt(ev.clientX);
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          <div className="mp__bar" ref={barRef}>
            <span className="mp__knob" />
          </div>
        </div>
        <span className="mp__time mono" ref={timeRef}>
          0:00 / 0:00
        </span>
        <div className="mp__vol">
          <button
            className="mp__vol-btn"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? t9.aria_unmute : t9.aria_mute}
          >
            {muted || vol <= 0 ? (
              // altavoz minimal, silenciado (x)
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
                <line x1="16" y1="9.5" x2="21" y2="14.5" />
                <line x1="21" y1="9.5" x2="16" y2="14.5" />
              </svg>
            ) : (
              // altavoz minimal con una sola onda
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              </svg>
            )}
          </button>
          <input
            className="mp__vol-slider"
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : vol}
            onChange={(e) => {
              setVol(parseFloat(e.target.value));
              setMuted(false);
            }}
            aria-label={t9.aria_volume}
          />
        </div>
      </div>
    </div>
  );
}
