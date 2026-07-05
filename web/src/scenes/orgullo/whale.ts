// MOBY DICK de papel — la ballena blanca de «Orgullo». Al caer la noche el
// barco la avista y (puro orgullo) sale a cazarla: ella cruza la escena en
// arcos deterministas (aguanta seek), azota la cola, sopla su chorro y en el
// coro final salta entera (breach). Papel blanco, tinta furiosa: la ceja en
// diagonal y la mandíbula apretada; la pupila sigue al barco todo el rato.
//
// Al ritmo de los stems: la cola bate con el BAJO, el chorro respira con la
// GUITARRA (el solo) y la VOZ (coro final), y los azotes/salto salpican papel.

import type { Frame } from "./conductor";
import { STORM_PAPER as SP } from "./theme";
import { el, seeded } from "./svg";

type ArcKind = "sight" | "cruise" | "slap" | "breach" | "dive";

interface Arc {
  /** segundo (remaster) en que empieza el arco */
  t0: number;
  dur: number;
  kind: ArcKind;
  /** 0 = lejos (tras olas cercanas), 1 = cerca (tras la ola frontal) */
  slot: 0 | 1;
  /** posición horizontal inicial/final (fracción de la ventana visible) */
  x0: number;
  x1: number;
  /** cuánto asoma sobre la línea de agua (px de escena, antes de escala) */
  rise: number;
  scale: number;
  /** +1 mira/nada a la derecha, -1 a la izquierda */
  dir: 1 | -1;
  /** inclinación máxima del cuerpo en el arco (grados) */
  tilt: number;
}

// La noche entra en t≈120–129; coro final en 190.2; el tema dura 236 s.
// OJO con las x: el barco navega en xFrac ≈ 0.39–0.58 durante la noche —
// los arcos lejanos (slot 0, misma altura visual) deben esquivar esa franja;
// los cercanos (slot 1) pasan POR DELANTE y por debajo (rise bajo).
const ARCS: Arc[] = [
  // avistamiento: emerge lejos, adelante del barco, y se queda mirándolo fija
  { t0: 131, dur: 15, kind: "sight", slot: 0, x0: 0.72, x1: 0.66, rise: 112, scale: 0.8, dir: -1, tilt: 6 },
  // la cacería: cruza huyendo/desafiando, alternando profundidad y sentido
  { t0: 150, dur: 10, kind: "cruise", slot: 1, x0: 0.1, x1: 0.8, rise: 56, scale: 1.12, dir: 1, tilt: 12 },
  { t0: 163, dur: 9, kind: "slap", slot: 0, x0: 0.86, x1: 0.64, rise: 102, scale: 0.85, dir: -1, tilt: 11 },
  { t0: 175, dur: 9, kind: "cruise", slot: 1, x0: 0.88, x1: 0.24, rise: 54, scale: 1.06, dir: -1, tilt: 12 },
  // BREACH: salto entero (cielo arriba) por la proa, con el coro final
  { t0: 190.2, dur: 7, kind: "breach", slot: 1, x0: 0.56, x1: 0.84, rise: 300, scale: 1.18, dir: 1, tilt: 34 },
  { t0: 200.5, dur: 9, kind: "slap", slot: 0, x0: 0.1, x1: 0.34, rise: 98, scale: 0.8, dir: 1, tilt: 11 },
  { t0: 211, dur: 10, kind: "cruise", slot: 1, x0: 0.84, x1: 0.22, rise: 52, scale: 1.02, dir: -1, tilt: 12 },
  // se pierde en lo hondo por la proa: la tormenta amaina detrás de ella
  { t0: 224, dur: 12, kind: "dive", slot: 0, x0: 0.66, x1: 0.84, rise: 106, scale: 0.85, dir: 1, tilt: 30 },
];

interface SplashBit {
  node: SVGElement;
  ang: number;
  r: number;
  spin: number;
}

interface WhalePuppet {
  root: SVGGElement;
  body: SVGGElement;
  fluke: SVGGElement;
  fin: SVGGElement;
  spout: SVGGElement;
  pupil: SVGElement;
  ripple: SVGEllipseElement;
  splash: SplashBit[];
  visible: boolean;
}

function smoothstep(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/** construye la ballena de papel (mirando a la IZQUIERDA en coords locales) */
function buildWhale(parent: SVGGElement): WhalePuppet {
  const root = el("g", { display: "none" }, parent);

  // espuma en la línea de agua
  const ripple = el("ellipse", {
    cx: 0, cy: 8, rx: 150, ry: 15, fill: "rgba(244, 234, 210, 0.28)",
  }, root);

  const body = el("g", {}, root);

  // chorro del espiráculo (detrás del lomo): V de papel + gotas
  const spout = el("g", { opacity: 0, transform: "translate(-128 -72)" }, body);
  el("path", {
    d: "M 0 0 C -10 -26, -30 -38, -34 -62 M 0 0 C 10 -26, 30 -38, 34 -62 M 0 0 C -1 -30, 1 -46, 0 -70",
    fill: "none", stroke: SP.spout, "stroke-width": 7, "stroke-linecap": "round", opacity: 0.9,
  }, spout);
  for (const [dx, dy, r] of [[-40, -74, 5], [40, -74, 5], [0, -84, 6], [-20, -92, 4], [22, -94, 4]] as const) {
    el("path", {
      d: `M ${dx} ${dy - r} L ${dx + r * 0.7} ${dy} L ${dx} ${dy + r} L ${dx - r * 0.7} ${dy} Z`,
      fill: SP.spout, opacity: 0.95,
    }, spout);
  }

  // COLA (grupo aparte: bate al ritmo del bajo; pivote en la raíz)
  const fluke = el("g", { transform: "translate(158 -6)" }, body);
  el("path", {
    d: "M 0 2 Q 30 -12 44 -46 L 40 -8 Q 58 -2 74 22 Q 40 16 12 12 Q 4 8 0 2 Z",
    fill: SP.whale, stroke: SP.whaleInk, "stroke-width": 3.5, "stroke-linejoin": "round",
  }, fluke);

  // CUERPO: cachalote de papel, cabeza en bloque (frente vertical)
  el("path", {
    d: `M -184 -58
        L -176 16
        Q -172 30 -152 36
        L -46 48
        Q 42 60 108 36
        Q 142 22 158 -2
        Q 130 -30 84 -50
        Q 20 -74 -74 -72
        L -184 -58 Z`,
    fill: SP.whale, stroke: SP.whaleInk, "stroke-width": 4, "stroke-linejoin": "round",
  }, body);
  // panza en sombra (recorte de papel inferior)
  el("path", {
    d: "M -152 36 L -46 48 Q 42 60 108 36 Q 70 46 -20 40 Q -110 32 -152 36 Z",
    fill: SP.whaleShade, opacity: 0.85,
  }, body);
  // pliegue de papel en diagonal (doblez de la cabeza)
  el("path", {
    d: "M -120 -66 L -74 30", stroke: SP.whaleInk, "stroke-width": 2, opacity: 0.22, fill: "none",
  }, body);
  // joroba/dorsal bajita
  el("path", {
    d: "M 34 -62 L 58 -78 L 82 -52 Z",
    fill: SP.whale, stroke: SP.whaleInk, "stroke-width": 3, "stroke-linejoin": "round",
  }, body);

  // cicatrices de viejas cacerías + arpón roto clavado (Moby Dick)
  el("path", {
    d: "M -142 -46 l 20 8 M -128 -50 l -6 18 M -96 -60 l 16 6",
    stroke: SP.whaleInk, "stroke-width": 2.4, "stroke-linecap": "round", opacity: 0.5, fill: "none",
  }, body);
  const harpoon = el("g", { transform: "translate(10 -66) rotate(-38)" }, body);
  el("line", { x1: 0, y1: 0, x2: 0, y2: -34, stroke: "#6b4a2e", "stroke-width": 4, "stroke-linecap": "round" }, harpoon);
  el("path", { d: "M -6 -30 L 0 -44 L 6 -30 Z", fill: SP.whaleInk }, harpoon);
  el("path", {
    d: "M 0 -6 q 14 4 12 16 q -2 10 -14 10", fill: "none",
    stroke: "#8a6a48", "stroke-width": 2, opacity: 0.8,
  }, harpoon);

  // FAUCES abiertas en gruñido: cuña de tinta con dientes de papel arriba y abajo
  el("path", {
    d: "M -176 8 L -116 20 L -172 36 Z",
    fill: SP.whaleInk, stroke: SP.whaleInk, "stroke-width": 3, "stroke-linejoin": "round",
  }, body);
  el("path", {
    // sierra superior (cuelga del labio) + sierra inferior (sube de la mandíbula)
    d: `M -172 9 L -164 20 L -157 12 Z  M -155 12 L -147 23 L -140 15 Z  M -138 15 L -131 25 L -124 17 Z
        M -168 34 L -159 24 L -152 31 Z  M -149 30 L -141 21 L -134 27 Z`,
    fill: SP.whale, stroke: "none",
  }, body);
  // comisura tensa hacia abajo (rabia, no pena)
  el("path", {
    d: "M -116 20 L -100 28",
    fill: "none", stroke: SP.whaleInk, "stroke-width": 3.4, "stroke-linecap": "round",
  }, body);

  // ojo FURIOSO: ceja gruesa cayendo hacia el morro (¡no hacia la cola!),
  // almendra entornada en el mismo ángulo y arruga de entrecejo
  el("path", {
    d: "M -152 -6 L -102 -32",
    stroke: SP.whaleInk, "stroke-width": 8, "stroke-linecap": "round", fill: "none",
  }, body);
  el("path", {
    d: "M -160 -2 L -150 -10",
    stroke: SP.whaleInk, "stroke-width": 3, "stroke-linecap": "round", fill: "none", opacity: 0.7,
  }, body);
  el("path", {
    d: "M -146 -3 Q -128 -17 -110 -8 Q -129 5 -146 -3 Z",
    fill: SP.whaleEye, stroke: SP.whaleInk, "stroke-width": 2.5,
  }, body);
  const pupil = el("circle", { cx: -128, cy: -6, r: 4.6, fill: SP.whalePupil }, body);

  // aleta pectoral (rema despacio)
  const fin = el("g", { transform: "translate(-58 30)" }, body);
  el("path", {
    d: "M 0 0 Q 18 26 46 34 Q 22 40 2 24 Q -4 12 0 0 Z",
    fill: SP.whaleShade, stroke: SP.whaleInk, "stroke-width": 3, "stroke-linejoin": "round",
  }, fin);

  // salpicadura de papel (azotes y breach): rombos que vuelan y caen
  const splashG = el("g", {}, root);
  const rnd = seeded(97);
  const splash: SplashBit[] = [];
  for (let i = 0; i < 12; i++) {
    const r = 4 + rnd() * 5;
    const node = el("path", {
      d: `M 0 ${-r} L ${r * 0.7} 0 L 0 ${r} L ${-r * 0.7} 0 Z`,
      fill: i % 3 === 0 ? SP.spout : "#f4ead2", opacity: 0,
    }, splashG);
    splash.push({
      node,
      ang: Math.PI * (1.05 + rnd() * 0.9), // hacia arriba, abriendo
      r: 90 + rnd() * 150,
      spin: (rnd() - 0.5) * 300,
    });
  }

  return { root, body, fluke, fin, spout, pupil, ripple, splash, visible: false };
}

export class Whale {
  /** una marioneta por capa de profundidad (evita re-parentar en caliente) */
  private puppets: [WhalePuppet, WhalePuppet];
  private waterY: [number, number];

  constructor(farLayer: SVGGElement, nearLayer: SVGGElement, waterYFar: number, waterYNear: number) {
    this.puppets = [buildWhale(farLayer), buildWhale(nearLayer)];
    this.waterY = [waterYFar, waterYNear];
  }

  /** arco activo en t (o null) */
  private static arcAt(t: number): { arc: Arc; k: number } | null {
    for (const arc of ARCS) {
      const k = (t - arc.t0) / arc.dur;
      if (k >= 0 && k < 1) return { arc, k };
    }
    return null;
  }

  update(
    f: Frame, time: number, nightK: number,
    xMin: number, xMax: number, boatX: number, boatY: number,
  ) {
    const hit = Whale.arcAt(f.t);
    for (let slot = 0; slot < 2; slot++) {
      const p = this.puppets[slot];
      const active = !!hit && hit.arc.slot === slot && nightK > 0.05;
      if (active !== p.visible) {
        p.visible = active;
        p.root.setAttribute("display", active ? "inline" : "none");
      }
      if (!active || !hit) continue;

      const { arc, k } = hit;
      const yWater = this.waterY[slot];
      const sc = arc.scale;

      // trayectoria del arco: sube-cruza-se hunde. El avistamiento aguanta
      // arriba (curva achatada); el breach es una parábola completa.
      const lift =
        arc.kind === "sight"
          ? Math.pow(Math.sin(Math.PI * k), 0.5)
          : Math.sin(Math.PI * k);
      const x = xMin + (xMax - xMin) * (arc.x0 + (arc.x1 - arc.x0) * k);
      const bob = arc.kind === "breach" ? 0 : Math.sin(time * 1.1 + arc.t0) * 5;
      const y = yWater - lift * arc.rise * sc + bob;

      // inclinación: morro arriba al subir, morro abajo al hundirse
      let rot = -arc.dir * Math.cos(Math.PI * k) * arc.tilt;
      if (arc.kind === "breach") {
        // el salto gira de -tilt a +tilt pasando por la vertical del lomo
        rot = -arc.dir * (arc.tilt - k * arc.tilt * 2.4);
      }

      const fadeIn = smoothstep(0, 0.09, k) * (1 - smoothstep(0.93, 1, k));
      p.root.setAttribute("opacity", (Math.min(1, nightK * 1.4) * Math.min(1, fadeIn * 2)).toFixed(2));
      p.root.setAttribute(
        "transform",
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${(sc * -arc.dir).toFixed(3)} ${sc.toFixed(3)})`,
      );

      // espuma clavada en la línea de agua (solo si el cuerpo la toca)
      const inWater = arc.kind === "breach" ? 1 - smoothstep(0.18, 0.32, k) + smoothstep(0.72, 0.84, k) : 1;
      p.ripple.setAttribute("cy", (((yWater - y) / sc) + 6).toFixed(1));
      p.ripple.setAttribute("rx", (120 + lift * 60).toFixed(1));
      p.ripple.setAttribute("opacity", (0.9 * Math.min(1, inWater)).toFixed(2));

      // la COLA bate con el bajo (y azota fuerte en los arcos «slap»)
      let flukeRot = Math.sin(time * 2.1 + arc.t0) * (6 + f.stem.bass * 16);
      if (arc.kind === "slap") {
        const w = smoothstep(0.5, 0.56, k) * (1 - smoothstep(0.66, 0.78, k));
        flukeRot += w * Math.sin((k - 0.5) * 40) * 38;
      }
      if (arc.kind === "dive") flukeRot += smoothstep(0.6, 0.95, k) * 26; // cola arriba al zambullirse
      p.fluke.setAttribute("transform", `translate(158 -6) rotate(${flukeRot.toFixed(1)})`);
      p.fin.setAttribute("transform", `translate(-58 30) rotate(${(Math.sin(time * 1.6 + 2) * 9).toFixed(1)})`);

      // chorro: respira con la guitarra (solo) y la voz (coro final)
      const breath = Math.max(f.stem.voice, f.stem.guitar * 0.85);
      const spoutK =
        arc.kind === "breach" || arc.kind === "dive"
          ? 0
          : smoothstep(0.3, 0.42, k) * (1 - smoothstep(0.6, 0.72, k));
      p.spout.setAttribute("opacity", (spoutK * (0.5 + breath * 0.5)).toFixed(2));
      p.spout.setAttribute(
        "transform",
        `translate(-128 -72) scale(${(0.55 + spoutK * (0.45 + breath * 0.55)).toFixed(2)})`,
      );

      // pupila furiosa clavada en el barco (deshaciendo flip/rotación aprox.)
      {
        const flip = -arc.dir; // sx = sc * -dir
        const ex = x + -128 * sc * flip;
        const ey = y + -6 * sc;
        const dx = boatX - ex;
        const dy = boatY - ey;
        const m = Math.hypot(dx, dy) || 1;
        const ox = ((dx / m) * 3.6) / flip;
        const oy = (dy / m) * 3;
        p.pupil.setAttribute("transform", `translate(${ox.toFixed(2)} ${oy.toFixed(2)})`);
      }

      // salpicadura de papel: azote de cola (k≈0.6) y reentrada del breach (k≈0.8)
      const splashAt =
        arc.kind === "slap" ? arc.t0 + arc.dur * 0.58 :
        arc.kind === "breach" ? arc.t0 + arc.dur * 0.8 :
        arc.kind === "dive" ? arc.t0 + arc.dur * 0.55 : -1;
      if (splashAt > 0) {
        const age = f.t - splashAt;
        const D = 1.05;
        for (const b of p.splash) {
          if (age <= 0 || age >= D) {
            b.node.setAttribute("opacity", "0");
            continue;
          }
          const a = age / D;
          const ease = 1 - (1 - a) * (1 - a);
          const bx = Math.cos(b.ang) * b.r * ease;
          const by = Math.sin(b.ang) * b.r * ease + 190 * a * a; // gravedad
          b.node.setAttribute("opacity", (1 - a).toFixed(2));
          b.node.setAttribute(
            "transform",
            `translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${(b.spin * a).toFixed(1)})`,
          );
        }
      }
    }
  }
}
