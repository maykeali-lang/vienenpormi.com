import { Performer, GLBModel, MODELS } from "./models";
import { Guitar, Bass } from "./Instruments";

// ============================================================================
//  BAND — 3 personajes GLB animados tocando (guitarra / bajo+voz / batería).
//  Los valores de POSICIÓN/ROTACIÓN/ESCALA están aquí arriba para afinarlos a
//  ojo en el dev server (el ajuste fino de assets importados es manual).
// ============================================================================

// Animaciones del personaje base (prefijo "Rig|"). Mano(s) al frente para
// "sujetar" el instrumento; el baterista, sentado.
const CLIP = {
  guitar: "Rig|Pistol_Idle_Loop", // manos al frente (sujeta la guitarra)
  bass: "Rig|Pistol_Idle_Loop",
  drums: "Rig|Sitting_Idle_Loop", // sentado tras la batería
};

export function Band() {
  return (
    <group>
      {/* ---------------- GUITARRA (izquierda) ---------------- */}
      <Performer clip={CLIP.guitar} position={[-2.3, 0, 0.3]} rotationY={0.18} height={1.75} speed={0.9}>
        <group position={[0.12, 1.02, 0.26]} rotation={[0.1, -0.2, -0.95]} scale={0.5}>
          <Guitar />
        </group>
      </Performer>

      {/* ---------------- BAJO / VOZ (derecha, al micro) ---------------- */}
      <Performer clip={CLIP.bass} position={[2.3, 0, 0.3]} rotationY={-0.18} height={1.78} speed={0.85}>
        <group position={[-0.12, 1.0, 0.26]} rotation={[0.1, 0.2, 0.95]} scale={0.52}>
          <Bass />
        </group>
      </Performer>
      {/* micrófono del concert pack frente al cantante */}
      <GLBModel url={MODELS.mic} fit={1.55} fitAxis="y" position={[2.3, 0, 0.95]} rotation={[0, Math.PI, 0]} />

      {/* ---------------- BATERÍA (centro-atrás) ---------------- */}
      <Performer clip={CLIP.drums} position={[0, 0, -1.75]} rotationY={0} height={1.7} speed={0.95} />
      {/* kit GLB delante del baterista */}
      <GLBModel url={MODELS.drumkit} fit={2.0} fitAxis="xz" position={[0, 0, -1.05]} rotation={[0, 0, 0]} />
    </group>
  );
}
