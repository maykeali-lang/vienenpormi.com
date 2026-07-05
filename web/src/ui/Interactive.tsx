import { useEffect, useRef } from "react";
import gsap from "gsap";
import { conductor } from "../audio/conductor";
import { useApp } from "../state/store";
import { useT } from "../i18n";

const NOTES = ["♪", "♫", "♩", "♬", "✦", "✷"];
// no spawnear sobre los controles del HUD / overlays
const BLOCK = ".hud, button, input, a, .endcard, .landing";

/**
 * Capa de interactividad: al tocar/clicar la escena durante la reproduccion,
 * brota un puñado de notas musicales que flotan (GSAP) y se dispara un destello
 * de luz/bloom en la escena (conductor.tap()). Da feedback de "estoy escuchando".
 */
export function Interactive() {
  const t = useT();
  const phase = useApp((s) => s.phase);
  const layerRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const lastSpawn = useRef(0);
  const tapped = useRef(false);

  useEffect(() => {
    if (phase !== "playing" && phase !== "ended") return;

    const spawn = (x: number, y: number) => {
      const layer = layerRef.current;
      if (!layer) return;
      conductor.tap();

      const count = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const el = document.createElement("span");
        el.className = "fx-note";
        el.textContent = NOTES[Math.floor(Math.random() * NOTES.length)];
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        layer.appendChild(el);
        gsap.set(el, { xPercent: -50, yPercent: -50, scale: 0.2, opacity: 0 });
        gsap
          .timeline({ onComplete: () => el.remove() })
          .to(el, { opacity: 1, scale: 1, duration: 0.18, ease: "back.out(2)" })
          .to(
            el,
            {
              x: (Math.random() - 0.5) * 150,
              y: -90 - Math.random() * 130,
              rotation: (Math.random() - 0.5) * 80,
              opacity: 0,
              scale: 0.5 + Math.random() * 0.7,
              duration: 1.1 + Math.random() * 0.5,
              ease: "power2.out",
            },
            0.05,
          );
      }

      const ring = document.createElement("span");
      ring.className = "fx-ring";
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      layer.appendChild(ring);
      gsap.fromTo(
        ring,
        { xPercent: -50, yPercent: -50, scale: 0, opacity: 0.55 },
        {
          scale: 1,
          opacity: 0,
          duration: 0.62,
          ease: "power2.out",
          onComplete: () => ring.remove(),
        },
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest(BLOCK)) return;
      const now = performance.now();
      if (now - lastSpawn.current < 90) return; // throttle anti-spam
      lastSpawn.current = now;
      if (!tapped.current) {
        tapped.current = true;
        if (hintRef.current) gsap.to(hintRef.current, { opacity: 0, duration: 0.4 });
      }
      spawn(e.clientX, e.clientY);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [phase]);

  // Pista de interaccion al entrar (desaparece sola o al primer toque).
  useEffect(() => {
    if (phase !== "playing" || tapped.current || !hintRef.current) return;
    const el = hintRef.current;
    gsap.fromTo(
      el,
      { opacity: 0, y: 8 },
      { opacity: 0.85, y: 0, duration: 0.6, delay: 0.8, ease: "power2.out" },
    );
    const t = gsap.to(el, { opacity: 0, duration: 0.6, delay: 6 });
    return () => {
      t.kill();
    };
  }, [phase]);

  if (phase !== "playing" && phase !== "ended") return null;

  return (
    <>
      <div ref={layerRef} className="fx-layer" />
      <div ref={hintRef} className="fx-hint">
        {t.fx_hint} <span>✷</span>
      </div>
    </>
  );
}
