import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import { useApp } from "../state/store";
import type { Quality } from "../config/song";

/**
 * Postproceso reactivo: el bloom respira con la energia y la aberracion
 * cromatica "glitchea" en los golpes de kick/snare -> sensacion internetcore.
 */
export function Effects({ quality }: { quality: Quality }) {
  const bloomRef = useRef<{ intensity: number }>(null!);
  const chromaOffset = useRef(new THREE.Vector2(0.0003, 0.0003));

  useFrame(() => {
    const f = conductor.frame;
    const e = f.energy;
    const drive = (e.kick + e.snare + e.bass + e.guitar) / 4;
    // Durante el visual del instrumental el bloom sube (look soñador del repo).
    const warp = useApp.getState().warp;
    if (bloomRef.current)
      bloomRef.current.intensity = warp
        ? 1.2 + drive * 1.0 + conductor.audioLevel() * 1.2
        : 0.3 + drive * 0.7 + conductor.userPulse * 0.8;
    chromaOffset.current.set(0.0002, 0.0002);
  });

  if (!quality.bloom) return null;

  // Look cartoon claro: bloom tenue con umbral alto, vineta muy leve.
  return (
    <EffectComposer multisampling={quality.grain ? 4 : 0}>
      <Bloom
        // @ts-expect-error ref to underlying effect for live intensity
        ref={bloomRef}
        intensity={0.35}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.5}
        mipmapBlur
        radius={0.7}
      />
      <Vignette eskil={false} offset={0.4} darkness={0.22} />
    </EffectComposer>
  );
}
