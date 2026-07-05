import { create } from "zustand";

export type Phase = "idle" | "loading" | "ready" | "playing" | "ended" | "error";

const PLAYS_KEY = "vpm.libreta.plays";

/** Lee el contador de reproducciones persistido (por dispositivo). */
function readPlays(): number {
  try {
    const v = parseInt(localStorage.getItem(PLAYS_KEY) || "0", 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

interface AppState {
  phase: Phase;
  error: string | null;
  muted: boolean;
  volume: number;
  /** info expuesta para HUD (no se usa para animar) */
  bpm: number;
  duration: number;
  /** reproducciones del tema (persistidas en este dispositivo) */
  plays: number;
  /** escena «warp tunnel» activa (cambio de escena del instrumental) */
  warp: boolean;
  setWarp: (w: boolean) => void;
  /** cámara libre: el visitante explora el mapa con el ratón/dedo */
  freeCam: boolean;
  toggleFreeCam: () => void;
  /** hoja del set list abierta (overlay) */
  setlistOpen: boolean;
  setSetlistOpen: (o: boolean) => void;
  /** hero de entrada (scroll cinemático) ya cerrado */
  heroDone: boolean;
  setHeroDone: (v: boolean) => void;
  /** portfolio/about de la banda abierto */
  aboutOpen: boolean;
  setAboutOpen: (v: boolean) => void;
  setPhase: (p: Phase) => void;
  setError: (e: string | null) => void;
  setMeta: (m: { bpm: number; duration: number }) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  /** fija el contador (lo gestiona state/plays.ts: backend global o local) */
  setPlays: (n: number) => void;
}

export const useApp = create<AppState>((set) => ({
  phase: "idle",
  error: null,
  muted: false,
  volume: 1,
  bpm: 0,
  duration: 0,
  plays: readPlays(),
  warp: false,
  setWarp: (warp) => set({ warp }),
  freeCam: false,
  toggleFreeCam: () => set((s) => ({ freeCam: !s.freeCam })),
  setlistOpen: false,
  setSetlistOpen: (setlistOpen) => set({ setlistOpen }),
  heroDone: false,
  setHeroDone: (heroDone) => set({ heroDone }),
  aboutOpen: false,
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error, phase: error ? "error" : "idle" }),
  setMeta: (m) => set({ bpm: m.bpm, duration: m.duration }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setVolume: (v) => set({ volume: v, muted: v <= 0 }),
  setPlays: (n) => set({ plays: Math.max(0, Math.floor(n)) }),
}));
