import * as THREE from "three";

/**
 * Serpiente procedural que sigue el cursor (adaptación del concepto de
 * github.com/Sujenphea/procedural-snake): una columna de articulaciones donde
 * la cabeza persigue el ratón y cada segmento queda a distancia fija del
 * anterior; se reconstruye un tubo 3D con degradado neón sobre fondo negro.
 * Devuelve una función de limpieza.
 */
export function mountSnake(container: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setClearColor(0x000000, 0);
  const el = renderer.domElement;
  el.style.position = "absolute";
  el.style.inset = "0";
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.pointerEvents = "none";
  container.appendChild(el);

  const scene = new THREE.Scene();
  let W = container.clientWidth || window.innerWidth;
  let H = container.clientHeight || window.innerHeight;
  const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 1000);
  camera.position.z = 200;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const headLight = new THREE.PointLight(0xff7ad0, 1.4, 1600);
  scene.add(headLight);

  // --- columna (spine) ---
  const N = 64;
  const L = 16; // separación entre articulaciones (px)
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) spine.push(new THREE.Vector3(0, -i * L, 0));
  const target = new THREE.Vector3(0, 0, 0);

  // --- materiales / cabeza ---
  const tubeMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  let tube: THREE.Mesh | null = null;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(15, 22, 18),
    new THREE.MeshStandardMaterial({
      color: "#ffc3e6",
      emissive: "#ff5fb0",
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.1,
    }),
  );
  head.scale.set(1, 1.25, 1);
  scene.add(head);
  const eyeGeo = new THREE.SphereGeometry(3.2, 10, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-6, 8, 11);
  eyeR.position.set(6, 8, 11);
  head.add(eyeL, eyeR);

  // --- input ---
  let lastInput = -1e9;
  const onMove = (e: PointerEvent) => {
    lastInput = performance.now();
    target.set(e.clientX - W / 2, -(e.clientY - H / 2), 0);
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  const onResize = () => {
    W = container.clientWidth || window.innerWidth;
    H = container.clientHeight || window.innerHeight;
    camera.left = -W / 2;
    camera.right = W / 2;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
  };
  onResize();
  window.addEventListener("resize", onResize);

  // --- bucle ---
  const tmp = new THREE.Vector3();
  const cA = new THREE.Color("#ff4fa6");
  const cB = new THREE.Color("#7b6bff");
  const cC = new THREE.Color("#46d6ff");
  const t0 = performance.now();
  let raf = 0;

  const animate = () => {
    raf = requestAnimationFrame(animate);
    const now = performance.now();

    // deambular si no hay ratón hace rato
    if (now - lastInput > 1600) {
      const t = (now - t0) / 1000;
      target.set(Math.cos(t * 0.55) * W * 0.32, Math.sin(t * 0.83) * H * 0.26, 0);
    }

    // cabeza hacia el objetivo + restricción de distancia por articulación
    spine[0].lerp(target, 0.2);
    for (let i = 1; i < N; i++) {
      tmp.subVectors(spine[i], spine[i - 1]);
      const d = tmp.length() || 1e-4;
      tmp.multiplyScalar(L / d);
      spine[i].copy(spine[i - 1]).add(tmp);
    }

    // tubo con radio cónico (cabeza gruesa -> cola fina) y color en degradado
    const curve = new THREE.CatmullRomCurve3(spine);
    const geo = new THREE.TubeGeometry(curve, N * 2, 10, 12, false);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i); // 0 (cabeza) .. 1 (cola)
      if (u < 0.5) c.copy(cA).lerp(cB, u * 2);
      else c.copy(cB).lerp(cC, (u - 0.5) * 2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (tube) {
      tube.geometry.dispose();
      tube.geometry = geo;
    } else {
      tube = new THREE.Mesh(geo, tubeMat);
      scene.add(tube);
    }

    // cabeza
    head.position.copy(spine[0]);
    tmp.subVectors(spine[0], spine[1]);
    head.rotation.z = Math.atan2(tmp.y, tmp.x) - Math.PI / 2;
    headLight.position.set(spine[0].x, spine[0].y, 120);

    renderer.render(scene, camera);
  };
  animate();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("resize", onResize);
    tube?.geometry.dispose();
    tubeMat.dispose();
    renderer.dispose();
    el.parentElement?.removeChild(el);
  };
}
