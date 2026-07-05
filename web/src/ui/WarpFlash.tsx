import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useApp } from "../state/store";

/** Destello blanco que enmascara el corte de escena al entrar/salir del warp. */
export function WarpFlash() {
  const warp = useApp((s) => s.warp);
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // sin destello en el montaje
    }
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0.96 },
      { opacity: 0, duration: 0.75, ease: "power2.out" },
    );
  }, [warp]);

  return <div ref={ref} className="warpflash" />;
}
