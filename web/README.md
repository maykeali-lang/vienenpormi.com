# VIENEN POR MI — experiencia web (Libreta)

Prototipo audiovisual reactivo al audio. Suena el **mixdown** de *Libreta* y
tres personajes faceless low-poly (estilo internetcore / Y2K, toon + cromado)
reaccionan **por instrumento** al beat. Stack: React + Vite + React Three Fiber
+ TypeScript + Web Audio API. Análisis de audio offline con Python/librosa.

## Cómo correr en localhost (PC)

```bash
cd web
npm install
npm run dev
```

Abre la URL que imprime Vite (normalmente http://localhost:5173).
Pulsa **ENTRAR ▶** para arrancar el audio (los navegadores bloquean el
autoplay; hace falta un click).

## Build de producción

```bash
npm run build      # genera /dist
npm run preview    # sirve /dist en local para probar antes de subir
```

Sube el contenido de `dist/` a tu servidor y apúntalo a tu dominio.
`vite.config.ts` usa `base: "./"` (rutas relativas), así funciona tanto en la
raíz del dominio como en una subcarpeta. Si lo sirves desde la raíz puedes
cambiarlo a `base: "/"`.

## Contrato de audio (importante)

- En el navegador **suena UN solo archivo**: el `mixdown` (mp3/ogg).
- Los **stems NO se reproducen**. Se analizan **offline una vez** con
  `scripts/bake_envelopes.py` para generar `envelopes.json` (curvas de energía
  + onsets por instrumento). La reactividad sale de esas curvas pre-bakeadas,
  no de FFT en vivo. En runtime solo viajan `mixdown.(mp3|ogg)` + `envelopes.json`.

## Re-bakear el audio (opcional)

Solo si cambias la mezcla o los stems. Necesitas Python con `librosa` y `ffmpeg`.

1. Coloca los stems en `web/audio_raw/libreta/stems/` con estos nombres:
   `kick.wav snare.wav hihat.wav bass.wav guitar.wav vocals.wav`
   y la mezcla en `web/audio_raw/libreta/mixdown.wav`.
   (Stems opcionales pueden faltar; el pipeline sigue.)
2. Ejecuta:

```bash
pip install librosa soundfile
npm run bake          # = python scripts/bake_envelopes.py
```

Esto regenera `public/assets/songs/libreta/{envelopes.json,mixdown.mp3,mixdown.ogg}`.
La carpeta `audio_raw/` está en `.gitignore` y **no se publica**.

## Estructura

```
web/
  public/assets/songs/libreta/   envelopes.json + mixdown.mp3/ogg  (lo que SUENA y ships)
  scripts/bake_envelopes.py      pipeline de audio offline
  src/
    audio/conductor.ts           reloj musical (1 AudioBufferSourceNode, sample-accurate)
    audio/useConductor.ts        carga + gate "Entrar" + tick por frame
    config/song.ts               config del tema, paleta, calidad por dispositivo
    state/store.ts               estado UI (zustand)
    three/Character.tsx          maniquí faceless + movimiento procedural por instrumento
    three/Stage.tsx              escenario, batería/amps/mic, luces neón, suelo reflejo
    three/CameraRig.tsx          cámara con vida (orbita por compás + parallax de ratón)
    three/Effects.tsx            postproceso reactivo (bloom/aberración/grain)
    three/Scene.tsx              ensamblado del canvas
    ui/Landing.tsx, ui/Hud.tsx   landing internetcore + HUD
```

## Mapeo personaje ↔ instrumento

- **Baterista** → kick/snare/hihat: brazos golpean en los *onsets*, cabeza/cuerpo rebotan con el kick.
- **Bajista/Vocalista** → bass + vocals: cuerpo pulsa con el bajo, cabeza hace *swell* con la voz.
- **Guitarrista** → guitar: brazo de rasgueo oscila al beat escalado por la energía.
- Todos respiran/oscilan suave en idle (nadie queda estático).

## Móvil

Hay *downgrade* automático (menos segmentos, sin grain/aberración, sin suelo
reflejo) en pantallas pequeñas o punteros táctiles. Prioridad actual: PC.

## Próximos pasos (fuera de alcance de este prototipo)

Migrar personajes a GLB desde Blender, sumar los temas Orgullo/Envidia/Ira,
navegación entre temas, redes y fechas.
