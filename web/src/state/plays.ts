// Contador de reproducciones GLOBAL por tema (backend /api/plays, servicio
// vpm-plays en el servidor): cualquier usuario que reproduzca un tema suma,
// tanto en modo experience como en el music player. Si el backend no está
// (dev sin servidor, offline) cae a localStorage por dispositivo.
import { useApp } from "./store";

// "orgullo-exp" = la experiencia /orgullo (contador propio, separado del
// "orgullo" que suma el music player)
export type TrackId = "outro" | "intro" | "libreta" | "orgullo" | "orgullo-exp" | "envidia" | "ira";
export type PlayCounts = Record<TrackId, number>;

const API = "/api/plays";
const LS = "vpm.libreta.plays"; // fallback local (histórico: solo libreta)

function readLocal(): number {
  try {
    const v = parseInt(localStorage.getItem(LS) || "0", 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}

function writeLocal(n: number) {
  try {
    localStorage.setItem(LS, String(n));
  } catch {
    /* almacenamiento no disponible (modo privado) */
  }
}

/** Indica si el último dato mostrado vino del backend global. */
let global = false;
export function isGlobal() {
  return global;
}

async function hit(url: string, method: "GET" | "POST"): Promise<PlayCounts | null> {
  try {
    const r = await fetch(url, {
      method,
      headers: { Accept: "application/json" },
      // corta esperas largas si el backend no responde
      signal: AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { plays?: PlayCounts };
    return j.plays && typeof j.plays === "object" ? j.plays : null;
  } catch {
    return null;
  }
}

/** Lee todos los contadores. */
export function fetchPlays(): Promise<PlayCounts | null> {
  return hit(API, "GET");
}

/** Suma una reproducción GLOBAL al tema (fire-and-forget para las escenas). */
export function bumpPlay(track: TrackId): Promise<PlayCounts | null> {
  return hit(`${API}/${track}`, "POST");
}

/** Lee el contador al cargar (global si hay backend; si no, local).
 *  El store del modo experience muestra el contador de «ira» (el directo). */
export async function syncPlays() {
  const p = await fetchPlays();
  if (p) {
    global = true;
    useApp.getState().setPlays(p.ira ?? 0);
  } else {
    global = false;
    useApp.getState().setPlays(readLocal());
  }
}

/** Suma una reproducción de «ira» (modo experience: entrar / replay). */
export async function recordPlay() {
  const p = await bumpPlay("ira");
  if (p) {
    global = true;
    useApp.getState().setPlays(p.ira ?? 0);
    return;
  }
  // sin backend: contamos en local
  global = false;
  const local = readLocal() + 1;
  writeLocal(local);
  useApp.getState().setPlays(local);
}
