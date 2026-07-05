import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { conductor } from "../audio/conductor";

// Rutas de los modelos (servidos desde /public/assets/models).
function url(p: string) {
  const b = import.meta.env.BASE_URL || "/";
  return `${b}assets/models/${p}`.replace(/\/{2,}/g, "/");
}

export const MODELS = {
  character: url("character.glb"),
  drumkit: url("drumkit.glb"),
  guitar: url("guitar.glb"),
  bass: url("bass.glb"),
  env: url("stage_env.glb"),
  stage: url("concert/stage.glb"),
  platform: url("concert/platform.glb"),
  speaker: url("concert/speaker.glb"),
  spotlight: url("concert/spotlight.glb"),
  spotlightMotor: url("concert/spotlight_motor.glb"),
  mic: url("concert/mic.glb"),
  barricade: url("concert/barricade.glb"),
} as const;

// Precarga (idempotente) para evitar tirones al montar la escena.
Object.values(MODELS).forEach((u) => useGLTF.preload(u));

interface ModelProps {
  url: string;
  /** tamaño objetivo (unidades) tras normalizar; si se omite, escala nativa */
  fit?: number;
  /** ejes para medir el tamaño: "xz" (huella) | "y" (alto) */
  fitAxis?: "xz" | "y";
  /** apoya la base del modelo en y=0 del grupo */
  ground?: boolean;
  shadow?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** factor extra sobre la escala calculada */
  extraScale?: number;
}

/** Modelo GLB estático normalizado (auto-escala + apoyo al suelo). */
export function GLBModel({
  url: u,
  fit,
  fitAxis = "xz",
  ground = true,
  shadow = true,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  extraScale = 1,
}: ModelProps) {
  const { scene } = useGLTF(u);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    if (shadow)
      c.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
    return c;
  }, [scene, shadow]);

  const { s, y } = useMemo(() => {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const raw = fitAxis === "y" ? size.y : Math.max(size.x, size.z);
    const extent = Number.isFinite(raw) && raw > 1e-4 ? raw : 1;
    const sc = (fit ? fit / extent : 1) * extraScale;
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
    return { s: sc, y: ground ? -minY * sc : 0 };
  }, [obj, fit, fitAxis, ground, extraScale]);

  return (
    <group position={position} rotation={rotation}>
      <primitive object={obj} scale={s} position={[0, y, 0]} />
    </group>
  );
}

/**
 * Barra LED semitransparente que cubre el mástil y se enciende con FUERZA en
 * sintonía con el stem (energy + golpe). Additive + sin tonemap -> bloom intenso.
 */
function LedNeckBar({
  reactKey,
  length,
  halfW,
  frontZ,
}: {
  reactKey: "guitar" | "bass";
  length: number;
  halfW: number;
  frontZ: number;
}) {
  const core = useRef<THREE.MeshBasicMaterial>(null!);
  const halo = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => {
    const e = conductor.frame.energy[reactKey];
    const p = conductor.frame.pulse[reactKey];
    const lvl = Math.min(1, e * 2.6 + p * 2.4);
    if (core.current) core.current.opacity = 0.3 + lvl * 0.68;
    if (halo.current) halo.current.opacity = 0.08 + lvl * 0.42;
  });
  const w = Math.max(0.01, halfW * 0.08); // banda aún un poco más delgada
  const y0 = length * 0.4; // subida un poco más
  const y1 = length * 1.02;
  const h = y1 - y0;
  const cy = (y0 + y1) / 2;
  return (
    <group position={[0, cy, frontZ]}>
      {/* halo difuso (resplandor) */}
      <mesh>
        <planeGeometry args={[w * 5, h * 1.04]} />
        <meshBasicMaterial
          ref={halo}
          color="#ffe4b8"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* barra principal */}
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          ref={core}
          color="#fff0d6"
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Instrumento GLB normalizado al marco local que espera la IK del personaje:
 * eje largo (mástil) hacia +Y, cara hacia +Z, base abajo. Auto-orienta el eje
 * más largo a +Y; `yaw`/`flip` ajustan a ojo la cara y el extremo. Si se pasa
 * `reactKey`, añade cuerdas LED reactivas al stem del instrumento.
 */
export function InstrumentGLB({
  url: u,
  length = 2.4,
  baseY = -0.5,
  yaw = 0,
  roll = 0,
  flip = false,
  reactKey,
}: {
  url: string;
  length?: number;
  baseY?: number;
  yaw?: number;
  roll?: number;
  flip?: boolean;
  reactKey?: "guitar" | "bass";
}) {
  const { scene } = useGLTF(u);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    return c;
  }, [scene]);

  const fit = useMemo(() => {
    obj.rotation.set(0, 0, 0);
    obj.position.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const a = [size.x, size.y, size.z];
    const li = a.indexOf(Math.max(a[0], a[1], a[2]));
    if (li === 0) obj.rotation.z = Math.PI / 2; // X -> Y
    else if (li === 2) obj.rotation.x = Math.PI / 2; // Z -> Y
    if (flip) obj.rotation.x += Math.PI;
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    const L = Number.isFinite(sz.y) && sz.y > 1e-4 ? sz.y : 1;
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
    // centra X/Z y apoya el extremo inferior en y=0 (en espacio sin escalar)
    obj.position.set(-center.x, -minY, -center.z);
    obj.updateMatrixWorld(true);
    const sc = length / L;
    return {
      sc,
      halfW: (sz.x * sc) / 2,
      frontZ: (sz.z * sc) / 2 + 0.02,
    };
  }, [obj, length, flip]);

  return (
    <group rotation={[0, yaw, roll]} position={[0, baseY, 0]}>
      <group scale={fit.sc}>
        <primitive object={obj} />
      </group>
      {reactKey && (
        <LedNeckBar
          reactKey={reactKey}
          length={length}
          halfW={fit.halfW}
          frontZ={fit.frontZ}
        />
      )}
    </group>
  );
}

interface PerformerProps {
  /** nombre del clip de animación (ej. "Rig|Idle_Loop") */
  clip: string;
  position?: [number, number, number];
  rotationY?: number;
  /** alto objetivo del personaje en unidades */
  height?: number;
  speed?: number;
  /** props (instrumento) en el espacio local del personaje */
  children?: ReactNode;
}

/**
 * Personaje GLB animado, instanciable (clona el esqueleto para que cada uno
 * reproduzca su propia animación de forma independiente).
 */
export function Performer({
  clip,
  position = [0, 0, 0],
  rotationY = 0,
  height = 1.7,
  speed = 1,
  children,
}: PerformerProps) {
  const { scene, animations } = useGLTF(MODELS.character);
  const obj = useMemo(() => {
    const c = skeletonClone(scene);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return c;
  }, [scene]);

  const rigRef = useRef<THREE.Group>(null!);
  const { actions } = useAnimations(animations, rigRef);

  useEffect(() => {
    const a = actions[clip] ?? Object.values(actions)[0];
    if (!a) return;
    a.reset().fadeIn(0.3).play();
    a.timeScale = speed;
    return () => {
      a.fadeOut(0.2);
    };
  }, [actions, clip, speed]);

  const { s, y } = useMemo(() => {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Number.isFinite(size.y) && size.y > 1e-4 ? size.y : 1.8;
    const sc = height / h;
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
    return { s: sc, y: -minY * sc };
  }, [obj, height]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group ref={rigRef} scale={s} position={[0, y, 0]}>
        <primitive object={obj} />
      </group>
      {children}
    </group>
  );
}
