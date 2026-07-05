// Escena standalone «04 · envidia» — Lion Mix, shooter cenital e-paper.
// Lazy-loaded desde /envidia. El canvas Three.js vive en game.ts; aquí va
// el shell: gate de inicio (desbloquea autoplay), crawl de apertura estilo
// Star Wars con el relato de los villanos, HUD marker-comic y finales.

import { useEffect, useRef, useState } from "react";
import { StemMixer, StemName, STEMS } from "./audio";
import { EnvidiaGame, EndResult, WaveInfo, PowerType } from "./game";
import { bumpPlay } from "../../state/plays";
import "./envidia.css";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
// «libreta» = el juego de nave; suena la canción libreta (mixdown, sin stems)
const MIX = `${BASE}/assets/songs/libreta/mixdown.mp3`;
const ART = `${BASE}/assets/envidia`;
const DURATION = 293; // s del mixdown de «libreta»
const BEST_KEY = "libreta-best";

// tabla de records GLOBAL (top 10): backend /api/scores (mismo microservicio
// vpm-plays que los plays/letterbox). Si el backend no está (dev/offline) cae
// a un top-10 local por dispositivo.
const SCORES_API = "/api/scores";
const SCORES_KEY = "libreta-scores";
interface ScoreRow {
  nick: string;
  score: number;
  ts: number;
}
function readLocalScores(): ScoreRow[] {
  try {
    const a = JSON.parse(localStorage.getItem(SCORES_KEY) || "[]");
    return Array.isArray(a) ? (a as ScoreRow[]) : [];
  } catch {
    return [];
  }
}
/** fallback local: inserta, ordena, recorta a 10 y devuelve lista + posición */
function saveLocalScore(nick: string, score: number): { list: ScoreRow[]; idx: number } {
  const row: ScoreRow = { nick: (nick || "anon").slice(0, 12), score, ts: Date.now() };
  const list = readLocalScores();
  list.push(row);
  list.sort((a, b) => b.score - a.score || a.ts - b.ts);
  const top = list.slice(0, 10);
  const idx = top.indexOf(row);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(top));
  } catch {
    /* almacenamiento no disponible */
  }
  return { list: top, idx };
}
const timeout = () => (AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined);
/** top-10 global (o local si el backend no responde) */
async function fetchScores(): Promise<ScoreRow[]> {
  try {
    const r = await fetch(SCORES_API, { headers: { Accept: "application/json" }, signal: timeout() });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.scores)) return j.scores as ScoreRow[];
    }
  } catch {
    /* sin backend */
  }
  return readLocalScores();
}
/** registra el record en el backend global (o local como fallback) */
async function submitScore(nick: string, score: number): Promise<{ list: ScoreRow[]; idx: number }> {
  try {
    const r = await fetch(SCORES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ nick, score }),
      signal: timeout(),
    });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.scores)) {
        return { list: j.scores as ScoreRow[], idx: typeof j.rank === "number" ? j.rank : -1 };
      }
    }
  } catch {
    /* sin backend */
  }
  return saveLocalScore(nick, score);
}

const POWER_LABEL: Record<PowerType, string> = {
  rapid: "» rapid fire",
  spread: "W triple shot",
  shield: "◈ shield up",
  life: "+ extra lives",
};

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Titan+One&family=Outfit:wght@400;500;700&display=swap";

// los "stems" del mixer son aquí los INSTRUMENTOS robados por los villanos
const STEM_META: Record<StemName, { label: string; color: string }> = {
  bass: { label: "bass", color: "#1E3F9E" },
  drum: { label: "drums", color: "#E8721C" },
  guitar: { label: "guitar", color: "#E0559A" },
  voice: { label: "mic", color: "#C1272D" },
};

// marcas de oleada sobre el raíl de progreso (t0 de cada mundo)
const WAVE_MARKS = [6, 88, 170, 252];

type Phase = "loading" | "ready" | "playing" | "error";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const fmtScore = (n: number) => n.toString().padStart(6, "0");

/** Lettering display estilo Lion Mix: Titan One con strokes apilados sin blur
 *  (violeta → amarillo → tinta → relleno rojo), paint-order stroke. */
function Lettering({
  text,
  className,
  fontSize = 140,
}: {
  text: string;
  className?: string;
  fontSize?: number;
}) {
  const layers = [
    { w: 0.3, c: "#4A2C82" },
    { w: 0.18, c: "#EFD93F" },
    { w: 0.085, c: "#1A1A1A" },
  ];
  const y = fontSize * 1.07;
  return (
    <svg
      className={`env-lettering ${className || ""}`}
      viewBox={`0 0 1000 ${Math.round(fontSize * 1.36)}`}
      aria-hidden="true"
    >
      {layers.map((l, i) => (
        <text
          key={i}
          x="500"
          y={y}
          textAnchor="middle"
          fontSize={fontSize}
          stroke={l.c}
          strokeWidth={fontSize * l.w}
          strokeLinejoin="round"
          fill="none"
        >
          {text}
        </text>
      ))}
      <text x="500" y={y} textAnchor="middle" fontSize={fontSize} fill="#C1272D">
        {text}
      </text>
    </svg>
  );
}

/** mini-nave a lápiz para el panel de vidas (glifo triangular, stroke 1.8) */
function LifeGlyph() {
  return (
    <svg className="env-life" viewBox="0 0 24 24">
      <path
        d="M12 3 L20 20 L12 15.5 L4 20 Z"
        fill="none"
        stroke="#3A3A3E"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MAX_LIVES = 12; // debe coincidir con MAX_LIVES de game.ts (dificultad subida)

export default function EnvidiaScene() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY)) || 0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [mult, setMult] = useState(1);
  const [wave, setWave] = useState<WaveInfo | null>(null);
  const [recovered, setRecovered] = useState<Set<StemName>>(new Set());
  const [bossHp, setBossHp] = useState<number | null>(null);
  const [ending, setEnding] = useState<EndResult | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [overlayHidden, setOverlayHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const [crawl, setCrawl] = useState(false);
  const [crawlLeaving, setCrawlLeaving] = useState(false);
  // fin de la CANCIÓN → tabla de records (top 10) + entrada de nick
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [nick, setNick] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [myIdx, setMyIdx] = useState(-1);
  const [powerToast, setPowerToast] = useState<PowerType | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const gameRef = useRef<EnvidiaGame | null>(null);
  const mixerRef = useRef<StemMixer | null>(null);
  const crawlTimers = useRef<number[]>([]);
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;
  const endingRef = useRef<EndResult | null>(null);
  endingRef.current = ending;

  useEffect(() => {
    document.title = "VIENEN POR MI — Libreta";
    // fuentes del juego (Titan One display + Outfit UI)
    if (!document.querySelector(`link[href="${FONTS_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONTS_HREF;
      document.head.appendChild(link);
    }

    const mixer = new StemMixer();
    mixerRef.current = mixer;
    const game = new EnvidiaGame(stageRef.current!, ART, mixer, {
      onScore: setScore,
      onLives: setLives,
      onMult: setMult,
      onWave: setWave,
      onStemRecovered: (s) =>
        setRecovered((prev) => {
          const next = new Set(prev);
          next.add(s);
          return next;
        }),
      onBossHp: setBossHp,
      onProgress: (f) => {
        if (progressRef.current) progressRef.current.style.width = `${(f * 100).toFixed(2)}%`;
        if (timeRef.current) timeRef.current.textContent = fmtTime(f * DURATION);
      },
      onEnd: (result, final) => {
        setEnding(result);
        setOverlayHidden(false);
        // el score al terminar la partida ya queda disponible para registrar
        // el récord DESDE la tarjeta de muerte (sin esperar al final del tema)
        setFinalScore(final);
        void fetchScores().then(setScores);
        const prev = Number(localStorage.getItem(BEST_KEY)) || 0;
        if (final > prev) {
          localStorage.setItem(BEST_KEY, String(final));
          setBest(final);
          setNewBest(true);
        }
      },
      // la canción terminó (aunque hubieras ganado y siguieras escuchando):
      // se abre la tabla de records para registrar el nick
      onSongEnd: (final) => {
        setFinalScore(final);
        setPaused(false);
        setFinished(true);
        void fetchScores().then(setScores);
      },
      onPowerup: (kind) => setPowerToast(kind),
    });
    gameRef.current = game;

    let cancelled = false;
    Promise.all([mixer.loadMix(MIX), game.load()])
      .then(() => {
        if (!cancelled) setPhase("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setPhase("error");
      });

    // pestaña oculta = pausa (la partida está atada al reloj de la canción)
    const onVis = () => {
      if (document.hidden && phaseRef.current === "playing" && !endingRef.current) {
        gameRef.current?.setPaused(true);
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      crawlTimers.current.forEach(clearTimeout);
      game.dispose();
      mixer.dispose();
    };
  }, []);

  const play = async () => {
    const game = gameRef.current!;
    const mixer = mixerRef.current!;
    setPhase("playing");
    // crawl de apertura: el relato (corto) cae MUY lento para leerse con
    // calma (~27 s); el juego corre detrás y nadie dispara hasta que se va
    setCrawl(true);
    crawlTimers.current = [
      window.setTimeout(() => setCrawlLeaving(true), 26000),
      window.setTimeout(() => setCrawl(false), 27000),
    ];
    game.start();
    try {
      await mixer.start();
      void bumpPlay("libreta"); // contador global de reproducciones
    } catch {
      setError("The browser blocked audio; reload and try again.");
      setPhase("error");
    }
  };

  const skipCrawl = () => {
    crawlTimers.current.forEach(clearTimeout);
    setCrawlLeaving(true);
    crawlTimers.current = [window.setTimeout(() => setCrawl(false), 450)];
  };

  const resume = () => {
    gameRef.current?.setPaused(false);
    setPaused(false);
  };

  const submittingRef = useRef(false);
  const register = async () => {
    if (submittingRef.current || submitted) return; // evita doble registro (Enter + click)
    submittingRef.current = true;
    const { list, idx } = await submitScore(nick.trim(), finalScore);
    setScores(list);
    setMyIdx(idx);
    setSubmitted(true);
  };

  // el aviso de power-up se borra solo tras ~1.6 s
  useEffect(() => {
    if (!powerToast) return;
    const id = window.setTimeout(() => setPowerToast(null), 1600);
    return () => clearTimeout(id);
  }, [powerToast]);

  // top-10 global para mostrarlo en el inicio del juego (y de fondo se
  // refresca al terminar la canción)
  useEffect(() => {
    void fetchScores().then(setScores);
  }, []);

  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  return (
    <div className="env-root">
      <div className="env-stage" ref={stageRef} />
      {/* grano de papel: un solo pase multiplicado sobre TODO el frame */}
      <div className="env-grain" aria-hidden="true" />

      {phase === "playing" && (
        <div className="env-hud">
          <div className="env-hud__top">
            <div className="env-panel env-panel--score">
              <span className="env-panel__label">score</span>
              <span className="env-panel__value">{fmtScore(score)}</span>
              <span className="env-panel__sub">best {fmtScore(best)}</span>
            </div>

            <div className="env-hud__center">
              <Lettering text="LION MIX × VIENEN POR MI" fontSize={58} className="env-brand" />
              {bossHp !== null && (
                <div className="env-boss">
                  <span className="env-boss__name">CAPO — The Murmur</span>
                  <div className="env-boss__bar">
                    <div className="env-boss__fill" style={{ width: `${bossHp * 100}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="env-hud__right">
              <div className="env-panel env-panel--lives">
                <div className="env-panel__row">
                  <span className="env-panel__label">lives</span>
                  <span className="env-panel__count">
                    <LifeGlyph /> {lives}/{MAX_LIVES}
                  </span>
                </div>
                <div className="env-lifebar">
                  {Array.from({ length: MAX_LIVES }, (_, i) => (
                    <span key={i} className={`env-lifebar__cell${i < lives ? " on" : ""}`} />
                  ))}
                </div>
              </div>
              <div className={`env-mult${mult > 1 ? " is-hot" : ""}`} title="no-damage streak">
                ×{mult}
              </div>
            </div>
          </div>

          {wave && (
            <div className="env-wave" key={wave.title}>
              <Lettering text={wave.world} className="env-wave__world" />
              <div className="env-wave__name">{wave.title}</div>
              <div className="env-wave__stem">
                {wave.villain === "capo" ? `has ${wave.stemLabel} — don't let him escape` : `stole ${wave.stemLabel}`}
              </div>
            </div>
          )}

          <div className="env-hud__bottom">
            <div className="env-stems">
              {STEMS.map((s) => (
                <span
                  key={s}
                  className={`env-stem${recovered.has(s) ? " is-back" : ""}`}
                  style={{ ["--stem" as string]: STEM_META[s].color }}
                >
                  {STEM_META[s].label}
                </span>
              ))}
            </div>
            <div className="env-clock mono">
              <span ref={timeRef}>0:00</span> / {fmtTime(DURATION)}
            </div>
          </div>

          <div className="env-progress">
            <div className="env-progress__fill" ref={progressRef} />
            {WAVE_MARKS.map((t) => (
              <span key={t} className="env-progress__mark" style={{ left: `${(t / DURATION) * 100}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* aviso breve de power-up atrapado */}
      {powerToast && phase === "playing" && (
        <div className="env-toast mono" key={powerToast}>
          {POWER_LABEL[powerToast]}
        </div>
      )}

      {/* crawl de apertura: el relato de los villanos cae en perspectiva
          estilo Star Wars mientras suena el intro; clic o «saltar» lo cierra */}
      {crawl && phase === "playing" && (
        <div className={`env-crawl${crawlLeaving ? " is-leaving" : ""}`} onClick={skipCrawl}>
          <div className="env-crawl__persp">
            <div className="env-crawl__text">
              <p className="env-crawl__ep mono">vienen x mi presents</p>
              <Lettering text="LIBRETA" className="env-crawl__title" />
              <p>
                Four villains — pure envy — stole the band's instruments: the bass, the drums,
                the guitar and the mic.
              </p>
              <p>
                The song can't be silenced. Take everything back before it ends. Don't let
                anyone escape.
              </p>
            </div>
          </div>
          <button className="env-crawl__skip mono" onClick={skipCrawl}>
            skip ▸
          </button>
        </div>
      )}

      {phase === "loading" && <div className="env-veil mono">sharpening the pencil…</div>}

      {phase === "error" && (
        <div className="env-veil mono">
          {error}
          <button className="env-btn" onClick={() => window.location.reload()}>
            retry
          </button>
        </div>
      )}

      {phase === "ready" && (
        <div className="env-gate">
          <div className="env-gate__brand">
            <Lettering text="LION MIX × VIENEN POR MI" fontSize={58} />
          </div>
          <Lettering text="LIBRETA" className="env-gate__title" />
          <p className="env-gate__tag">
            the villains — pure envy — <b>stole the band's instruments</b>: the bass, the drums,
            the guitar and the mic.
            <br />
            shoot down each thief and catch the instrument it drops — the song plays whole and
            the run lasts exactly one song.
          </p>
          <button className="env-btn env-btn--big" onClick={play}>
            play · {fmtTime(DURATION)}
          </button>
          <p className="env-gate__keys mono">
            {coarse ? "drag to fly · the pencil fires on its own" : "wasd / arrows to float · space to shoot"}
          </p>

          {/* top-10 GLOBAL en el inicio del juego */}
          <div className="env-gate__records">
            <span className="env-gate__records-h mono">records · top 10</span>
            <ol className="env-lb__list env-lb__list--gate mono">
              {scores.length === 0 && <li className="env-lb__empty">no records yet — be the first</li>}
              {scores.map((r, i) => (
                <li key={`${r.ts}-${i}`} className="env-lb__row">
                  <span className="env-lb__rank">{String(i + 1).padStart(2, "0")}</span>
                  <span className="env-lb__who">{r.nick}</span>
                  <span className="env-lb__pts">{fmtScore(r.score)}</span>
                </li>
              ))}
            </ol>
          </div>

          <a className="env-gate__back mono" href={`${BASE}/` || "/"}>
            ← vienen por mi
          </a>
        </div>
      )}

      {paused && phase === "playing" && !ending && (
        <button className="env-veil env-veil--btn mono" onClick={resume}>
          paused — tap to continue
        </button>
      )}

      {ending && !overlayHidden && !finished && (
        <div className="env-end">
          <Lettering
            text={ending === "victory" ? "IT'S YOURS!" : ending === "defeat" ? "ERASED" : "HE GOT AWAY…"}
            className="env-end__title"
          />
          <p className="env-end__msg">
            {ending === "victory" &&
              "you beat CAPO and the mic came home: the band gets its own back. let the song play out."}
            {ending === "defeat" &&
              "envy un-drew your ship. the song keeps playing — the show stops for no one."}
            {ending === "escape" && "the song ended and CAPO got away with the mic. envy survives."}
          </p>
          <div className="env-end__score mono">
            score {fmtScore(score)}
            {newBest ? " · new record!" : ` · best ${fmtScore(best)}`}
          </div>

          {/* registro del récord DIRECTO en la tarjeta de muerte: guarda tu
              nick al instante, sin tener que esperar al final de la canción */}
          {!submitted ? (
            <div className="env-lb__entry env-lb__entry--end">
              <span className="env-lb__entry-h mono">register your record</span>
              <div className="env-lb__form">
                <input
                  className="env-lb__nick mono"
                  value={nick}
                  maxLength={12}
                  placeholder="your nick"
                  onChange={(e) => setNick(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") register();
                  }}
                />
                <button className="env-btn" onClick={register}>
                  register record
                </button>
              </div>
            </div>
          ) : (
            <div className="env-end__score mono">
              {myIdx >= 0 ? `saved ✓ · you're #${myIdx + 1}` : "saved ✓ — not in the top 10"}
            </div>
          )}

          <div className="env-end__row">
            {ending === "victory" && (
              <button className="env-btn" onClick={() => setOverlayHidden(true)}>
                keep listening
              </button>
            )}
            <button className="env-btn" onClick={() => window.location.reload()}>
              play again
            </button>
            <a className="env-gate__back mono" href={`${BASE}/` || "/"}>
              ← vienen por mi
            </a>
          </div>
        </div>
      )}

      {/* fin de la canción: tabla de records (top 10) + registro de nick */}
      {finished && (
        <div className="env-end env-lb">
          <Lettering text="TOP 10" className="env-end__title" />
          {!submitted ? (
            <div className="env-lb__entry">
              <div className="env-end__score mono">your score · {fmtScore(finalScore)}</div>
              <div className="env-lb__form">
                <input
                  className="env-lb__nick mono"
                  value={nick}
                  maxLength={12}
                  placeholder="your nick"
                  autoFocus
                  onChange={(e) => setNick(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") register();
                  }}
                />
                <button className="env-btn" onClick={register}>
                  register record
                </button>
              </div>
            </div>
          ) : (
            <div className="env-end__score mono">
              {myIdx >= 0 ? `you're #${myIdx + 1}` : "not in the top 10 — keep trying"}
            </div>
          )}
          <ol className="env-lb__list mono">
            {scores.length === 0 && <li className="env-lb__empty">no records yet — be the first</li>}
            {scores.map((r, i) => (
              <li
                key={`${r.ts}-${i}`}
                className={`env-lb__row${submitted && i === myIdx ? " is-me" : ""}`}
              >
                <span className="env-lb__rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="env-lb__who">{r.nick}</span>
                <span className="env-lb__pts">{fmtScore(r.score)}</span>
              </li>
            ))}
          </ol>
          <div className="env-end__row">
            <button className="env-btn" onClick={() => window.location.reload()}>
              play again
            </button>
            <a className="env-gate__back mono" href={`${BASE}/` || "/"}>
              ← vienen por mi
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
