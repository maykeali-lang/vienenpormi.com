import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { conductor } from "../audio/conductor";
import { useApp } from "../state/store";
import type { Quality } from "../config/song";

// ============================================================================
//  AUDIO VISUAL — recreacion del "ThreeJS Audio-Reactive Visual" de KekkoRider
//  (github.com/kekkorider/threejs-audio-reactive-visual): particulas que
//  emanan de una esfera (paleta cosenoidal iridiscente, additive), un
//  icosaedro wireframe que late y una cupula de fondo deformada por ruido.
//  Aqui el "uInfluence" sale del ESPECTRO REAL del mixdown (conductor.audioLevel).
// ============================================================================

// Paleta cosenoidal de Inigo Quilez (la misma del repo original).
const PALETTE_GLSL = /* glsl */ `
vec3 palette(float t){
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.00, 0.10, 0.20);
  return a + b*cos(6.28318*(c*t + d));
}`;

// Simplex 3D noise (Ashima / Ian McEwan) — idéntico al modulo del repo.
const SNOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

const PARTICLE_VERT = /* glsl */ `
attribute vec3 aDirection;
attribute float aRandom;
uniform float uTime;
uniform float uInfluence;
varying float vAlpha;
varying vec3 vColor;
${PALETTE_GLSL}
void main(){
  float progress = fract(uTime*0.5*aRandom + aRandom);
  float alpha = smoothstep(0.0, 0.2, progress) * smoothstep(1.0, 0.6, progress);
  vec3 pos = position + aDirection*progress*1.9 + aDirection*uInfluence*0.35;
  vec4 mv = instanceMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * mv;
  vAlpha = alpha;
  vColor = palette(distance(vec3(0.0), pos)*0.32 + uTime*0.15);
}`;

const PARTICLE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main(){
  gl_FragColor = vec4(vColor, 1.0) * vAlpha;
}`;

const BG_VERT = /* glsl */ `
uniform float uTime;
varying float vMix;
varying vec3 vColor;
${SNOISE_GLSL}
${PALETTE_GLSL}
void main(){
  float n = snoise(position*0.2 + uTime*0.1);
  n = n*0.5 + 0.5;
  vec3 pos = position;
  vec3 dir = normalize(pos);
  pos -= dir*n*2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  vMix = n;
  vColor = palette(pos.x*0.1 + uTime*0.1);
}`;

const BG_FRAG = /* glsl */ `
varying float vMix;
varying vec3 vColor;
void main(){
  vec3 cA = vec3(0.0);
  float a = smoothstep(0.3, 0.8, vMix);
  vec3 col = mix(cA, vColor, a);
  gl_FragColor = vec4(col, 1.0) * a;
}`;

const BG_COLOR = new THREE.Color("#0d021f");

export function AudioVisual({ active, quality }: { active: boolean; quality: Quality }) {
  const { camera, scene } = useThree();
  const group = useRef<THREE.Group>(null!);
  const ico = useRef<THREE.Mesh>(null!);
  const bg = useRef<THREE.Mesh>(null!);
  const particlesRef = useRef<THREE.InstancedMesh>(null!);
  const tick = useRef(0);
  const prevBg = useRef<THREE.Color | THREE.Texture | null>(null);

  const COUNT = quality.shadows ? 2400 : 1100;
  const bgSeg = quality.shadows ? [120, 60] : [56, 28];

  const particleMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 1 }, uInfluence: { value: 0 } },
      }),
    [],
  );

  const bgMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        side: THREE.BackSide,
        wireframe: true,
        transparent: true,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  );

  const particleGeo = useMemo(() => new THREE.SphereGeometry(0.02, 8, 8), []);
  const bgGeo = useMemo(
    () => new THREE.SphereGeometry(6.5, bgSeg[0], bgSeg[1]),
    [bgSeg],
  );

  // Reparte las particulas en la superficie de una esfera (radio 2) y guarda
  // su direccion radial + semilla aleatoria como atributos instanciados.
  useEffect(() => {
    const mesh = particlesRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const dirs = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    // PRNG determinista
    let s = 99173;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < COUNT; i++) {
      const u = rand();
      const v = rand();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);
      const R = 2.0;
      dummy.position.set(x * R, y * R, z * R);
      dummy.scale.setScalar(0.5 + rand() * 0.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      dirs[i * 3] = x;
      dirs[i * 3 + 1] = y;
      dirs[i * 3 + 2] = z;
      rnd[i] = 0.4 + rand() * 0.6;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute("aDirection", new THREE.InstancedBufferAttribute(dirs, 3));
    mesh.geometry.setAttribute("aRandom", new THREE.InstancedBufferAttribute(rnd, 1));
  }, [COUNT]);

  // Fondo oscuro (morado) durante la escena; restaura el cielo al salir.
  useEffect(() => {
    if (active) {
      prevBg.current = (scene.background as THREE.Color | THREE.Texture | null) ?? null;
      scene.background = BG_COLOR;
    } else if (prevBg.current !== null) {
      scene.background = prevBg.current;
      prevBg.current = null;
    }
    return () => {
      if (prevBg.current !== null) {
        scene.background = prevBg.current;
        prevBg.current = null;
      }
    };
  }, [active, scene]);

  useFrame((state, dt) => {
    if (!active) return;
    const d = Math.min(dt, 1 / 30);
    const lvl = conductor.audioLevel(); // 0..1 (espectro real del mixdown)

    particleMat.uniforms.uTime.value += d * (0.6 + lvl * 1.6);
    particleMat.uniforms.uInfluence.value = THREE.MathUtils.lerp(
      particleMat.uniforms.uInfluence.value,
      lvl * 3.4,
      0.18,
    );
    bgMat.uniforms.uTime.value = state.clock.elapsedTime;

    if (group.current) {
      group.current.rotation.y += 0.002;
      group.current.rotation.z += 0.0012;
    }
    if (ico.current) {
      ico.current.rotation.x += 0.009;
      ico.current.scale.setScalar(1 - lvl * 0.28 + conductor.frame.pulse.kick * 0.18);
    }
    if (bg.current) {
      bg.current.rotation.z -= 0.003;
      bg.current.rotation.y -= 0.001;
    }

    // camara: orbita lenta modulada por el audio (como el repo original).
    // Si el visitante activó la cámara libre, no la tocamos.
    if (!useApp.getState().freeCam) {
      tick.current += 0.01;
      const sp = 0.5 + lvl * 0.9;
      camera.position.set(
        Math.sin(tick.current * 0.63) * 2.2 * sp,
        Math.sin(tick.current * 0.84) * 1.6 * sp,
        Math.cos(tick.current * 0.39) * 4.6,
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
    }
  });

  return (
    <group visible={active}>
      {/* cupula de fondo (wireframe deformado por ruido) */}
      <mesh ref={bg} geometry={bgGeo} material={bgMat} />

      <group ref={group}>
        {/* icosaedro wireframe central que late */}
        <mesh ref={ico}>
          <icosahedronGeometry args={[1.2, 0]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.5} />
        </mesh>

        {/* particulas que emanan de la esfera */}
        <instancedMesh
          ref={particlesRef}
          args={[
            particleGeo,
            particleMat,
            COUNT,
          ]}
          frustumCulled={false}
        />
      </group>
    </group>
  );
}
