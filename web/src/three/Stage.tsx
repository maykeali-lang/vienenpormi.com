import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer, ContactShadows, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import { PALETTE, STAGE_LIFT, type Quality } from "../config/song";
import { GLBModel, MODELS } from "./models";
import { toonGradient } from "./materials";

// ============================================================================
//  STAGE — Concierto profesional: «Future House Dark» como terreno/venue +
//  Concert Pack (escenario, altavoces, focos, barricada) + luces reactivas.
//  Posiciones/escala como constantes para afinar a ojo en el dev server.
// ============================================================================

/** Cartel LED encendido con texto (JAKE / CB) sobre el ampli. */
function LedLabel({
  text,
  color,
  position,
}: {
  text: string;
  color: string;
  position: [number, number, number];
}) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const x = c.getContext("2d")!;
    x.fillStyle = "#0c0a14";
    x.fillRect(0, 0, 256, 96);
    x.strokeStyle = "rgba(255,255,255,0.12)";
    x.lineWidth = 4;
    x.strokeRect(6, 6, 244, 84);
    x.font = "700 60px 'Space Mono', ui-monospace, monospace";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.shadowColor = color;
    x.shadowBlur = 22;
    x.fillStyle = color;
    x.fillText(text, 128, 54);
    x.shadowBlur = 0;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, color]);
  return (
    <mesh position={position}>
      <planeGeometry args={[0.66, 0.25]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={1.2} roughness={0.6} toneMapped={false} />
    </mesh>
  );
}

/** Amplificador con la única pantalla de color + cartel LED (JAKE / CB). */
function Amp({
  position,
  color,
  energyKey,
  label,
}: {
  position: [number, number, number];
  color: string;
  energyKey: "bass" | "guitar";
  label: string;
}) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => {
    if (mat.current)
      mat.current.emissiveIntensity =
        0.06 + conductor.frame.energy[energyKey] * 1.3 + conductor.frame.pulse[energyKey] * 0.8;
  });
  return (
    <group position={position}>
      {/* gabinete */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.15, 1.25, 0.6]} />
        <meshToonMaterial color="#332b52" gradientMap={toonGradient()} />
      </mesh>
      {/* marco de la rejilla */}
      <mesh position={[0, -0.1, 0.305]}>
        <boxGeometry args={[1.0, 0.82, 0.03]} />
        <meshToonMaterial color="#473e6b" gradientMap={toonGradient()} />
      </mesh>
      {/* pantalla de color (late con el beat) */}
      <mesh position={[0, -0.1, 0.325]}>
        <planeGeometry args={[0.9, 0.72]} />
        <meshStandardMaterial ref={mat} color="#2c2740" emissive={color} emissiveIntensity={0.1} roughness={0.9} metalness={0} toneMapped={false} />
      </mesh>
      {/* cartel LED con el nombre (JAKE / CB) */}
      <LedLabel text={label} color={color} position={[0, 0.05, 0.345]} />
      {/* panel de control superior */}
      <mesh position={[0, 0.6, 0.18]} rotation={[-0.42, 0, 0]}>
        <boxGeometry args={[1.08, 0.18, 0.14]} />
        <meshStandardMaterial color="#14151b" metalness={0.4} roughness={0.5} />
      </mesh>
      {[-0.42, -0.27, -0.12, 0.03, 0.18].map((dx, i) => (
        <mesh key={i} position={[dx, 0.625, 0.255]} rotation={[-0.42, 0, 0]}>
          <cylinderGeometry args={[0.026, 0.026, 0.05, 12]} />
          <meshStandardMaterial color="#cfd3da" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0.46, 0.625, 0.255]} rotation={[-0.42, 0, 0]}>
        <sphereGeometry args={[0.02, 10, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {/* patas */}
      {[-0.45, 0.45].map((dx, i) => (
        <mesh key={i} position={[dx, -0.65, 0]}>
          <boxGeometry args={[0.12, 0.06, 0.5]} />
          <meshStandardMaterial color="#0d0d11" roughness={0.7} />
        </mesh>
      ))}
      {/* franja de marca */}
      <mesh position={[0, -0.5, 0.31]}>
        <boxGeometry args={[0.3, 0.05, 0.015]} />
        <meshStandardMaterial color={PALETTE.bone} roughness={0.6} />
      </mesh>
    </group>
  );
}

function grafitiUrl() {
  const b = import.meta.env.BASE_URL || "/";
  return `${b}assets/ira/grafiti.mp4`.replace(/\/{2,}/g, "/");
}

/**
 * Pantalla del escenario: reproduce el video «grafiti» de principio a fin de
 * «Ira». El video dura más que el tema, así que sigue el reloj de la canción y
 * se recorta a su duración; en el tramo final hace FADE OUT.
 */
function StageScreen({
  position,
  size,
}: {
  position: [number, number, number];
  size: [number, number];
}) {
  // <video> oculto (mudo, sigue el reloj de la canción) + VideoTexture (cover)
  const video = useMemo(() => {
    const v = document.createElement("video");
    v.src = grafitiUrl();
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.loop = false;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    return v;
  }, []);
  const tex = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    // CUBRIR la pantalla con el 16:9 sin deformar
    const A = 16 / 9;
    const P = size[0] / size[1];
    t.center.set(0.5, 0.5);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    const rx = A < P ? 1 : P / A;
    const ry = A < P ? A / P : 1;
    t.repeat.set(rx, ry);
    return t;
  }, [video, size]);

  const mat = useRef<THREE.MeshStandardMaterial>(null!);

  useFrame(() => {
    const f = conductor.frame;
    const songDur = conductor.duration || 178.6;
    // reproducir / pausar con la canción
    if (f.playing && video.paused) void video.play().catch(() => {});
    else if (!f.playing && !video.paused) video.pause();
    // sincroniza el video al reloj de la canción (corrige drift > 0.3 s)
    if (video.readyState >= 2 && isFinite(video.duration)) {
      const target = Math.min(f.t, video.duration - 0.05);
      if (Math.abs(video.currentTime - target) > 0.3) video.currentTime = Math.max(0, target);
    }
    // brillo levemente reactivo + FADE OUT en los últimos ~4.5 s de «Ira»
    const e = f.energy;
    const drive = (e.kick + e.snare + e.bass + e.guitar) / 4;
    const fade = Math.min(1, Math.max(0, (songDur - f.t) / 4.5));
    if (mat.current) {
      mat.current.emissiveIntensity = (0.75 + drive * 0.7) * fade;
      mat.current.opacity = fade;
    }
  });

  return (
    <group position={position}>
      {/* pantalla con el video */}
      <mesh>
        <planeGeometry args={size} />
        <meshStandardMaterial
          ref={mat}
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={0.85}
          toneMapped={false}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* marco oscuro */}
      <mesh position={[0, 0, -0.12]}>
        <boxGeometry args={[size[0] + 0.5, size[1] + 0.5, 0.2]} />
        <meshStandardMaterial color="#0a0b12" metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

/**
 * Tarima del Concert Pack, pero OCULTANDO la estructura/"pared" trasera (los
 * materiales *Struss). Deja el suelo de la tarima + el LED para que se vea la
 * pantalla del fondo.  HIDE = qué materiales no se muestran (ajustable).
 */
const STAGE_HIDE = /Struss/i; // estructura trasera tipo pared
function StageRig({
  position,
  fit,
}: {
  position: [number, number, number];
  fit: number;
}) {
  const { scene } = useGLTF(MODELS.stage);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const name = mats.map((x) => (x ? x.name : "")).join(",");
      if (STAGE_HIDE.test(name)) m.visible = false;
    });
    return c;
  }, [scene]);
  const { s, y } = useMemo(() => {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const raw = Math.max(size.x, size.z);
    const extent = Number.isFinite(raw) && raw > 1e-4 ? raw : 1;
    const sc = fit / extent;
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
    return { s: sc, y: -minY * sc };
  }, [obj, fit]);
  return (
    <group position={position}>
      <primitive object={obj} scale={s} position={[0, y, 0]} />
    </group>
  );
}

/** Luces de concierto reactivas a la mezcla. */
function ReactiveLights() {
  const key = useRef<THREE.SpotLight>(null!);
  const magenta = useRef<THREE.SpotLight>(null!);
  const cyan = useRef<THREE.SpotLight>(null!);
  useFrame(() => {
    const e = conductor.frame.energy;
    const overall = (e.kick + e.snare + e.bass) / 3;
    const tap = conductor.userPulse;
    if (key.current) key.current.intensity = 5.0 + conductor.frame.pulse.kick * 6 + overall * 3;
    if (magenta.current) magenta.current.intensity = 3.0 + e.guitar * 6 + tap * 6;
    if (cyan.current) cyan.current.intensity = 3.0 + e.vocals * 5 + e.bass * 3 + tap * 6;
  });
  return (
    <>
      <ambientLight intensity={0.55} color="#6b76c0" />
      <hemisphereLight args={["#3a3f6e", "#0c0c14", 0.5]} />
      <directionalLight position={[2, 9, 6]} intensity={1.0} color="#cdd6ff" />
      {/* foco principal blanco (con sombras) */}
      <spotLight
        ref={key}
        position={[0, 11, 5]}
        angle={0.72}
        penumbra={0.7}
        color="#ffffff"
        intensity={5.5}
        distance={54}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* focos de color desde la torre de luces */}
      {/* luces unificadas a un tono neutro cálido (sin magenta/cyan) */}
      <spotLight ref={magenta} position={[-6, 9, 3]} angle={0.5} penumbra={0.85} color="#ffe9c4" intensity={3.4} distance={46} />
      <spotLight ref={cyan} position={[6, 9, 3]} angle={0.5} penumbra={0.85} color="#ffe9c4" intensity={3.4} distance={46} />
      <pointLight position={[0, 3, 2]} intensity={1.4} color="#ffe9c4" distance={16} />
    </>
  );
}

export function Stage({ quality }: { quality: Quality }) {
  return (
    <group>
      {/* Reflejos fríos de club en los metales de los modelos PBR. */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#0a0b14"]} />
        <Lightformer intensity={0.6} color="#ffe9c4" position={[-5, 4, -4]} scale={[8, 8, 1]} />
        <Lightformer intensity={0.6} color="#ffe9c4" position={[5, 4, -4]} scale={[8, 8, 1]} />
        <Lightformer intensity={0.9} color="#cfd6ff" position={[0, 8, 3]} scale={[10, 4, 1]} />
      </Environment>

      <ReactiveLights />
      <fog attach="fog" args={["#0b0c18", 18, 64]} />

      {/* Suelo oscuro del escenario (se quitó el «Future House Dark Stage») */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#0c0d16" roughness={0.85} metalness={0.1} />
      </mesh>

      {/* ---------- CONCERT PACK: escenario profesional ---------- */}
      {/* tarima (suelo + LED) SIN la estructura/pared trasera */}
      <StageRig position={[0, 0, -2.6]} fit={11} />

      {/* PANTALLA del escenario (logo «vienen por mi» / fanart 1:28–1:40) */}
      <StageScreen position={[0, 3.6, -4.5]} size={[9, 4.5]} />

      {/* altavoces (PA) bien separados y alejados de la tarima */}
      <GLBModel url={MODELS.speaker} fit={2.7} fitAxis="y" position={[-7.6, 0, 1.8]} />
      <GLBModel url={MODELS.speaker} fit={2.7} fitAxis="y" position={[7.6, 0, 1.8]} />

      {/* Backline elevado con la banda: amplificadores JAKE / CB + micrófono */}
      <group position={[0, STAGE_LIFT, 0]}>
        <Amp position={[-3.0, 0.62, -1.4]} color="#e8ddc4" energyKey="guitar" label="JAKE" />
        <Amp position={[3.0, 0.62, -1.4]} color="#e8ddc4" energyKey="bass" label="CB" />
        {/* micrófono: cápsula mirando a la boca del bajista (giro 180°) */}
        <GLBModel url={MODELS.mic} fit={1.65} fitAxis="y" position={[2.5, 0, 0.9]} rotation={[0, 0, 0]} />
      </group>

      {/* (se quitaron las 3 luces aéreas) */}

      {/* Sombras de contacto bajo la banda (grounding) */}
      <ContactShadows position={[0, 0.02, 0]} scale={16} far={5} blur={2.6} opacity={0.5} color="#05060c" resolution={1024} />
    </group>
  );
}
