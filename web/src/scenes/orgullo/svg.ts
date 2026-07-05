// Helpers SVG de la escena «Orgullo» (creación imperativa, sin re-render React).

export const NS = "http://www.w3.org/2000/svg";

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** PRNG determinista (mulberry32) — bordes "rasgados" estables entre frames. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interpola dos colores hex ("#rrggbb") — crepúsculo de las capas de papel. */
export function lerpColor(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * k));
  const g = Math.round(((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * k));
  const bl = Math.round((pa & 255) + (((pb & 255) - (pa & 255)) * k));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/**
 * Banda de mar papercraft: borde superior de "olas recortadas" (festón con
 * jitter de papel rasgado) + cuerpo hasta `bottom`. Emite DOS tiles idénticos
 * (ancho total 2×width) en un solo path: el parallax hace wrap módulo `width`
 * sin costura y sin sombras internas de bordes duplicados.
 */
export function seaBandPath(
  width: number,
  bumps: number,
  amp: number,
  bottom: number,
  seed: number,
): string {
  const step = width / bumps;
  let d = `M 0 0`;
  for (let tile = 0; tile < 2; tile++) {
    const rnd = seeded(seed); // mismo jitter en ambos tiles → wrap perfecto
    const off = tile * width;
    for (let i = 0; i < bumps; i++) {
      const x0 = off + i * step;
      const jy = (rnd() - 0.5) * amp * 0.5;
      const jx = (rnd() - 0.5) * step * 0.2;
      // festón: sube en cresta y baja al valle (curva de papel recortado)
      d += ` Q ${x0 + step * 0.25 + jx} ${-amp + jy}, ${x0 + step * 0.5} ${jy * 0.4}`;
      d += ` Q ${x0 + step * 0.75 - jx} ${amp * 0.35 - jy}, ${x0 + step} 0`;
    }
  }
  d += ` L ${width * 2} ${bottom} L 0 ${bottom} Z`;
  return d;
}

/** Nube de papel (elipses solapadas simplificadas en un path). */
export function cloudPath(w: number, seed: number): string {
  const rnd = seeded(seed);
  const h = w * 0.34;
  const lobes = 4 + Math.floor(rnd() * 2);
  let d = `M 0 ${h}`;
  for (let i = 0; i < lobes; i++) {
    const x0 = (i / lobes) * w;
    const x1 = ((i + 1) / lobes) * w;
    const peak = h * (0.15 + rnd() * 0.5);
    d += ` Q ${(x0 + x1) / 2} ${-peak}, ${x1} ${h * (0.75 + rnd() * 0.2)}`;
  }
  d += ` L ${w} ${h} Z`;
  return d;
}
