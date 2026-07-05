import { useEffect, useRef, useState } from "react";
import { conductor } from "../audio/conductor";
import { useApp } from "../state/store";
import { LYRICS } from "../config/lyrics";

/**
 * Subtitulos estilo karaoke: cada linea revela sus palabras poco a poco,
 * sincronizadas con la voz. El revelado se reparte entre el tiempo de la
 * linea y la siguiente (con un tope para que no se arrastre en instrumentales).
 * Solo re-renderiza al cambiar de linea; el "pintado" de palabras se hace por
 * rAF sobre refs (sin re-render por frame).
 */
export function Subtitle() {
  const phase = useApp((s) => s.phase);
  const [words, setWords] = useState<string[]>([]);
  const [en, setEn] = useState<string>("");
  const idxRef = useRef(-1);
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const meta = useRef({ start: 0, dur: 1 });

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = conductor.frame.t;
      // linea activa (ultima con t <= ahora)
      let idx = -1;
      for (let i = 0; i < LYRICS.length; i++) {
        if (LYRICS[i].t <= t) idx = i;
        else break;
      }

      if (idx !== idxRef.current) {
        idxRef.current = idx;
        const text = idx >= 0 ? LYRICS[idx].text : "";
        const w = text ? text.split(" ") : [];
        spans.current = [];
        setWords(w);
        setEn(idx >= 0 && text ? LYRICS[idx].en ?? "" : "");
        if (w.length) {
          const nextT = LYRICS[idx + 1]?.t ?? conductor.duration;
          const gap = Math.max(0.4, nextT - LYRICS[idx].t);
          // revela en el tiempo cantado, con tope ~0.42s/palabra
          const dur = Math.min(gap - 0.15, Math.max(1.0, w.length * 0.42));
          meta.current = { start: LYRICS[idx].t, dur: Math.max(0.6, dur) };
        }
        raf = requestAnimationFrame(loop);
        return;
      }

      // pintar palabras segun progreso
      const n = spans.current.length;
      if (n) {
        const { start, dur } = meta.current;
        const revealed = ((t - start) / dur) * n;
        for (let i = 0; i < n; i++) {
          const sp = spans.current[i];
          if (!sp) continue;
          const f = Math.max(0, Math.min(1, revealed - i));
          sp.style.opacity = `${0.42 + f * 0.58}`;
          // revelada: blanco nitido; por revelar: gris claro tenue
          sp.style.color = f > 0.5 ? "#ffffff" : "rgba(255,255,255,0.5)";
          sp.style.transform = `translateY(${(1 - f) * 4}px)`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (phase !== "playing" && phase !== "ended") return null;
  if (!words.length) return null;

  return (
    <div className="subs">
      <div className="subs__stack" key={idxRef.current}>
        <div className="subs__line">
          {words.map((w, i) => (
            <span
              key={i}
              className="subs__word"
              ref={(el) => {
                spans.current[i] = el;
              }}
            >
              {w}
            </span>
          ))}
        </div>
        {en && <div className="subs__line subs__line--en">{en}</div>}
      </div>
    </div>
  );
}
