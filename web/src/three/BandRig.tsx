import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import type { InstrumentName } from "../config/song";
import { InstrumentGLB, MODELS } from "./models";

// Los integrantes de la banda ya no son personajes animados: cada uno es un
// CÚMULO de partículas en movimiento detrás de su instrumento, que emite luz
// al ritmo de su stem. Todos los cúmulos son del MISMO color (luz de escenario).
const CLUSTER_COLOR = "#ffdca6";

/**
 * Cúmulo de partículas (un integrante). Gira y respira; su point light y el
 * brillo de las partículas laten con la energía/golpes de sus stems.
 */
function ParticleCluster({
  position,
  reactKeys,
  count = 180,
  radius = 0.85,
}: {
  position: [number, number, number];
  reactKeys: InstrumentName[];
  count?: number;
  radius?: number;
}) {
  const grp = useRef<THREE.Group>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const light = useRef<THREE.PointLight>(null!);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // distribución esférica con densidad hacia el centro (cbrt)
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = radius * Math.cbrt(Math.random());
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 1.2;
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count, radius]);

  useFrame((state, dt) => {
    let e = 0;
    let p = 0;
    for (const k of reactKeys) {
      e = Math.max(e, conductor.frame.energy[k]);
      p = Math.max(p, conductor.frame.pulse[k]);
    }
    const lvl = Math.min(1, e * 1.9 + p * 1.7);
    const tt = state.clock.elapsedTime;
    if (grp.current) {
      grp.current.rotation.y += dt * 0.28;
      grp.current.rotation.x = Math.sin(tt * 0.4) * 0.14;
      grp.current.scale.setScalar(1 + lvl * 0.2 + Math.sin(tt * 1.4) * 0.02);
    }
    if (mat.current) {
      mat.current.size = 0.075 + lvl * 0.08;
      mat.current.opacity = 0.4 + lvl * 0.55;
    }
    if (light.current) light.current.intensity = 0.5 + lvl * 7;
  });

  return (
    <group position={position}>
      <group ref={grp}>
        <points geometry={geo}>
          <pointsMaterial
            ref={mat}
            color={CLUSTER_COLOR}
            size={0.09}
            sizeAttenuation
            transparent
            opacity={0.7}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      </group>
      <pointLight ref={light} color={CLUSTER_COLOR} intensity={1} distance={7.5} decay={2} />
    </group>
  );
}

/** Instrumento flotando: leve bob + balanceo (sin nadie que lo sostenga). */
function FloatingInstrument({
  position,
  yaw,
  roll,
  phase,
  children,
}: {
  position: [number, number, number];
  yaw: number;
  roll: number;
  phase: number;
  children: ReactNode;
}) {
  const g = useRef<THREE.Group>(null!);
  useFrame((state) => {
    const tt = state.clock.elapsedTime;
    if (g.current) {
      g.current.position.y = position[1] + Math.sin(tt * 0.9 + phase) * 0.07;
      g.current.rotation.y = yaw + Math.sin(tt * 0.5 + phase) * 0.16;
      g.current.rotation.z = roll + Math.sin(tt * 0.7 + phase) * 0.03;
    }
  });
  return (
    <group ref={g} position={position} rotation={[0, yaw, roll]}>
      {children}
    </group>
  );
}

/**
 * Rig del directo SIN personajes: guitarra y bajo flotando (con bajo y guitarra
 * ya intercambiados de lado — antes estaban al revés) + un cúmulo de partículas
 * por integrante detrás de cada instrumento. La batería (DrumKit procedural) va
 * aparte en la escena; su integrante es el cúmulo de más atrás.
 */
export function BandRig() {
  return (
    <group>
      {/* GUITARRA flotando a la DERECHA (antes a la izquierda) */}
      <FloatingInstrument position={[2.4, 1.5, 0.35]} yaw={-0.36} roll={0.34} phase={0}>
        <InstrumentGLB url={MODELS.guitar} reactKey="guitar" length={2.1} baseY={-1.05} />
      </FloatingInstrument>

      {/* BAJO flotando a la IZQUIERDA (antes a la derecha) */}
      <FloatingInstrument position={[-2.4, 1.5, 0.35]} yaw={0.36} roll={-0.34} phase={1.7}>
        <InstrumentGLB url={MODELS.bass} reactKey="bass" length={2.35} baseY={-1.18} />
      </FloatingInstrument>

      {/* Integrantes = cúmulos de partículas detrás de cada instrumento */}
      <ParticleCluster position={[2.4, 1.55, -0.55]} reactKeys={["guitar"]} />
      <ParticleCluster position={[-2.4, 1.55, -0.55]} reactKeys={["bass"]} />
      <ParticleCluster
        position={[0, 1.55, -2.75]}
        reactKeys={["kick", "snare", "hihat"]}
        radius={1.05}
        count={240}
      />
    </group>
  );
}
