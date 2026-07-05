// Capa e-paper del juego «Envidia» (Lion Mix): los SVG de reMarkable se
// rasterizan a CanvasTexture SIN simplificar paths — el temblor del trazo es
// identidad. El redibujado progresivo (entrada de la nave, daño, muerte)
// se hace pintando los Path2D en su orden original de documento.

import * as THREE from "three";

export interface EpaperGroup {
  id: string;
  start: number; // índice del primer path del grupo
  end: number; // exclusivo
}

export interface EpaperSvg {
  paths: Path2D[];
  groups: EpaperGroup[];
  vb: { x: number; y: number; w: number; h: number };
  rotated: boolean; // el grupo raíz lleva rotate(90) (export reMarkable)
}

const INK = "#3A3A3E";
const INK_ALPHA = 0.92;

/** color de un path según su índice/grupo — para el pase de marcador Lion Mix */
export type ColorPlan = (index: number, groupId: string, total: number) => string;

/** plan por bandas de orden de trazo: [hastaFracción, color] en orden */
export function bandPlan(bands: [number, string][]): ColorPlan {
  return (i, _g, total) => {
    const f = i / total;
    for (const [upTo, color] of bands) if (f < upTo) return color;
    return bands[bands.length - 1][1];
  };
}

/** plan por id de grupo SVG (nave: fuselaje/cabina/alas-turbinas/propulsion/armamento) */
export function groupPlan(map: Record<string, string>, fallback = INK): ColorPlan {
  return (_i, g) => map[g] ?? fallback;
}

/* ------------------- flats de cuerpo (color bajo la tinta) -------------------
   Los personajes van pintados ENTEROS, no solo las líneas: se calcula la
   silueta cerrada de los trazos (dilatar → exterior por BFS → erosionar) y se
   rellena a color plano que queda debajo de la tinta, como los flats de un
   cómic. Se computa una vez por SVG/tamaño y se cachea. */

const bodyCache = new WeakMap<EpaperSvg, Map<string, HTMLCanvasElement>>();

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildBodyCanvas(
  svg: EpaperSvg,
  w: number,
  h: number,
  byColor: Map<string, number[]>,
): HTMLCanvasElement {
  const body = document.createElement("canvas");
  body.width = w;
  body.height = h;
  const bctx = body.getContext("2d")!;
  const rClose = Math.max(3, Math.round(w * 0.03)); // cierra huecos entre trazos
  const rErode = rClose + 2; // el flat no debe sangrar fuera de la línea

  for (const [color, idxs] of byColor) {
    // 1) máscara de trazos de esta zona, dilatada rClose (anillos de offsets)
    const m = document.createElement("canvas");
    m.width = w;
    m.height = h;
    const mc = m.getContext("2d")!;
    const s = w / svg.vb.w;
    mc.setTransform(s, 0, 0, s, -svg.vb.x * s, -svg.vb.y * s);
    if (svg.rotated) mc.rotate(Math.PI / 2);
    mc.fillStyle = "#000";
    for (const i of idxs) mc.fill(svg.paths[i], "evenodd");
    mc.setTransform(1, 0, 0, 1, 0, 0);
    const orig = document.createElement("canvas");
    orig.width = w;
    orig.height = h;
    orig.getContext("2d")!.drawImage(m, 0, 0);
    for (const r of [rClose, rClose * 0.55]) {
      const steps = r === rClose ? 10 : 6;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        mc.drawImage(orig, Math.cos(a) * r, Math.sin(a) * r);
      }
    }

    // 2) exterior conectado al borde (BFS por alpha) + dilatación rErode:
    //    lo que no quede marcado es cuerpo (interior + trazos)
    const data = mc.getImageData(0, 0, w, h).data;
    const dist = new Int16Array(w * h).fill(-1);
    const queue = new Int32Array(w * h);
    let head = 0,
      tail = 0;
    const visit = (p: number, d: number) => {
      if (dist[p] !== -1) return;
      dist[p] = d;
      queue[tail++] = p;
    };
    for (let x = 0; x < w; x++) {
      if (data[x * 4 + 3] < 128) visit(x, 0);
      const b = (h - 1) * w + x;
      if (data[b * 4 + 3] < 128) visit(b, 0);
    }
    for (let y = 0; y < h; y++) {
      if (data[y * w * 4 + 3] < 128) visit(y * w, 0);
      const b = y * w + w - 1;
      if (data[b * 4 + 3] < 128) visit(b, 0);
    }
    while (head < tail) {
      const p = queue[head++];
      const d = dist[p];
      const x = p % w;
      const step = (q: number) => {
        if (dist[q] !== -1) return;
        const nd = d === 0 && data[q * 4 + 3] < 128 ? 0 : d + 1;
        if (nd <= rErode) visit(q, nd);
      };
      // 8-conectado: la erosión abraza también las diagonales (sin sangrado)
      const up = p >= w;
      const dn = p < w * (h - 1);
      if (x > 0) {
        step(p - 1);
        if (up) step(p - w - 1);
        if (dn) step(p + w - 1);
      }
      if (x < w - 1) {
        step(p + 1);
        if (up) step(p - w + 1);
        if (dn) step(p + w + 1);
      }
      if (up) step(p - w);
      if (dn) step(p + w);
    }

    // 3) volcar el flat de color donde hay cuerpo
    const flat = document.createElement("canvas");
    flat.width = w;
    flat.height = h;
    const fc = flat.getContext("2d")!;
    const fimg = fc.createImageData(w, h);
    const [cr, cg, cb] = hexToRgb(color);
    for (let p = 0; p < w * h; p++) {
      if (dist[p] < 0) {
        fimg.data[p * 4] = cr;
        fimg.data[p * 4 + 1] = cg;
        fimg.data[p * 4 + 2] = cb;
        fimg.data[p * 4 + 3] = 255;
      }
    }
    fc.putImageData(fimg, 0, 0);
    bctx.drawImage(flat, 0, 0);
  }
  return body;
}

export async function loadEpaperSvg(url: string): Promise<EpaperSvg> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
  const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
  const svg = doc.documentElement;
  const [x, y, w, h] = (svg.getAttribute("viewBox") || "0 0 100 100")
    .split(/[\s,]+/)
    .map(Number);
  const rotated = /rotate\(\s*90/.test(svg.querySelector("g")?.getAttribute("transform") || "");

  const paths: Path2D[] = [];
  const groups: EpaperGroup[] = [];
  const els = svg.querySelectorAll("path");
  let currentGroup: EpaperGroup | null = null;
  els.forEach((el) => {
    const gid = el.closest("g[id]")?.getAttribute("id") || "";
    if (!currentGroup || currentGroup.id !== gid) {
      if (currentGroup) currentGroup.end = paths.length;
      currentGroup = { id: gid, start: paths.length, end: paths.length };
      groups.push(currentGroup);
    }
    paths.push(new Path2D(el.getAttribute("d") || ""));
  });
  if (currentGroup) (currentGroup as EpaperGroup).end = paths.length;

  return { paths, groups, vb: { x, y, w, h }, rotated };
}

/**
 * Rasterizador incremental: mantiene un canvas con los primeros `drawn`
 * paths pintados. Avanzar es incremental (barato); retroceder redibuja
 * desde cero (solo pasa en daño/muerte, es puntual).
 */
export class EpaperRaster {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  /** ancho/alto lógicos del sprite en unidades de viewBox */
  readonly aspect: number; // h / w
  private ctx: CanvasRenderingContext2D;
  private svg: EpaperSvg;
  private drawn = 0;
  private colorPlan: ColorPlan | null;
  private groupOf: string[];
  private bodyCanvas: HTMLCanvasElement | null = null;
  private bodyAlpha = 0; // alpha acumulada del flat ya compuesto
  /** temblor extra al redibujar tras daño (px de canvas) */
  shake = 0;

  constructor(
    svg: EpaperSvg,
    pxWidth: number,
    colorPlan: ColorPlan | null = null,
    bodyPlan: ((groupId: string, index: number, total: number) => string | null) | null = null,
  ) {
    this.svg = svg;
    this.colorPlan = colorPlan;
    this.groupOf = new Array(svg.paths.length).fill("");
    for (const g of svg.groups) for (let i = g.start; i < g.end; i++) this.groupOf[i] = g.id;
    this.aspect = svg.vb.h / svg.vb.w;
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(pxWidth);
    this.canvas.height = Math.round(pxWidth * this.aspect);
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 2;

    if (bodyPlan) {
      const byColor = new Map<string, number[]>();
      for (let i = 0; i < svg.paths.length; i++) {
        const c = bodyPlan(this.groupOf[i], i, svg.paths.length);
        if (!c) continue;
        let arr = byColor.get(c);
        if (!arr) byColor.set(c, (arr = []));
        arr.push(i);
      }
      if (byColor.size) {
        const key = `${this.canvas.width}|${[...byColor.keys()].join(",")}`;
        let perSvg = bodyCache.get(svg);
        if (!perSvg) bodyCache.set(svg, (perSvg = new Map()));
        let bc = perSvg.get(key);
        if (!bc) perSvg.set(key, (bc = buildBodyCanvas(svg, this.canvas.width, this.canvas.height, byColor)));
        this.bodyCanvas = bc;
      }
    }
  }

  get total() {
    return this.svg.paths.length;
  }
  get progress() {
    return this.drawn / this.svg.paths.length;
  }

  private applyTransform() {
    const { vb } = this.svg;
    const s = this.canvas.width / vb.w;
    this.ctx.setTransform(s, 0, 0, s, -vb.x * s, -vb.y * s);
    if (this.svg.rotated) this.ctx.rotate(Math.PI / 2);
  }

  /** pinta hasta n paths (0..total). Devuelve true si cambió el canvas. */
  drawTo(n: number): boolean {
    n = Math.max(0, Math.min(this.svg.paths.length, Math.round(n)));
    if (n === this.drawn) return false;
    const ctx = this.ctx;
    if (n < this.drawn) {
      // des-dibujado: limpiar y repintar 0..n
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawn = 0;
      this.bodyAlpha = 0;
    }
    this.applyTransform();
    ctx.globalAlpha = INK_ALPHA;
    const total = this.svg.paths.length;
    for (let i = this.drawn; i < n; i++) {
      ctx.fillStyle = this.colorPlan ? this.colorPlan(i, this.groupOf[i], total) : INK;
      if (this.shake > 0) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
        ctx.fill(this.svg.paths[i], "evenodd");
        ctx.restore();
      } else {
        ctx.fill(this.svg.paths[i], "evenodd");
      }
    }
    this.drawn = n;
    // flat de color bajo la tinta: se materializa junto con el redibujado
    // (destination-over solo pinta lo aún transparente; alpha exacta acumulando)
    if (this.bodyCanvas) {
      const target = Math.min(1, (n / total) * 1.2) * 0.88;
      if (target > this.bodyAlpha + 0.004) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "destination-over";
        ctx.globalAlpha = (target - this.bodyAlpha) / (1 - this.bodyAlpha);
        ctx.drawImage(this.bodyCanvas, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        this.bodyAlpha = target;
      }
    }
    this.texture.needsUpdate = true;
    return true;
  }

  drawAll() {
    this.drawTo(this.svg.paths.length);
  }

  dispose() {
    this.texture.dispose();
  }
}

/** textura de disparo: trazo discontinuo tipo LED (dash 30/16, cap redondo) —
 *  halo del color, cuerpo saturado y núcleo casi blanco; capas planas, sin blur */
export function makeDashTexture(opts: { px?: number; color?: string; core?: string } = {}): THREE.CanvasTexture {
  const px = opts.px ?? 16; // ancho del canvas
  const color = opts.color ?? INK;
  const core = opts.core ?? "#FFFFFF";
  const c = document.createElement("canvas");
  c.width = px;
  c.height = 92; // 30+16 dash + margen a escala 2x
  const ctx = c.getContext("2d")!;
  ctx.lineCap = "round";
  ctx.setLineDash([30, 16]);
  const pass = (width: number, style: string, alpha: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(px / 2, -20);
    ctx.lineTo(px / 2, c.height + 20);
    ctx.stroke();
  };
  pass(px * 0.92, color, 0.3); // halo
  pass(px * 0.55, color, 1); // cuerpo LED
  pass(px * 0.22, core, 0.95); // núcleo
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
