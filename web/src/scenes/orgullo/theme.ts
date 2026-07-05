// Tema de la escena «Orgullo» — papercraft: kraft/crema + navy + dorado.

/** Eje de navegación. 'horizontal' = izq→der; 'vertical' quedaría para hundimiento. */
export const ORIENTATION: "horizontal" | "vertical" = "horizontal";

export const PAPER = {
  skyTop: "#f6e7c8", // crema kraft claro (cielo alto)
  skyBottom: "#eed9ae", // kraft calido al horizonte
  sun: "#e8b64c", // dorado = orgullo
  sunGlow: "#f3d489",
  cloud: "#faf1dd",
  cloudShade: "#e3d0a8",
  seaFar: "#7d92b8", // navy desaturado lejano
  seaMid: "#46608f",
  seaNear: "#2c4370",
  seaFront: "#1d3055", // navy profundo (primer plano)
  foam: "#f4ead2",
  hull: "#f7eed9", // papel del barco
  hullShade: "#d9c69b",
  hullLine: "#3a3a55", // pliegues (tinta)
  sail: "#fdf6e4",
  gold: "#d9a431", // acento orgullo
  goldDeep: "#b3801c",
  ink: "#2e2c48", // texto/tinta
  inkSoft: "rgba(46, 44, 72, 0.65)",
  faroBody: "#f1e3c2",
  faroStripe: "#c25b4e",
} as const;

/**
 * Niveles de pomposidad del barco. Nivel 0 = humilde; cada entrada a un
 * estribillo sube un nivel (escala + ornamento). La escala cuenta el pecado.
 */
export interface PrideLevel {
  scale: number;
  mast: number; // altura extra del mástil (0..1)
  flags: number; // nº de banderines
  gold: number; // 0..1 cuánto dorado en casco/vela
}

export const PRIDE_LEVELS: PrideLevel[] = [
  { scale: 1.0, mast: 0, flags: 0, gold: 0 },
  { scale: 1.18, mast: 0.35, flags: 2, gold: 0.35 },
  { scale: 1.42, mast: 0.7, flags: 4, gold: 0.7 },
  { scale: 1.72, mast: 1, flags: 6, gold: 1 },
];

/**
 * El remaster 2026 va +1.2 s respecto a los timestamps autorados de la banda
 * (letra/secciones). CONFIRMADO a oído por el usuario («ya no aguanto la
 * presión» se canta en 0:17, «de tus ojos…» en 0:21 = autorado+1) y por los
 * onsets del stem de voz (17.0 / 21.2 / 112.1 / 190.4 ≈ autorado+1.2).
 * OJO: el primer onset del stem (15.86) es un pickup/respiración, NO el
 * arranque de la frase — no calibrar contra él. La letra además se re-ancla
 * por línea al onset real (alignLyricsToVoice), así que este offset solo
 * necesita dejar cada semilla a <1 s de lo cantado.
 */
export const REMASTER_OFFSET = 1.2;

/**
 * Anochecer: a la entrada del solo se pone el sol y sale la luna.
 * `start` en s (tiempo del remaster); `fade` = duración del crepúsculo (s).
 * Determinista (aguanta seek).
 */
export const NIGHT = { start: 119 + REMASTER_OFFSET, fade: 9 } as const;

/**
 * Tormenta nocturna (la cacería de la ballena): crece tras el anochecer,
 * pega fuerte durante el solo y el coro final, y amaina hacia el cierre.
 * Todo determinista desde f.t. Los relámpagos los disparan los golpes
 * de la BATERÍA; el oleaje extra lo empuja el BAJO; la lluvia se inclina
 * y el viento silba con la GUITARRA.
 */
export const STORM = {
  start: 127, // empiezan a entrar nubes de tormenta
  full: 152, // tormenta plena
  calm: 224, // empieza a amainar (la ballena se pierde en lo hondo)
  end: 235, // resto de tormenta al cierre
  rest: 0.3, // intensidad residual al final
} as const;

/** Paleta/tinta de la tormenta y de Moby Dick (papel blanco, tinta furiosa). */
export const STORM_PAPER = {
  cloud: "#1b2138", // nubes de tormenta (tinta noche profunda)
  cloudEdge: "#0c1128",
  rain: "#aebadf",
  bolt: "#fff3c4", // relámpago de papel
  boltCore: "#ffffff",
  flash: "#dfe6ff", // destello del cielo
  whale: "#f4efe0", // el papel blanco de la ballena
  whaleShade: "#d8d2bd",
  whaleInk: "#1c2337", // pliegues/tinta
  whaleEye: "#f6ecc9",
  whalePupil: "#0c1128",
  spout: "#dfe8f2",
} as const;

/** Paleta nocturna (mismos recortes de papel, tinta más profunda). */
export const NIGHT_PAPER = {
  skyTop: "#161c3e",
  skyBottom: "#454a7a",
  seaFar: "#535f85",
  seaMid: "#303f66",
  seaNear: "#1d2b4c",
  seaFront: "#111c38",
  moon: "#f2ead0",
  moonShade: "#cfc3a0",
  star: "#f6ecc9",
} as const;

/** Parallax: factor de desplazamiento por capa (x mundo por unidad de progress). */
export const PARALLAX = {
  clouds: 0.25,
  seaFar: 0.45,
  seaMid: 0.85,
  seaNear: 1.4,
  seaFront: 2.1,
} as const;
