// i18n mínimo de la web: ES/EN con switch. Por defecto ESPAÑOL para nuestra
// región (cualquier navegador es-*) e inglés para el resto; la elección del
// usuario se persiste en localStorage y manda sobre la detección.

import { create } from "zustand";

export type Lang = "es" | "en";

const KEY = "vpm-lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* sin storage */
  }
  const langs =
    typeof navigator !== "undefined"
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language || "en"]
      : ["en"];
  return langs.some((l) => (l || "").toLowerCase().startsWith("es")) ? "es" : "en";
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

function persist(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* modo incógnito */
  }
  document.documentElement.lang = lang;
}

export const useLang = create<LangState>((set) => ({
  lang: detect(),
  setLang: (lang) => {
    persist(lang);
    set({ lang });
  },
  toggle: () =>
    set((s) => {
      const lang: Lang = s.lang === "es" ? "en" : "es";
      persist(lang);
      return { lang };
    }),
}));

document.documentElement.lang = useLang.getState().lang;

/* ------------------------------ diccionario ------------------------------ */

const es = {
  // hero / home
  mode_player: "reproductor ↗",
  mode_exp: "← experiencia",
  about_hint: "acerca ↗",
  credit_by: "portada de",
  track_demo: "demo",
  track_listen: "escuchar ↗",
  track_sail: "zarpar ↗",
  track_soon: "muy pronto",
  track_preview: "preview ↗",
  track_live: "directo",
  track_watch: "ver ↗",
  track_game: "jugar ↗",
  track_enter: "entrar ↗",
  meta_game: "juego",
  gate_title: "toda esta página es música",
  gate_sub: "cada rincón suena · sube el volumen · mejor con audífonos",
  gate_cta: "click para explorar",
  aria_ira: "01 · ira — entrar al directo",
  aria_libreta: "Jugar 02 · libreta — el juego de nave",
  aria_orgullo: "Escuchar 03 · orgullo",
  aria_envidia: "04 · envidia — escuchar el preview en el reproductor",
  aria_outro: "05 · outro — collage de UAPs",
  aria_about: "Sobre la banda",

  // music player
  tag_soon: "muy pronto",
  tag_preview: "preview · muy pronto",
  tag_demo: "demo · 2026",
  aria_prev: "Tema anterior",
  aria_next: "Tema siguiente",
  aria_play: "Reproducir",
  aria_pause: "Pausa",
  aria_mute: "Silenciar",
  aria_unmute: "Activar sonido",
  aria_volume: "Volumen",
  aria_card_soon: "muy pronto",

  // about
  ab_topbar: "la banda",
  ab_tag: "Un viaje musical sobre la introspección y la aceptación humana.",
  ab_sec_band: "Información",
  ab_band_p:
    "Vienen Por Mí es un proyecto internet core que existe solo por diversión.",
  ab_role_vocals: "voz y bajo",
  ab_role_guitar: "guitarra",
  ab_role_drums: "batería",
  ab_portfolio: "portafolio ↗",
  ab_sec_tracks: "Los temas · música × three.js",
  ab_tracks_p:
    "Un demo musical hecho en casa: canciones originales grabadas en el cuarto, llevadas a experiencias de movimiento y web con three.js. Cada tema es su propio mundo:",
  ab_t1: "un collage de UAPs a pantalla completa; el tema suena mientras los avistamientos desfilan como en un radar.",
  ab_t2_pre: "un shooter de nave a lápiz sobre una libreta electrónica — arte de",
  ab_t2_post: ". Suena la canción libreta y la partida dura lo que el tema.",
  ab_devlog: "making of · ver el devlog ↗",
  ab_devlog_close: "cerrar el devlog ✕",
  ab_t3: "un barquito de papel que crece con cada coro, vigilado por un sol y una luna esotéricos; scroll para navegar la canción.",
  ab_t4: "un adelanto: suena en loop dentro del reproductor.",
  ab_t5: "el directo instrumental low poly — la banda toca en 3D y la animación sigue los stems. Ya disponible: entra desde el setlist.",
  ab_sec_connect: "Conecta",
  ab_rider: "basic rider (pdf) ↗",
  ab_sec_letterbox: "Buzón",
  ab_letterbox_p: "Déjanos una nota — queda fijada aquí para todos.",
  lbx_placeholder: "deja una nota…",
  lbx_nick: "nick (opcional)",
  lbx_send: "al buzón",
  lbx_sending: "enviando…",
  lbx_sent: "en el buzón ✓",
  lbx_error: "no se pudo enviar — intenta en un momento",
  lbx_hint: "con tu nick o de forma anónima",
  lbx_anon: "anónimo",
  lbx_aria_notes: "Notas de los visitantes",
  lbx_aria_text: "Tu nota",
  lbx_aria_nick: "Nick, opcional — déjalo vacío para quedar anónimo",
  ab_stamp_aria: "Fanart de Loretta — ver el post en Instagram",
  ab_art_alt: "Vienen Por Mí en vivo — fanart de Loretta",

  // experiencia (directo «ira»)
  ld_track: "TEMA",
  ld_plays: "reproducciones",
  ld_loading: "cargando…",
  ld_play: "▶ reproducir",
  ld_demo: "Demo · «Ira» instrumental, en directo",
  ld_foot: "sube el volumen · auriculares recomendados",
  ld_graffiti: "grafiti en pantalla ·",
  ld_graffiti_by: "angel d leiva",
  hud_back: "volver",
  hud_explore: "🎥 explorar",
  hud_freecam: "🎥 cámara libre",
  hud_thanks: "GRACIAS",
  hud_that_was: "Eso fue",
  hud_again: "OTRA VEZ ↺",
  hud_home: "⌂ INICIO",
  fx_hint: "toca la escena",
  sl_title: "Set List",
  sl_soon: "muy pronto",
  sl_play: "tocar ↗",

  // orgullo
  org_sub: "un barquito de papel · el orgullo como lastre",
  org_sail: "⛵ zarpar",
  org_loading: "cargando…",
  org_hint: "sube el volumen · rueda del mouse para viajar en el tiempo",
  org_end: "maldito orgullo",
  org_again: "↺ otra vez",
  org_back: "← volver",
  org_audio_err: "El navegador bloqueó el audio; intenta de nuevo.",

  // envidia teaser
  et_soon: "muy pronto",
  et_meta: "una canción = una partida · 5:45 · e-paper marker comic",
};

const en: typeof es = {
  mode_player: "music player ↗",
  mode_exp: "← experience",
  about_hint: "about the band ↗",
  credit_by: "cover art by",
  track_demo: "demo",
  track_listen: "listen ↗",
  track_sail: "set sail ↗",
  track_soon: "coming soon",
  track_preview: "preview ↗",
  track_live: "live",
  track_watch: "watch ↗",
  track_game: "play ↗",
  track_enter: "enter ↗",
  meta_game: "game",
  gate_title: "this whole page is music",
  gate_sub: "every corner plays sound · turn it up · headphones recommended",
  gate_cta: "click to explore",
  aria_ira: "01 · ira — enter the live show",
  aria_libreta: "Play 02 · libreta — the ship game",
  aria_orgullo: "Listen to 03 · orgullo",
  aria_envidia: "04 · envidia — hear the preview in the music player",
  aria_outro: "05 · outro — a UAP collage",
  aria_about: "About the band",

  tag_soon: "coming soon",
  tag_preview: "preview · coming soon",
  tag_demo: "demo · 2026",
  aria_prev: "Previous track",
  aria_next: "Next track",
  aria_play: "Play",
  aria_pause: "Pause",
  aria_mute: "Mute",
  aria_unmute: "Unmute",
  aria_volume: "Volume",
  aria_card_soon: "coming soon",

  ab_topbar: "about the band",
  ab_tag: "A musical journey about introspection and human acceptance.",
  ab_sec_band: "Info",
  ab_band_p:
    "Vienen Por Mí is an internet-core project that exists just for fun.",
  ab_role_vocals: "vocals & bass",
  ab_role_guitar: "guitar",
  ab_role_drums: "drums",
  ab_portfolio: "portfolio ↗",
  ab_sec_tracks: "The tracks · music × three.js",
  ab_tracks_p:
    "A home-made music demo: original songs recorded in the bedroom, carried into motion and web experiences with three.js. Each track is its own world:",
  ab_t1: "a full-screen UAP collage; the track plays while the sightings sweep by like a radar.",
  ab_t2_pre: "a pencil-sketch ship shooter on an electronic notebook — art by",
  ab_t2_post: ". The libreta song plays and the run lasts exactly one song.",
  ab_devlog: "making of · read the devlog ↗",
  ab_devlog_close: "close the devlog ✕",
  ab_t3: "a paper boat that grows with each chorus, watched by an esoteric sun and moon; scroll to sail through the song.",
  ab_t4: "a taster: it loops inside the music player.",
  ab_t5: "the low-poly instrumental live show — the band plays in 3D and the animation follows the stems. Available now: enter from the setlist.",
  ab_sec_connect: "Connect",
  ab_rider: "basic rider (pdf) ↗",
  ab_sec_letterbox: "Letterbox",
  ab_letterbox_p: "Leave us a note — it stays pinned here for everyone.",
  lbx_placeholder: "drop a note…",
  lbx_nick: "nick (optional)",
  lbx_send: "drop it in",
  lbx_sending: "sending…",
  lbx_sent: "in the box ✓",
  lbx_error: "couldn't send — try again in a moment",
  lbx_hint: "with your nick or anonymously",
  lbx_anon: "anonymous",
  lbx_aria_notes: "Notes left by visitors",
  lbx_aria_text: "Your note",
  lbx_aria_nick: "Nick, optional — leave empty to stay anonymous",
  ab_stamp_aria: "Fanart by Loretta — see the post on Instagram",
  ab_art_alt: "Vienen Por Mí live — fanart by Loretta",

  ld_track: "TRACK",
  ld_plays: "plays",
  ld_loading: "loading…",
  ld_play: "▶ play",
  ld_demo: "Demo · «Ira» instrumental, live",
  ld_foot: "turn it up · headphones recommended",
  ld_graffiti: "on-screen graffiti ·",
  ld_graffiti_by: "angel d leiva",
  hud_back: "back",
  hud_explore: "🎥 explore",
  hud_freecam: "🎥 free cam",
  hud_thanks: "THANK YOU",
  hud_that_was: "That was",
  hud_again: "PLAY AGAIN ↺",
  hud_home: "⌂ HOME",
  fx_hint: "tap the scene",
  sl_title: "Set List",
  sl_soon: "coming soon",
  sl_play: "play ↗",

  org_sub: "a little paper boat · pride as ballast",
  org_sail: "⛵ set sail",
  org_loading: "loading…",
  org_hint: "turn it up · mouse wheel to travel through time",
  org_end: "maldito orgullo",
  org_again: "↺ play again",
  org_back: "← back",
  org_audio_err: "The browser blocked audio; try again.",

  et_soon: "coming soon",
  et_meta: "one song = one run · 5:45 · e-paper marker comic",
};

export const STR: Record<Lang, typeof es> = { es, en };

/** hook de conveniencia: diccionario del idioma activo */
export function useT() {
  const lang = useLang((s) => s.lang);
  return STR[lang];
}
