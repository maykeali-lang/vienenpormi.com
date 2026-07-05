// Props del mundo «envidia» dibujados a canvas en estilo marker Lion Mix:
// contorno negro grueso, rellenos planos, sombra = mismo hue una pasada más
// oscura, highlight = papel sin pintar. Nada de gradientes ni glow.
// Aquí viven: asteriscos (estrellas), asteroides-obstáculo y los 4
// instrumentos robados (batería, bajo, guitarra, mic).

import * as THREE from "three";
import type { StemName } from "./audio";

const INK = "#1A1A1A";
const PAPER = "#F2EFE4";

function makeCanvas(px: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  return [c, c.getContext("2d")!];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** asterisco a tinta (estrella de cómic): 3 trazos cruzados, cap redondo */
export function makeAsteriskTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64);
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineWidth = 7;
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3 + 0.2;
    ctx.beginPath();
    ctx.moveTo(32 - Math.cos(a) * 22, 32 - Math.sin(a) * 22);
    ctx.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22);
    ctx.stroke();
  }
  return toTexture(c);
}

/** llama de propulsión de la nave: gota marker (gold fuera, orange dentro,
 *  núcleo de papel), contorno a tinta. La animación (parpadeo de escala y
 *  alpha) vive en game.ts — minimalista, sin partículas ni glow. */
export function makeFlameTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.lineJoin = "round";
  const drop = (w: number, h: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(48, y + h); // punta hacia abajo (escape de la nave)
    ctx.quadraticCurveTo(48 - w, y + h * 0.42, 48, y);
    ctx.quadraticCurveTo(48 + w, y + h * 0.42, 48, y + h);
    ctx.closePath();
  };
  drop(34, 104, 8);
  ctx.fillStyle = "#E9B322";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drop(20, 64, 14);
  ctx.fillStyle = "#E8721C";
  ctx.fill();
  drop(9, 30, 18);
  ctx.fillStyle = PAPER;
  ctx.fill();
  return toTexture(c);
}

/** asteroide-obstáculo: roca irregular marrón con sombra y contorno */
export function makeAsteroidTexture(seed = 1): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(140);
  const cx = 70,
    cy = 70;
  const pts: [number, number][] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s % 1000) / 1000;
  };
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 44 * (0.72 + rnd() * 0.34);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const poly = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
  };
  poly();
  ctx.fillStyle = "#A8703F";
  ctx.fill();
  ctx.save();
  poly();
  ctx.clip();
  ctx.fillStyle = "#7A4F2B"; // sombra: mismo hue más oscuro, abajo-derecha
  ctx.beginPath();
  ctx.ellipse(cx + 18, cy + 20, 52, 40, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // cráteres a tinta
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx - 18 + rnd() * 36, cy - 18 + rnd() * 36, 3.5 + rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  poly();
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();
  return toTexture(c);
}

/* ------------------- instrumentos robados (ítems) -------------------- */

function outlined(ctx: CanvasRenderingContext2D, draw: () => void, fill: string, lw = 7) {
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  draw();
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawDrum(ctx: CanvasRenderingContext2D) {
  // casco rojo con sombra, parche de papel, dos baquetas cruzadas
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.rect(35, 72, 90, 52);
    },
    "#C1272D",
  );
  ctx.fillStyle = "#8A1B1E";
  ctx.fillRect(35, 104, 90, 20);
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.ellipse(80, 72, 45, 16, 0, 0, Math.PI * 2);
    },
    PAPER,
  );
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (const [x1, y1, x2, y2] of [
    [48, 52, 108, 88],
    [112, 52, 52, 88],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "#A8703F";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x1, y1, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#E9B322";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawBass(ctx: CanvasRenderingContext2D) {
  // cuerpo cobalto + mástil marrón largo (el bajo de colinabit)
  ctx.save();
  ctx.translate(80, 80);
  ctx.rotate(-0.7);
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.rect(-7, -78, 14, 92);
    },
    "#A8703F",
  );
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.ellipse(0, 40, 34, 28, 0, 0, Math.PI * 2);
    },
    "#1E3F9E",
  );
  ctx.fillStyle = "#142B6E";
  ctx.beginPath();
  ctx.ellipse(8, 50, 22, 14, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 2;
  for (const dx of [-3, 3]) {
    ctx.beginPath();
    ctx.moveTo(dx, -74);
    ctx.lineTo(dx, 52);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGuitar(ctx: CanvasRenderingContext2D) {
  // guitarra naranja con cintura (la de xjake)
  ctx.save();
  ctx.translate(80, 80);
  ctx.rotate(0.7);
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.rect(-6, -76, 12, 80);
    },
    "#A8703F",
  );
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.arc(0, 18, 22, Math.PI * 0.95, Math.PI * 2.05);
      ctx.arc(0, 46, 28, Math.PI * 1.85, Math.PI * 1.15);
      ctx.closePath();
    },
    "#E8721C",
  );
  ctx.fillStyle = "#A84F12";
  ctx.beginPath();
  ctx.ellipse(10, 52, 16, 10, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 34, 9, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 2;
  for (const dx of [-2.5, 2.5]) {
    ctx.beginPath();
    ctx.moveTo(dx, -72);
    ctx.lineTo(dx, 30);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMic(ctx: CanvasRenderingContext2D) {
  // mic de colinabit: cabeza de papel con rejilla a tinta, mango violeta
  ctx.save();
  ctx.translate(80, 80);
  ctx.rotate(0.5);
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(-13, -8);
      ctx.lineTo(-7, 66);
      ctx.lineTo(7, 66);
      ctx.lineTo(13, -8);
      ctx.closePath();
    },
    "#4A2C82",
  );
  ctx.fillStyle = "#331D5C";
  ctx.beginPath();
  ctx.moveTo(2, -8);
  ctx.lineTo(5, 66);
  ctx.lineTo(7, 66);
  ctx.lineTo(13, -8);
  ctx.closePath();
  ctx.fill();
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.arc(0, -32, 30, 0, Math.PI * 2);
    },
    PAPER,
  );
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, -32, 28, 0, Math.PI * 2);
  ctx.clip();
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 9, -62);
    ctx.lineTo(i * 9, -2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-30, -32 + i * 9);
    ctx.lineTo(30, -32 + i * 9);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

export function makeInstrumentTexture(kind: StemName): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(160);
  ctx.lineCap = "round";
  if (kind === "drum") drawDrum(ctx);
  else if (kind === "bass") drawBass(ctx);
  else if (kind === "guitar") drawGuitar(ctx);
  else drawMic(ctx);
  return toTexture(c);
}
