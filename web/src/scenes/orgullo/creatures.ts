// Criaturas nocturnas de «Orgullo»: cuando anochece, se asoman del agua entre
// las olas, miran pasar el barco (las pupilas lo siguen) y vuelven a hundirse.
// Todo determinista respecto al tiempo de la canción (aguanta seek).

import type { Frame } from "./conductor";
import { el } from "./svg";

// tinta nocturna: siluetas más oscuras que el mar, ojos de papel estrella
const BODY = "#243459";
const INK = "#0c1430";
const EYE = "#f6ecc9";
const PUPIL = "#141a30";
const FOAM = "rgba(244, 234, 210, 0.3)";

type Kind = "kraken" | "periscopio";

interface Peek {
  /** segundo de la canción en que se asoma */
  t0: number;
  /** duración total del asomo (subir + mirar + hundirse) */
  dur: number;
  /** posición horizontal como fracción de la ventana visible */
  xFrac: number;
  kind: Kind;
  /** 0 = tras las olas medias (lejos), 1 = tras la ola frontal (cerca) */
  slot: 0 | 1;
  scale: number;
  flip: boolean;
}

// La noche cae en t≈120–129 (remaster 2026) y desde el avistamiento la
// protagonista es MOBY DICK (whale.ts): las criaturas quedan de testigos,
// asomándose apenas dos veces en los huecos de la cacería.
const SCHEDULE: Peek[] = [
  { t0: 143, dur: 7, xFrac: 0.12, kind: "periscopio", slot: 0, scale: 0.7, flip: false },
  { t0: 217, dur: 8, xFrac: 0.1, kind: "kraken", slot: 0, scale: 0.7, flip: false },
];

interface Puppet {
  peek: Peek;
  g: SVGGElement;
  /** pupilas + centro local del ojo (para seguir al barco) */
  pupils: { node: SVGElement; cx: number; cy: number }[];
  ripple: SVGEllipseElement;
  /** altura que asoma sobre la línea de agua */
  rise: number;
  phase: number;
  visible: boolean;
}

function smoothstep(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/** kraken tímido: domo con dos ojazos y tentáculos que asoman a los lados */
function buildKraken(g: SVGGElement): Puppet["pupils"] {
  for (const s of [-1, 1]) {
    el("path", {
      d: `M ${70 * s} 58 Q ${100 * s} 30 ${88 * s} 4 Q ${82 * s} -8 ${70 * s} 0`,
      fill: "none", stroke: BODY, "stroke-width": 11, "stroke-linecap": "round",
    }, g);
  }
  el("path", {
    d: "M -70 120 L -70 40 Q -70 -18 0 -18 Q 70 -18 70 40 L 70 120 Z",
    fill: BODY, stroke: INK, "stroke-width": 3, "stroke-linejoin": "round",
  }, g);
  const pupils: Puppet["pupils"] = [];
  for (const s of [-1, 1]) {
    el("circle", { cx: 26 * s, cy: 8, r: 14, fill: EYE, stroke: INK, "stroke-width": 2 }, g);
    const p = el("circle", { cx: 26 * s, cy: 8, r: 6, fill: PUPIL }, g);
    // párpado caído: mirada tímida
    el("path", {
      d: `M ${26 * s - 14} 2 A 14 14 0 0 1 ${26 * s + 14} 2 L ${26 * s + 14} -2 L ${26 * s - 14} -2 Z`,
      fill: BODY,
    }, g);
    pupils.push({ node: p, cx: 26 * s, cy: 8 });
  }
  return pupils;
}

/** periscopio: un solo ojo enorme sobre un tallo, pura curiosidad */
function buildPeriscopio(g: SVGGElement): Puppet["pupils"] {
  el("path", {
    d: "M -9 150 C -16 70, -8 34, 0 4 L 16 8 C 8 38, 6 72, 13 150 Z",
    fill: BODY, stroke: INK, "stroke-width": 3, "stroke-linejoin": "round",
  }, g);
  el("circle", { cx: 5, cy: -12, r: 19, fill: EYE, stroke: INK, "stroke-width": 3 }, g);
  el("circle", { cx: 5, cy: -12, r: 10, fill: "#6d7fae", opacity: 0.55 }, g);
  const pupil = el("circle", { cx: 5, cy: -12, r: 5.5, fill: PUPIL }, g);
  // gota/alga colgando del tallo
  el("path", { d: "M -6 26 q -10 8 -6 18", fill: "none", stroke: INK, "stroke-width": 2, opacity: 0.6 }, g);
  return [{ node: pupil, cx: 5, cy: -12 }];
}

export class NightCreatures {
  private puppets: Puppet[] = [];
  private layers: [SVGGElement, SVGGElement];
  /** línea de agua (y de escena) de cada slot */
  private waterY: [number, number];

  constructor(farLayer: SVGGElement, nearLayer: SVGGElement, waterYFar: number, waterYNear: number) {
    this.layers = [farLayer, nearLayer];
    this.waterY = [waterYFar, waterYNear];

    for (const peek of SCHEDULE) {
      const g = el("g", { display: "none" }, this.layers[peek.slot]);
      const ripple = el("ellipse", {
        cx: 0, cy: 6, rx: 70, ry: 12, fill: FOAM,
      }, g);
      const body = el("g", {}, g);
      const pupils = peek.kind === "kraken" ? buildKraken(body) : buildPeriscopio(body);
      this.puppets.push({
        peek, g, pupils, ripple,
        rise: peek.kind === "kraken" ? 120 : 150,
        phase: peek.t0 * 1.7,
        visible: false,
      });
    }
  }

  /** llamado cada frame por Stage.update */
  update(
    f: Frame, time: number, nightK: number,
    xMin: number, xMax: number, boatX: number, boatY: number,
  ) {
    for (const p of this.puppets) {
      const k = (f.t - p.peek.t0) / p.peek.dur;
      const active = nightK > 0.05 && k > 0 && k < 1;
      if (active !== p.visible) {
        p.visible = active;
        p.g.setAttribute("display", active ? "inline" : "none");
      }
      if (!active) continue;

      // sube, mira un rato y vuelve a perderse
      const riseK = smoothstep(0, 0.24, k) * (1 - smoothstep(0.76, 1, k));
      const s = p.peek.scale * (p.peek.flip ? -1 : 1);
      const x = xMin + (xMax - xMin) * p.peek.xFrac;
      const yWater = this.waterY[p.peek.slot];
      const y = yWater - riseK * p.rise * p.peek.scale + Math.sin(time * 1.1 + p.phase) * 5;
      const sway = Math.sin(time * 0.7 + p.phase) * 3;
      p.g.setAttribute("opacity", (nightK * Math.min(1, riseK * 3)).toFixed(2));
      p.g.setAttribute(
        "transform",
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${sway.toFixed(1)}) scale(${s} ${p.peek.scale})`,
      );
      // la espuma queda clavada en la línea de agua aunque el cuerpo suba
      p.ripple.setAttribute("cy", ((yWater - y) / p.peek.scale + 4).toFixed(1));
      p.ripple.setAttribute("rx", (58 + riseK * 22).toFixed(1));

      // las pupilas siguen al barco
      for (const eye of p.pupils) {
        // ojo en coordenadas de escena (deshaciendo flip/escala)
        const ex = x + eye.cx * s;
        const ey = y + eye.cy * p.peek.scale;
        const dx = boatX - ex;
        const dy = boatY - ey;
        const m = Math.hypot(dx, dy) || 1;
        // offset local (el flip invierte el eje x del grupo)
        const ox = ((dx / m) * 3.4) / (p.peek.flip ? -1 : 1);
        const oy = (dy / m) * 2.8;
        eye.node.setAttribute("transform", `translate(${ox.toFixed(2)} ${oy.toFixed(2)})`);
      }
    }
  }
}
