import { useMemo, useState } from "react";
import * as THREE from "three";
import { useApp } from "../state/store";

/** Hoja blanca (paper art) tirada en el escenario; al clicarla abre el setlist. */
export function SetlistSheet({
  position = [0, 0.02, 1.6],
  rotation = [-Math.PI / 2, 0, 0.16],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const setOpen = useApp((s) => s.setSetlistOpen);
  const open = useApp((s) => s.setlistOpen);
  const [hover, setHover] = useState(false);

  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 712;
    const x = c.getContext("2d")!;
    // papel blanco con leve textura
    x.fillStyle = "#f7f4ec";
    x.fillRect(0, 0, 512, 712);
    x.fillStyle = "rgba(0,0,0,0.03)";
    for (let i = 0; i < 1200; i++) {
      x.fillRect(Math.floor(Math.random() * 512), Math.floor(Math.random() * 712), 1, 1);
    }
    // borde rasgado tenue
    x.strokeStyle = "rgba(40,36,60,0.18)";
    x.lineWidth = 6;
    x.strokeRect(18, 18, 512 - 36, 712 - 36);
    // título
    x.fillStyle = "#23203a";
    x.textAlign = "center";
    x.font = "700 80px 'Caveat', 'Archivo Black', cursive";
    x.fillText("SET LIST", 256, 130);
    // líneas de canciones (insinuadas)
    x.strokeStyle = "rgba(40,36,60,0.22)";
    x.lineWidth = 3;
    x.font = "600 52px 'Caveat', cursive";
    x.textAlign = "left";
    const songs = [
      { s: "01  intro" },
      { s: "02  libreta" },
      { s: "03  orgullo" },
      { s: "04  envidia" },
      { s: "05  ira" },
    ];
    songs.forEach(({ s }, i) => {
      const yy = 230 + i * 86;
      x.beginPath();
      x.moveTo(70, yy + 18);
      x.lineTo(442, yy + 18);
      x.stroke();
      x.fillStyle = "#3a3556";
      x.font = "600 52px 'Caveat', cursive";
      x.fillText(s, 80, yy);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  return (
    <group position={position} rotation={rotation}>
      <mesh
        visible={!open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "auto";
        }}
      >
        <planeGeometry args={[0.66, 0.92]} />
        <meshStandardMaterial
          map={tex}
          roughness={0.95}
          emissive="#ffffff"
          emissiveIntensity={hover ? 0.3 : 0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
