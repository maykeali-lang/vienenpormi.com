import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useApp } from "../state/store";
import { useT } from "../i18n";

// orden actual del proyecto; envidia queda como preview (solo en el reproductor)
const SONGS: { name: string; upcoming?: boolean; live?: boolean; href?: string }[] = [
  { name: "ira", live: true },
  { name: "libreta", href: "/libreta" },
  { name: "orgullo", href: "/orgullo" },
  { name: "envidia", upcoming: true },
  { name: "outro", href: "/outro" },
];

/** Overlay del set list: la hoja se agranda; la X la cierra y "cae" al piso. */
export function Setlist() {
  const t = useT();
  const open = useApp((s) => s.setlistOpen);
  const setOpen = useApp((s) => s.setSetlistOpen);
  const [mounted, setMounted] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  // Monta al abrir; al cerrar, anima la caída y luego desmonta.
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    if (open && paperRef.current && backRef.current) {
      gsap.fromTo(backRef.current, { opacity: 0 }, { opacity: 1, duration: 0.35 });
      gsap.fromTo(
        paperRef.current,
        { yPercent: 60, scale: 0.2, rotate: -14, opacity: 0 },
        { yPercent: 0, scale: 1, rotate: -2, opacity: 1, duration: 0.6, ease: "back.out(1.5)" },
      );
    }
  }, [mounted, open]);

  const close = () => {
    if (!paperRef.current || !backRef.current) {
      setOpen(false);
      setMounted(false);
      return;
    }
    gsap.to(backRef.current, { opacity: 0, duration: 0.5, delay: 0.15 });
    gsap.to(paperRef.current, {
      yPercent: 80,
      scale: 0.25,
      rotate: 12,
      opacity: 0,
      duration: 0.6,
      ease: "power2.in",
      onComplete: () => {
        setOpen(false);
        setMounted(false);
      },
    });
  };

  if (!mounted) return null;

  return (
    <div className="setlist" ref={backRef} onClick={close}>
      <div className="setlist__paper" ref={paperRef} onClick={(e) => e.stopPropagation()}>
        <button className="setlist__x" onClick={close} aria-label="Close">
          ✕
        </button>
        <h2 className="setlist__title">{t.sl_title}</h2>
        <ol className="setlist__songs">
          {SONGS.map((s, i) => (
            <li key={s.name} className={s.upcoming ? "is-upcoming" : ""}>
              <span className="setlist__n">{String(i + 1).padStart(2, "0")}</span>
              {s.href ? (
                <a className="setlist__song" href={s.href}>
                  {s.name}
                </a>
              ) : (
                <span className="setlist__song">{s.name}</span>
              )}
              {s.upcoming && <span className="setlist__soon">{t.sl_soon}</span>}
              {s.live && <span className="setlist__soon">live</span>}
              {s.href && !s.upcoming && <span className="setlist__soon">{t.sl_play}</span>}
            </li>
          ))}
        </ol>
        <div className="setlist__foot">vienen por mi · live</div>
      </div>
    </div>
  );
}
