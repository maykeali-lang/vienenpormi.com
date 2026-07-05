// Genera el BASIC RIDER de Vienen Por Mí como PDF crudo (A4, 2 páginas),
// sin dependencias: objetos PDF + xref calculado al vuelo.
// Pág. 1: rider técnico del EPK provisional + contactos.
// Pág. 2: ilustración del escenario (tarima principal, extraída del EPK).
// Uso: node scripts/make-rider-pdf.mjs [salida.pdf] [escenario.jpg]
import { readFileSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] || "public/rider/vienen-por-mi-basic-rider.pdf";
const IMG = process.argv[3] || "public/rider/escenario.jpg";
const IMG_W = 1366, IMG_H = 768; // dimensiones del jpeg (baseline)

const W = 595.28, H = 841.89; // A4 pt
const INK = "0.075 0.071 0.063"; // #131210
const AGUA = "0.035 0.373 0.659"; // #095fa8
const GREY = "0.45 0.44 0.42";
const MX = 64; // margen

// --- helpers de contenido (escriben en el stream de la página activa) ---
let c = [];
let y = 0;
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const T = (font, size, x, yy, text, color = INK) => {
  c.push(`BT ${color} rg /${font} ${size} Tf ${x} ${yy} Td (${esc(text)}) Tj ET`);
};
// texto con tracking (letter-spacing) estilo mono del sitio.
// OJO: Tc persiste entre bloques BT/ET — el cuerpo hereda el del último TS.
const TS = (font, size, x, yy, text, spacing, color = INK) => {
  c.push(`BT ${color} rg /${font} ${size} Tf ${spacing} Tc ${x} ${yy} Td (${esc(text)}) Tj ET`);
};
const RECT = (x, yy, w, h, color = INK) => c.push(`${color} rg ${x} ${yy} ${w} ${h} re f`);
const LINE = (x1, y1, x2, y2, w = 1, color = INK) =>
  c.push(`${color} RG ${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
const header = () => {
  y = H - 72;
  TS("Mono", 8.5, MX, y, "VIENEN POR MI  \xB7  BASIC RIDER", 1.4, GREY);
  TS("Mono", 8.5, W - MX - 148, y, "MARACAIBO \xB7 ZULIA \xB7 VE", 1.4, GREY);
  LINE(MX, y - 12, W - MX, y - 12, 1.2);
};
const footer = (page) => {
  LINE(MX, 88, W - MX, 88, 1.2);
  TS("Mono", 8.5, MX, 72, "WWW.VIENENPORMI.COM", 1.2, GREY);
  TS("Mono", 8.5, W - MX - 116, 72, `VIENEN POR MI \xA9 2026 \xB7 ${page}/2`, 1.2, GREY);
};
const section = (num, title) => {
  TS("Mono", 9, MX, y, num, 1.4, AGUA);
  TS("Mono", 10.5, MX + 28, y, title, 2);
  LINE(MX, y - 9, W - MX, y - 9, 0.8, "0.85 0.83 0.79");
  y -= 32;
};
const item = (txt, indent = 0) => {
  T("Reg", 12, MX + 14 + indent, y, "\x95  " + txt);
  y -= 20;
};

/* ============================ PÁGINA 1 ============================ */
c = [];
header();
y -= 68;

// lockup: "vienen" en tinta y "por mi" en blanco sobre barra negra
T("Bold", 42, MX, y, "vienen");
y -= 48;
RECT(MX - 4, y - 11, 152, 51, INK);
T("Bold", 42, MX + 4, y, "por mi", "0.949 0.918 0.847"); // papel #f2ead8
y -= 36;
T("Reg", 11.5, MX, y, "Power tr\xEDo \xB7 voz y bajo, guitarra, bater\xEDa y secuencias \xB7 Maracaibo, Venezuela.", GREY);
y -= 46;

section("01", "REQUISITOS B\xC1SICOS");
item("Caja directa (DI) para secuencias");
item("Micr\xF3fono para 1era voz");
item("Micr\xF3fono para 2da voz");
item("Bater\xEDa de 5 piezas");
item("Amplificadores:");
item("1 para bajo", 18);
item("1 para guitarra", 18);
y -= 18;

section("02", "MONITOREO Y MEZCLA");
item("Retorno / monitoreo para los 3 m\xFAsicos (seg\xFAn la sala)");
item("Prueba de sonido previa al show, acordada con producci\xF3n");
y -= 18;

section("03", "NOTA IMPORTANTE");
T("Reg", 12, MX + 14, y, "Es de vital importancia adaptar cualquier especificaci\xF3n t\xE9cnica");
y -= 17;
T("Reg", 12, MX + 14, y, "a la banda con previo acuerdo. Escr\xEDbenos y lo resolvemos.");
y -= 36;

section("04", "CONTACTO");
T("Bold", 12, MX + 14, y, "vienenpormi.ve@gmail.com");
y -= 19;
T("Reg", 12, MX + 14, y, "Instagram: @vienenpormi_");
y -= 19;
T("Reg", 12, MX + 14, y, "Web: www.vienenpormi.com");

footer(1);
const content1 = c.join("\n");

/* ==================== PÁGINA 2: escenario ==================== */
c = [];
header();
y -= 60;

section("05", "ESCENARIO \x97 REFERENCIA");
y -= 4;
// ilustración del EPK a todo el ancho de caja, con marco de tinta
const iw = W - 2 * MX; // 467pt
const ih = (iw * IMG_H) / IMG_W; // ~262.6pt
const iy = y - ih;
c.push(`q ${iw} 0 0 ${ih} ${MX} ${iy} cm /Img Do Q`);
c.push(`${INK} RG 1.5 w ${MX} ${iy} ${iw} ${ih} re S`);
y = iy - 22;
TS("Mono", 8.5, MX, y, "TARIMA PRINCIPAL \xB7 DISTRIBUCI\xD3N DE LA BANDA (DEL EPK)", 1.2, GREY);
y -= 34;
T("Reg", 12, MX, y, "Bater\xEDa al centro-fondo; guitarra con laptop y secuencias a un lateral; voz y bajo");
y -= 17;
T("Reg", 12, MX, y, "al otro. El plano es referencial: la distribuci\xF3n se adapta al espacio de cada sala.");

footer(2);
const content2 = c.join("\n");

/* ==================== ensamblado binario con xref ==================== */
const jpeg = readFileSync(IMG);
const objs = [];
objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
objs[2] = `<< /Type /Pages /Kids [3 0 R 8 0 R] /Count 2 >>`;
const FONTS = `/Font << /Reg 5 0 R /Bold 6 0 R /Mono 7 0 R >>`;
objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << ${FONTS} >> /Contents 4 0 R >>`;
objs[4] = `<< /Length ${Buffer.byteLength(content1, "latin1")} >>\nstream\n${content1}\nendstream`;
objs[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
objs[6] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
objs[7] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`;
objs[8] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << ${FONTS} /XObject << /Img 10 0 R >> >> /Contents 9 0 R >>`;
objs[9] = `<< /Length ${Buffer.byteLength(content2, "latin1")} >>\nstream\n${content2}\nendstream`;
objs[10] = Buffer.concat([
  Buffer.from(
    `<< /Type /XObject /Subtype /Image /Width ${IMG_W} /Height ${IMG_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    "latin1",
  ),
  jpeg,
  Buffer.from(`\nendstream`, "latin1"),
]);

const parts = [];
let len = 0;
const push = (x) => {
  const b = Buffer.isBuffer(x) ? x : Buffer.from(x, "latin1");
  parts.push(b);
  len += b.length;
};
push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
const offsets = [0];
for (let i = 1; i < objs.length; i++) {
  offsets[i] = len;
  push(`${i} 0 obj\n`);
  push(objs[i]);
  push(`\nendobj\n`);
}
const xrefAt = len;
push(`xref\n0 ${objs.length}\n0000000000 65535 f \n`);
for (let i = 1; i < objs.length; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
push(`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

writeFileSync(OUT, Buffer.concat(parts));
console.log("ok:", OUT);
