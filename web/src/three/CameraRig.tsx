import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import { useApp } from "../state/store";

const damp = THREE.MathUtils.damp;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Director de camara "en vivo" (multicam). Recorre una secuencia de planos:
 * orbita amplia del escenario + close-ups de cada integrante, cortando por
 * fases musicales (cada N compases). Todo derivado del conductor: sin keyframes.
 */
interface Shot {
  /** posicion de camara; t = segundos del tema */
  pos: (t: number) => THREE.Vector3;
  /** punto al que mira */
  look: THREE.Vector3;
  /** amplitud de "handheld" (cama al hombro) */
  handheld: number;
  /** corte duro al entrar (true) o glide suave (false) */
  cut: boolean;
}

// Posiciones de los integrantes (coinciden con config/song BAND).
const GUI = V(-2.5, 0, 0.4); // guitarrista
const BAS = V(2.5, 0, 0.4); // bajista/voz
const DRU = V(0, 0, -1.6); // baterista

const SHOTS: Shot[] = [
  // 0 — Plano general orbitando
  {
    pos: (t) => V(Math.sin(t * 0.16) * 7.6, 2.4 + Math.sin(t * 0.3) * 0.25, Math.cos(t * 0.16) * 7.6),
    look: V(0, 1.2, -0.3),
    handheld: 0.04,
    cut: false,
  },
  // 1 — Close-up guitarrista
  {
    pos: () => V(GUI.x + 1.3, 1.55, GUI.z + 2.2),
    look: V(GUI.x, 1.45, GUI.z),
    handheld: 0.06,
    cut: true,
  },
  // 2 — Plano general bajo (hero)
  {
    pos: (t) => V(Math.sin(t * 0.1 + 2) * 3.5, 0.7, 5.8),
    look: V(0, 1.4, -0.4),
    handheld: 0.05,
    cut: true,
  },
  // 3 — Close-up baterista
  {
    pos: () => V(0, 1.95, DRU.z + 3.4),
    look: V(0, 1.75, DRU.z + 0.4),
    handheld: 0.05,
    cut: true,
  },
  // 4 — Close-up bajista / voz
  {
    pos: () => V(BAS.x - 1.3, 1.55, BAS.z + 2.2),
    look: V(BAS.x, 1.5, BAS.z),
    handheld: 0.06,
    cut: true,
  },
  // 5 — Travelling lateral amplio
  {
    pos: (t) => V(THREE.MathUtils.clamp(Math.sin(t * 0.12) * 6, -6, 6), 1.8, 6.2),
    look: V(0, 1.3, -0.5),
    handheld: 0.05,
    cut: false,
  },
  // 6 — POV desde el publico (sobre las cabezas, hacia el escenario)
  {
    pos: (t) => V(Math.sin(t * 0.09) * 1.6, 1.05, 8.6),
    look: V(0, 1.4, -1),
    handheld: 0.07,
    cut: true,
  },
  // 7 — Dolly bajo cruzando el frente del escenario
  {
    pos: (t) => V(THREE.MathUtils.clamp(Math.sin(t * 0.2) * 3.2, -3.2, 3.2), 0.5, 4.4),
    look: V(0, 1.25, -0.6),
    handheld: 0.05,
    cut: false,
  },
  // 8 — Detalle del ampli «JAKE» (guitarra)
  {
    pos: () => V(GUI.x - 0.9, 1.0, GUI.z + 1.0),
    look: V(-4.2, 0.7, -1.4),
    handheld: 0.05,
    cut: true,
  },
  // 9 — Grua alta sobre la banda
  {
    pos: (t) => V(Math.sin(t * 0.13) * 2.4, 5.4, 4.2),
    look: V(0, 1.0, -1),
    handheld: 0.04,
    cut: true,
  },
  // 10 — Picado cerrado sobre la bateria
  {
    pos: () => V(0.2, 3.0, DRU.z + 1.8),
    look: V(0, 0.9, DRU.z),
    handheld: 0.05,
    cut: true,
  },
];

const BARS_PER_SHOT = 3; // cambia de plano cada 3 compases (mas transiciones)
// Distancia extra para alejar TODAS las tomas (estaban demasiado cerca).
const PULLBACK = 3.2;

export function CameraRig() {
  const { camera, pointer } = useThree();
  const prevIdx = useRef(-1);
  const curTarget = useRef(V(0, 1.2, 0));
  const tmp = useRef(new THREE.Vector3());

  useFrame((_, dtRaw) => {
    // Durante el «warp» o la cámara libre, el rig no controla la cámara.
    const st = useApp.getState();
    if (st.warp || st.freeCam) return;
    const dt = Math.min(dtRaw, 1 / 30);
    const f = conductor.frame;
    const env = conductor.env;
    const t = f.t;

    // --- Seleccion de plano por compas ---
    const bpm = env?.bpm ?? 120;
    const beatOffset = env?.beatOffset ?? 0;
    const barDur = (60 / bpm) * 4;
    const bar = Math.floor((t - beatOffset) / barDur);
    let idx = Math.floor(bar / BARS_PER_SHOT) % SHOTS.length;
    if (idx < 0) idx = 0;
    // Antes de empezar (idle) plano general; en PAUSA conservamos el plano
    // actual (t congelado) para que la camara no salte ni derive.
    if (!f.playing && !f.paused) idx = 0;

    const shot = SHOTS[idx];

    // --- Posicion deseada ---
    const desired = tmp.current.copy(shot.pos(t));
    // handheld sutil
    desired.x += Math.sin(t * 1.7) * shot.handheld;
    desired.y += Math.cos(t * 1.3) * shot.handheld * 0.7;
    // parallax con el raton (PC)
    desired.x += pointer.x * 0.5;
    desired.y += pointer.y * 0.3;
    // Alejar TODOS los planos (estaban muy cerca) + "punch" de dolly en el kick
    const dir = desired.clone().sub(shot.look).normalize();
    desired.addScaledVector(dir, PULLBACK - f.pulse.kick * 0.25);

    if (idx !== prevIdx.current) {
      // corte / nuevo plano
      if (shot.cut) {
        camera.position.copy(desired);
        curTarget.current.copy(shot.look);
      }
      prevIdx.current = idx;
    }

    const rate = shot.cut ? 7 : 3.2;
    camera.position.x = damp(camera.position.x, desired.x, rate, dt);
    camera.position.y = damp(camera.position.y, desired.y, rate, dt);
    camera.position.z = damp(camera.position.z, desired.z, rate, dt);

    curTarget.current.x = damp(curTarget.current.x, shot.look.x, 5, dt);
    curTarget.current.y = damp(curTarget.current.y, shot.look.y, 5, dt);
    curTarget.current.z = damp(curTarget.current.z, shot.look.z, 5, dt);
    camera.lookAt(curTarget.current);
  });

  return null;
}
