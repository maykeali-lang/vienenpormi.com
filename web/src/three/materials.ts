import * as THREE from "three";

/**
 * Genera un gradientMap de pocos escalones para look toon (sombra dura,
 * estilo comic). N escalones -> N bandas de luz.
 */
export function makeToonGradient(
  levels: number[] = [0.5, 0.7, 0.86, 1.0],
): THREE.DataTexture {
  // 3 bandas duras: sombra / medio / luz -> look Wind Waker / Paper Mario.
  const data = new Uint8Array(levels.length);
  for (let i = 0; i < levels.length; i++) {
    data[i] = Math.round(THREE.MathUtils.clamp(levels[i], 0, 1) * 255);
  }
  const tex = new THREE.DataTexture(data, levels.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let _grad: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (!_grad) _grad = makeToonGradient();
  return _grad;
}

export function toonMaterial(color: THREE.ColorRepresentation) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
  });
}

// Cache de materiales toon por color: los personajes comparten instancia en
// vez de crear ~30 materiales cada uno (menos memoria y cambios de estado).
const _toonCache = new Map<string, THREE.MeshToonMaterial>();
export function sharedToonFlat(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  const key = String(color);
  let m = _toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      // @types/three no tipa flatShading en toon, pero three lo soporta
      ...({ flatShading: true } as Record<string, unknown>),
    } as THREE.MeshToonMaterialParameters);
    _toonCache.set(key, m);
  }
  return m;
}

/** Material cromado iridiscente (refleja el environment + neon). */
export function chromeMaterial(envIntensity = 1.4) {
  return new THREE.MeshStandardMaterial({
    color: "#cfd6e6",
    metalness: 1,
    roughness: 0.12,
    envMapIntensity: envIntensity,
  });
}
