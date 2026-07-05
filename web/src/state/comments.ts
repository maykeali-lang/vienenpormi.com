// Letterbox del About (backend /api/comments, mismo servicio vpm-plays):
// cualquiera puede dejar una nota con nick o anónima; quedan guardadas en el
// servidor y visibles para todos. Sin backend (dev/offline) simplemente no
// se muestra la lista y el envío falla en silencio.

export interface Note {
  id: number;
  nick: string | null;
  text: string;
  ts: number;
}

const API = "/api/comments";
export const NICK_MAX = 24;
export const TEXT_MAX = 280;

async function hit(method: "GET" | "POST", body?: unknown): Promise<Note[] | null> {
  try {
    const r = await fetch(API, {
      method,
      headers: body
        ? { Accept: "application/json", "Content-Type": "application/json" }
        : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { comments?: Note[] };
    return Array.isArray(j.comments) ? j.comments : null;
  } catch {
    return null;
  }
}

/** Lee todas las notas (nuevas primero). */
export function fetchNotes(): Promise<Note[] | null> {
  return hit("GET");
}

/** Deja una nota; nick vacío = anónima. Devuelve la lista actualizada. */
export function postNote(nick: string, text: string): Promise<Note[] | null> {
  return hit("POST", { nick: nick.slice(0, NICK_MAX), text: text.slice(0, TEXT_MAX) });
}
