# De la libreta al navegador — cómo se construyó *Vienen por mí*

> El making-of técnico de [vienenpormi.com](https://vienenpormi.com): un demo musical
> donde **toda la página es música** y cada tema es su propio mundo interactivo.
> Este artículo cuenta, sobre todo, **cómo un videojuego completo nació a lápiz
> dentro de una libreta e-paper** y terminó corriendo en tiempo real dentro de una
> pestaña del navegador — sin perder ni un trazo.

---

## 0. La idea

*Vienen por mí* es un power trío de Maracaibo, Venezuela. La web no es una landing:
es un **demo jugable/escuchable** donde cada canción del setlist abre una experiencia
distinta hecha con Three.js y audio reactivo. El home es una tela que ondea con la
portada; desde ahí se entra a cinco mundos:

| # | Tema | Experiencia |
|---|------|-------------|
| 01 | **ira** | directo instrumental *low-poly* en 3D; la animación de la banda sigue los *stems* de la mezcla |
| 02 | **libreta** | un *shooter* de nave dibujado a lápiz sobre una libreta electrónica |
| 03 | **orgullo** | un barquito de papel *papercraft* que navega la canción al hacer scroll |
| 04 | **envidia** | un adelanto que suena en loop dentro del reproductor |
| 05 | **outro** | un collage de UAPs a pantalla completa con estética de radar |

El corazón de este post es el **02 · libreta**, porque es donde mejor se ve la
tesis del proyecto: *el arte hecho a mano puede llegar a la pantalla intacto.*

---

## 1. El devlog: de la libreta al juego

> 🔗 La versión visual e interactiva de esta sección vive embebida en la web,
> dentro de **Acerca → 02 · libreta → «making of · ver el devlog»**, o directo en
> [`/devlog/`](https://vienenpormi.com/devlog/).

### 1.1 El punto de partida: lápiz y e-paper

Sin tableta gráfica y sin software de ilustración. Todo *Vienen por mí* — la nave,
los cuatro villanos y el mundo entero — se dibujó a lápiz en una libreta e-paper
antes de escribir una sola línea de código. Tres *notebooks* guardan el ADN del juego:

- **Notebook 7** — la nave en vista cenital (la canónica para un *shooter* vertical).
- **Notebooks 8 y 9** — los estudios de personajes / villanos.

### 1.2 La regla de oro: 0 % de simplificación

La única regla del proyecto fue **preservar el 100 % de los trazos originales, cero
simplificación**. Cada boceto se exportó y se convirtió en **SVG limpio**:

- se descartó la plantilla raster,
- se ajustó el `viewBox` al *bounding box* real,
- se rotó a orientación de lectura,
- y se agrupó con `<g id>` semánticos: `fuselaje`, `cabina`, `alas-turbinas`,
  `propulsion`, `armamento`.

El resultado, en números:

| SVG | Paths |
|-----|-------|
| La nave (Notebook 7) | **284** |
| Notebook 8 | **259** |
| Notebook 9 | **619** |

Nada se «redibujó en limpio»: lo que ves en el juego es exactamente el trazo de lápiz.

### 1.3 El casting de villanos

Los cuatro enemigos salieron tal cual del papel; sus nombres nacieron de lo que ya
eran en el boceto:

- **LOLL** — *the Slacker* (de *lolling tongue*, la lengua colgante).
- **CAPO** — *the Murmur* · **boss final** (capo = jefe criminal + *cap*, su gorra).
- **CACKLE** — *the Laughtrack* (su risa «HAHAHA» es parte física del personaje).
- **SMIRK** — *the Grinner* (la sonrisa dentuda de medio lado, exacta al sketch).

### 1.4 El color: paleta *Lion*

El lápiz puso la forma; los marcadores pusieron el color. La **paleta Lion** son 12
pares base/sombra construidos sobre la estructura del papel (`--ink-black` para el
contorno, `--paper-warm` como *highlight*, `--pencil-graphite` para el trazo de la
nave). Cada villano usa exactamente **tres** marcadores — ni uno más.

### 1.5 Mundo 1: todo junto

El primer mockup jugable reúne la nave del Notebook 7 abajo, los cuatro villanos en
formación arriba, y el marcador corriendo: los trazos de la libreta, ahora con
física, disparos y un mundo azul cielo esperando ser invadido.

---

## 2. Del SVG al *shooter* en tiempo real

La escena **libreta** (`src/scenes/envidia/`) toma esos SVG y los vuelve un juego que
**dura exactamente lo que la canción**. Piezas clave:

- **Sprites de trazo con *jitter* e-paper.** Cada sprite tiembla ligeramente a ~8 fps
  para conservar la sensación de dibujo vivo sobre papel electrónico.
- **Oleadas atadas al reloj de la canción.** La *timeline* de enemigos (`WAVES`) se
  dispara según el tiempo del audio, no según un temporizador propio: la partida y la
  música están sincronizadas cuadro a cuadro.
- **Final = final del tema.** Ganes o pierdas, cuando el mixdown llega a su fin se
  cierra la partida y se abre la tabla de **récords (top 10 global)**.
- **Récord al instante.** Al morir puedes registrar tu *nick* directamente en la
  tarjeta de fin de partida; el puntaje viaja al backend (`POST /api/scores`) y, si no
  hay red, cae a `localStorage`. No hay puntaje mínimo: basta con jugar.

---

## 3. El stack

Todo es una **SPA de Vite + React + TypeScript** con render 3D vía **Three.js**
(y React Three Fiber / drei / postprocessing donde conviene), animación con **GSAP**
y estado con **Zustand**.

```
react 18 · @react-three/fiber · @react-three/drei · @react-three/postprocessing
three 0.169 · gsap · zustand · vite 5 · typescript 5
```

### 3.1 Enrutado por *pathname*, escenas *lazy*

`src/main.tsx` mira `window.location.pathname` y monta la escena correspondiente con
`React.lazy`, de modo que `/libreta` no arrastra la pila 3D del directo ni viceversa:

```ts
const isLibreta = path === "/libreta";
const isOrgullo = path === "/orgullo";
const isOutro   = path === "/outro";
// nginx hace fallback de todas las rutas a index.html (SPA)
```

### 3.2 Audio reactivo: el *conductor*

Un **conductor** (`src/audio/conductor.ts`) es la única fuente de verdad del tiempo
musical: expone `frame` (tiempo, fase de beat, energía) que las escenas leen cada
frame. Para el directo *ira*, las envolventes de los *stems* se **pre-calculan** con
un script de Python (`scripts/bake_envelopes.py`) y se sirven como JSON, así la
animación de la banda sigue la mezcla sin analizar audio en vivo en el cliente.

### 3.3 Backend mínimo (Node + systemd)

Un microservicio Node (`api/plays-server.mjs`, bajo `systemd` como `vpm-plays`)
resuelve tres cosas detrás de `/api/`:

- `GET/POST /api/plays` — contador global de reproducciones.
- `GET/POST /api/scores` — tabla de récords top-10 de *libreta*.
- `GET/POST /api/comments` — el *buzón* (letterbox) de notas de visitantes.

Todo con *fallback* a `localStorage` en el cliente si el backend no responde.

### 3.4 Bilingüe (ES/EN)

Un i18n propio y mínimo (`src/i18n.ts`) con detección por navegador y persistencia en
`localStorage`; el español es el idioma por defecto para nuestra región.

### 3.5 Despliegue

`vite build` genera `dist/`, servido por **nginx** con SSL (Certbot). Las rutas SPA
caen a `index.html` (`try_files`), y las páginas estáticas (`/rider/`, `/devlog/`)
viven en `public/` y se copian al build. Los assets con hash van con cache de 30 días;
el HTML, sin cache, para ver cambios al instante.

---

## 4. Analítica

El sitio integra **Google Analytics 4** vía `gtag.js` en las tres superficies
(la SPA, el rider y el devlog) para saber cuánta gente entra, desde dónde y a qué
mundo. El snippet está **guardado tras un placeholder**: mientras el ID sea
`G-XXXXXXXXXX` no carga nada; al poner el ID real se activa. (Ver
[`README.md`](../README.md) para el paso a paso.)

---

## 5. Filosofía

La restricción se volvió estilo: **e-paper, trazo de lápiz, cero simplificación,
tres marcadores por villano, una canción = una partida**. Nada de esto se decidió en
Figma; se decidió en una libreta, y la web solo tuvo que ser fiel al papel.

> *Cada enemigo que esquivas fue primero un trazo de lápiz. Cada nivel, una página de
> la libreta.*

—

Hecho a lápiz, marcador y código en Maracaibo · Zulia · Venezuela 🇻🇪
