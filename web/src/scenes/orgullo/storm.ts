// Tormenta nocturna de «Orgullo» — el telón de la cacería de Moby Dick.
// Nubes de tormenta que ruedan contra el viaje, lluvia de papel, ráfagas de
// viento y RELÁMPAGOS de papel disparados por los golpes de la batería
// (con destello del cielo); la lluvia se inclina con la guitarra.
// La intensidad (stormK) es determinista desde f.t: aguanta seek.

import type { Frame } from "./conductor";
import { STORM, STORM_PAPER as SP } from "./theme";
import { el, seeded } from "./svg";
import { VIEW_W, VIEW_H, HORIZON } from "./stage";

// nube de tormenta REAL (púrpura con relámpago dentro), recortada por
// scripts/process-orgullo-assets.py
const STORM_CLOUD = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/assets/orgullo/nube-noche-2.png`;
const STORM_CLOUD_AR = 336 / 547;

/** intensidad 0..1 de la tormenta en el segundo t (determinista) */
export function stormAt(t: number): number {
  const up = Math.max(0, Math.min(1, (t - STORM.start) / (STORM.full - STORM.start)));
  const down = Math.max(0, Math.min(1, (t - STORM.calm) / (STORM.end - STORM.calm)));
  const k = up * (1 - down * (1 - STORM.rest));
  return k * k * (3 - 2 * k);
}

interface Bolt {
  glow: SVGPathElement;
  core: SVGPathElement;
  /** segundo de la canción en que cayó (−1 = libre) */
  t0: number;
}

const BOLT_LIFE = 0.32; // s visibles (como el decay del golpe de batería)
const RAIN_ROW = 240; // separación vertical del patrón de gotas (loop)

export class Storm {
  private cloudsG: SVGGElement;
  private clouds: { g: SVGGElement; w: number; y: number; speed: number }[] = [];
  private boltsG: SVGGElement;
  private bolts: Bolt[] = [];
  private windG: SVGGElement;
  private winds: SVGPathElement[] = [];
  private rainG: SVGGElement;
  private rainInner: SVGGElement;
  private flash: SVGRectElement;
  private reduced: boolean;

  private lastBoltT = -10;
  private lastBoltIdx = -1;
  private boltSlot = 0;
  private lastK = -1;

  /**
   * cloudsLayer: en el cielo (sobre las nubes normales, bajo el mar).
   * rainLayer/flashLayer: por delante de todo (el destello, lo último).
   */
  constructor(cloudsLayer: SVGGElement, frontLayer: SVGGElement, reduced: boolean) {
    this.reduced = reduced;

    // nubes de tormenta REALES (la púrpura con relámpago) rodando contra el
    // viaje; alternan flip para que no se lea el mismo recorte en fila
    this.cloudsG = el("g", { opacity: 0 }, cloudsLayer);
    const defs: [number, number, number, boolean][] = [
      [520, 6, 0.9, false], [400, 118, 1.25, true], [460, 44, 1.05, false], [380, 156, 1.4, true],
    ];
    for (const [w, y, speed, flip] of defs) {
      const g = el("g", {}, this.cloudsG);
      const inner = el("g", {}, g);
      if (flip) inner.setAttribute("transform", `scale(-1 1) translate(${-w} 0)`);
      el("image", {
        href: STORM_CLOUD, x: 0, y: 0, width: w, height: w * STORM_CLOUD_AR,
        preserveAspectRatio: "xMidYMid meet",
      }, inner);
      this.clouds.push({ g, w, y, speed });
    }

    // relámpagos (pool de 2, alternados)
    this.boltsG = el("g", {}, cloudsLayer);
    for (let i = 0; i < 2; i++) {
      const glow = el("path", {
        d: "", fill: "none", stroke: SP.bolt, "stroke-width": 11,
        "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0,
      }, this.boltsG);
      const core = el("path", {
        d: "", fill: "none", stroke: SP.boltCore, "stroke-width": 4,
        "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0,
      }, this.boltsG);
      this.bolts.push({ glow, core, t0: -1 });
    }

    // ráfagas de viento (trazos en S que cruzan el cielo con la guitarra)
    this.windG = el("g", { opacity: 0 }, frontLayer);
    for (let i = 0; i < 3; i++) {
      const y = 120 + i * 130;
      const p = el("path", {
        d: `M 0 ${y} q 60 -18 120 0 t 120 0 t 120 0`,
        fill: "none", stroke: "#f4ead2", "stroke-width": 3,
        "stroke-linecap": "round", "stroke-dasharray": "46 30", opacity: 0.7,
      }, this.windG);
      this.winds.push(p);
    }

    // lluvia de papel: rejilla de trazos que cae en loop (rotación = inclinación)
    this.rainG = el("g", { opacity: 0 }, frontLayer);
    this.rainInner = el("g", {}, this.rainG);
    const rnd = seeded(23);
    const cols = reduced ? 12 : 22;
    const rows = Math.ceil((VIEW_H + RAIN_ROW * 2) / RAIN_ROW);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c / cols) * (VIEW_W + 400) - 200 + (rnd() - 0.5) * 70;
        const y = -RAIN_ROW + r * RAIN_ROW + rnd() * RAIN_ROW;
        const len = 22 + rnd() * 18;
        el("line", {
          x1: x, y1: y, x2: x, y2: y + len,
          stroke: SP.rain, "stroke-width": 2.6, "stroke-linecap": "round",
          opacity: 0.35 + rnd() * 0.55,
        }, this.rainInner);
      }
    }

    // destello del relámpago (encima de todo lo demás)
    this.flash = el("rect", {
      x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: SP.flash, opacity: 0,
      "pointer-events": "none",
    }, frontLayer);
  }

  /** rayo de papel: zigzag sembrado por el índice del golpe (determinista) */
  private boltPath(seed: number, xMin: number, xMax: number): string {
    const rnd = seeded(seed * 7 + 3);
    let x = xMin + 120 + rnd() * (xMax - xMin - 240);
    let y = 60 + rnd() * 80;
    let d = `M ${x.toFixed(0)} ${y.toFixed(0)}`;
    const steps = 6;
    const yEnd = HORIZON + 20;
    for (let i = 0; i < steps; i++) {
      x += (rnd() - 0.5) * 130;
      y += (yEnd - y) / (steps - i) + (rnd() - 0.4) * 26;
      d += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
      // una rama corta a mitad de camino
      if (i === 2) {
        const bx = x + (rnd() - 0.5) * 160;
        const by = y + 60 + rnd() * 70;
        d += ` M ${x.toFixed(0)} ${y.toFixed(0)} L ${bx.toFixed(0)} ${by.toFixed(0)} M ${x.toFixed(0)} ${y.toFixed(0)}`;
      }
    }
    return d;
  }

  /** llamado cada frame por Stage.update; devuelve stormK */
  update(f: Frame, time: number, nightK: number, xMin: number, xMax: number): number {
    const k = stormAt(f.t) * Math.min(1, nightK * 1.6);

    if (Math.abs(k - this.lastK) > 0.002) {
      this.lastK = k;
      this.cloudsG.setAttribute("opacity", (k * 0.96).toFixed(2));
      this.rainG.setAttribute("opacity", k < 0.25 ? "0" : ((k - 0.25) * 1.1).toFixed(2));
    }
    if (k <= 0.01) {
      this.windG.setAttribute("opacity", "0");
      this.flash.setAttribute("opacity", "0");
      for (const b of this.bolts) {
        b.core.setAttribute("opacity", "0");
        b.glow.setAttribute("opacity", "0");
      }
      return k;
    }

    // nubes de tormenta ruedan de derecha a izquierda (contra el viaje)
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      const span = VIEW_W + c.w * 2;
      const drift = (time * 26 * c.speed + i * 560) % span;
      c.g.setAttribute(
        "transform",
        `translate(${(VIEW_W + c.w - drift).toFixed(1)} ${(c.y + Math.sin(time * 0.5 + i) * 8).toFixed(1)})`,
      );
    }

    // lluvia: cae en loop; la GUITARRA la inclina y la acelera
    const gtr = f.stem.guitar;
    const fall = (time * (620 + gtr * 380)) % RAIN_ROW;
    const slant = 10 + gtr * 14;
    this.rainG.setAttribute("transform", `rotate(${slant.toFixed(1)} ${(VIEW_W / 2).toFixed(0)} ${(VIEW_H / 2).toFixed(0)})`);
    this.rainInner.setAttribute("transform", `translate(0 ${fall.toFixed(1)})`);

    // ráfagas de viento con la guitarra
    const windOp = k * (0.1 + gtr * 0.5);
    this.windG.setAttribute("opacity", windOp.toFixed(2));
    if (windOp > 0.02) {
      for (let i = 0; i < this.winds.length; i++) {
        const span = VIEW_W + 500;
        const wx = span - ((time * (260 + gtr * 240) + i * 640) % span) - 400;
        this.winds[i].setAttribute("transform", `translate(${wx.toFixed(1)} ${(Math.sin(time * 0.9 + i * 2) * 14).toFixed(1)})`);
      }
    }

    // RELÁMPAGOS: los dispara la batería (onsets fuertes, espaciados);
    // en el estribillo final la tormenta se vuelve frenética
    if (f.t < this.lastBoltT - 0.1) this.lastBoltT = -10; // seek atrás
    const minGap = f.section === "estribillo" ? 1.35 : 2.3;
    if (
      k > 0.45 &&
      f.drumHitIdx >= 0 &&
      f.drumHitIdx !== this.lastBoltIdx &&
      f.hit.drums > 0.5 &&
      f.t - this.lastBoltT > minGap
    ) {
      this.lastBoltIdx = f.drumHitIdx;
      this.lastBoltT = f.t;
      const b = this.bolts[this.boltSlot];
      this.boltSlot = (this.boltSlot + 1) % this.bolts.length;
      const d = this.boltPath(f.drumHitIdx, xMin, xMax);
      b.glow.setAttribute("d", d);
      b.core.setAttribute("d", d);
      b.t0 = f.t;
    }

    // vida de los rayos + destello del cielo
    let flashK = 0;
    for (const b of this.bolts) {
      if (b.t0 < 0) continue;
      const age = f.t - b.t0;
      if (age < 0 || age > BOLT_LIFE) {
        b.core.setAttribute("opacity", "0");
        b.glow.setAttribute("opacity", "0");
        continue;
      }
      const life = 1 - age / BOLT_LIFE;
      // parpadeo del trazo (dos pulsos)
      const flicker = life * (0.55 + 0.45 * Math.cos(age * 62));
      b.core.setAttribute("opacity", flicker.toFixed(2));
      b.glow.setAttribute("opacity", (flicker * 0.55).toFixed(2));
      flashK = Math.max(flashK, life);
    }
    this.flash.setAttribute("opacity", (flashK * flashK * 0.22 * k).toFixed(3));

    return k;
  }
}
