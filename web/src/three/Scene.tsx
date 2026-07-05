import { Suspense } from "react";
import { OrbitControls } from "@react-three/drei";
import { Stage } from "./Stage";
import { BandRig } from "./BandRig";
import { DrumKit } from "./Instruments";
import { SetlistSheet } from "./SetlistSheet";
import { CameraRig } from "./CameraRig";
import { Effects } from "./Effects";
import { AudioVisual } from "./AudioVisual";
import { useConductorTick } from "../audio/useConductor";
import { useApp } from "../state/store";
import { STAGE_LIFT, type Quality } from "../config/song";

/** Contenido del Canvas R3F. */
export function Scene({ quality }: { quality: Quality }) {
  // Tick del conductor al inicio del loop (prioridad -1).
  useConductorTick();
  const warp = useApp((s) => s.warp);
  const freeCam = useApp((s) => s.freeCam);

  return (
    <>
      <CameraRig />
      {/* Cámara libre: el visitante explora el mapa (órbita/zoom/paneo). */}
      {freeCam && (
        <OrbitControls
          makeDefault
          enablePan
          enableDamping
          dampingFactor={0.08}
          minDistance={1.5}
          maxDistance={45}
          target={[0, 1.2, 0]}
        />
      )}
      {/* Banda + escenario: se ocultan durante el «warp» del instrumental. */}
      <group visible={!warp}>
        <Suspense fallback={null}>
          <Stage quality={quality} />
          {/* backline elevado: SIN personajes — instrumentos flotando +
              cúmulos de partículas por integrante (BandRig) + batería */}
          <group position={[0, STAGE_LIFT, 0]}>
            <DrumKit />
            <BandRig />
            {/* hoja blanca del set list (clicable) en el frente del escenario */}
            <SetlistSheet position={[0, 0.02, 1.7]} />
          </group>
        </Suspense>
      </group>
      {/* Visual reactivo (estilo KekkoRider) a mitad del instrumental. */}
      <AudioVisual active={warp} quality={quality} />
      <Effects quality={quality} />
    </>
  );
}
