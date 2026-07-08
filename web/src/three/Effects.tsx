import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Noise,
  Scanline,
  HueSaturation,
  BrightnessContrast,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import { useApp } from "../state/store";
import type { Quality } from "../config/song";

/**
 * Postproceso reactivo con GRADE de directo (anti-«video genérico»):
 * bloom que respira con la energía, aberración cromática que glitchea en los
 * golpes de kick/snare, grano de película, scanlines de cámara de concierto,
 * saturación/contraste levemente subidos y viñeta de lente.
 */
export function Effects({ quality }: { quality: Quality }) {
  const bloomRef = useRef<{ intensity: number }>(null!);
  const chromaOffset = useRef(new THREE.Vector2(0.00035, 0.0002));

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
    // La aberración late con kick/snare: base fina + golpe corto en el hit.
    const hit = Math.max(f.pulse.kick, f.pulse.snare * 0.7);
    const k = 0.00035 + hit * 0.0022;
    chromaOffset.current.set(k, k * 0.6);
  });

  if (!quality.bloom) return null;

  // Look cartoon claro con grade encima: cine antes que captura de pantalla.
  // En móvil (sin grain/chroma) queda solo bloom + grade + viñeta, baratos.
  const effects = [
    <Bloom
      key="bloom"
      // @ts-expect-error ref to underlying effect for live intensity
      ref={bloomRef}
      intensity={0.35}
      luminanceThreshold={0.85}
      luminanceSmoothing={0.5}
      mipmapBlur
      radius={0.7}
    />,
  ];
  if (quality.chroma)
    effects.push(
      <ChromaticAberration
        key="chroma"
        offset={chromaOffset.current}
        radialModulation
        modulationOffset={0.35}
      />,
    );
  // grade sutil: colores un punto más vivos y negros más firmes
  effects.push(<HueSaturation key="hue" saturation={0.14} />);
  effects.push(<BrightnessContrast key="bc" brightness={0.0} contrast={0.07} />);
  if (quality.grain) {
    effects.push(<Noise key="noise" premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.5} />);
    effects.push(<Scanline key="scan" blendFunction={BlendFunction.OVERLAY} density={1.1} opacity={0.045} />);
  }
  effects.push(<Vignette key="vig" eskil={false} offset={0.32} darkness={0.32} />);

  return <EffectComposer multisampling={quality.grain ? 4 : 0}>{effects}</EffectComposer>;
}
