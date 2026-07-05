// El barquito de papel: cabecea al beat, infla la vela con el viento (energía
// + stem de GUITARRA) y sube de nivel de pomposidad (escala + ornamento
// dorado) en cada estribillo. En la tormenta nocturna se lanza a la cacería:
// más balanceo, proa inclinada y estela crecida.

import gsap from "gsap";
import type { Frame } from "./conductor";
import { PAPER, PRIDE_LEVELS } from "./theme";
import { el } from "./svg";
import { HORIZON } from "./stage";
import { stormAt } from "./storm";

/** línea de flotación del barco en coordenadas de escena */
export const BOAT_Y = HORIZON + 118;

export class Boat {
  /** g exterior: posición + cabeceo (lo mueve update) */
  readonly pos: SVGGElement;
  /** g interior: escala de orgullo (lo anima GSAP) */
  private prideG: SVGGElement;
  private sail: SVGPathElement;
  private sailGold: SVGPathElement;
  private mast: SVGRectElement;
  private topFlag: SVGPathElement;
  private goldTrim: SVGPathElement;
  private flagsG: SVGGElement;
  private confettiG: SVGGElement;
  private foam!: SVGGElement;
  private level = 0;
  /** escala global (pantallas estrechas: barco más chico para que quepa) */
  baseScale = 1;
  /** ancla local (x,y) donde LyricEngine cuelga letras en la vela */
  readonly sailAnchor = { x: 46, y: -150 };
  /** ancla local para el banderín de letra (punta del mástil) */
  readonly mastAnchor = { x: 8, y: -210 };

  constructor(parent: SVGGElement) {
    this.pos = el("g", { class: "org-boat" }, parent);
    this.prideG = el("g", {}, this.pos);

    // estela de espuma (crece en plena cacería)
    this.foam = el("g", { opacity: 0.75 }, this.prideG);
    el("ellipse", { cx: -120, cy: 40, rx: 46, ry: 10, fill: PAPER.foam, opacity: 0.5 }, this.foam);
    el("ellipse", { cx: -170, cy: 46, rx: 26, ry: 7, fill: PAPER.foam, opacity: 0.35 }, this.foam);

    // mástil (crece con el orgullo) — detrás del pliegue central
    this.mast = el("rect", { x: -3, y: -150, width: 6, height: 92, rx: 3, fill: PAPER.hullLine }, this.prideG);

    // vela (path recalculado por frame: se infla con la energía)
    this.sail = el("path", {
      d: "", fill: PAPER.sail, stroke: PAPER.hullLine, "stroke-width": 2.5, "stroke-linejoin": "round",
    }, this.prideG);
    this.sailGold = el("path", { d: "", fill: PAPER.gold, opacity: 0 }, this.prideG);

    // gallardete en la punta del mástil
    this.topFlag = el("path", { d: "M 0 -150 L 46 -138 L 0 -126 Z", fill: PAPER.faroStripe, stroke: PAPER.hullLine, "stroke-width": 2 }, this.prideG);

    // casco de papel plegado
    const hull = el("g", {}, this.prideG);
    el("path", {
      d: "M -132 -8 L -76 56 L 76 56 L 132 -8 Z",
      fill: PAPER.hull, stroke: PAPER.hullLine, "stroke-width": 3, "stroke-linejoin": "round",
    }, hull);
    el("path", { d: "M -132 -8 L -76 56 L 76 56 L 132 -8 Z", fill: PAPER.hullShade, opacity: 0.25 }, hull);
    el("path", {
      d: "M -62 -8 L 0 -74 L 62 -8 Z",
      fill: PAPER.hull, stroke: PAPER.hullLine, "stroke-width": 3, "stroke-linejoin": "round",
    }, hull);
    el("path", { d: "M 0 -74 L 62 -8 L 30 -8 Z", fill: PAPER.hullShade, opacity: 0.35 }, hull);
    el("line", { x1: -132, y1: -8, x2: 132, y2: -8, stroke: PAPER.hullLine, "stroke-width": 3 }, hull);

    // adorno dorado del casco (aparece con el orgullo)
    this.goldTrim = el("path", {
      d: "M -124 -2 L -74 50 L 74 50 L 124 -2",
      fill: "none", stroke: PAPER.gold, "stroke-width": 6, "stroke-linecap": "round", opacity: 0,
    }, this.prideG);

    // banderines (cuerda mástil → popa), poblados por nivel
    this.flagsG = el("g", {}, this.prideG);
    this.confettiG = el("g", {}, this.pos);

    this.applyLevel(0, false);
  }

  /** puntos de la cuerda de banderines (quadrática mástil → popa) */
  private ropePoint(k: number, mastTop: number): { x: number; y: number } {
    const p0 = { x: 0, y: mastTop };
    const pc = { x: 78, y: mastTop * 0.35 };
    const p1 = { x: 128, y: -12 };
    const u = 1 - k;
    return {
      x: u * u * p0.x + 2 * u * k * pc.x + k * k * p1.x,
      y: u * u * p0.y + 2 * u * k * pc.y + k * k * p1.y,
    };
  }

  private applyLevel(level: number, animate: boolean) {
    const L = PRIDE_LEVELS[Math.min(level, PRIDE_LEVELS.length - 1)];
    const mastTop = -150 - L.mast * 68;

    if (animate) {
      gsap.to(this.mast, { attr: { y: mastTop, height: -mastTop - 58 }, duration: 0.8, ease: "back.out(1.6)" });
      // origen de escala en la quilla: el barco crece hacia arriba, no se hunde
      gsap.fromTo(this.prideG, { scale: L.scale * 0.92 }, {
        scale: L.scale, duration: 1.1, ease: "elastic.out(1, 0.45)", svgOrigin: "0 50",
      });
    } else {
      this.mast.setAttribute("y", String(mastTop));
      this.mast.setAttribute("height", String(-mastTop - 58));
      gsap.set(this.prideG, { scale: L.scale, svgOrigin: "0 50" });
    }
    gsap.to([this.goldTrim, this.sailGold], { opacity: L.gold * 0.9, duration: 0.8 });
    this.topFlag.setAttribute("transform", `translate(0 ${mastTop + 150})`);
    if (L.gold > 0.6) this.topFlag.setAttribute("fill", PAPER.gold);

    // banderines
    this.flagsG.innerHTML = "";
    const colors = [PAPER.faroStripe, PAPER.gold, PAPER.seaMid, PAPER.foam];
    for (let i = 0; i < L.flags; i++) {
      const k = (i + 1) / (L.flags + 1);
      const p = this.ropePoint(k, mastTop);
      const f = el("path", {
        d: `M ${p.x - 9} ${p.y} L ${p.x + 9} ${p.y} L ${p.x} ${p.y + 20} Z`,
        fill: colors[i % colors.length], stroke: PAPER.hullLine, "stroke-width": 1.5,
      }, this.flagsG);
      if (animate) {
        gsap.from(f, { scale: 0, svgOrigin: `${p.x} ${p.y}`, duration: 0.5, delay: 0.15 + i * 0.07, ease: "back.out(2.5)" });
      }
    }
    if (L.flags > 0) {
      const rope = el("path", {
        d: `M 0 ${mastTop} Q 78 ${mastTop * 0.35} 128 -12`,
        fill: "none", stroke: PAPER.hullLine, "stroke-width": 2, opacity: 0.8,
      }, this.flagsG);
      this.flagsG.insertBefore(rope, this.flagsG.firstChild);
    }

    this.mastAnchor.y = mastTop - 4;
  }

  /** g interior expuesto para colgar letra diegética (vela / banderín) */
  get deck(): SVGGElement {
    return this.prideG;
  }

  /** sincroniza el nivel con el conductor: sube con fanfarria, baja en seco (seek atrás) */
  syncLevel(level: number) {
    if (level > this.level) this.levelUp(level);
    else if (level < this.level) {
      this.level = level;
      this.applyLevel(level, false);
    }
  }

  /** sube de nivel con fanfarria (confeti de papel) */
  levelUp(level: number) {
    if (level === this.level) return;
    this.level = level;
    this.applyLevel(level, true);

    const colors = [PAPER.gold, PAPER.foam, PAPER.faroStripe, PAPER.sunGlow];
    for (let i = 0; i < 16; i++) {
      const bit = el("rect", {
        x: -5, y: -5, width: 10, height: 10, rx: 2,
        fill: colors[i % colors.length],
      }, this.confettiG);
      const ang = (i / 16) * Math.PI * 2;
      const r = 90 + Math.random() * 130;
      gsap.fromTo(bit, { x: 0, y: -80, rotation: 0, opacity: 1 }, {
        x: Math.cos(ang) * r,
        y: -80 + Math.sin(ang) * r * 0.7 - 40,
        rotation: 180 + Math.random() * 360,
        opacity: 0,
        duration: 1.1 + Math.random() * 0.5,
        ease: "power2.out",
        onComplete: () => bit.remove(),
      });
    }
  }

  /** llamado cada frame */
  update(f: Frame, time: number, smoothE: number, x: number) {
    const L = PRIDE_LEVELS[Math.min(this.level, PRIDE_LEVELS.length - 1)];
    const mastTop = -150 - L.mast * 68;

    // tormenta (solo de noche): más tumbos, proa al frente y sacudida al golpe
    const sk = stormAt(f.t);

    // cabeceo al beat + oleaje lento por energía (+ marejada de la cacería)
    const beat = Math.sin(f.beatPhase * Math.PI * 2);
    const rot =
      beat * (2.2 + smoothE * 3.4) * (1 + sk * 0.45) +
      Math.sin(time * 0.6) * 1.5 +
      sk * (2.2 + f.hit.drums * 2.4);
    const y =
      BOAT_Y +
      Math.sin(time * 0.9) * 9 * (0.5 + smoothE) * (1 + sk * 0.6) +
      beat * smoothE * 5;
    this.pos.setAttribute(
      "transform",
      `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${this.baseScale})`,
    );
    this.foam.setAttribute("opacity", (0.75 + sk * 0.25).toFixed(2));

    // vela: se infla con el VIENTO — la guitarra sopla más que el mix
    const wind = Math.min(1, Math.max(smoothE, smoothE * 0.35 + f.stem.guitar * 0.85));
    const boom = -84;
    const sailW = 92 + L.mast * 26;
    const belly = 10 + wind * 34 + L.gold * 6;
    const topY = mastTop + 10;
    const midX = (6 + sailW) / 2 + belly;
    const midY = (topY + boom) / 2 + belly * 0.3;
    this.sail.setAttribute("d", `M 6 ${topY} Q ${midX} ${midY} ${sailW} ${boom} L 6 ${boom} Z`);
    // banda dorada de la vela (franja interior)
    this.sailGold.setAttribute(
      "d",
      `M 6 ${boom - 26} L ${6 + (sailW - 6) * 0.82} ${boom - 26} L ${6 + (sailW - 6) * 0.94} ${boom - 8} L 6 ${boom - 8} Z`,
    );
    // ancla de letra en la vela (centro aproximado)
    this.sailAnchor.x = (6 + sailW) / 2 + belly * 0.4;
    this.sailAnchor.y = (topY + boom) / 2 + 6;
  }
}
