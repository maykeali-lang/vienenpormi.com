import { useEffect } from "react";
import { useT, useLang } from "../../i18n";
import "./teaser.css";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const ART = `${BASE}/assets/envidia`;

// preview del audio de «envidia»: suena de fondo en loop, suave
const PREVIEW_SRC = `${BASE}/assets/songs/envidia/preview.mp3`;
const PREVIEW_VOL = 1; // full vol

/**
 * /envidia — modo COMING SOON: preview del trabajo de la experiencia
 * («Lion Mix», shooter e-paper marker comic). Muestra el playfield con los
 * villanos y la nave en sus idles de diseño, sin gameplay, con el preview
 * del audio sonando de fondo. El juego real (EnvidiaScene) queda montado
 * para el estreno.
 */
export default function EnvidiaTeaser() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);
  // audio del preview en loop; si el navegador bloquea el autoplay, arranca
  // con la primera interacción (mismo patrón que el intro del home)
  useEffect(() => {
    const a = new Audio(PREVIEW_SRC);
    a.loop = true;
    a.volume = PREVIEW_VOL;
    a.preload = "auto";
    const onFirst = () => {
      a.play().catch(() => {});
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
    a.play().catch(() => {
      window.addEventListener("pointerdown", onFirst);
      window.addEventListener("keydown", onFirst);
    });
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
      a.pause();
      a.src = "";
    };
  }, []);

  return (
    <div className="et">
      <a className="et__back mono" href={`${BASE}/` || "/"}>
        ← vienen por mi
      </a>
      <button
        className="et__lang mono"
        onClick={toggleLang}
        aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
      >
        {lang === "es" ? "es → en" : "en → es"}
      </button>

      <header className="et__head">
        <p className="et__num mono">04 · envidia</p>
        <h1 className="et__title disp">lion mix</h1>
        <span className="et__soon mono">{t.et_soon}</span>
      </header>

      {/* preview del playfield: la nave despejada al centro; arriba, LOLL y
          el boss CAPO alineados uno a cada lateral */}
      <figure className="et__field" aria-label="Game preview: the player ship below; LOLL and the boss CAPO above">
        <div className="et__villains">
          <img className="et__v et__v--loll" src={`${ART}/loll.svg`} alt="LOLL" />
          <img className="et__v et__v--capo" src={`${ART}/capo.svg`} alt="CAPO — The Murmur" />
        </div>
        <img className="et__nave" src={`${ART}/nave.svg`} alt="Player ship, pencil sketch" />
      </figure>

      <section className="et__copy">
        {lang === "es" ? (
          <p>
            Un shooter espacial dibujado a lápiz. Los villanos robaron los stems de la
            banda — batería, bajo, guitarra, voz — y la partida dura exactamente una
            canción. Cada villano derribado devuelve un instrumento; <b>CAPO — The
            Murmur</b> retiene la voz hasta el final. Recupera la música.
          </p>
        ) : (
          <p>
            A pencil-sketch space shooter. The villains stole the band's stems — drums,
            bass, guitar, voice — and the run lasts exactly one song. Every villain you
            bring down gives an instrument back; <b>CAPO — The Murmur</b> holds the voice
            until the very end. Win the music back.
          </p>
        )}
        <p className="et__meta mono">{t.et_meta}</p>
      </section>
    </div>
  );
}
