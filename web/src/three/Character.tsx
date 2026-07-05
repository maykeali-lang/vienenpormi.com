import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import { PALETTE, type BandMember } from "../config/song";
import { toonGradient, sharedToonFlat } from "./materials";
import { InstrumentGLB, MODELS } from "./models";

// Ajuste a ojo de los instrumentos GLB en las manos (orientación/extremo).
const GUITAR_TUNE = { length: 2.4, baseY: -0.5, yaw: 0, flip: false };
const BASS_TUNE = { length: 2.7, baseY: -0.55, yaw: 0, flip: false };

const TAU = Math.PI * 2;
const damp = THREE.MathUtils.damp;

/**
 * IK analitica de 2 huesos para un brazo que en reposo apunta a -Y y pivota en
 * el hombro (rotacion.x/.z) con flexion de codo (rotacion.x). Devuelve los
 * angulos para que la mano alcance el objetivo (tx,ty,tz) en espacio de hips.
 */
function solveArm(
  sx0: number,
  sy0: number,
  sz0: number,
  tx: number,
  ty: number,
  tz: number,
  Lu: number,
  Lf: number,
) {
  const dx = tx - sx0;
  const dy = ty - sy0;
  const dz = tz - sz0;
  const L = Math.hypot(dx, dy, dz) || 1e-4;
  const vx = dx / L;
  const vy = dy / L;
  const vz = dz / L;
  const horiz = Math.hypot(vy, vz) || 1e-4;
  const zAim = Math.atan2(vx, horiz); // gira hacia el objetivo en X (lateral)
  const xAim = Math.atan2(-vz, -vy); // inclina -Y hacia el objetivo (adelante/arriba)
  let dist = L;
  const maxR = (Lu + Lf) * 0.999;
  const minR = Math.abs(Lu - Lf) + 0.01;
  dist = Math.min(Math.max(dist, minR), maxR);
  const cosLift = (Lu * Lu + dist * dist - Lf * Lf) / (2 * Lu * dist);
  const lift = Math.acos(THREE.MathUtils.clamp(cosLift, -1, 1));
  const cosElb = (Lu * Lu + Lf * Lf - dist * dist) / (2 * Lu * Lf);
  const interior = Math.acos(THREE.MathUtils.clamp(cosElb, -1, 1));
  return { sx: xAim + lift, sz: zAim, ex: -(Math.PI - interior) };
}

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/** Coloca un instrumento para que su cuerpo caiga en Rh y su mastil en Lh. */
function placeInstrument(
  Rh: THREE.Vector3,
  Lh: THREE.Vector3,
  nLocal: number,
) {
  const D = new THREE.Vector3().subVectors(Lh, Rh);
  const len = D.length() || 1e-4;
  const dir = D.clone().multiplyScalar(1 / len);
  const scale = len / nLocal;
  const q1 = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  // Roll para que la cara/cuerdas (+Z local) mire hacia la camara (+Z).
  const desired = FWD.clone().projectOnPlane(dir);
  let roll = 0;
  if (desired.lengthSq() > 1e-4) {
    desired.normalize();
    const fproj = FWD.clone().applyQuaternion(q1).projectOnPlane(dir).normalize();
    roll = Math.acos(THREE.MathUtils.clamp(fproj.dot(desired), -1, 1));
    if (new THREE.Vector3().crossVectors(fproj, desired).dot(dir) < 0) roll = -roll;
  }
  const q = new THREE.Quaternion().setFromAxisAngle(dir, roll).multiply(q1);
  return {
    position: [Rh.x, Rh.y, Rh.z] as [number, number, number],
    quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
    scale,
  };
}

// Largos de hueso del rig (hombro->codo, codo->palma).
const ARM_UPPER = 0.36;
const ARM_FORE = 0.39;

interface PartProps {
  children: ReactNode; // geometry element
  color: THREE.ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** escala no uniforme de la pieza (silueta más humana) */
  scale?: number | [number, number, number];
  outline?: number;
  chrome?: boolean;
  /** piezas pequeñas (dedos, muñecas) no proyectan sombra: shadow map más barato */
  shadow?: boolean;
}

/**
 * Una pieza toon con contorno negro (look comic) y `flatShading`: cada cara
 * queda plana → facetas visibles = estética low-poly, pero con proporciones
 * humanas gracias a `scale`. El material toon se COMPARTE por color entre
 * todas las piezas/personajes (una instancia por color, no una por mesh).
 */
function Part({
  children,
  color,
  position,
  rotation,
  scale,
  outline = 0.035,
  chrome = false,
  shadow = true,
}: PartProps) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow={shadow} receiveShadow={shadow}>
      {children}
      {chrome ? (
        <meshStandardMaterial
          color="#cfd6e6"
          metalness={1}
          roughness={0.14}
          envMapIntensity={1.5}
          flatShading
        />
      ) : (
        <primitive object={sharedToonFlat(color)} attach="material" dispose={null} />
      )}
      {outline > 0 && <Outlines thickness={outline} color={PALETTE.ink} />}
    </mesh>
  );
}

interface CharacterProps {
  member: BandMember;
  seg: number;
}

export function Character({ member, seg }: CharacterProps) {
  // Refs a los "joints" (grupos). El movimiento es rotacion procedural.
  const root = useRef<THREE.Group>(null!);
  const hips = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const shL = useRef<THREE.Group>(null!); // hombro izq
  const elL = useRef<THREE.Group>(null!); // codo izq
  const wrL = useRef<THREE.Group>(null!); // muñeca izq
  const shR = useRef<THREE.Group>(null!);
  const elR = useRef<THREE.Group>(null!);
  const wrR = useRef<THREE.Group>(null!);
  // marcadores para las cuerdas de marioneta (cabeza + manos)
  const mHead = useRef<THREE.Object3D>(null!);
  const mHandL = useRef<THREE.Object3D>(null!);
  const mHandR = useRef<THREE.Object3D>(null!);

  const bone = PALETTE.bone;
  const accent = member.accent;
  // prenda indie (chaqueta/camisa) por integrante — tonos frios apagados
  const cloth =
    member.id === "guitarist" ? "#3f4856" : member.id === "bassist" ? "#46493a" : "#2c2d34";
  const pants = bone; // sin pantalon (cuerpo limpio)
  void cloth;
  const hipY = 0.92 * member.heightScale;
  const seated = member.id === "drummer";

  // dimensiones derivadas — pocos segmentos para el look low-poly facetado
  // (junto con flatShading en el material). Se mantiene legible como humano.
  const radial = THREE.MathUtils.clamp(Math.round(seg * 0.32), 6, 8);
  const cap = 2;

  // valores suavizados persistentes entre frames
  const s = useMemo(
    () => ({
      hipsY: hipY,
      hipsX: 0,
      bodyTilt: 0,
      headPitch: 0,
      headYaw: 0,
      shLx: 0,
      shLz: 0,
      elLx: 0,
      shRx: 0,
      elRx: 0,
      shRz: 0,
      wrLx: 0,
      wrLz: 0,
      wrRx: 0,
      wrRz: 0,
      strumPhase: 0,
    }),
    [hipY],
  );

  // Anclas de agarre (espacio de hips): donde van las manos sobre el instrumento.
  const anchors = useMemo(() => {
    let a: { Lh: THREE.Vector3; Rh: THREE.Vector3; nLocal: number } | null = null;
    // Pose ESTÁNDAR (diestra): la mano IZQUIERDA pisa el mástil (que sube
    // hacia la izquierda) y la derecha rasguea/puntea sobre el cuerpo.
    if (member.id === "guitarist")
      a = {
        Lh: new THREE.Vector3(-0.4, 0.66, 0.26), // mano del mástil (izquierda)
        Rh: new THREE.Vector3(0.06, 0.3, 0.32), // mano de rasgueo (cuerpo)
        nLocal: 0.95,
      };
    if (member.id === "bassist")
      a = {
        Lh: new THREE.Vector3(-0.4, 0.7, 0.26),
        Rh: new THREE.Vector3(0.08, 0.26, 0.32),
        nLocal: 1.05,
      };
    if (!a) return null;
    // eje del mastil (Rh -> Lh): la mano izquierda desliza a lo largo de el.
    const axis = new THREE.Vector3().subVectors(a.Lh, a.Rh).normalize();
    return { ...a, axis };
  }, [member.id]);

  // La palma del mástil no cae SOBRE el eje del mástil: queda un pelín arriba
  // y detrás para que los dedos (que curvan hacia la cámara) lo envuelvan.
  const NECK_PALM = { y: 0.02, z: -0.05 } as const;

  // "Acordes": desplazamientos de la mano del mastil que cambian por compas.
  const CHORDS = [0, 0.11, -0.07, 0.15, -0.03, 0.08];

  const instXform = useMemo(
    () => (anchors ? placeInstrument(anchors.Rh, anchors.Lh, anchors.nLocal) : null),
    [anchors],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30);
    const f = conductor.frame;
    const { energy, pulse, beatPhase, barPhase } = f;
    const breathe = Math.sin(barPhase * TAU);
    const sway = Math.sin(barPhase * TAU + member.position[0]);

    // --- Idle base (nadie estatico) ---
    let tHipsY = hipY + breathe * 0.012;
    let tBodyTilt = sway * 0.03;
    let tHeadPitch = 0.04 + breathe * 0.03;
    let tHeadYaw = sway * 0.06;
    // Convencion: rotacion X NEGATIVA en hombro/codo = brazo hacia ADELANTE
    // (hacia la camara). El personaje siempre mira al frente (+Z).
    let tShLx = seated ? -1.15 : -0.2 + breathe * 0.04;
    let tElLx = seated ? -0.6 : -0.25;
    let tShRx = seated ? -1.15 : -0.2 - breathe * 0.04;
    let tElRx = seated ? -0.6 : -0.25;
    let tShRz = 0;
    let tShLz = 0; // rotacion Z del hombro izq: sube la mano al mastil
    // muñecas: el "snap" fino que remata cada golpe/rasgueo/nota
    let tWrLx = -0.06 + breathe * 0.02;
    let tWrLz = 0;
    let tWrRx = -0.06 - breathe * 0.02;
    let tWrRz = 0;

    if (member.id === "drummer") {
      // kick -> rebote de cuerpo/cabeza; snare/hihat -> golpes de brazos
      const k = energy.kick;
      tHipsY = hipY - 0.05 + pulse.kick * 0.06 + k * 0.02;
      tHeadPitch = 0.18 + pulse.kick * 0.5 + pulse.snare * 0.25;
      tBodyTilt = sway * 0.02;
      // "listo" levantado entre golpes; en el golpe baja seco.
      const readyR = Math.sin(barPhase * TAU * 2) * 0.05;
      const readyL = Math.cos(barPhase * TAU * 2) * 0.05;
      // los brazos se TURNAN por negras (der: tiempos 1 y 3, izq: 2 y 4):
      // nunca bajan los dos a la vez. La campana sin(bp·π) marca el golpe de
      // la negra y el pulso real del stem acentúa solo a la mano de turno.
      const beatIdx = Math.floor(barPhase * 4);
      const bp = barPhase * 4 - beatIdx;
      const drumE = Math.min(1, (energy.snare + energy.hihat) * 1.4 + k * 0.4);
      const strike = Math.pow(Math.max(0, Math.sin(bp * Math.PI)), 2) * drumE;
      const isR = beatIdx % 2 === 0;
      const acc = Math.max(pulse.snare, pulse.hihat) * 0.6;
      const hitR = isR ? Math.min(1.2, strike + acc) : 0;
      const hitL = isR ? 0 : Math.min(1.2, strike + acc);
      tShRx = -0.92 + readyR - hitR * 0.5;
      tElRx = -0.5 + readyR - hitR * 0.85;
      tShLx = -0.95 + readyL - hitL * 0.45;
      tElLx = -0.5 + readyL - hitL * 0.8;
      // latigazo de muñeca: la baqueta remata el golpe (más látigo que brazo)
      tWrRx = -0.3 + readyR * 0.6 - hitR * 0.75;
      tWrLx = -0.3 + readyL * 0.6 - hitL * 0.7;
    } else if (member.id === "bassist") {
      // bass -> pulso de cuerpo; vocals -> swell de cabeza/torso
      const b = energy.bass;
      const v = energy.vocals;
      tHipsY = hipY + b * 0.05 + pulse.bass * 0.03;
      tBodyTilt = sway * 0.04 - v * 0.08;
      tHeadPitch = 0.02 - v * 0.35 + breathe * 0.03 - pulse.bass * 0.05; // cabecea al grave, mira al cielo al cantar
      tHeadYaw = sway * 0.05;
      // IK: manos reales sobre el bajo (IZQ pisa el mástil, DER puntea el cuerpo)
      if (anchors) {
        // Mano del mastil del bajo: camina por trastes (por compas) + vibrato.
        const beatDur = 60 / (conductor.env?.bpm ?? 120);
        const bar = Math.floor((f.t - (conductor.env?.beatOffset ?? 0)) / (beatDur * 4));
        const chord = CHORDS[((bar % CHORDS.length) + CHORDS.length) % CHORDS.length];
        const slide = chord + Math.sin(f.t * 16) * (0.005 + b * 0.013) + pulse.bass * 0.03;
        const lx = anchors.Lh.x + anchors.axis.x * slide;
        const ly = anchors.Lh.y + anchors.axis.y * slide + NECK_PALM.y;
        const lz = anchors.Lh.z + anchors.axis.z * slide + NECK_PALM.z;
        const rh = anchors.Rh;
        const ry = rh.y + pulse.bass * 0.04; // la mano del pulgar marca el grave
        const il = solveArm(-0.34, 0.48, 0, lx, ly, lz, ARM_UPPER, ARM_FORE);
        const ir = solveArm(0.34, 0.48, 0, rh.x, ry, rh.z, ARM_UPPER, ARM_FORE);
        tShLx = il.sx; tShLz = il.sz; tElLx = il.ex;
        tShRx = ir.sx; tShRz = ir.sz; tElRx = ir.ex;
        // muñecas: la izq ENVUELVE el mástil (flexión + vibrato fino);
        // la derecha puntea cada nota grave
        tWrLx = -0.55 + Math.sin(f.t * 16) * 0.05;
        tWrRx = -0.14 - pulse.bass * 0.35;
      }
    } else if (member.id === "guitarist") {
      // guitar -> rasgueo ritmico (beat) escalado por energy
      // Sincronia REAL con el stem de guitarra:
      //  - g = energia continua del stem -> tanto se mueve el brazo
      //  - pg = impulso de onset (cada pluck/ataque) -> golpe de rasgueo seco
      // Si la guitarra calla, el brazo queda casi quieto (no rasguea al vacio).
      const g = energy.guitar;
      const pg = pulse.guitar;
      const sweep = Math.sin(beatPhase * TAU * 2) * g * 0.62; // barrido solo con energia
      tHipsY = hipY + g * 0.05 + pg * 0.02;
      tBodyTilt = sway * 0.05 + g * 0.04 + sweep * 0.035; // «body english» con el rasgueo
      tHeadPitch = 0.06 + g * 0.14;
      // IK: manos reales sobre la guitarra. La IZQUIERDA pisa el mástil;
      // la derecha rasguea (su ancla se mueve arriba/abajo sobre el cuerpo).
      if (anchors) {
        // Mano del mastil: desliza por trastes (cambia por compas) + vibrato.
        const beatDur = 60 / (conductor.env?.bpm ?? 120);
        const bar = Math.floor((f.t - (conductor.env?.beatOffset ?? 0)) / (beatDur * 4));
        const chord = CHORDS[((bar % CHORDS.length) + CHORDS.length) % CHORDS.length];
        const slide = chord + Math.sin(f.t * 22) * (0.006 + g * 0.014);
        const lx = anchors.Lh.x + anchors.axis.x * slide;
        const ly = anchors.Lh.y + anchors.axis.y * slide + NECK_PALM.y;
        const lz = anchors.Lh.z + anchors.axis.z * slide + NECK_PALM.z;
        const rh = anchors.Rh;
        const ry = rh.y + sweep * 0.15 + pg * 0.05;
        const rz = rh.z + Math.abs(sweep) * 0.04;
        const il = solveArm(-0.34, 0.48, 0, lx, ly, lz, ARM_UPPER, ARM_FORE);
        const ir = solveArm(0.34, 0.48, 0, rh.x, ry, rz, ARM_UPPER, ARM_FORE);
        tShLx = il.sx; tShLz = il.sz; tElLx = il.ex;
        tShRx = ir.sx; tShRz = ir.sz; tElRx = ir.ex;
        // muñeca izq: ENVUELVE el mástil (flexión) + vibrato fino;
        // muñeca der: rola con el barrido y remata cada ataque de rasgueo
        tWrLx = -0.55 + Math.sin(f.t * 22) * 0.05;
        tWrRx = -0.1 - pg * 0.3;
        tWrRz = sweep * 0.45;
      }
    }

    // --- Groove común: nadie queda tieso; micro-rebote y cabeceo al beat ---
    let tHipsX = seated ? sway * 0.006 : sway * 0.022;
    if (!seated) {
      const beat = Math.max(0, pulse.kick);
      tHipsY += beat * 0.016; // rebote sutil en cada bombo
      tHeadPitch += beat * 0.06; // cabeceo al beat
    }

    // --- Damping hacia los targets (movimiento organico) ---
    const L = 14; // rigidez
    s.hipsY = damp(s.hipsY, tHipsY, L, dt);
    s.hipsX = damp(s.hipsX, tHipsX, 9, dt);
    s.bodyTilt = damp(s.bodyTilt, tBodyTilt, L, dt);
    s.headPitch = damp(s.headPitch, tHeadPitch, L, dt);
    s.headYaw = damp(s.headYaw, tHeadYaw, L, dt);
    s.shLx = damp(s.shLx, tShLx, 18, dt);
    s.shLz = damp(s.shLz, tShLz, 16, dt);
    s.elLx = damp(s.elLx, tElLx, 18, dt);
    s.shRx = damp(s.shRx, tShRx, 20, dt);
    s.elRx = damp(s.elRx, tElRx, 20, dt);
    s.shRz = damp(s.shRz, tShRz, 16, dt);
    // muñecas más rígidas que el brazo: responden rápido (látigo)
    s.wrLx = damp(s.wrLx, tWrLx, 26, dt);
    s.wrLz = damp(s.wrLz, tWrLz, 24, dt);
    s.wrRx = damp(s.wrRx, tWrRx, 26, dt);
    s.wrRz = damp(s.wrRz, tWrRz, 24, dt);

    if (hips.current) {
      hips.current.position.y = s.hipsY;
      hips.current.position.x = s.hipsX;
    }
    if (torso.current) torso.current.rotation.z = s.bodyTilt;
    if (head.current) {
      head.current.rotation.x = s.headPitch;
      head.current.rotation.y = s.headYaw;
    }
    if (shL.current) {
      shL.current.rotation.x = s.shLx;
      shL.current.rotation.z = s.shLz;
    }
    if (elL.current) elL.current.rotation.x = s.elLx;
    if (shR.current) {
      shR.current.rotation.x = s.shRx;
      shR.current.rotation.z = s.shRz;
    }
    if (elR.current) elR.current.rotation.x = s.elRx;
    if (wrL.current) {
      wrL.current.rotation.x = s.wrLx;
      wrL.current.rotation.z = s.wrLz;
    }
    if (wrR.current) {
      wrR.current.rotation.x = s.wrRx;
      wrR.current.rotation.z = s.wrRz;
    }
    if (root.current) {
      root.current.rotation.z = damp(root.current.rotation.z, sway * 0.015, 8, dt);
    }
  });

  return (
    <>
    <group ref={root} position={member.position} rotation={[0, member.rotationY, 0]}>
      <group ref={hips} position={[0, hipY, 0]}>
        {/* Torso */}
        <group ref={torso}>
          {/* Pelvis / cadera */}
          <Part color={bone} position={[0, 0.04, 0]} scale={[1.05, 0.9, 0.85]}>
            <sphereGeometry args={[0.2, radial, radial]} />
          </Part>
          {/* Abdomen -> cintura (mas estrecha) */}
          <Part color={bone} position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.2, 0.17, 0.3, radial]} />
          </Part>
          {/* Caja toracica (pecho, mas esbelto y alto) */}
          <Part color={bone} position={[0, 0.43, 0]} scale={[1.0, 1.02, 0.72]}>
            <sphereGeometry args={[0.255, radial, radial]} />
          </Part>
          {/* Clavicula / ancho de hombros */}
          <Part color={bone} position={[0, 0.51, 0]} rotation={[0, 0, Math.PI / 2]} outline={0.022}>
            <capsuleGeometry args={[0.1, 0.46, cap, radial]} />
          </Part>
          {/* (sin prenda — cuerpo limpio) */}
          {/* Trapecio */}
          <Part color={bone} position={[0, 0.55, -0.03]}>
            <sphereGeometry args={[0.11, radial, radial]} />
          </Part>
          {/* Cuello (conico) */}
          <Part color={bone} position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.072, 0.095, 0.14, radial]} />
          </Part>
        </group>

        {/* Cabeza (proporción algo más humana que el chibi original) */}
        <group ref={head} position={[0, 0.66, 0]} scale={1.1}>
          {/* Craneo ovoide */}
          <Part color={bone} position={[0, 0.16, 0]} scale={[0.95, 1.08, 0.96]} outline={0.02}>
            <sphereGeometry args={[0.2, radial, radial]} />
          </Part>
          {/* Mandibula */}
          <Part color={bone} position={[0, 0.05, 0.02]} scale={[0.82, 0.72, 0.86]} outline={0.016}>
            <sphereGeometry args={[0.18, radial, radial]} />
          </Part>
          {/* (sin ojos ni cachetes de color — rostro liso) */}
          <object3D ref={mHead} position={[0, 0.36, 0]} />
          {/* (sin boca — rostro liso también en el bajista) */}
          {/* (sin gorro) */}
          {/* (sin pelo) */}
          {/* (sin gorra) */}
        </group>

        {/* Brazo izquierdo */}
        <group ref={shL} position={[-0.34, 0.48, 0]}>
          {/* Deltoides */}
          <Part color={bone} position={[0, 0, 0]}>
            <sphereGeometry args={[0.11, radial, radial]} />
          </Part>
          {/* Biceps (conico) */}
          <Part color={bone} position={[0, -0.18, 0]}>
            <cylinderGeometry args={[0.082, 0.06, 0.33, radial]} />
          </Part>
          <group ref={elL} position={[0, -0.36, 0]}>
            {/* Codo */}
            <Part color={bone} position={[0, 0, 0]} outline={0.016}>
              <sphereGeometry args={[0.072, radial, radial]} />
            </Part>
            {/* Antebrazo (conico) */}
            <Part color={bone} position={[0, -0.16, 0]}>
              <cylinderGeometry args={[0.06, 0.044, 0.3, radial]} />
            </Part>
            {/* muñeca articulada: snap fino de golpes/rasgueos (la baqueta va
                dentro para que siga el látigo) */}
            <group ref={wrL} position={[0, -0.33, 0]}>
              <Hand color={bone} accent={accent} radial={radial} grip={seated ? 0.6 : 0.55} />
              {seated && (
                <Part color="#d9b98c" position={[0, -0.41, 0.08]} rotation={[0.42, 0, 0]} outline={0.009} shadow={false}>
                  <cylinderGeometry args={[0.011, 0.017, 0.58, 8]} />
                </Part>
              )}
            </group>
            <object3D ref={mHandL} position={[0, -0.4, 0]} />
          </group>
        </group>

        {/* Brazo derecho */}
        <group ref={shR} position={[0.34, 0.48, 0]}>
          {/* Deltoides */}
          <Part color={bone} position={[0, 0, 0]}>
            <sphereGeometry args={[0.11, radial, radial]} />
          </Part>
          {/* Biceps (conico) */}
          <Part color={bone} position={[0, -0.18, 0]}>
            <cylinderGeometry args={[0.082, 0.06, 0.33, radial]} />
          </Part>
          <group ref={elR} position={[0, -0.36, 0]}>
            {/* Codo */}
            <Part color={bone} position={[0, 0, 0]} outline={0.016}>
              <sphereGeometry args={[0.072, radial, radial]} />
            </Part>
            {/* Antebrazo (conico) */}
            <Part color={bone} position={[0, -0.16, 0]}>
              <cylinderGeometry args={[0.06, 0.044, 0.3, radial]} />
            </Part>
            <group ref={wrR} position={[0, -0.33, 0]}>
              <Hand color={bone} accent={accent} radial={radial} flip grip={seated ? 0.6 : 0.3} />
              {seated && (
                <Part color="#d9b98c" position={[0, -0.41, 0.08]} rotation={[0.42, 0, 0]} outline={0.009} shadow={false}>
                  <cylinderGeometry args={[0.011, 0.017, 0.58, 8]} />
                </Part>
              )}
            </group>
            <object3D ref={mHandR} position={[0, -0.4, 0]} />
          </group>
        </group>

        {/* Instrumento colocado para conectar las dos manos (mastil <-> cuerpo) */}
        {instXform && member.id === "guitarist" && (
          <group position={instXform.position} quaternion={instXform.quaternion} scale={instXform.scale}>
            <InstrumentGLB url={MODELS.guitar} reactKey="guitar" {...GUITAR_TUNE} />
          </group>
        )}
        {instXform && member.id === "bassist" && (
          <group position={instXform.position} quaternion={instXform.quaternion} scale={instXform.scale}>
            <InstrumentGLB url={MODELS.bass} reactKey="bass" {...BASS_TUNE} />
          </group>
        )}

        {/* Piernas (estaticas, solo presencia) */}
        {!seated ? (
          <>
            <Leg x={-0.16} bone={bone} accent={accent} cap={cap} pants={pants} radial={radial} />
            <Leg x={0.16} bone={bone} accent={accent} cap={cap} pants={pants} radial={radial} />
          </>
        ) : (
          // Baterista: muslos hacia adelante (sentado)
          <>
            {[-0.17, 0.17].map((lx) => (
              <group key={lx} position={[lx, 0, 0]}>
                {/* pantalon (sentado) */}
                <Part color={pants} position={[0, -0.02, 0]}>
                  <sphereGeometry args={[0.125, radial, radial]} />
                </Part>
                <Part color={pants} position={[0, -0.06, 0.2]} rotation={[1.25, 0, 0]}>
                  <cylinderGeometry args={[0.13, 0.1, 0.4, radial]} />
                </Part>
                <Part color={pants} position={[0, -0.08, 0.4]} outline={0.018}>
                  <sphereGeometry args={[0.098, radial, radial]} />
                </Part>
                <Part color={pants} position={[0, -0.42, 0.42]}>
                  <cylinderGeometry args={[0.1, 0.065, 0.4, radial]} />
                </Part>
                {/* zapato */}
                <Part color={accent} position={[0, -0.62, 0.5]} outline={0.018}>
                  <boxGeometry args={[0.14, 0.1, 0.3]} />
                </Part>
              </group>
            ))}
          </>
        )}
      </group>
    </group>
    <PuppetStrings cx={member.position[0]} cz={member.position[2]} head={mHead} hL={mHandL} hR={mHandR} />
    </>
  );
}

/** Cuerdas de marioneta semitransparentes desde una barra de control. */
function PuppetStrings({
  cx,
  cz,
  head,
  hL,
  hR,
}: {
  cx: number;
  cz: number;
  head: RefObject<THREE.Object3D>;
  hL: RefObject<THREE.Object3D>;
  hR: RefObject<THREE.Object3D>;
}) {
  const grp = useRef<THREE.Group>(null!);
  const s0 = useRef<THREE.Mesh>(null!);
  const s1 = useRef<THREE.Mesh>(null!);
  const s2 = useRef<THREE.Mesh>(null!);
  // cruces de marioneta a la altura sobre la pantalla del escenario
  const topY = 5.6;
  const tops = useMemo(
    () => [
      new THREE.Vector3(cx, topY, cz),
      new THREE.Vector3(cx - 0.32, topY, cz + 0.04),
      new THREE.Vector3(cx + 0.32, topY, cz + 0.04),
    ],
    [cx, cz],
  );
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const upd = (mesh: THREE.Mesh | null, top: THREE.Vector3, marker: THREE.Object3D | null) => {
    if (!mesh || !marker) return;
    marker.getWorldPosition(tmp);
    // pasa la posición del personaje al espacio local de las cuerdas (la banda
    // está elevada): así los hilos siguen llegando exactamente a los muñecos.
    if (grp.current) grp.current.worldToLocal(tmp);
    const dir = tmp.sub(top);
    const len = dir.length() || 0.001;
    mesh.position.copy(top).addScaledVector(dir, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  };

  useFrame(() => {
    upd(s0.current, tops[0], head.current);
    upd(s1.current, tops[1], hL.current);
    upd(s2.current, tops[2], hR.current);
  });

  const strand = (ref: RefObject<THREE.Mesh>) => (
    <mesh ref={ref}>
      <cylinderGeometry args={[0.004, 0.004, 1, 6]} />
      <meshBasicMaterial color="#6a6386" transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );

  return (
    <group ref={grp}>
      {/* barra de control (cruz de marioneta) */}
      <mesh position={[cx, topY, cz]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.9, 8]} />
        <meshStandardMaterial color="#b3a4cf" roughness={0.7} />
      </mesh>
      <mesh position={[cx, topY, cz]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.5, 8]} />
        <meshStandardMaterial color="#b3a4cf" roughness={0.7} />
      </mesh>
      {strand(s0)}
      {strand(s1)}
      {strand(s2)}
    </group>
  );
}

/**
 * Mano estilizada con dedos articulados: cada dedo tiene DOS falanges con un
 * curl distinto (índice más recto, meñique más cerrado) y el pulgar es
 * oponible — lee como agarre real sobre mástil/baqueta. `grip` controla
 * cuánto cierra el puño. Mantiene DOS colores: piel + pulsera de acento.
 * Las piezas pequeñas no proyectan sombra ni llevan contorno (rendimiento).
 */
function Hand({
  color,
  accent,
  radial,
  flip = false,
  grip = 0.35,
}: {
  color: string;
  accent: string;
  radial: number;
  flip?: boolean;
  grip?: number;
}) {
  const s = flip ? -1 : 1;
  return (
    <group>
      {/* muñeca / pulsera de color */}
      <Part color={accent} position={[0, 0.02, 0]} outline={0.01} shadow={false}>
        <cylinderGeometry args={[0.056, 0.056, 0.04, radial]} />
      </Part>
      {/* palma (aplanada, levemente ahuecada hacia el agarre) */}
      <Part color={color} position={[0, -0.06, 0.004]} rotation={[0.1, 0, 0]} scale={[1, 1, 0.5]} outline={0.012} shadow={false}>
        <sphereGeometry args={[0.068, radial, radial]} />
      </Part>
      {/* dedos: nudillo + falange proximal + falange distal */}
      {[-0.034, -0.0115, 0.0115, 0.034].map((fx, i) => {
        const curl = grip * (0.7 + i * 0.22); // índice recto → meñique cerrado
        const len = i === 3 ? 0.05 : i === 0 ? 0.058 : 0.064;
        return (
          <group key={i} position={[fx, -0.112, 0.008]} rotation={[curl, 0, 0]}>
            <Part color={color} position={[0, 0, 0]} outline={0} shadow={false}>
              <sphereGeometry args={[0.0115, 6, 5]} />
            </Part>
            <Part color={color} position={[0, -len / 2, 0]} outline={0} shadow={false}>
              <boxGeometry args={[0.019, len, 0.024]} />
            </Part>
            <group position={[0, -len, 0.002]} rotation={[curl * 1.35, 0, 0]}>
              <Part color={color} position={[0, -0.024, 0]} outline={0} shadow={false}>
                <boxGeometry args={[0.0165, 0.048, 0.02]} />
              </Part>
            </group>
          </group>
        );
      })}
      {/* pulgar oponible (dos falanges hacia la palma) */}
      <group position={[0.052 * s, -0.052, 0.022]} rotation={[0.2, 0, 0.55 * s]}>
        <Part color={color} position={[0, -0.022, 0]} outline={0} shadow={false}>
          <boxGeometry args={[0.019, 0.046, 0.024]} />
        </Part>
        <group position={[0, -0.046, 0.004]} rotation={[0.45 + grip * 0.4, 0, 0.12 * s]}>
          <Part color={color} position={[0, -0.019, 0]} outline={0} shadow={false}>
            <boxGeometry args={[0.017, 0.038, 0.02]} />
          </Part>
        </group>
      </group>
    </group>
  );
}

/** Pierna anatomica de pie: gluteo, muslo/pantorrilla conicos, rodilla, pie. */
function Leg({
  x,
  bone,
  accent,
  pants,
  radial,
}: {
  x: number;
  bone: string;
  accent: string;
  cap: number;
  pants: string;
  radial: number;
}) {
  return (
    <group position={[x, -0.04, 0]}>
      {/* pantalon: cadera/muslo/rodilla/pantorrilla */}
      <Part color={pants} position={[0, -0.02, 0]}>
        <sphereGeometry args={[0.14, radial, radial]} />
      </Part>
      <Part color={pants} position={[0, -0.26, 0]}>
        <cylinderGeometry args={[0.142, 0.1, 0.44, radial]} />
      </Part>
      <Part color={pants} position={[0, -0.48, 0]} outline={0.018}>
        <sphereGeometry args={[0.094, radial, radial]} />
      </Part>
      <Part color={pants} position={[0, -0.69, 0]}>
        <cylinderGeometry args={[0.108, 0.072, 0.42, radial]} />
      </Part>
      {/* tobillo (calcetin) */}
      <Part color={bone} position={[0, -0.89, 0]}>
        <sphereGeometry args={[0.056, radial, radial]} />
      </Part>
      {/* zapato */}
      <Part color={accent} position={[0, -0.93, 0.07]} outline={0.018}>
        <boxGeometry args={[0.15, 0.1, 0.3]} />
      </Part>
    </group>
  );
}
