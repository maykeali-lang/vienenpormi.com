import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useApp } from "../state/store";
import { fetchNotes, postNote, type Note, NICK_MAX, TEXT_MAX } from "../state/comments";
import { useT, useLang } from "../i18n";

gsap.registerPlugin(ScrollTrigger);

const IG_URL = "https://instagram.com/vienenpormi_";

// integrantes con su instagram (botón sutil junto al nick). El rol se
// traduce por clave i18n.
const MEMBERS: { roleKey: "ab_role_vocals" | "ab_role_guitar" | "ab_role_drums"; nick: string; ig: string; web?: string }[] = [
  { roleKey: "ab_role_vocals", nick: "colinabit", ig: "https://www.instagram.com/colinabit?igsh=NDF3cjF5djhuczFw" },
  {
    roleKey: "ab_role_guitar",
    nick: "xjake",
    ig: "https://www.instagram.com/_xjake?igsh=MXBlaHQ1bGx0N3JxeQ==",
  },
  { roleKey: "ab_role_drums", nick: "mdk", ig: "https://www.instagram.com/mdk_314?igsh=MTRvaWJubzRjZXVsOA==" },
];

/** Icono minimalista de Instagram (contorno). */
function IgIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Símbolo oficial: tres barras (señal interferida / línea redactada). */
function Mark({ className = "" }: { className?: string }) {
  return (
    <span className={`about__mark ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Letterbox: deja una nota (nick o anónima); quedan guardadas y visibles. */
function Letterbox() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [nick, setNick] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    void fetchNotes().then((n) => n && setNotes(n));
  }, []);

  const send = async () => {
    const t = text.trim();
    if (!t || state === "sending") return;
    setState("sending");
    const n = await postNote(nick.trim(), t);
    if (n) {
      setNotes(n);
      setText("");
      setState("sent");
      window.setTimeout(() => setState("idle"), 2500);
    } else {
      setState("error");
      window.setTimeout(() => setState("idle"), 3500);
    }
  };

  return (
    <div className="lbx">
      <form
        className="lbx__box"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <span className="lbx__slot" aria-hidden="true" />
        {/* fanart de Loretta como sello postal pegado en la esquina del buzón;
            el sello entero enlaza a su post de Instagram */}
        <a
          className="lbx__stamp"
          href="https://www.instagram.com/p/DZ0XFrYSGKj/?igsh=MWR0eTFvaHpuaHhveA=="
          target="_blank"
          rel="noreferrer"
          aria-label={t.ab_stamp_aria}
          title={t.ab_stamp_aria}
        >
          <img
            src={`${import.meta.env.BASE_URL || "/"}assets/fanart.jpeg`.replace(/\/{2,}/g, "/")}
            alt={t.ab_art_alt}
            loading="lazy"
          />
          <span className="mono">art · loretta ↗</span>
        </a>
        <textarea
          className="lbx__text mono"
          value={text}
          maxLength={TEXT_MAX}
          rows={3}
          placeholder={t.lbx_placeholder}
          onChange={(e) => setText(e.target.value)}
          aria-label={t.lbx_aria_text}
        />
        <div className="lbx__row">
          <input
            className="lbx__nick mono"
            value={nick}
            maxLength={NICK_MAX}
            placeholder={t.lbx_nick}
            onChange={(e) => setNick(e.target.value)}
            aria-label={t.lbx_aria_nick}
          />
          <button className="lbx__send mono" type="submit" disabled={!text.trim() || state === "sending"}>
            {state === "sending" ? t.lbx_sending : state === "sent" ? t.lbx_sent : t.lbx_send}
          </button>
        </div>
        <p className="lbx__hint mono">
          {state === "error" ? t.lbx_error : t.lbx_hint}
        </p>
      </form>

      {notes && notes.length > 0 && (
        <ul className="lbx__notes" aria-label={t.lbx_aria_notes}>
          {notes.map((n) => (
            <li key={n.id} className="lbx__note">
              <p className="lbx__note-text">{n.text}</p>
              <span className="lbx__note-by mono">
                — {n.nick || t.lbx_anon} ·{" "}
                {new Date(n.ts).toLocaleDateString(lang === "es" ? "es-VE" : "en-US", { month: "short", day: "numeric" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Portfolio / about de la banda (en inglés). Sigue el sistema de identidad
 * «estática» (vienen-por-mi-identidad.html): lockup oficial con barra,
 * símbolo de 3 barras, secciones numeradas con filetes — pero en armonía
 * con el resto de la web: papel claro, tinta y el azul agua cromo líquido.
 * Se abre desde el logo del home.
 */
export function About() {
  const open = useApp((s) => s.aboutOpen);
  const setOpen = useApp((s) => s.setAboutOpen);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);
  const [mounted, setMounted] = useState(false);
  // devlog «making of» de libreta: se despliega embebido dentro de la sección 02
  const [devlogOpen, setDevlogOpen] = useState(false);
  const devlogRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(panelRef.current, { yPercent: 100 }, { yPercent: 0, duration: 0.6, ease: "power3.out" });
      gsap.utils.toArray<HTMLElement>(".about__reveal").forEach((el) => {
        gsap.from(el, {
          y: 46,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { scroller: scrollRef.current, trigger: el, start: "top 88%" },
        });
      });
      ScrollTrigger.refresh();
    }, rootRef);
    return () => ctx.revert();
  }, [mounted]);

  const close = () => {
    if (!panelRef.current) {
      setOpen(false);
      setMounted(false);
      return;
    }
    gsap.to(panelRef.current, {
      yPercent: 100,
      duration: 0.5,
      ease: "power2.in",
      onComplete: () => {
        setOpen(false);
        setMounted(false);
      },
    });
  };

  if (!mounted) return null;

  return (
    <div className="about" ref={rootRef}>
      <button className="about__x" onClick={close} aria-label="Close">
        ✕
      </button>
      <div className="about__panel" ref={panelRef}>
        <div className="about__scroll" ref={scrollRef}>
          <div className="about__topbar mono">
            <span>vienen por mi</span>
            <div className="about__topbar-r">
              <button
                className="about__lang mono"
                onClick={toggleLang}
                aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
              >
                <span className={lang === "es" ? "is-on" : ""}>es</span>
                <i>/</i>
                <span className={lang === "en" ? "is-on" : ""}>en</span>
              </button>
              <Mark />
            </div>
          </div>

          <header className="about__head about__reveal">
            <p className="about__loc mono">Maracaibo · Zulia · Venezuela</p>
            <p className="about__tag">{t.ab_tag}</p>
          </header>

          <section className="about__sec about__reveal">
            <div className="about__sechead">
              <span className="about__num mono">01</span>
              <h2 className="about__sectitle mono">{t.ab_sec_band}</h2>
            </div>
            <p>{t.ab_band_p}</p>
            <ul className="about__members mono">
              {MEMBERS.map((m) => (
                <li key={m.nick}>
                  <span>{t[m.roleKey]}</span>
                  <span className="about__nick">
                    {m.nick}
                    <a
                      className="about__igmini"
                      href={m.ig}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${m.nick} on Instagram`}
                      title={`${m.nick} on Instagram`}
                    >
                      <IgIcon size={15} />
                    </a>
                    {m.web && (
                      <a
                        className="about__webmini"
                        href={m.web}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${m.nick} — ${t.ab_portfolio}`}
                        title={`${m.nick} — ${t.ab_portfolio}`}
                      >
                        {t.ab_portfolio}
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="about__sec about__reveal">
            <div className="about__sechead">
              <span className="about__num mono">02</span>
              <h2 className="about__sectitle mono">{t.ab_sec_tracks}</h2>
            </div>
            <p>{t.ab_tracks_p}</p>
            <ul className="about__tracks">
              <li>
                <b>01 · ira</b> — {t.ab_t5}
              </li>
              <li>
                <b>02 · libreta</b> — {t.ab_t2_pre}{" "}
                <span className="about__nick">
                  lion mix
                  <a
                    className="about__igmini"
                    href="https://www.instagram.com/lion_mix?igsh=NTlyanAzaGc4Zzk5"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="lion mix — Instagram"
                    title="lion mix — Instagram"
                  >
                    <IgIcon size={15} />
                  </a>
                </span>
                {t.ab_t2_post}
              </li>
              <li>
                <b>03 · orgullo</b> — {t.ab_t3}
              </li>
              <li className="is-upcoming">
                <b>04 · envidia</b> — {t.ab_t4}
              </li>
              <li>
                <b>05 · outro</b> — {t.ab_t1}
              </li>
            </ul>

            {/* «making of» del juego libreta: el devlog completo se despliega
                embebido aquí mismo (iframe a /devlog/) sin salir del about */}
            <button
              className="about__devlog-toggle mono"
              onClick={() => {
                setDevlogOpen((v) => {
                  const next = !v;
                  if (next)
                    window.setTimeout(
                      () => devlogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      60,
                    );
                  return next;
                });
              }}
              aria-expanded={devlogOpen}
            >
              {devlogOpen ? t.ab_devlog_close : t.ab_devlog}
            </button>
            {devlogOpen && (
              <div className="about__devlog" ref={devlogRef}>
                <iframe
                  src={`${import.meta.env.BASE_URL || "/"}devlog/`.replace(/\/{2,}/g, "/")}
                  title={t.ab_devlog}
                  loading="lazy"
                />
              </div>
            )}
          </section>

          <section className="about__sec about__connect about__reveal">
            <div className="about__sechead">
              <span className="about__num mono">03</span>
              <h2 className="about__sectitle mono">{t.ab_sec_connect}</h2>
            </div>
            <a className="about__ig" href={IG_URL} target="_blank" rel="noreferrer">
              <IgIcon />
              <span>@vienenpormi_</span>
            </a>
            <a className="about__mail mono" href="mailto:vienenpormi.ve@gmail.com">
              vienenpormi.ve@gmail.com
            </a>
            {/* rider con URL propia (/rider): ver el PDF, descargarlo o copiar
                el texto — para pasarle el link a producción de eventos */}
            <a
              className="about__mail mono"
              href={`${import.meta.env.BASE_URL || "/"}rider/`.replace(/\/{2,}/g, "/")}
              target="_blank"
              rel="noreferrer"
            >
              {t.ab_rider}
            </a>
          </section>

          <section className="about__sec about__reveal">
            <div className="about__sechead">
              <span className="about__num mono">04</span>
              <h2 className="about__sectitle mono">{t.ab_sec_letterbox}</h2>
            </div>
            <p>{t.ab_letterbox_p}</p>
            <Letterbox />
          </section>

          <footer className="about__foot about__reveal">
            <Mark className="about__mark--foot" />
            <span className="mono">vienen por mi © 2026</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
