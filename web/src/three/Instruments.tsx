import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import { PALETTE } from "../config/song";
import { toonGradient } from "./materials";

const ink = PALETTE.ink;

/** Pieza toon con contorno (madera / plástico). */
function T({
  children,
  color,
  position,
  rotation,
  scale,
  outline = 0.015,
}: {
  children: ReactNode;
  color: THREE.ColorRepresentation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  outline?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow>
      {children}
      <meshToonMaterial color={color} gradientMap={toonGradient()} />
      {outline > 0 && <Outlines thickness={outline} color={ink} />}
    </mesh>
  );
}

/** Hardware cromado. */
function Metal({
  children,
  position,
  rotation,
  color = "#b9c0cc",
  rough = 0.3,
}: {
  children: ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  rough?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      {children}
      <meshStandardMaterial color={color} metalness={1} roughness={rough} />
    </mesh>
  );
}

// ============================================================================
//  GUITARRA (Stratocaster) / BAJO (Jazz Bass)
// ============================================================================

/**
 * Silueta real de cuerpo (doble cutaway) como THREE.Shape, para extruir con
 * grosor. Coordenadas en el plano XY (Y hacia el mastil). `wide` ensancha el
 * cuerpo (bajo). Se obtiene un contorno de guitarra, no un apilado de esferas.
 */
function makeBodyShape(wide: number): THREE.Shape {
  const s = new THREE.Shape();
  const w = 0.34 * wide;
  s.moveTo(0, -0.52);
  // lado derecho: bout inferior -> cintura -> bout superior -> cuerno
  s.bezierCurveTo(0.30 * wide, -0.54, 0.34 * wide, -0.08, 0.21 * wide, 0.06);
  s.bezierCurveTo(0.30 * wide, 0.18, 0.40 * wide, 0.34, 0.30 * wide, 0.5);
  s.bezierCurveTo(0.22 * wide, 0.44, 0.14 * wide, 0.41, 0.075, 0.42);
  // talon del mastil (neck pocket)
  s.lineTo(-0.075, 0.42);
  // lado izquierdo (cuerno superior un poco mas largo: look offset)
  s.bezierCurveTo(-0.15 * wide, 0.43, -0.2 * wide, 0.62, -0.34 * wide, 0.54);
  s.bezierCurveTo(-0.44 * wide, 0.46, -0.30 * wide, 0.3, -0.31 * wide, 0.24);
  s.bezierCurveTo(-0.33 * wide, 0.16, -0.17 * wide, 0.14, -0.21 * wide, 0.06);
  s.bezierCurveTo(-0.34 * wide, -0.08, -w, -0.54, 0, -0.52);
  return s;
}

interface StringedProps {
  kind: "strat" | "jazz";
  reactKey: "guitar" | "bass";
  bodyColor: string;
  pickguard: string;
  neckLen: number;
}

function Stringed({ kind, reactKey, bodyColor, pickguard, neckLen }: StringedProps) {
  const root = useRef<THREE.Group>(null!);
  const isBass = kind === "jazz";
  const sc = isBass ? 1.12 : 1;
  const nStr = isBass ? 4 : 6;
  const woodNeck = "#caa46a";
  const board = "#3a2618";
  const headTop = 0.5 + neckLen + (isBass ? 0.34 : 0.28);

  // Material compartido por las cuerdas reales (brilla con el instrumento).
  const stringMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e8ecf2",
        emissive: new THREE.Color(PALETTE.bone),
        emissiveIntensity: 0.1,
        metalness: 1,
        roughness: 0.28,
      }),
    [],
  );
  // Geometria de cuerda (un cilindro fino reutilizado, escalado por instancia).
  const stringGeo = useMemo(
    () => new THREE.CylinderGeometry(1, 1, 1, 6),
    [],
  );

  // Cuerpo extruido con silueta real (centrado en Z para que el frente mire +Z).
  const bodyGeo = useMemo(() => {
    const depth = isBass ? 0.15 : 0.13;
    const shape = makeBodyShape(isBass ? 1.12 : 1);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.018,
      bevelSegments: 2,
      curveSegments: 24,
    });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  }, [isBass]);

  // Material iridiscente «prisma»: barniz que descompone la luz (thin-film).
  const bodyMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(bodyColor),
        metalness: 0.42,
        roughness: 0.3,
        clearcoat: 0.7,
        clearcoatRoughness: 0.22,
        iridescence: 1,
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [120, 440],
        envMapIntensity: 1.25,
      }),
    [bodyColor],
  );

  // Cuerdas: de la cejuela (arriba) al puente (abajo), repartidas en X.
  const nutY = 0.5 + neckLen + (isBass ? 0.02 : 0.0);
  const bridgeY = -0.3;
  const strLen = nutY - bridgeY;
  const strCenterY = (nutY + bridgeY) / 2;
  const halfW = isBass ? 0.032 : 0.026;
  const strings = useMemo(() => {
    const arr: { x: number; r: number }[] = [];
    for (let i = 0; i < nStr; i++) {
      const x = nStr > 1 ? (i / (nStr - 1) - 0.5) * 2 * halfW : 0;
      // graves mas gruesas (izquierda) -> agudas mas finas (derecha)
      const r = (isBass ? 0.0034 : 0.0022) * (1 - i / (nStr * 1.6));
      arr.push({ x, r });
    }
    return arr;
  }, [nStr, halfW, isBass]);

  useFrame(() => {
    const e = conductor.frame.energy[reactKey];
    const p = conductor.frame.pulse[reactKey];
    stringMat.emissiveIntensity = 0.1 + e * 0.7 + p * 0.6;
    if (root.current) root.current.position.z = p * 0.018;
  });

  return (
    <group ref={root} scale={sc}>
      {/* ---------- CUERPO (silueta extruida + barniz prisma) ---------- */}
      <mesh geometry={bodyGeo} material={bodyMat} castShadow receiveShadow>
        <Outlines thickness={0.012} color={ink} />
      </mesh>

      {/* pickguard (sigue el contorno, mas pequeno) */}
      <T color={pickguard} position={[0.02, 0.04, 0.07]} scale={[0.86, 1.06, 0.3]} outline={0.008}>
        <sphereGeometry args={[0.22, 20, 14]} />
      </T>

      {/* pastillas (single-coil x3 strat / J x2 bass) */}
      {(isBass
        ? [
            [0, 0.08, 0.11, 0.26],
            [0, -0.18, 0.11, 0.2],
          ]
        : [
            [0, 0.14, 0.11, 0.2],
            [0, -0.02, 0.11, 0.2],
            [0.02, -0.18, 0.11, 0.2, -0.25],
          ]
      ).map((pk, i) => (
        <T
          key={i}
          color="#15151b"
          position={[pk[0], pk[1], pk[2]]}
          rotation={[0, 0, (pk[4] as number) || 0]}
          outline={0.006}
        >
          <boxGeometry args={[pk[3] as number, 0.05, 0.05]} />
        </T>
      ))}

      {/* puente (placa) + selletas individuales por cuerda */}
      <Metal position={[0, -0.3, 0.1]} color="#9aa0ad">
        <boxGeometry args={[0.22, 0.07, 0.05]} />
      </Metal>
      {strings.map((st, i) => (
        <Metal key={`sad${i}`} position={[st.x, -0.31, 0.13]} color="#d2d6de" rough={0.32}>
          <boxGeometry args={[isBass ? 0.014 : 0.011, 0.03, 0.05]} />
        </Metal>
      ))}
      {/* salida jack + boton de correa */}
      <Metal position={[0.2, -0.18, 0.12]} color="#cfd3da" rough={0.35}>
        <cylinderGeometry args={[0.022, 0.022, 0.03, 12]} />
      </Metal>
      <Metal position={[0, -0.42, 0.0]} color="#b9c0cc">
        <cylinderGeometry args={[0.018, 0.018, 0.04, 10]} />
      </Metal>
      {/* perillas */}
      {[
        [0.14, -0.12],
        [0.17, -0.24],
      ].map((k, i) => (
        <Metal key={i} position={[k[0], k[1], 0.12]} color="#d8dde6" rough={0.35}>
          <cylinderGeometry args={[0.025, 0.025, 0.04, 12]} />
        </Metal>
      ))}

      {/* ---------- MASTIL ---------- */}
      <T color={woodNeck} position={[0, 0.5 + neckLen / 2, 0.0]}>
        <boxGeometry args={[isBass ? 0.085 : 0.072, neckLen, 0.06]} />
      </T>
      {/* diapason */}
      <T color={board} position={[0, 0.5 + neckLen / 2, 0.04]} outline={0.005}>
        <boxGeometry args={[isBass ? 0.08 : 0.066, neckLen, 0.022]} />
      </T>
      {/* trastes + inlays */}
      {Array.from({ length: 7 }).map((_, i) => {
        const y = 0.62 + i * (neckLen / 8);
        return (
          <group key={i}>
            <Metal position={[0, y, 0.052]} color="#c8ccd4" rough={0.3}>
              <boxGeometry args={[isBass ? 0.08 : 0.066, 0.006, 0.006]} />
            </Metal>
            {i % 2 === 1 && (
              <T color="#e9e3d3" position={[0, y - neckLen / 16, 0.053]} outline={0}>
                <cylinderGeometry args={[0.008, 0.008, 0.006, 8]} />
              </T>
            )}
          </group>
        );
      })}

      {/* ---------- CLAVIJERO (6 in-line strat / 4 jazz) ---------- */}
      <T color={woodNeck} position={[0, headTop, 0.0]} rotation={[0, 0, isBass ? 0 : 0.06]}>
        <boxGeometry args={[isBass ? 0.13 : 0.12, isBass ? 0.34 : 0.28, 0.05]} />
      </T>
      {Array.from({ length: nStr }).map((_, i) => {
        const y = headTop - (isBass ? 0.05 : 0.02) - i * (isBass ? 0.075 : 0.042);
        return (
          <group key={i}>
            {/* poste / eje de la clavija */}
            <Metal position={[0.085, y, 0.03]} rotation={[0, 0, Math.PI / 2]} color="#d8dde6">
              <cylinderGeometry args={[0.013, 0.013, 0.07, 8]} />
            </Metal>
            {/* boton de afinacion (ovalo) por detras del clavijero */}
            <Metal
              position={[0.14, y, -0.04]}
              rotation={[Math.PI / 2, 0, 0]}
              color="#e3e7ee"
              rough={0.28}
            >
              <cylinderGeometry args={[0.018, 0.026, 0.05, 10]} />
            </Metal>
          </group>
        );
      })}

      {/* ---------- CEJUELA (nut) ---------- */}
      <T color="#efe9da" position={[0, 0.5 + neckLen + 0.005, 0.05]} outline={0.004}>
        <boxGeometry args={[isBass ? 0.082 : 0.068, 0.018, 0.03]} />
      </T>

      {/* ---------- CUERDAS REALES (cilindros finos, reactivos) ---------- */}
      {strings.map((st, i) => (
        <mesh
          key={`str${i}`}
          geometry={stringGeo}
          material={stringMat}
          position={[st.x, strCenterY, 0.072]}
          scale={[st.r, strLen, st.r]}
        />
      ))}
    </group>
  );
}

export function Guitar() {
  // guitarra rosa oscuro pastel (con brillo prisma)
  return <Stringed kind="strat" reactKey="guitar" bodyColor="#c2547e" pickguard="#efe6d2" neckLen={0.85} />;
}
export function Bass() {
  // bajo rojo oscuro pastel (con brillo prisma)
  return <Stringed kind="jazz" reactKey="bass" bodyColor="#8c3a3f" pickguard="#efe6d2" neckLen={1.05} />;
}

// ============================================================================
//  BATERIA (kit realista)
// ============================================================================

/** Anillo de lugs (cuerpos) + varillas de tension entre aros (look real). */
function Lugs({ radius, depth, count = 8 }: { radius: number; depth: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const a = (i / count) * Math.PI * 2;
        const cx = Math.cos(a) * radius;
        const cy = Math.sin(a) * radius;
        return (
          <group key={i}>
            {/* cuerpo del lug sobre el casco */}
            <Metal position={[cx, cy, 0]} color="#c8ccd4" rough={0.35}>
              <boxGeometry args={[0.03, 0.07, depth * 0.6]} />
            </Metal>
            {/* varilla de tension paralela al eje del casco, entre ambos aros */}
            <Metal
              position={[Math.cos(a) * (radius + 0.018), Math.sin(a) * (radius + 0.018), 0]}
              rotation={[Math.PI / 2, 0, 0]}
              color="#e0e3ea"
              rough={0.22}
            >
              <cylinderGeometry args={[0.006, 0.006, depth + 0.04, 6]} />
            </Metal>
          </group>
        );
      })}
    </>
  );
}

/** Cartel encendido con texto (p.ej. "MDK") para el parche del bombo. */
function DrumBadge({ text, z }: { text: string; z: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 150;
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, 320, 150);
    x.font = "800 96px 'Archivo Black', system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.shadowColor = "#ff7ab0";
    x.shadowBlur = 30;
    x.fillStyle = "#fff6e9";
    x.fillText(text, 160, 80);
    x.shadowBlur = 0;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text]);
  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[0.4, 0.19]} />
      <meshStandardMaterial
        map={tex}
        emissiveMap={tex}
        emissive="#ffffff"
        emissiveIntensity={1.1}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Tambor con casco, lugs y parche reactivo; bombo con cartel encendido. */
function Drum({
  pos,
  radius,
  depth,
  color,
  reactKey,
  rotation = [0, 0, 0],
  headColor = "#efeadd",
  logoText,
}: {
  pos: [number, number, number];
  radius: number;
  depth: number;
  color: string;
  reactKey: "kick" | "snare" | "hihat";
  rotation?: [number, number, number];
  headColor?: string;
  logoText?: string;
}) {
  const head = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => {
    if (head.current) head.current.emissiveIntensity = conductor.frame.pulse[reactKey] * 0.5;
  });
  return (
    <group position={pos} rotation={rotation}>
      {/* casco */}
      <T color={color} rotation={[Math.PI / 2, 0, 0]} outline={0.012}>
        <cylinderGeometry args={[radius, radius, depth, 30]} />
      </T>
      {/* lugs (sin aros metalicos redondos) */}
      <Lugs radius={radius * 0.98} depth={depth} count={radius > 0.4 ? 10 : 8} />
      {/* parche frontal */}
      <mesh position={[0, 0, depth / 2 + 0.001]}>
        <circleGeometry args={[radius * 0.95, 30]} />
        <meshStandardMaterial ref={head} color={headColor} emissive={PALETTE.bone} emissiveIntensity={0} roughness={0.7} />
      </mesh>
      {logoText && <DrumBadge text={logoText} z={depth / 2 + 0.004} />}
    </group>
  );
}

/** Stand de tripode metalico. */
function Stand({ pos, h }: { pos: [number, number, number]; h: number }) {
  return (
    <group position={pos}>
      <Metal position={[0, h / 2, 0]} color="#aab0ba">
        <cylinderGeometry args={[0.018, 0.022, h, 10]} />
      </Metal>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <Metal key={i} position={[Math.cos(a) * 0.14, 0.11, Math.sin(a) * 0.14]} rotation={[0, -a, 0.5]} color="#9aa0ad">
            <cylinderGeometry args={[0.013, 0.013, 0.32, 8]} />
          </Metal>
        );
      })}
    </group>
  );
}

/** Plato inclinado que vibra/brilla con el golpe. */
function Cymbal({
  pos,
  reactKey,
  size = 0.34,
  tilt = 0.2,
}: {
  pos: [number, number, number];
  reactKey: "hihat" | "snare";
  size?: number;
  tilt?: number;
}) {
  const grp = useRef<THREE.Group>(null!);
  useFrame(() => {
    const p = conductor.frame.pulse[reactKey];
    if (grp.current) grp.current.rotation.z = tilt + p * 0.28;
  });
  return (
    <group position={pos}>
      <Stand pos={[0, -pos[1], 0]} h={pos[1]} />
      <group ref={grp} rotation={[0, 0, tilt]}>
        {/* plato con perfil conico (mas grueso al centro, fino al borde) */}
        <mesh castShadow>
          <cylinderGeometry args={[size, size * 0.985, 0.006, 36]} />
          <meshStandardMaterial color="#c2a23e" metalness={1} roughness={0.32} />
        </mesh>
        {/* lomo del plato (taper hacia el centro) */}
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[size * 0.42, size * 0.62, 0.022, 28]} />
          <meshStandardMaterial color="#c6a743" metalness={1} roughness={0.3} />
        </mesh>
        {/* campana (bell) abovedada */}
        <mesh position={[0, 0.03, 0]} scale={[1, 0.6, 1]}>
          <sphereGeometry args={[size * 0.2, 18, 14]} />
          <meshStandardMaterial color="#caa84a" metalness={1} roughness={0.26} />
        </mesh>
        {/* tornillo / fieltro central */}
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.05, 10]} />
          <meshStandardMaterial color="#cfd3da" metalness={0.9} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** Kit completo, mirando a camara — bateria negra «MDK», colocacion creible. */
export function DrumKit() {
  const shell = "#15151a"; // casco negro
  const shellSnare = "#2a2a32"; // redoblante negro un pelin mas claro
  return (
    <group position={[0, 0, -1.15]}>
      {/* Bombo al frente, parche oscuro con cartel "MDK" encendido */}
      <Drum pos={[0, 0.5, 0]} radius={0.5} depth={0.42} color={shell} reactKey="kick" headColor="#101015" logoText="MDK" />
      {/* spurs (patas) del bombo, atras */}
      {[-0.4, 0.4].map((x, i) => (
        <Metal key={i} position={[x, 0.14, -0.16]} rotation={[-0.3, 0, x > 0 ? -0.4 : 0.4]} color="#9aa0ad">
          <cylinderGeometry args={[0.013, 0.013, 0.36, 8]} />
        </Metal>
      ))}

      {/* Barra de montaje de los toms (sale del bombo) */}
      <Metal position={[0, 1.02, -0.04]} color="#9aa0ad">
        <cylinderGeometry args={[0.018, 0.018, 0.3, 8]} />
      </Metal>
      {/* Toms rack apoyados sobre el bombo, ligera inclinacion hacia el frente */}
      <Drum pos={[-0.26, 0.96, 0.12]} radius={0.17} depth={0.18} color={shell} reactKey="snare" rotation={[Math.PI / 2 - 0.5, 0, 0]} />
      <Drum pos={[0.26, 0.98, 0.12]} radius={0.19} depth={0.2} color={shell} reactKey="snare" rotation={[Math.PI / 2 - 0.5, 0, 0]} />

      {/* Redoblante (snare) en su soporte, a la izquierda — NO frente al bombo */}
      <group position={[-0.62, 0, 0.16]}>
        <Stand pos={[0, 0, 0]} h={0.6} />
        <Drum pos={[0, 0.66, 0]} radius={0.2} depth={0.15} color={shellSnare} reactKey="snare" rotation={[Math.PI / 2, 0, 0]} />
      </group>

      {/* Tom de piso a la derecha, sobre patas */}
      <group position={[0.86, 0, 0.22]}>
        <Drum pos={[0, 0.5, 0]} radius={0.25} depth={0.42} color={shell} reactKey="kick" rotation={[Math.PI / 2, 0, 0]} />
        {[-0.19, 0.19].map((x, i) => (
          <Metal key={i} position={[x, 0.24, 0]} color="#9aa0ad">
            <cylinderGeometry args={[0.014, 0.014, 0.48, 8]} />
          </Metal>
        ))}
      </group>

      {/* Hi-hat: dos platos a la izquierda */}
      <group position={[-1.0, 0, 0.4]}>
        <Stand pos={[0, 0, 0]} h={0.86} />
        <mesh position={[0, 0.86, 0]} rotation={[0, 0, 0.04]}>
          <cylinderGeometry args={[0.21, 0.21, 0.01, 28]} />
          <meshStandardMaterial color="#c2a23e" metalness={1} roughness={0.32} />
        </mesh>
        <Cymbal pos={[0, 0.93, 0]} reactKey="hihat" size={0.21} tilt={0.04} />
      </group>

      {/* Crash (izq, alto) + ride (der, alto) en sus soportes */}
      <Cymbal pos={[-0.82, 1.42, -0.32]} reactKey="snare" size={0.33} tilt={0.24} />
      <Cymbal pos={[0.98, 1.28, -0.2]} reactKey="hihat" size={0.4} tilt={-0.2} />
    </group>
  );
}
