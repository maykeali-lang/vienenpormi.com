// Conductor-lite de «Orgullo»: cada frame deriva progress / beatPhase /
// energy / section / stems del currentTime del audio + análisis pre-bakeado.
// Todo lo visual se anima contra estos valores (aguanta seek).

export type SectionType = "intro" | "verso" | "estribillo" | "puente" | "outro";

export type StemName = "drums" | "bass" | "guitar" | "voice";
export const STEM_NAMES: StemName[] = ["drums", "bass", "guitar", "voice"];

export interface StemData {
  /** RMS 0..1 por hop (mismo hop que energy) */
  env: number[];
  /** onsets [t, fuerza 0..1] — golpes del stem */
  onsets: [number, number][];
}

export interface Analysis {
  bpm: number;
  duration: number;
  hop: number;
  beats: number[];
  energy: number[];
  sections: { t: number; type: SectionType }[];
  /** curvas por stem del remaster 2026 (batería/bajo/guitarra/voz) */
  stems?: Record<StemName, StemData>;
}

export interface Frame {
  t: number;
  /** 0..1 sobre la duración total */
  progress: number;
  /** 0..1 entre beats (fase del pulso) */
  beatPhase: number;
  /** envelope RMS 0..1 en este instante (mix) */
  energy: number;
  /** sección actual */
  section: SectionType;
  /** nº de estribillos ya alcanzados (0..n) — nivel de orgullo determinista */
  prideLevel: number;
  /** energía 0..1 por stem (0 si el análisis no trae stems) */
  stem: Record<StemName, number>;
  /** pulso de golpe 0..1 por stem (decae tras cada onset; determinista) */
  hit: Record<StemName, number>;
  /** índice del último onset de batería disparado (para sembrar relámpagos) */
  drumHitIdx: number;
}

/** caída del pulso por stem (s hasta apagarse) */
const HIT_DECAY: Record<StemName, number> = {
  drums: 0.3,
  bass: 0.42,
  guitar: 0.38,
  voice: 0.5,
};

export async function loadAnalysis(url: string): Promise<Analysis> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar el análisis (${res.status})`);
  return (await res.json()) as Analysis;
}

/** muestreo lineal de un envelope por hops */
function sampleEnv(env: number[], t: number, hop: number): number {
  const fi = t / hop;
  const i0 = Math.min(env.length - 1, Math.max(0, Math.floor(fi)));
  const i1 = Math.min(env.length - 1, i0 + 1);
  return env[i0] + (env[i1] - env[i0]) * (fi - i0);
}

export class Conductor {
  private a: Analysis;
  private beatIdx = 0;
  private lastPride = 0;
  /** puntero incremental de onsets por stem (reset si hay seek atrás) */
  private onsetIdx: Record<StemName, number> = { drums: 0, bass: 0, guitar: 0, voice: 0 };
  /** callback al ENTRAR a un estribillo (sube el nivel de orgullo) */
  onEnterEstribillo: ((level: number) => void) | null = null;

  constructor(analysis: Analysis) {
    this.a = analysis;
  }

  get duration() {
    return this.a.duration;
  }
  get bpm() {
    return this.a.bpm;
  }

  /** nivel de orgullo determinista: estribillos con t <= tiempo actual */
  prideAt(t: number): number {
    let n = 0;
    for (const s of this.a.sections) if (s.type === "estribillo" && s.t <= t) n++;
    return n;
  }

  frame(t: number): Frame {
    const a = this.a;
    const clamped = Math.max(0, Math.min(t, a.duration));

    // beatPhase — puntero incremental con reset si hubo seek hacia atrás
    const beats = a.beats;
    if (this.beatIdx >= beats.length || beats[this.beatIdx] > clamped) this.beatIdx = 0;
    while (this.beatIdx < beats.length - 1 && beats[this.beatIdx + 1] <= clamped) this.beatIdx++;
    const b0 = beats[this.beatIdx] ?? 0;
    const b1 = beats[this.beatIdx + 1] ?? b0 + 60 / (a.bpm || 120);
    const beatPhase = b1 > b0 ? Math.min(1, (clamped - b0) / (b1 - b0)) : 0;

    // energy — muestreo del envelope del mix
    const energy = sampleEnv(a.energy, clamped, a.hop);

    // stems: energía continua + pulso de golpe con decay (determinista)
    const stem = { drums: 0, bass: 0, guitar: 0, voice: 0 } as Record<StemName, number>;
    const hit = { drums: 0, bass: 0, guitar: 0, voice: 0 } as Record<StemName, number>;
    let drumHitIdx = -1;
    if (a.stems) {
      for (const n of STEM_NAMES) {
        const s = a.stems[n];
        if (!s) continue;
        stem[n] = sampleEnv(s.env, clamped, a.hop);
        const on = s.onsets;
        let i = this.onsetIdx[n];
        if (i >= on.length || (i > 0 && on[i - 1][0] > clamped)) i = 0; // seek atrás
        while (i < on.length && on[i][0] <= clamped) i++;
        this.onsetIdx[n] = i;
        if (i > 0) {
          const [t0, k] = on[i - 1];
          const age = clamped - t0;
          const decay = HIT_DECAY[n];
          if (age < decay) hit[n] = k * (1 - age / decay);
          if (n === "drums") drumHitIdx = i - 1;
        }
      }
    }

    // sección actual
    let section: SectionType = "intro";
    for (const s of a.sections) {
      if (s.t <= clamped) section = s.type;
      else break;
    }

    const prideLevel = this.prideAt(clamped);
    if (prideLevel > this.lastPride && this.onEnterEstribillo) {
      this.onEnterEstribillo(prideLevel);
    }
    this.lastPride = prideLevel;

    return {
      t: clamped,
      progress: a.duration > 0 ? clamped / a.duration : 0,
      beatPhase,
      energy,
      section,
      prideLevel,
      stem,
      hit,
      drumHitIdx,
    };
  }
}

/** frame neutro (pantalla de carga, antes de tener análisis) */
export function idleFrame(): Frame {
  return {
    t: 0,
    progress: 0,
    beatPhase: 0,
    energy: 0.12,
    section: "intro",
    prideLevel: 0,
    stem: { drums: 0, bass: 0, guitar: 0, voice: 0 },
    hit: { drums: 0, bass: 0, guitar: 0, voice: 0 },
    drumHitIdx: -1,
  };
}
