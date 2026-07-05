// Hooks de integracion del conductor con React.
import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { conductor } from "./conductor";
import { SONG, INSTRUMENTAL_WARP } from "../config/song";
import { useApp } from "../state/store";
import { recordPlay } from "../state/plays";

/** Carga (idempotente) envelopes + mixdown y publica metadata. */
export function useLoadSong() {
  const setPhase = useApp((s) => s.setPhase);
  const setError = useApp((s) => s.setError);
  const setMeta = useApp((s) => s.setMeta);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    const base = import.meta.env.BASE_URL || "/";
    const j = (p: string) => `${base}${p}`.replace(/\/{2,}/g, "/");
    conductor
      .load(j(SONG.envelopes), {
        mp3: j(SONG.audio.mp3),
        ogg: j(SONG.audio.ogg),
      })
      .then(() => {
        if (cancelled) return;
        if (conductor.env) {
          setMeta({
            bpm: conductor.env.bpm,
            duration: conductor.env.duration,
          });
        }
        setPhase("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error(e);
        setError(e instanceof Error ? e.message : "Error al cargar el audio");
      });
    return () => {
      cancelled = true;
    };
  }, [setPhase, setError, setMeta]);
}

/** Arranca el audio tras el gesto del usuario ("Entrar"). */
export async function enter() {
  const { setPhase, setError } = useApp.getState();
  try {
    await conductor.start();
    void recordPlay();
    setPhase("playing");
  } catch (e) {
    setError(e instanceof Error ? e.message : "No se pudo iniciar el audio");
  }
}

/**
 * Coloca el "tick" del conductor al PRINCIPIO del loop de render, con prioridad
 * negativa, para que todos los demas useFrame lean un frame ya actualizado.
 */
export function useConductorTick() {
  const setPhase = useApp((s) => s.setPhase);
  useFrame(() => {
    conductor.update();
    const f = conductor.frame;
    const st = useApp.getState();
    if (f.ended) {
      // marcar fin una sola vez
      if (st.phase === "playing") setPhase("ended");
    }
    // Cambio de escena al «warp tunnel» a mitad del instrumental y vuelta.
    const inWindow =
      (f.playing || f.paused) &&
      f.t >= INSTRUMENTAL_WARP.start &&
      f.t < INSTRUMENTAL_WARP.end;
    if (inWindow !== st.warp) st.setWarp(inWindow);
  }, -1);
}
