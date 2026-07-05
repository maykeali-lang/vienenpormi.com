// Letra diegética de «Orgullo» — timestamps entregados por la banda en
// public/assets/songs/orgullo/orgullo letra.txt (medidos sobre el master
// viejo; se corrigen con REMASTER_OFFSET al exportar). Ajustar t si hace falta.

import { REMASTER_OFFSET } from "./theme";

export type LyricPlacement = "vela" | "ola" | "banderin" | "faro" | "cielo";

export interface LyricLine {
  /** momento de aparición (s) */
  t: number;
  text: string;
  place: LyricPlacement;
  /** cuánto queda visible (s); por defecto hasta 1 s antes de la siguiente línea */
  hold?: number;
  /** énfasis dorado (palabras-orgullo) */
  gold?: boolean;
}

const RAW: LyricLine[] = [
  // verso I
  { t: 16, text: "ya no aguanto la presión", place: "ola" },
  { t: 20, text: "de tus ojos sobre mi espalda", place: "cielo" },
  { t: 23, text: "todos los consejos que me das", place: "ola" },
  { t: 27, text: "son opacados por tu arrogancia", place: "cielo" },
  // coro I
  { t: 30, text: "ya… no estaré", place: "vela" },
  { t: 33, text: "en este lugar", place: "vela" },
  { t: 37, text: "pues si hago", place: "ola" },
  { t: 39, text: "o no hago", place: "ola" },
  { t: 40.5, text: "ya ni estorbo", place: "ola" },
  { t: 44, text: "ya", place: "cielo" },
  { t: 45, text: "no estaré", place: "cielo" },
  { t: 47, text: "en ese lugar", place: "cielo" },
  { t: 51, text: "maldito", place: "banderin" },
  { t: 55, text: "ORGULLO", place: "cielo", gold: true, hold: 5 },
  // verso II
  { t: 73, text: "ya no aguanto", place: "ola" },
  { t: 76, text: "de tus ojos sobre mi espalda", place: "cielo" },
  { t: 80, text: "todos los consejos que me das", place: "ola" },
  { t: 83, text: "son opacados por tu arrogancia", place: "cielo" },
  // coro II
  { t: 90, text: "ya… no estaré", place: "vela" },
  { t: 93, text: "en este lugar", place: "vela" },
  { t: 97, text: "pues si hago", place: "ola" },
  { t: 98.5, text: "o no hago", place: "ola" },
  { t: 100, text: "ya ni estorbo", place: "ola" },
  { t: 104, text: "ya", place: "cielo" },
  { t: 106, text: "no estaré", place: "cielo" },
  { t: 107.5, text: "en este lugar", place: "cielo" },
  { t: 111, text: "maldito", place: "banderin" },
  { t: 115, text: "ORGULLO", place: "cielo", gold: true, hold: 5 },
  // coro final (tras el solo)
  { t: 189, text: "ya… no estaré", place: "faro", hold: 3 },
  { t: 192, text: "en este lugar", place: "faro", hold: 6 },
];

// timestamps al tiempo del remaster 2026
export const ORGULLO_LYRICS: LyricLine[] = RAW.map((l) => ({ ...l, t: l.t + REMASTER_OFFSET }));

/**
 * Ancla cada línea al onset de VOZ más creíble cerca de su timestamp — la
 * banda midió la letra a oído, pero el stem manda: así la letra cae AL
 * COMPÁS de lo cantado (diegética de verdad) y no un pelo tarde.
 * `onsets` = [t, fuerza 0..1] del análisis pre-bakeado.
 */
export function alignLyricsToVoice(
  lines: LyricLine[],
  onsets: [number, number][] | undefined,
): LyricLine[] {
  if (!onsets?.length) return lines;
  const LEAD = 0.12; // la letra entra un pelín antes del ataque (se lee mejor)
  const out = lines.map((l) => {
    let best: number | null = null;
    let bestScore = 0.1; // exige un mínimo: si no hay onset creíble, se queda
    for (const [t, k] of onsets) {
      if (t < l.t - 1.2) continue;
      if (t > l.t + 0.9) break;
      const score = k - Math.abs(t - l.t) * 0.35; // fuerza − lejanía
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best != null ? { ...l, t: Math.round((best - LEAD) * 100) / 100 } : l;
  });
  // dos líneas no pueden anclarse al mismo instante: mantiene el orden
  for (let i = 1; i < out.length; i++) {
    if (out[i].t < out[i - 1].t + 0.2) out[i] = { ...out[i], t: out[i - 1].t + 0.2 };
  }
  return out;
}
