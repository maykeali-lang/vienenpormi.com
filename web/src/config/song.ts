// Configuracion del tema + paleta internetcore / Y2K para Vienen por mi.

export type InstrumentName =
  | "kick"
  | "snare"
  | "hihat"
  | "bass"
  | "guitar"
  | "vocals";

export interface SongConfig {
  id: string;
  title: string;
  band: string;
  /** Carpeta base bajo /public/assets/songs */
  basePath: string;
  /** Orden de fuentes de audio (el navegador elige la primera soportada) */
  audio: { mp3: string; ogg: string };
  envelopes: string;
}

// Altura a la que se eleva la banda/backline sobre el suelo (tarima). Ajustar
// a ojo: si flotan, baja; si siguen hundidos, sube.
export const STAGE_LIFT = 0.68;

// Ventana donde la escena cambia al «warp tunnel» y vuelve.
// («Ira» es instrumental completo, dura ~178.6 s; el viaje va a mitad del tema.)
export const INSTRUMENTAL_WARP = { start: 84, end: 118 } as const;

// Tema del modo experience (directo 3D): «Ira», instrumental.
export const IRA: SongConfig = {
  id: "ira",
  title: "IRA",
  band: "VIENEN POR MI",
  basePath: "assets/songs/ira",
  audio: {
    mp3: "assets/songs/ira/mixdown.mp3",
    ogg: "assets/songs/ira/mixdown.ogg",
  },
  envelopes: "assets/songs/ira/envelopes.json",
};

// Alias que consumen la experiencia en vivo (Landing/Hud/useConductor).
export const SONG = IRA;

// Paleta — «Tierra de Ooo» (Hora de Aventura): cielo turquesa, cesped, chicle,
// lavanda y crema, con contorno uva oscuro (look cartoon de dibujo plano).
export const PALETTE = {
  bg: "#141a3a", // noche (clear color)
  bgDeep: "#0e1430",
  fog: "#3c3a68", // bruma nocturna del horizonte
  magenta: "#ef6aa6", // chicle (guitarra)
  hotPink: "#ff9ccb",
  cyan: "#3fb6c9", // turquesa (bajo)
  lime: "#7ac74f", // cesped (bateria)
  violet: "#b69ce8", // lavanda (montañas)
  amber: "#ffcf5c", // sol
  bone: "#f4ead2", // crema (cuerpos de personajes)
  boneShadow: "#cbb98f",
  ink: "#262247", // contorno uva oscuro
} as const;

// Tonos extra del paisaje (no afectan a la reactividad por instrumento).
// Clave NOCTURNA: cielo profundo + luna, pero la banda queda bien iluminada
// por las luces de escenario (ver Stage > ReactiveLights).
export const SCENERY = {
  skyTop: "#0f1738", // noche profunda (cenit)
  skyMid: "#283063",
  skyHorizon: "#5a4a86", // resplandor violeta del horizonte
  grass: "#4f8b3f", // cesped a la luz de la luna
  grassDark: "#3c6b30",
  grassLight: "#67a64c",
  hill: "#4f8b3f",
  hillFar: "#5a7f6a",
  mountain: "#574234", // marron oscuro pastel (chocolate)
  mountainFar: "#6d564a",
  trunk: "#8a5a3b",
  leaf: "#5fb84a",
  leafDark: "#4c9c3a",
  cloud: "#cfd2e6", // nubes a la luz de la luna
  sun: "#f4f0d8", // luna pal­ida
} as const;

// Asignacion personaje -> instrumento + acento de color.
export interface BandMember {
  id: "drummer" | "bassist" | "guitarist";
  role: string;
  accent: string;
  position: [number, number, number];
  rotationY: number;
  headStyle: "egg" | "tall" | "cap";
  heightScale: number;
}

export const BAND: BandMember[] = [
  {
    id: "drummer",
    role: "Bateria",
    accent: PALETTE.lime,
    // un paso más atrás del kit (el kit queda delante, en z≈-1.05)
    position: [0, 0, -2.05],
    rotationY: 0,
    headStyle: "egg",
    heightScale: 0.96,
  },
  {
    id: "bassist",
    role: "Bajo / Voz",
    accent: PALETTE.cyan,
    position: [2.5, 0, 0.4],
    rotationY: 0,
    headStyle: "tall",
    heightScale: 1.06,
  },
  {
    id: "guitarist",
    role: "Guitarra",
    accent: PALETTE.magenta,
    position: [-2.5, 0, 0.4],
    rotationY: 0,
    headStyle: "cap",
    heightScale: 1.0,
  },
];

// Calidad por dispositivo. Se decide una vez en runtime.
export interface Quality {
  dpr: [number, number];
  segments: number; // detalle de geometrias
  bloom: boolean;
  grain: boolean;
  chroma: boolean;
  shadows: boolean;
}

export function detectQuality(): Quality {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;
  const isMobile = w < 820 || coarse;
  if (isMobile) {
    return {
      dpr: [1, 1.5],
      segments: 10,
      bloom: true,
      grain: false,
      chroma: false,
      shadows: false,
    };
  }
  return {
    dpr: [1, 2],
    segments: 24,
    bloom: true,
    grain: true,
    chroma: true,
    shadows: true,
  };
}
