// Letra sincronizada del tema del modo experience (subtitulos tipo karaoke).
// t = segundos desde el inicio del tema. text:"" limpia/oculta.
// en = traduccion al ingles (subtitulo secundario, mas pequeno).
//
// «Ira» es INSTRUMENTAL: sin letra, los subtitulos quedan apagados.

export interface LyricLine {
  t: number;
  text: string;
  en?: string;
}

export const LYRICS: LyricLine[] = [];

// Letra de «Libreta» (archivada; el directo ya no la usa).
export const LIBRETA_LYRICS: LyricLine[] = [
  { t: 0, text: "" },

  // Verso 1
  { t: 39.9, text: "Siempre empiezo en el final", en: "I always start at the end" },
  {
    t: 46.0,
    text: "Lastimé a quien solo me quiso cuidar",
    en: "I hurt the one who only wanted to care for me",
  },
  { t: 52.0, text: "Para recordar", en: "So I'll remember" },
  { t: 55.0, text: "leo todo", en: "I read it all" },
  {
    t: 58.0,
    text: "lo que me escribiste en mi libreta",
    en: "everything you wrote me in my notebook",
  },

  // Coro 1
  { t: 64.0, text: "Escribe bien", en: "Write it down well" },
  { t: 66.0, text: "lo que te lastima", en: "whatever hurts you" },
  { t: 70.0, text: "Si olvido quién soy", en: "If I forget who I am" },
  { t: 73.0, text: "tus letras me ayudarán", en: "your words will help me" },
  { t: 76.0, text: "Para recordar", en: "So I'll remember" },
  { t: 79.0, text: "leo todo", en: "I read it all" },
  {
    t: 82.0,
    text: "lo que me escribiste en mi…",
    en: "everything you wrote me in my…",
  },
  { t: 86.0, text: "" },

  // Verso 2
  { t: 100.0, text: "Siempre me dejo llevar", en: "I always get carried away" },
  { t: 105.6, text: "ante esta hoja blanca", en: "before this blank page" },
  { t: 108.6, text: "que hoy no tiene final", en: "that today has no end" },
  { t: 112.0, text: "Para recordar", en: "So I'll remember" },
  { t: 115.0, text: "leo todo", en: "I read it all" },
  {
    t: 118.0,
    text: "lo que me escribiste en mi libreta",
    en: "everything you wrote me in my notebook",
  },
  { t: 123.0, text: "" },

  // Coro 2 (re-entra a 2:04, misma estructura)
  { t: 124.0, text: "Escribe bien", en: "Write it down well" },
  { t: 126.0, text: "lo que te lastima", en: "whatever hurts you" },
  { t: 129.9, text: "Si olvido quién soy", en: "If I forget who I am" },
  { t: 132.9, text: "tus letras me ayudarán", en: "your words will help me" },
  { t: 136.0, text: "Para recordar", en: "So I'll remember" },
  { t: 139.0, text: "leo todo", en: "I read it all" },
  {
    t: 141.9,
    text: "lo que me escribiste en mi libreta",
    en: "everything you wrote me in my notebook",
  },
  {
    t: 148.0,
    text: "lo que me escribiste en mi libreta",
    en: "everything you wrote me in my notebook",
  },
  { t: 153.5, text: "" },

  // Puente
  { t: 238.0, text: "Escribe bien", en: "Write it down well" },
  { t: 240.0, text: "lo que te lastima", en: "whatever hurts you" },
  { t: 244.0, text: "Escribe bien", en: "Write it down well" },
  { t: 250.0, text: "" },
  {
    t: 257.0,
    text: "Escribe bien lo que te lastima",
    en: "Write down well whatever hurts you",
  },
  { t: 261.0, text: "" },

  // Cierre
  {
    t: 262.0,
    text: "Si olvido quién soy tus letras me ayudarán",
    en: "If I forget who I am, your words will help me",
  },
  {
    t: 268.0,
    text: "Para recordar leo todo",
    en: "So I'll remember, I read it all",
  },
  {
    t: 274.4,
    text: "lo que me escribiste en mi libreta",
    en: "everything you wrote me in my notebook",
  },
  { t: 280.0, text: "" },
];
