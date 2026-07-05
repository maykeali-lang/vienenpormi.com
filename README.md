# vienenpormi.com

Web oficial de **Vienen por mí** — power trío de Maracaibo, Venezuela. No es una
landing: es un **demo musical interactivo** donde *toda la página es música* y cada
tema del setlist abre su propio mundo hecho con Three.js y audio reactivo.

🌐 **En vivo:** https://vienenpormi.com
📖 **Cómo se construyó (post técnico + devlog):** [`docs/devlog-tecnico.md`](docs/devlog-tecnico.md)

---

## Los cinco mundos

| # | Tema | Experiencia | Ruta |
|---|------|-------------|------|
| 01 | **ira** | directo instrumental *low-poly* 3D, animado por los *stems* | `/` (entrar) |
| 02 | **libreta** | *shooter* de nave dibujado a lápiz sobre libreta e-paper | `/libreta` |
| 03 | **orgullo** | barquito de papel *papercraft* que navega la canción | `/orgullo` |
| 04 | **envidia** | adelanto en loop dentro del reproductor | `/` (player) |
| 05 | **outro** | collage de UAPs a pantalla completa | `/outro` |

Además: `/rider/` (rider técnico + PDF) y `/devlog/` (making-of visual del juego).

## Stack

`React 18` · `React Three Fiber` + `drei` + `postprocessing` · `Three.js 0.169` ·
`GSAP` · `Zustand` · `Vite 5` · `TypeScript 5`. Backend mínimo en Node (`api/`) bajo
`systemd`, servido por nginx.

## Desarrollo

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/  (lo que sirve nginx)
npm run plays      # backend local de plays/records/buzón (opcional)
```

## Estructura

```
web/
  src/            código de la SPA (escenas, ui, audio, estado, i18n)
  public/         assets servidos tal cual (mp3, modelos, svg, /rider, /devlog)
  scripts/        utilidades Python/Node (bake de envolventes, PDF del rider)
  server/         microservicio de plays/records/buzón
api/              el mismo microservicio, desplegado (systemd vpm-plays)
docs/             el post técnico / making-of
```

> Los **másters crudos** (video/wav, ~3 GB) no están en el repo a propósito: el sitio
> corre completo solo con `web/public/`. Ver `.gitignore`.

---

## Google Analytics 4 — activar

El sitio ya trae el snippet de GA4 (en `web/index.html`,
`web/public/rider/index.html` y `web/public/devlog/index.html`), **inactivo** tras un
placeholder. Para encenderlo:

1. Entra a **https://analytics.google.com** → *Administrar* → **Crear propiedad**.
2. Nómbrala (ej. «Vienen por mí»), elige zona horaria y moneda.
3. En **Flujos de datos** → *Web*, agrega `https://vienenpormi.com`.
4. Copia el **ID de medición** con formato `G-XXXXXXXXXX`.
5. Reemplaza el texto `G-XXXXXXXXXX` por tu ID en los **tres** archivos de arriba.
6. Reconstruye y despliega: `cd web && npm run build`.

Mientras el ID siga siendo `G-XXXXXXXXXX`, el snippet no carga nada (no rastrea). Una
vez puesto el ID real, GA4 registra visitas, geografía y qué mundo abre cada quien.

---

Hecho a lápiz, marcador y código en Maracaibo · Zulia · Venezuela 🇻🇪
