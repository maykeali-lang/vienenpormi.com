import * as THREE from "three";
import gsap from "gsap";

/**
 * «Old Cloth with Wind» (port del CodePen de sabosugi, ByzLYpb): la imagen se
 * muestra como un lienzo viejo y rasgado que ondea al viento (shader). Sin GUI
 * ni OrbitControls; cámara fija. Devuelve `{ dispose, exit }`: `exit` reproduce
 * la transición de salida (la tela se rasga y sale volando).
 */
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  uniform float uFabricFreq;
  varying vec2 vUv;
  varying float vZ;
  void main() {
    vUv = uv;
    vec3 pos = position;
    float looseFactor = 1.0 - uv.y;
    float pinInfluence = pow(looseFactor, 1.8);
    float wave1 = sin(uv.x * 5.0 + uTime * 2.0);
    float wave2 = sin(uv.x * 12.0 + uTime * 4.0 + uv.y * 5.0);
    float wave3 = sin(uTime * 1.5);
    float ripples = (wave1 * 0.5 + wave2 * 0.2 + wave3 * 0.3);
    float displacement = (uWindStrength * 2.0 + ripples * uFabricFreq) * pinInfluence;
    pos.y += (sin(displacement) * 0.1) * pinInfluence;
    pos.z += displacement;
    vZ = displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uRatio;
  uniform float uEdgeScale;
  uniform float uEdgeAmp;
  uniform float uFrameSize;
  uniform float uPhotoInset;
  uniform vec3 uPaperColor;
  uniform float uScratchAmp;
  uniform float uGrainAmp;
  uniform float uVignette;
  uniform float uSeed;
  uniform float uShadowOpacity;
  uniform vec3 uEdgeShadowColor;
  uniform float uEdgeShadowOpacity;
  uniform float uLight;
  uniform float uExit;
  varying vec2 vUv;
  varying float vZ;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ; m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  float fbm(vec2 x) {
    float v = 0.0; float a = 0.5; vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < 5; ++i) { v += a * snoise(x + uSeed); x = rot * x * 2.0 + shift; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv - 0.5;
    vec2 aspectUV = uv;
    aspectUV.x *= uRatio;
    float noise = fbm(aspectUV * uEdgeScale);
    float dist = max(abs(uv.x), abs(uv.y));
    float raggedDist = dist + noise * uEdgeAmp;
    float borderLimit = 0.5 - uFrameSize;
    float alpha = 1.0 - smoothstep(borderLimit, borderLimit + 0.01, raggedDist);
    if (alpha < 0.01) discard;
    // Salida: la tela se rasga por trozos (disolucion con ruido) al arrancarla.
    float tear = fbm(vUv * 3.2 + 21.0) * 0.5 + 0.5;
    if (uExit > 0.0001 && tear < uExit) discard;
    float paperGrain = fbm(vUv * 60.0);
    vec3 paperCol = uPaperColor - paperGrain * 0.05;
    vec4 photoTex = texture2D(uTexture, vUv);
    float photoNoise = snoise(aspectUV * 30.0) * 0.005;
    float photoDist = max(abs(uv.x), abs(uv.y)) + photoNoise;
    float photoLimit = borderLimit - uPhotoInset;
    float photoMask = 1.0 - smoothstep(photoLimit, photoLimit + 0.02, photoDist);
    float scratches = snoise(vec2(vUv.x * 300.0, vUv.y * 3.0));
    float dust = fbm(vUv * 40.0 + uSeed);
    vec3 grungePhoto = photoTex.rgb;
    grungePhoto = mix(grungePhoto, vec3(0.6, 0.5, 0.4), dust * uGrainAmp);
    grungePhoto -= scratches * uScratchAmp;
    // baño de luz LED blanca fría: ganancia + leve lift azulado
    grungePhoto = grungePhoto * uLight + vec3(0.018, 0.024, 0.034);
    float len = length(uv);
    grungePhoto -= len * uVignette;
    vec3 finalRGB = mix(paperCol, grungePhoto, photoMask);
    finalRGB += vZ * uShadowOpacity;
    float edgeShadowFactor = smoothstep(borderLimit - 0.05, borderLimit, raggedDist);
    finalRGB = mix(finalRGB, uEdgeShadowColor, edgeShadowFactor * uEdgeShadowOpacity);
    // Borde caliente (amarillo del remero) en la linea de rasgado al salir volando.
    if (uExit > 0.0001) {
      float edgeGlow = 1.0 - smoothstep(uExit, uExit + 0.12, tear);
      finalRGB += edgeGlow * vec3(0.91, 0.72, 0.25) * 0.9;
    }
    gl_FragColor = vec4(finalRGB, 1.0);
  }
`;

function imgUrl() {
  const b = import.meta.env.BASE_URL || "/";
  // portada oficial del trabajo musical (proporcionada por Johan Galue)
  return `${b}assets/portada.jpg`.replace(/\/{2,}/g, "/");
}

export function mountCloth(
  container: HTMLElement,
  onPick?: () => void,
): { dispose: () => void; exit: (onDone?: () => void) => void } {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const el = renderer.domElement;
  el.style.position = "absolute";
  el.style.inset = "0";
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.pointerEvents = "none";
  container.appendChild(el);

  let W = container.clientWidth || window.innerWidth;
  let H = container.clientHeight || window.innerHeight;
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, 2.5);
  camera.lookAt(0, 0, 0);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTexture: { value: null },
      uRatio: { value: 1.0 },
      uTime: { value: 0 },
      uWindStrength: { value: 0.2 },
      uFabricFreq: { value: 0.32 },
      uShadowOpacity: { value: 0.22 },
      uLight: { value: 1.3 },
      // shape/marcos bajados al mínimo (casi rectangular, sin borde)
      uEdgeScale: { value: 8.8 },
      uEdgeAmp: { value: 0.007 },
      uFrameSize: { value: 0.0 },
      uPhotoInset: { value: 0.0 },
      uPaperColor: { value: new THREE.Color(0xf0ebe0) },
      uScratchAmp: { value: 0.0106272 },
      uGrainAmp: { value: 0.034925 },
      uVignette: { value: 0.0 },
      uSeed: { value: 0.0 },
      uEdgeShadowColor: { value: new THREE.Color(0x000000) },
      uEdgeShadowOpacity: { value: 0.015 },
      uExit: { value: 0.0 },
    },
    side: THREE.DoubleSide,
    transparent: true,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 64, 64), material);
  scene.add(mesh);

  // tela reducida: la portada es un cuadro, no un telón a pantalla completa.
  // En retrato se limita al ancho visible para que no llene la pantalla.
  let texAspect = 1;
  const fitCloth = () => {
    const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const visW = visH * camera.aspect;
    const h = Math.min(1.12, (0.86 * visW) / texAspect);
    mesh.scale.set(h * texAspect, h, 1);
  };

  const loader = new THREE.TextureLoader();
  loader.load(imgUrl(), (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    material.uniforms.uTexture.value = tex;
    texAspect = (tex.image?.width || 1) / (tex.image?.height || 1);
    material.uniforms.uRatio.value = texAspect;
    fitCloth();
  });

  const onResize = () => {
    W = container.clientWidth || window.innerWidth;
    H = container.clientHeight || window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
    fitCloth();
  };
  window.addEventListener("resize", onResize);

  // La tela se inclina/gira siguiendo el cursor (parallax). Sobre el cuadro el
  // cursor invita al click (onPick: muestra/oculta el crédito de la portada).
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const hitsCloth = (clientX: number, clientY: number) => {
    pointerNDC.set((clientX / W) * 2 - 1, -(clientY / H) * 2 + 1);
    raycaster.setFromCamera(pointerNDC, camera);
    return raycaster.intersectObject(mesh).length > 0;
  };
  let mx = 0;
  let my = 0;
  const onMove = (e: PointerEvent) => {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
    if (onPick) container.style.cursor = hitsCloth(e.clientX, e.clientY) ? "pointer" : "";
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  const onClick = (e: MouseEvent) => {
    if (!exiting && onPick && hitsCloth(e.clientX, e.clientY)) onPick();
  };
  container.addEventListener("click", onClick);

  // Cuando arranca la salida, el bucle deja de mandar sobre viento/rotación
  // (los controla GSAP) y la tela ondea fuerte mientras sale volando.
  let exiting = false;

  const clock = new THREE.Clock();
  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    // ondeo pausado: el shader recibe el tiempo a menos de la mitad de marcha
    material.uniforms.uTime.value = t * 0.42;
    if (!exiting) {
      let gust = Math.sin(t * 0.5) + Math.sin(t * 1.6) * 0.5 + 0.5;
      gust = Math.max(0, gust);
      material.uniforms.uWindStrength.value = gust * 0.25 * 0.22;
      // sigue el ratón
      mesh.rotation.y += (mx * 0.55 - mesh.rotation.y) * 0.06;
      mesh.rotation.x += (-my * 0.3 - mesh.rotation.x) * 0.06;
    }
    renderer.render(scene, camera);
  };
  animate();

  // Transición de salida: la tela se rasga por trozos y sale volando hacia el
  // espectador, dejando ver la experiencia en vivo que hay detrás.
  const exit = (onDone?: () => void) => {
    if (exiting) return;
    exiting = true;
    gsap.killTweensOf([mesh.position, mesh.rotation, material.uniforms.uWindStrength]);
    const tl = gsap.timeline({ onComplete: () => onDone?.() });
    // viento huracanado: la tela se hincha justo antes de arrancarse
    tl.to(material.uniforms.uWindStrength, { value: 1.1, duration: 0.22, ease: "power2.out" }, 0);
    // rasgado progresivo (disolución con ruido en el shader)
    tl.to(material.uniforms.uExit, { value: 1.0, duration: 0.95, ease: "power2.in" }, 0.05);
    // sale volando hacia la cámara, girando
    tl.to(mesh.position, { y: 1.9, z: 1.4, duration: 0.95, ease: "power2.in" }, 0);
    tl.to(mesh.rotation, { x: -1.15, z: 0.55, duration: 0.95, ease: "power1.in" }, 0);
  };

  const dispose = () => {
    cancelAnimationFrame(raf);
    gsap.killTweensOf([mesh.position, mesh.rotation, material.uniforms.uWindStrength, material.uniforms.uExit]);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onMove);
    container.removeEventListener("click", onClick);
    container.style.cursor = "";
    mesh.geometry.dispose();
    material.dispose();
    const t = material.uniforms.uTexture.value as THREE.Texture | null;
    t?.dispose();
    renderer.dispose();
    el.parentElement?.removeChild(el);
  };

  return { dispose, exit };
}

export type ClothHandle = ReturnType<typeof mountCloth>;
