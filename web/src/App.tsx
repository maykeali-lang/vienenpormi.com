import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Scene } from "./three/Scene";
import { Hud } from "./ui/Hud";
import { Subtitle } from "./ui/Subtitle";
import { Interactive } from "./ui/Interactive";
import { WarpFlash } from "./ui/WarpFlash";
import { Setlist } from "./ui/Setlist";
import { Hero } from "./ui/Hero";
import { About } from "./ui/About";
import { useLoadSong } from "./audio/useConductor";
import { syncPlays } from "./state/plays";
import { useApp } from "./state/store";
import { detectQuality, PALETTE, SCENERY } from "./config/song";

export default function App() {
  const quality = useMemo(() => detectQuality(), []);
  const heroDone = useApp((s) => s.heroDone);
  // Carga envelopes + mixdown al montar (idempotente).
  useLoadSong();
  // Lee el contador global (o local) una vez al cargar.
  useEffect(() => {
    void syncPlays();
  }, []);

  return (
    <div className="app">
      <Canvas
        shadows={quality.shadows}
        dpr={quality.dpr}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        camera={{ position: [0, 1.7, 7.2], fov: 42, near: 0.1, far: 80 }}
        onCreated={({ gl, scene }) => {
          // Cielo diurno «Tierra de Ooo»: turquesa arriba -> verde palido al
          // horizonte (Hora de Aventura).
          const c = document.createElement("canvas");
          c.width = 4;
          c.height = 256;
          const ctx = c.getContext("2d")!;
          const grad = ctx.createLinearGradient(0, 0, 0, 256);
          grad.addColorStop(0, SCENERY.skyTop);
          grad.addColorStop(0.55, SCENERY.skyMid);
          grad.addColorStop(1, SCENERY.skyHorizon);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 4, 256);
          const tex = new THREE.CanvasTexture(c);
          tex.colorSpace = THREE.SRGBColorSpace;
          scene.background = tex;
          gl.setClearColor(PALETTE.bg);
        }}
      >
        <Scene quality={quality} />
      </Canvas>

      <Hud />
      <Subtitle />
      <Interactive />
      <WarpFlash />
      <Setlist />
      {!heroDone && <Hero />}
      <About />
      <div className="grain" />
    </div>
  );
}
