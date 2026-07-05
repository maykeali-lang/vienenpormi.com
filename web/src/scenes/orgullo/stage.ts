// Escenario papercraft de «Orgullo»: cielo + sol dorado + nubes + 4 bandas de
// mar con parallax y oleaje reactivo, un faro que emerge al final y, de noche,
// la tormenta y la cacería de Moby Dick (todo al ritmo de los stems).

import type { Frame } from "./conductor";
import { PAPER, PARALLAX, NIGHT, NIGHT_PAPER } from "./theme";
import { el, seaBandPath, cloudPath, seeded, lerpColor } from "./svg";
import { NightCreatures } from "./creatures";
import { Storm } from "./storm";
import { Whale } from "./whale";

export const VIEW_W = 1600;
export const VIEW_H = 900;
export const HORIZON = 520;

/** assets REALES del mundo (fotos recortadas por scripts/process-orgullo-assets.py) */
const ASSET = `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/assets/orgullo`;
// alto/ancho de cada recorte (para no deformar las <image>)
const IMG_AR = {
  luna: 393 / 420,
  dia1: 429 / 720,
  dia2: 331 / 720,
  noche1: 422 / 534,
} as const;
/** distancia total (px de mundo) que recorre el parallax base en la canción */
const WORLD = 6000;

interface SeaBand {
  g: SVGGElement;
  path: SVGPathElement;
  dayColor: string;
  nightColor: string;
  tile: number;
  factor: number;
  baseY: number;
  bobAmp: number;
  bobSpeed: number;
  phase: number;
}

export class Stage {
  readonly svg: SVGSVGElement;
  /** capa donde vive el barco (entre olas medias y cercanas) */
  readonly boatLayer: SVGGElement;
  /** capa de letra en el cielo */
  readonly skyLyrics: SVGGElement;
  /** capa de letra sobre las olas (delante del barco) */
  readonly seaLyrics: SVGGElement;
  /** ancla del faro (aparece al final) */
  readonly faroAnchor: SVGGElement;

  private bands: SeaBand[] = [];
  private sun: SVGGElement;
  private sunRays!: SVGGElement;
  private sunPupils: SVGGElement[] = [];
  private moon: SVGGElement;
  private creatures: NightCreatures;
  private storm: Storm;
  private whale: Whale;
  /** punto de la escena que sol/luna/criaturas miran (el barco) */
  private lookX = VIEW_W * 0.35;
  private lookY = HORIZON + 118;
  private stars: { el: SVGElement; speed: number; phase: number }[] = [];
  private starsG: SVGGElement;
  private nightSky: SVGRectElement;
  private duskGlow!: SVGRectElement;
  private clouds: {
    g: SVGGElement;
    day: SVGImageElement;
    night: SVGImageElement;
    speed: number;
    y: number;
    w: number;
  }[] = [];
  private faro: SVGGElement;
  private faroBeam: SVGPathElement;
  private smoothE = 0;
  private lastNight = -1;
  /** 0 = día, 1 = noche (crepúsculo en NIGHT.start; la letra lo consulta) */
  nightK = 0;
  /** 0..1 intensidad de la tormenta nocturna (lo calcula Storm) */
  stormK = 0;

  // ventana visible dentro del viewBox (preserveAspectRatio slice recorta):
  // el layout (barco, sol, faro, letra) se ancla a esta ventana, no al viewBox.
  xMin = 0;
  xMax = VIEW_W;
  yMin = 0;
  faroX = VIEW_W - 0.14 * VIEW_W;
  private sunX = VIEW_W - 0.2 * VIEW_W;

  setViewport(w: number, h: number) {
    const aspect = w / Math.max(1, h);
    const vbW = Math.min(VIEW_W, VIEW_H * aspect);
    const vbH = Math.min(VIEW_H, VIEW_W / aspect);
    this.xMin = (VIEW_W - vbW) / 2;
    this.xMax = this.xMin + vbW;
    this.yMin = (VIEW_H - vbH) / 2;
    this.sunX = this.xMax - vbW * 0.2;
    this.faroX = this.xMax - vbW * 0.13;
  }

  constructor(container: HTMLElement, reduced: boolean) {
    this.svg = el("svg", {
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      preserveAspectRatio: "xMidYMid slice",
      class: "org-stage",
    });
    container.appendChild(this.svg);

    const defs = el("defs", {}, this.svg);
    const sky = el("linearGradient", { id: "org-sky", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0%", "stop-color": PAPER.skyTop }, sky);
    el("stop", { offset: "100%", "stop-color": PAPER.skyBottom }, sky);
    // sombra suave de capa (look cutout). En móvil (reduced) se omite: caro.
    if (!reduced) {
      const f = el("filter", { id: "org-cut", x: "-5%", y: "-20%", width: "110%", height: "140%" }, defs);
      el("feDropShadow", { dx: 0, dy: -6, stdDeviation: 6, "flood-color": "#1a2340", "flood-opacity": 0.28 }, f);
    }

    // cielo de día + cielo de noche encima (crossfade por opacidad)
    el("rect", { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: "url(#org-sky)" }, this.svg);
    const nsky = el("linearGradient", { id: "org-sky-n", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0%", "stop-color": NIGHT_PAPER.skyTop }, nsky);
    el("stop", { offset: "100%", "stop-color": NIGHT_PAPER.skyBottom }, nsky);
    this.nightSky = el("rect", {
      x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: "url(#org-sky-n)", opacity: 0,
    }, this.svg);
    // resplandor de atardecer: pica a mitad del crepúsculo (evita el gris sucio)
    const dusk = el("linearGradient", { id: "org-sky-d", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "20%", "stop-color": "#e8946b", "stop-opacity": 0 }, dusk);
    el("stop", { offset: "100%", "stop-color": "#e8946b", "stop-opacity": 0.85 }, dusk);
    this.duskGlow = el("rect", {
      x: 0, y: 0, width: VIEW_W, height: HORIZON + 40, fill: "url(#org-sky-d)", opacity: 0,
    }, this.svg);

    // estrellas de papel (rombos), solo visibles de noche
    this.starsG = el("g", { opacity: 0 }, this.svg);
    const srnd = seeded(41);
    for (let i = 0; i < 16; i++) {
      const sx = 60 + srnd() * (VIEW_W - 120);
      const sy = 30 + srnd() * (HORIZON - 160);
      const r = 5 + srnd() * 6;
      const star = el("path", {
        d: `M ${sx} ${sy - r} L ${sx + r * 0.62} ${sy} L ${sx} ${sy + r} L ${sx - r * 0.62} ${sy} Z`,
        fill: NIGHT_PAPER.star,
        opacity: 0.9,
      }, this.starsG);
      this.stars.push({ el: star, speed: 0.8 + srnd() * 1.6, phase: srnd() * 6.3 });
    }

    // sol esotérico (estilo tarot): rayos alternos rectos/ondulados que giran
    // aparte, y una cara serena SIEMPRE derecha cuyos ojos siguen al barco
    this.sun = el("g", { class: "org-sun" }, this.svg);
    if (!reduced) this.sun.setAttribute("filter", "url(#org-cut)");
    el("circle", { cx: 4, cy: 6, r: 84, fill: PAPER.cloud }, this.sun);
    this.sunRays = el("g", {}, this.sun);
    for (let i = 0; i < 16; i++) {
      const wavy = i % 2 === 1;
      el("path", {
        d: wavy
          ? // llama serpenteante (rayo ondulado)
            "M -8 -82 C -18 -98, -2 -110, -8 -124 C -12 -136, -2 -144, 5 -150 C 4 -138, 12 -126, 5 -112 C 1 -102, 7 -92, 8 -82 Z"
          : "M -11 -84 L 11 -84 L 0 -126 Z",
        fill: PAPER.sun, transform: `rotate(${i * 22.5})`,
      }, this.sunRays);
    }
    el("circle", { r: 70, fill: PAPER.sun }, this.sun);
    // anillos grabados (grabado alquímico)
    el("circle", { r: 58, fill: "none", stroke: PAPER.goldDeep, "stroke-width": 1.8, opacity: 0.55 }, this.sun);
    el("circle", { r: 63, fill: "none", stroke: PAPER.goldDeep, "stroke-width": 1, opacity: 0.3 }, this.sun);
    {
      const face = el("g", { stroke: PAPER.hullLine, "stroke-width": 2.4, fill: "none", "stroke-linecap": "round" }, this.sun);
      // tercer ojo (rombo en la frente)
      el("path", { d: "M 0 -46 L 7 -37 L 0 -28 L -7 -37 Z", fill: PAPER.goldDeep, stroke: "none", opacity: 0.75 }, face);
      // cejas serenas
      el("path", { d: "M -36 -22 Q -24 -31 -12 -22" }, face);
      el("path", { d: "M 12 -22 Q 24 -31 36 -22" }, face);
      // ojos almendrados
      el("path", { d: "M -35 -12 Q -24 -21 -13 -12 Q -24 -4 -35 -12 Z", fill: PAPER.cloud }, face);
      el("path", { d: "M 13 -12 Q 24 -21 35 -12 Q 24 -4 13 -12 Z", fill: PAPER.cloud }, face);
      // iris+pupila agrupados: el grupo entero mira al barco
      for (const s of [-1, 1] as const) {
        const eye = el("g", { stroke: "none" }, face);
        el("circle", { cx: 24 * s, cy: -12, r: 5, fill: PAPER.goldDeep }, eye);
        el("circle", { cx: 24 * s, cy: -12, r: 2.6, fill: PAPER.hullLine }, eye);
        this.sunPupils.push(eye);
      }
      // nariz recta y boca serena
      el("path", { d: "M 0 -10 L 0 12 M -7 14 Q 0 20 7 14" }, face);
      el("path", { d: "M -13 30 Q 0 39 13 30" }, face);
      // mejillas
      el("circle", { cx: -42, cy: 12, r: 6, fill: PAPER.sunGlow, stroke: "none", opacity: 0.9 }, face);
      el("circle", { cx: 42, cy: 12, r: 6, fill: PAPER.sunGlow, stroke: "none", opacity: 0.9 }, face);
    }

    // LUNA REAL: el sticker Méliès («Le Voyage dans la Lune») recortado —
    // reemplaza al creciente dibujado; conserva su vaivén y su fade nocturno
    this.moon = el("g", { class: "org-moon", opacity: 0 }, this.svg);
    if (!reduced) this.moon.setAttribute("filter", "url(#org-cut)");
    {
      const w = 168; // coherente con el creciente anterior (~150 de alto)
      const h = w * IMG_AR.luna;
      el("image", {
        href: `${ASSET}/luna.png`,
        x: -w / 2, y: -h / 2, width: w, height: h,
        preserveAspectRatio: "xMidYMid meet",
      }, this.moon);
    }

    // NUBES REALES (fotos recortadas): día ⇄ noche por crossfade en el
    // crepúsculo. Mismos anchos/alturas que las nubes de papel anteriores.
    const rnd = seeded(77);
    const dayImgs = [
      { href: `${ASSET}/nube-dia-1.png`, ar: IMG_AR.dia1 },
      { href: `${ASSET}/nube-dia-2.png`, ar: IMG_AR.dia2 },
    ];
    const nightImg = { href: `${ASSET}/nube-noche-1.png`, ar: IMG_AR.noche1 };
    const cloudDefs = [
      { w: 300, y: 120, v: 0, flip: false },
      { w: 210, y: 230, v: 1, flip: false },
      { w: 380, y: 70, v: 1, flip: true },
      { w: 250, y: 310, v: 0, flip: true },
    ];
    for (let i = 0; i < cloudDefs.length; i++) {
      const c = cloudDefs[i];
      const g = el("g", { opacity: 0.92 }, this.svg);
      // el flip vive en un grupo interior para no pelear con el translate
      const inner = el("g", {}, g);
      if (c.flip) inner.setAttribute("transform", `scale(-1 1) translate(${-c.w} 0)`);
      const dv = dayImgs[c.v];
      const day = el("image", {
        href: dv.href, x: 0, y: 0, width: c.w, height: c.w * dv.ar,
        preserveAspectRatio: "xMidYMid meet",
      }, inner);
      // de noche la nube cambia a su versión nocturna (misma caja)
      const night = el("image", {
        href: nightImg.href, x: 0, y: 0, width: c.w, height: c.w * nightImg.ar,
        preserveAspectRatio: "xMidYMid meet", opacity: 0,
      }, inner);
      this.clouds.push({ g, day, night, speed: 0.35 + rnd() * 0.5, y: c.y, w: c.w });
    }

    // capa de cielo de la tormenta (nubes negras + relámpagos), sobre las
    // nubes normales y DEBAJO del mar (los rayos mueren tras las olas)
    const stormSky = el("g", {}, this.svg);

    // faro (en el horizonte, emerge cuando el viaje va llegando)
    this.faro = el("g", { class: "org-faro", opacity: 0 }, this.svg);
    this.faroBeam = el("path", {
      d: "M 0 -164 L -260 -216 L -260 -128 Z",
      fill: PAPER.sunGlow, opacity: 0.0,
    }, this.faro);
    const tower = el("g", {}, this.faro);
    el("path", { d: "M -26 0 L -18 -150 L 18 -150 L 26 0 Z", fill: PAPER.faroBody, stroke: PAPER.hullLine, "stroke-width": 2.5 }, tower);
    for (let i = 0; i < 3; i++) {
      el("path", {
        d: `M ${-24 + i * 2.4} ${-18 - i * 44} L ${24 - i * 2.4} ${-18 - i * 44} L ${23 - i * 2.4} ${-40 - i * 44} L ${-23 + i * 2.4} ${-40 - i * 44} Z`,
        fill: PAPER.faroStripe, opacity: 0.9,
      }, tower);
    }
    el("rect", { x: -14, y: -178, width: 28, height: 28, fill: PAPER.hullLine, rx: 3 }, tower);
    el("circle", { cx: 0, cy: -164, r: 9, fill: PAPER.sun }, tower);
    el("path", { d: "M -20 -178 L 0 -198 L 20 -178 Z", fill: PAPER.faroStripe, stroke: PAPER.hullLine, "stroke-width": 2 }, tower);
    this.faro.setAttribute("transform", `translate(${this.faroX} ${HORIZON + 6})`);

    // bandas de mar (lejos → cerca). El barco va entre seaNear y seaFront.
    const mk = (
      color: string, tile: number, bumps: number, amp: number, baseY: number,
      factor: number, bobAmp: number, bobSpeed: number, seed: number, shadow: boolean,
    ): SeaBand => {
      const g = el("g", {}, this.svg);
      const d = seaBandPath(tile, bumps, amp, VIEW_H, seed);
      const attrs: Record<string, string | number> = { d, fill: color };
      if (shadow && !reduced) attrs.filter = "url(#org-cut)";
      const path = el("path", attrs, g);
      return { g, path, dayColor: color, nightColor: color, tile, factor, baseY, bobAmp, bobSpeed, phase: seed };
    };

    this.bands.push(mk(PAPER.seaFar, 2000, 26, 10, HORIZON, PARALLAX.seaFar, 3, 0.5, 3, false));
    this.bands.push(mk(PAPER.seaMid, 2200, 18, 20, HORIZON + 70, PARALLAX.seaMid, 6, 0.7, 7, true));
    this.boatLayer = el("g", {}, this.svg);
    this.bands.push(mk(PAPER.seaNear, 2400, 13, 34, HORIZON + 170, PARALLAX.seaNear, 10, 0.9, 11, true));
    this.seaLyrics = el("g", {}, this.svg);
    this.bands.push(mk(PAPER.seaFront, 2600, 9, 52, HORIZON + 300, PARALLAX.seaFront, 16, 1.15, 17, true));
    const nightSea = [NIGHT_PAPER.seaFar, NIGHT_PAPER.seaMid, NIGHT_PAPER.seaNear, NIGHT_PAPER.seaFront];
    this.bands.forEach((b, i) => (b.nightColor = nightSea[i]));
    this.skyLyrics = el("g", {}, this.svg);
    this.faroAnchor = this.faro;

    // criaturas nocturnas: cada capa vive DETRÁS de una banda de mar para que
    // la ola la tape al hundirse (lejos: tras seaNear; cerca: tras seaFront)
    const creatureFar = el("g", {}, this.svg);
    this.svg.insertBefore(creatureFar, this.boatLayer);
    const creatureNear = el("g", {}, this.svg);
    this.svg.insertBefore(creatureNear, this.bands[3].g);
    this.creatures = new NightCreatures(creatureFar, creatureNear, HORIZON + 185, HORIZON + 312);

    // MOBY DICK: mismas profundidades que las criaturas (lejos/cerca)
    const whaleFar = el("g", {}, this.svg);
    this.svg.insertBefore(whaleFar, this.boatLayer);
    const whaleNear = el("g", {}, this.svg);
    this.svg.insertBefore(whaleNear, this.bands[3].g);
    this.whale = new Whale(whaleFar, whaleNear, HORIZON + 185, HORIZON + 312);

    // frente de tormenta (lluvia, viento y destello) POR DELANTE de todo
    const stormFront = el("g", {}, this.svg);
    this.storm = new Storm(stormSky, stormFront, reduced);
  }

  /** el barco informa su posición cada frame: sol, luna y criaturas lo miran */
  lookAt(x: number, y: number) {
    this.lookX = x;
    this.lookY = y;
  }

  update(f: Frame, time: number) {
    // energía suavizada: ataque rápido, release lento (respiración del mar)
    this.smoothE += (f.energy - this.smoothE) * (f.energy > this.smoothE ? 0.25 : 0.05);
    const e = this.smoothE;

    // crepúsculo: en NIGHT.start el día se apaga (determinista desde t)
    const n = Math.max(0, Math.min(1, (f.t - NIGHT.start) / NIGHT.fade));
    this.nightK = n;

    // tormenta nocturna: nubes negras, lluvia, viento y relámpagos a la
    // batería; devuelve su intensidad para el oleaje y la luz
    const sk = this.storm.update(f, time, n, this.xMin, this.xMax);
    this.stormK = sk;

    // el color de cielo/mar se hunde un punto más con la tormenta
    const colorK = Math.min(1, n + sk * 0.14);
    if (Math.abs(colorK - this.lastNight) > 0.002) {
      this.lastNight = colorK;
      this.nightSky.setAttribute("opacity", Math.min(1, n).toFixed(3));
      this.duskGlow.setAttribute("opacity", (Math.sin(n * Math.PI) * 0.6).toFixed(3));
      for (const b of this.bands) b.path.setAttribute("fill", lerpColor(b.dayColor, b.nightColor, colorK));
      // crossfade nube de día ⇄ nube de noche; la tormenta las apaga un punto
      for (const c of this.clouds) {
        c.g.setAttribute("opacity", (0.92 - sk * 0.3).toFixed(2));
        c.day.setAttribute("opacity", (1 - n).toFixed(2));
        c.night.setAttribute("opacity", n.toFixed(2));
      }
    }
    // estrellas: la tormenta las tapa casi del todo
    this.starsG.setAttribute("opacity", (n * (1 - sk * 0.75)).toFixed(3));

    // sol: late con la energía (y salta con el golpe de batería) y SE PONE al
    // anochecer; giran solo los rayos (la cara queda derecha, mirando al barco)
    const sunS = 1 + e * 0.1 + f.hit.drums * 0.05 + (f.section === "estribillo" ? 0.08 : 0);
    const sunY = this.yMin + 150 + n * 620; // baja tras el horizonte
    this.sun.setAttribute(
      "transform",
      `translate(${this.sunX.toFixed(1)} ${sunY.toFixed(1)}) scale(${sunS.toFixed(3)})`,
    );
    this.sun.setAttribute("opacity", (1 - n).toFixed(2));
    if (n < 1) {
      this.sunRays.setAttribute("transform", `rotate(${(time * 2.2).toFixed(2)})`);
      this.trackEyes(this.sunPupils, this.sunX, sunY, 3.6, 3);
    }

    // luna (sticker Méliès): sube desde el horizonte por el lado opuesto.
    // La tormenta la vela a medias y la voz (coro final) la hace respirar.
    const moonX = this.xMin + (this.xMax - this.xMin) * 0.22;
    const moonY = this.yMin + 160 + (1 - n) * 420 + Math.sin(time * 0.4) * 6;
    const moonS = 1 + f.stem.voice * 0.06;
    this.moon.setAttribute("opacity", (n * (1 - sk * 0.35)).toFixed(2));
    this.moon.setAttribute(
      "transform",
      `translate(${moonX.toFixed(1)} ${moonY.toFixed(1)}) rotate(${(Math.sin(time * 0.25) * 4).toFixed(1)}) scale(${moonS.toFixed(3)})`,
    );

    // estrellas: titilan (cada una a su ritmo)
    if (n > 0) {
      for (const s of this.stars) {
        s.el.setAttribute("opacity", (0.45 + 0.5 * Math.sin(time * s.speed + s.phase)).toFixed(2));
      }
    }

    // nubes: deriva propia + parallax con el progreso
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      const drift = (time * 12 * c.speed + f.progress * WORLD * PARALLAX.clouds + i * 480) % (VIEW_W + c.w);
      c.g.setAttribute("transform", `translate(${(VIEW_W - drift).toFixed(1)} ${c.y})`);
    }

    // mar: parallax horizontal + bob vertical escalado por energía; en la
    // tormenta el BAJO empuja la marejada
    const swell = 0.5 + e * 1.3 + sk * (0.55 + f.stem.bass * 1.2);
    for (const b of this.bands) {
      const x = -((f.progress * WORLD * b.factor) % b.tile);
      const y = b.baseY + Math.sin(time * b.bobSpeed + b.phase) * b.bobAmp * swell;
      b.g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    }

    // faro: emerge en el último tramo del viaje; su luz barre
    const fk = Math.max(0, Math.min(1, (f.progress - 0.78) / 0.08));
    this.faro.setAttribute("opacity", fk.toFixed(2));
    const bandMid = this.bands[1];
    const fy = HORIZON + 76 + (1 - fk) * 60 + Math.sin(time * bandMid.bobSpeed + bandMid.phase) * bandMid.bobAmp * (0.5 + e * 1.3);
    this.faro.setAttribute("transform", `translate(${this.faroX.toFixed(1)} ${fy.toFixed(1)})`);
    // de noche el haz gana protagonismo
    this.faroBeam.setAttribute(
      "opacity",
      fk > 0 ? ((0.25 + Math.sin(time * 1.4) * 0.15) * (1 + this.nightK * 1.1)).toFixed(2) : "0",
    );
    this.faroBeam.setAttribute("transform", `rotate(${(Math.sin(time * 0.5) * 18).toFixed(1)} 0 -164)`);

    // criaturas nocturnas: se asoman del agua, miran pasar el barco y se van
    this.creatures.update(f, time, n, this.xMin, this.xMax, this.lookX, this.lookY);

    // Moby Dick: el avistamiento, la cacería y el breach del coro final
    this.whale.update(f, time, n, this.xMin, this.xMax, this.lookX, this.lookY);

    return e;
  }

  /** desplaza los grupos iris+pupila hacia el barco (mirada) */
  private trackEyes(eyes: SVGGElement[], cx: number, cy: number, maxX: number, maxY: number) {
    const dx = this.lookX - cx;
    const dy = this.lookY - cy;
    const m = Math.hypot(dx, dy) || 1;
    const t = `translate(${((dx / m) * maxX).toFixed(2)} ${((dy / m) * maxY).toFixed(2)})`;
    for (const eye of eyes) eye.setAttribute("transform", t);
  }
}
