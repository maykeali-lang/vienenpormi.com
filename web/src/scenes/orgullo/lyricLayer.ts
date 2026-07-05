// Letra diegética de «Orgullo»: cada línea aparece en su momento integrada al
// mundo (vela, ola, banderín, faro, cielo), nunca como subtítulo karaoke.

import gsap from "gsap";
import type { Frame } from "./conductor";
import { ORGULLO_LYRICS, type LyricLine } from "./lyrics";
import { PAPER } from "./theme";
import { el, seeded } from "./svg";
import { Stage, HORIZON } from "./stage";
import { Boat } from "./boat";

const FONT_HAND = "'Caveat', cursive";
const FONT_DISP = "'Archivo Black', system-ui, sans-serif";

interface ActiveLyric {
  g: SVGGElement;
  leaving: boolean;
}

export class LyricEngine {
  private active = new Map<number, ActiveLyric>();
  /** líneas activas (por defecto las autoradas; la escena las re-ancla
   *  a los onsets del stem de voz al cargar el análisis) */
  private lines: LyricLine[] = ORGULLO_LYRICS;

  constructor(
    private stage: Stage,
    private boat: Boat,
  ) {}

  /** reemplaza las líneas (p. ej. alineadas al stem de voz) */
  setLines(lines: LyricLine[]) {
    // limpia lo visible para no dejar huérfanos con timings viejos
    for (const [i] of this.active) this.despawn(i, false);
    this.lines = lines;
  }

  private window(i: number): [number, number] {
    const line = this.lines[i];
    const next = this.lines[i + 1];
    const end = line.hold != null ? line.t + line.hold : next ? Math.max(line.t + 1.6, next.t + 1.2) : line.t + 5;
    return [line.t, end];
  }

  update(f: Frame) {
    for (let i = 0; i < this.lines.length; i++) {
      const [t0, t1] = this.window(i);
      const inWindow = f.t >= t0 && f.t < t1;
      const a = this.active.get(i);
      if (inWindow && !a) this.spawn(i, this.lines[i]);
      else if (!inWindow && a && !a.leaving) {
        // seek lejano: fuera sin animación; salida natural: se disuelve
        const natural = f.t >= t1 && f.t < t1 + 1.5;
        this.despawn(i, natural);
      }
    }
  }

  private text(
    parent: SVGGElement,
    str: string,
    attrs: Record<string, string | number>,
  ): SVGTextElement {
    const t = el("text", {
      "font-family": FONT_HAND,
      "font-size": 52,
      fill: PAPER.ink,
      "text-anchor": "middle",
      "paint-order": "stroke",
      ...attrs,
    }, parent);
    t.textContent = str;
    return t;
  }

  private spawn(i: number, line: LyricLine) {
    const rnd = seeded(1000 + i * 31);
    let g: SVGGElement;

    switch (line.place) {
      case "vela": {
        // escrita sobre la vela: viaja (y se escala) con el barco
        g = el("g", {}, this.boat.deck);
        const { x, y } = this.boat.sailAnchor;
        this.text(g, line.text, {
          x, y, "font-size": 28, fill: PAPER.hullLine,
          stroke: "rgba(253,246,228,0.85)", "stroke-width": 4,
          transform: `rotate(-4 ${x} ${y})`,
        });
        gsap.from(g, { opacity: 0, y: 10, duration: 0.7, ease: "power2.out" });
        break;
      }
      case "banderin": {
        // grito en un banderín colgado del mástil
        g = el("g", {}, this.boat.deck);
        const { x, y } = this.boat.mastAnchor;
        const w = line.text.length * 15 + 26;
        el("path", {
          d: `M ${x} ${y - 16} L ${x + w} ${y - 16} L ${x + w + 16} ${y} L ${x + w} ${y + 16} L ${x} ${y + 16} Z`,
          fill: PAPER.faroStripe, stroke: PAPER.hullLine, "stroke-width": 2,
        }, g);
        this.text(g, line.text, {
          x: x + w / 2 + 4, y: y + 9, "font-size": 27, fill: PAPER.foam, "font-weight": 700,
        });
        gsap.from(g, {
          scale: 0, svgOrigin: `${x} ${y}`, duration: 0.6, ease: "back.out(2.2)",
        });
        break;
      }
      case "ola": {
        // letras-origami que emergen del agua, delante del barco
        g = el("g", {}, this.stage.seaLyrics);
        // alterna lado y altura por línea: dos seguidas no se pisan
        const vbW = this.stage.xMax - this.stage.xMin;
        const x = this.stage.xMin + vbW * (0.16 + (i % 2) * 0.36 + rnd() * 0.26);
        const y = HORIZON + 200 + (i % 2) * 56 + rnd() * 16;
        const t = this.text(g, line.text, {
          x, y, "font-size": 56, fill: PAPER.foam,
          stroke: "rgba(20,30,60,0.55)", "stroke-width": 5,
          transform: `rotate(${(rnd() - 0.5) * 8} ${x} ${y})`,
        });
        gsap.from(t, { attr: { y: y + 90 }, opacity: 0, duration: 0.9, ease: "back.out(1.4)" });
        break;
      }
      case "cielo": {
        // flota en el cielo como recorte de papel
        g = el("g", {}, this.stage.skyLyrics);
        const vbW = this.stage.xMax - this.stage.xMin;
        const x = this.stage.xMin + vbW * (0.16 + rnd() * 0.42);
        const y = this.stage.yMin + 110 + rnd() * 240;
        const gold = !!line.gold;
        const night = this.stage.nightK > 0.5; // de noche: tinta clara sobre cielo navy
        const t = this.text(g, line.text, {
          x, y,
          "font-size": gold ? 84 : 54,
          "font-family": gold ? FONT_DISP : FONT_HAND,
          fill: gold ? PAPER.gold : night ? PAPER.foam : PAPER.ink,
          stroke: gold ? PAPER.goldDeep : night ? "rgba(20,30,60,0.6)" : "rgba(250,241,221,0.8)",
          "stroke-width": gold ? 2.5 : 6,
          transform: `rotate(${(rnd() - 0.5) * 6} ${x} ${y})`,
        });
        if (gold) {
          gsap.from(t, { scale: 0.2, svgOrigin: `${x} ${y}`, opacity: 0, duration: 0.9, ease: "elastic.out(1, 0.5)" });
        } else {
          gsap.from(t, { opacity: 0, attr: { y: y + 26 }, duration: 0.9, ease: "power2.out" });
        }
        gsap.to(g, { x: -30, duration: 6, ease: "none" });
        break;
      }
      case "faro": {
        // el faro responde al final del viaje (capa propia: no hereda su fade)
        g = el("g", {}, this.stage.skyLyrics);
        const x = this.stage.faroX - 88;
        const y = this.stage.yMin + 205 - (i % 2) * 62;
        const night = this.stage.nightK > 0.5;
        const t = this.text(g, line.text, {
          x, y, "font-size": 48,
          fill: night ? PAPER.foam : PAPER.ink,
          stroke: night ? "rgba(20,30,60,0.6)" : "rgba(250,241,221,0.85)",
          "stroke-width": 5,
          "text-anchor": "end",
        });
        gsap.from(t, { opacity: 0, attr: { x: x + 40 }, duration: 0.8, ease: "power2.out" });
        break;
      }
    }

    this.active.set(i, { g, leaving: false });
  }

  private despawn(i: number, animate: boolean) {
    const a = this.active.get(i);
    if (!a) return;
    if (!animate) {
      gsap.killTweensOf(a.g);
      a.g.remove();
      this.active.delete(i);
      return;
    }
    a.leaving = true;
    gsap.to(a.g, {
      opacity: 0,
      y: "-=18",
      duration: 0.9,
      ease: "power1.in",
      onComplete: () => {
        a.g.remove();
        this.active.delete(i);
      },
    });
  }
}
