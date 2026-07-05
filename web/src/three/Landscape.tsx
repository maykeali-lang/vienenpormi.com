import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { PALETTE, SCENERY, type Quality } from "../config/song";
import { toonGradient } from "./materials";

const ink = PALETTE.ink;

/** Pieza cartoon con sombreado en bandas (toon) y contorno opcional. */
function Toon({
  children,
  color,
  position,
  rotation,
  scale,
  outline = 0,
}: {
  children: ReactNode;
  color: THREE.ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  outline?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      {children}
      <meshToonMaterial color={color} gradientMap={toonGradient()} />
      {outline > 0 && <Outlines thickness={outline} color={ink} />}
    </mesh>
  );
}

/** Nube de burbujas que deriva lentamente por el cielo nocturno. */
function Cloud({
  position,
  scale = 1,
  speed = 0.2,
  span = 90,
  seg,
}: {
  position: [number, number, number];
  scale?: number;
  speed?: number;
  span?: number;
  seg: number;
}) {
  const ref = useRef<THREE.Group>(null!);
  const x0 = position[0];
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed;
    let x = x0 + (((t % span) + span) % span);
    if (x > span / 2) x -= span;
    ref.current.position.x = x;
  });
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 1.0],
    [1.1, -0.1, 0.1, 0.78],
    [-1.1, -0.05, -0.1, 0.8],
    [0.5, 0.45, 0, 0.7],
    [-0.55, 0.4, 0.05, 0.66],
  ];
  return (
    <group ref={ref} position={position} scale={scale}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]}>
          <sphereGeometry args={[p[3], seg, seg]} />
          <meshBasicMaterial color={SCENERY.cloud} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Luna caricaturesca con halo, alta en el cielo nocturno. */
function Moon({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <circleGeometry args={[3.0, 40]} />
        <meshBasicMaterial color={SCENERY.sun} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.2]}>
        <circleGeometry args={[4.4, 40]} />
        <meshBasicMaterial color={SCENERY.sun} transparent opacity={0.22} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Publico sentado alrededor (estilo Woodstock): muchos bultos sencillos con
 * cabeza, repartidos en la pradera mirando al escenario. Geometria y materiales
 * compartidos para no penalizar el rendimiento.
 */
function Audience({ count }: { count: number }) {
  const geo = useMemo(() => new THREE.SphereGeometry(1, 8, 7), []);
  const skin = useMemo(
    () => new THREE.MeshToonMaterial({ color: "#e6c4a0", gradientMap: toonGradient() }),
    [],
  );
  const mats = useMemo(() => {
    // pasteles OSCUROS (publico nocturno apagado)
    const cols = ["#9c4f6e", "#367f8c", "#4f7a3c", "#6f5a93", "#a98a4c", "#7d7360", "#a85f7e", "#4f5d86"];
    return cols.map((c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() }));
  }, []);

  const people = useMemo(() => {
    // PRNG determinista para una colocacion estable entre recargas.
    let s = 20240426;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const arr: { x: number; z: number; sc: number; mi: number; ry: number }[] = [];
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 6.5 + rnd() * 9; // anillo 6.5..15.5, deja libre el escenario
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      arr.push({
        x,
        z,
        sc: 0.8 + rnd() * 0.45,
        mi: Math.floor(rnd() * mats.length),
        ry: Math.atan2(-x, -z), // mirar al centro (escenario)
      });
    }
    return arr;
  }, [count, mats.length]);

  return (
    <group>
      {people.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} scale={p.sc} rotation={[0, p.ry, 0]}>
          {/* torso sentado */}
          <mesh geometry={geo} material={mats[p.mi]} position={[0, 0.28, 0]} scale={[0.3, 0.27, 0.3]} castShadow />
          {/* cabeza */}
          <mesh geometry={geo} material={skin} position={[0, 0.52, 0.02]} scale={0.15} castShadow />
          {/* rodillas insinuadas, hacia el escenario */}
          <mesh geometry={geo} material={mats[p.mi]} position={[0, 0.12, 0.2]} scale={[0.27, 0.15, 0.22]} />
        </group>
      ))}
    </group>
  );
}

/**
 * Paisaje «Tierra de Ooo» de noche: colinas redondeadas alrededor, montañas de
 * chocolate (marron oscuro pastel) al fondo, nubes que derivan, la luna y el
 * publico sentado rodeando el escenario.
 */
export function Landscape({ quality }: { quality: Quality }) {
  const seg = Math.max(8, Math.round(quality.segments * 0.5));
  const crowd = quality.shadows ? 80 : 34;

  const hills = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; c: string }[] = [];
    const defs = [
      { a: 0.4, r: 16, w: 9, h: 3.6, c: SCENERY.hill },
      { a: 1.3, r: 19, w: 12, h: 4.4, c: SCENERY.grassDark },
      { a: 2.2, r: 15, w: 8, h: 3.0, c: SCENERY.grassLight },
      { a: 3.0, r: 20, w: 13, h: 5.0, c: SCENERY.hill },
      { a: 3.9, r: 17, w: 10, h: 3.8, c: SCENERY.grassDark },
      { a: 4.7, r: 22, w: 14, h: 4.6, c: SCENERY.hillFar },
      { a: 5.5, r: 16, w: 9, h: 3.4, c: SCENERY.grassLight },
      { a: 6.0, r: 21, w: 12, h: 4.2, c: SCENERY.hill },
    ];
    for (const d of defs) {
      out.push({ p: [Math.cos(d.a) * d.r, -0.2, Math.sin(d.a) * d.r], s: [d.w, d.h, d.w], c: d.c });
    }
    return out;
  }, []);

  // Montañas de marron oscuro pastel (chocolate suave) al fondo.
  const mountains = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; c: string }[] = [];
    const defs = [
      { a: 0.2, r: 34, w: 16, h: 11, c: SCENERY.mountain },
      { a: 1.1, r: 38, w: 20, h: 14, c: SCENERY.mountainFar },
      { a: 2.4, r: 33, w: 15, h: 10, c: SCENERY.mountain },
      { a: 3.4, r: 40, w: 22, h: 16, c: SCENERY.mountainFar },
      { a: 4.4, r: 35, w: 17, h: 12, c: SCENERY.mountain },
      { a: 5.6, r: 39, w: 20, h: 14, c: SCENERY.mountainFar },
    ];
    for (const d of defs) {
      out.push({ p: [Math.cos(d.a) * d.r, -1, Math.sin(d.a) * d.r], s: [d.w, d.h, d.w], c: d.c });
    }
    return out;
  }, []);

  const clouds = useMemo(
    () => [
      { p: [-14, 13, -20] as [number, number, number], s: 2.2, sp: 0.18 },
      { p: [12, 16, -26] as [number, number, number], s: 3.0, sp: 0.12 },
      { p: [-4, 18, -30] as [number, number, number], s: 2.6, sp: 0.15 },
      { p: [20, 12, -14] as [number, number, number], s: 2.0, sp: 0.22 },
      { p: [-22, 15, -10] as [number, number, number], s: 2.4, sp: 0.16 },
    ],
    [],
  );

  return (
    <group>
      <Moon position={[26, 22, -34]} />

      {mountains.map((m, i) => (
        <Toon key={`mt${i}`} color={m.c} position={m.p} scale={m.s}>
          <sphereGeometry args={[1, 14, 12]} />
        </Toon>
      ))}

      {hills.map((h, i) => (
        <Toon key={`hl${i}`} color={h.c} position={h.p} scale={h.s} outline={i % 3 === 0 ? 0.004 : 0}>
          <sphereGeometry args={[1, seg + 4, seg + 2]} />
        </Toon>
      ))}

      <Audience count={crowd} />

      {clouds.map((c, i) => (
        <Cloud key={`cl${i}`} position={c.p} scale={c.s} speed={c.sp} seg={Math.max(8, seg)} />
      ))}
    </group>
  );
}
