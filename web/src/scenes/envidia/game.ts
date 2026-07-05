// Núcleo del juego «04 · envidia» (Lion Mix) — shooter cenital estilo
// Space Invaders en Three.js (cámara ortográfica, todo son quads con
// texturas canvas de los bocetos reMarkable).
//
// La partida dura EXACTAMENTE lo que dura la canción (345 s) y LA CANCIÓN
// SIEMPRE SUENA COMPLETA. Los villanos, puro envidiosos, robaron los
// INSTRUMENTOS de la banda (bajo, batería, guitarra y mic): al limpiar la
// oleada de un villano, suelta el instrumento y hay que atraparlo con la
// nave. CAPO (boss final) se llevó el mic. Los eventos (fuego enemigo,
// pulso) siguen a la batería vía analyser: la música ES el reloj del juego.

import * as THREE from "three";
import { StemMixer, StemName } from "./audio";
import { loadEpaperSvg, EpaperRaster, EpaperSvg, makeDashTexture } from "./sprites";
import {
  makeAsteriskTexture,
  makeAsteroidTexture,
  makeInstrumentTexture,
  makeFlameTexture,
} from "./props";

export type VillainKey = "loll" | "cackle" | "smirk" | "capo";
export type EndResult = "victory" | "defeat" | "escape";

export interface WaveInfo {
  villain: VillainKey;
  world: string;
  title: string;
  stem: StemName;
  stemLabel: string;
}

export type PowerType = "rapid" | "spread" | "shield" | "life";

export interface GameCallbacks {
  onScore(score: number): void;
  onLives(lives: number): void;
  onWave(w: WaveInfo | null): void;
  onStemRecovered(stem: StemName): void;
  onMult(mult: number): void;
  onBossHp(frac: number | null): void;
  onProgress(frac: number): void;
  onEnd(result: EndResult, score: number): void;
  /** la CANCIÓN terminó (aunque el juego ya hubiera acabado): cierra la partida
   *  y abre la tabla de records. Se dispara una sola vez. */
  onSongEnd(score: number): void;
  /** power-up atrapado (para un aviso breve en el HUD) */
  onPowerup(kind: PowerType): void;
}

interface VillainSpec {
  url: string;
  wFrac: number; // ancho relativo al playfield
  hp: number;
  score: number;
  px: number; // resolución de rasterizado
  rows: number;
  cols: number;
}

// Dificultad SUBIDA (2026-07-05): más HP, más filas/columnas de enemigos.
const VILLAINS: Record<VillainKey, VillainSpec> = {
  loll: { url: "loll.svg", wFrac: 0.14, hp: 4, score: 100, px: 300, rows: 2, cols: 6 },
  cackle: { url: "cackle.svg", wFrac: 0.18, hp: 6, score: 150, px: 360, rows: 2, cols: 5 },
  smirk: { url: "smirk.svg", wFrac: 0.13, hp: 5, score: 125, px: 300, rows: 3, cols: 5 },
  capo: { url: "capo.svg", wFrac: 0.34, hp: 110, score: 5000, px: 640, rows: 1, cols: 1 },
};

// ni fuego enemigo ni asteroides hasta que termina el crawl de apertura
// (relato Star Wars, lento para leerse con calma — ~27 s)
const INTRO_SAFE = 27;

// vidas máximas (dificultad SUBIDA 2026-07-05); debe coincidir con MAX_LIVES
// del HUD en EnvidiaScene.tsx
const MAX_LIVES = 12;

// Los sprites van SIN color (decisión 2026-07-03): nave y villanos son los
// bocetos a lápiz tal cual salieron del cuaderno — grafito sobre papel.

interface Wave {
  villain: VillainKey;
  t0: number;
  t1: number;
  stem: StemName;
  stemLabel: string;
  bg: string;
  world: string;
  title: string;
  boss?: boolean;
}

// Línea de tiempo sobre los ~293 s de la canción «libreta» (mixdown). Fondo =
// blanco papel e-paper en todos los mundos; SOLO el boss tiñe la pantalla.
const WAVES: Wave[] = [
  { villain: "loll", t0: 5, t1: 75, stem: "bass", stemLabel: "the bass", bg: "#F4F3EE", world: "WORLD 1", title: "LOLL · the Slacker" },
  { villain: "cackle", t0: 75, t1: 145, stem: "drum", stemLabel: "the drums", bg: "#F4F3EE", world: "WORLD 2", title: "CACKLE · the Laughtrack" },
  { villain: "smirk", t0: 145, t1: 214, stem: "guitar", stemLabel: "the guitar", bg: "#F4F3EE", world: "WORLD 3", title: "SMIRK · the Grinner" },
  { villain: "capo", t0: 214, t1: 289, stem: "voice", stemLabel: "the mic", bg: "#B7A6D9", world: "BOSS", title: "CAPO — The Murmur", boss: true },
];

const H = 100; // alto del mundo en unidades; el ancho sale del aspect

interface Enemy {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  raster: EpaperRaster;
  key: VillainKey;
  hp: number;
  w: number;
  h: number;
  home: THREE.Vector2; // posición en la formación (fracciones de playfield)
  phase: number;
  alive: boolean;
  eco: boolean; // formación de refuerzo (más pequeña)
  dying: number; // >0: progreso de des-dibujado de muerte
  regen: number; // <1: re-dibujándose tras daño
  entering: number; // 0..1 entrada desde arriba
  retreating: boolean;
}

interface Bullet {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  active: boolean;
}

interface Drifter {
  mesh: THREE.Mesh;
  vy: number;
  vr: number;
  size: number;
}

interface Asteroid {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  hp: number;
  vx: number;
  vy: number;
  vr: number;
  r: number;
  dying: number;
}

interface Item {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  kind: StemName;
  hover: boolean;
  phase: number;
}

interface PowerUp {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  kind: PowerType;
  phase: number;
}

export class EnvidiaGame {
  private host: HTMLElement;
  private mixer: StemMixer;
  private cb: GameCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private svgs = new Map<VillainKey | "nave", EpaperSvg>();

  private W = 100;
  private playW = 80;

  // nave
  private ship!: THREE.Mesh;
  private shipMat!: THREE.MeshBasicMaterial;
  private shipRaster!: EpaperRaster;
  private flames: THREE.Mesh[] = [];
  private flameMat!: THREE.MeshBasicMaterial;
  private shipW = 16;
  private shipH = 18;
  private pos = new THREE.Vector2(0, -38);
  private vel = new THREE.Vector2();
  private keys = new Set<string>();
  private touchTarget: THREE.Vector2 | null = null;
  private firing = false;
  private fireCooldown = 0;
  private invuln = 0;
  private entrance = 0; // 0..1 redibujado inicial
  private shipRegen = 1;

  private enemies: Enemy[] = [];
  private playerBullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private dashTex!: THREE.CanvasTexture;
  private enemyDashTex!: THREE.CanvasTexture;

  // mundo: asteriscos + planetas (decoración) y asteroides (obstáculo)
  private drifters: Drifter[] = [];
  private asteroids: Asteroid[] = [];
  private asteroidTex: THREE.CanvasTexture[] = [];
  private asteroidTimer = 6;
  // instrumentos robados sueltos en el campo
  private items: Item[] = [];
  private lastKillPos = new THREE.Vector2(0, 20);
  private propTextures: THREE.Texture[] = [];

  // power-ups: caen del cielo, se atrapan con la nave y dan mejoras temporales
  private powerups: PowerUp[] = [];
  private powerTimer = 12;
  private powerTex = new Map<PowerType, THREE.CanvasTexture>();
  private rapidT = 0; // disparo rápido restante (s)
  private spreadT = 0; // triple disparo restante (s)
  private shieldT = 0; // escudo restante (s)
  private shieldMesh!: THREE.Mesh;
  private songEnded = false;

  private score = 0;
  private lives = MAX_LIVES; // dificultad SUBIDA: menos vidas
  private streak = 0; // bajas seguidas sin recibir daño → multiplicador
  private mult = 1;
  private waveIdx = -1;
  private ecoTimer = 0; // cuenta atrás para la siguiente formación eco
  private waveCleared = false;
  private bossDefeated = false;
  private ended = false;
  private paused = false;

  // pulso musical
  private emaFast = 0;
  private emaSlow = 0;
  private sinceBeat = 0;
  private beatFireBudget = 0;

  private jitterClock = 0;
  private jitters = new Map<THREE.Mesh, THREE.Vector2>();
  private clock = 0;
  private syncClock = 0;
  private raf = 0;
  private lastNow = 0;
  private disposed = false;
  private base: string;

  constructor(host: HTMLElement, assetBase: string, mixer: StemMixer, cb: GameCallbacks) {
    this.host = host;
    this.base = assetBase;
    this.mixer = mixer;
    this.cb = cb;
  }

  async load() {
    const names: (VillainKey | "nave")[] = ["nave", "loll", "cackle", "smirk", "capo"];
    const loaded = await Promise.all(
      names.map((n) => loadEpaperSvg(`${this.base}/${n === "nave" ? "nave" : n}.svg`)),
    );
    names.forEach((n, i) => this.svgs.set(n, loaded[i]));
  }

  start() {
    const host = this.host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#F4F3EE"); // blanco papel e-paper
    this.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 50);
    this.camera.position.z = 10;

    // balas LED: azul para la nave, rojo para los villanos
    this.dashTex = makeDashTexture({ px: 18, color: "#2E86FF", core: "#D6ECFF" });
    this.enemyDashTex = makeDashTexture({ px: 18, color: "#FF2E2E", core: "#FFD9D2" });
    this.spawnWorldProps();

    // nave: redibujado de entrada (~2.6 s) en el orden original de los 284
    // paths, a lápiz grafito puro (sin pase de color)
    const naveSvg = this.svgs.get("nave")!;
    this.shipRaster = new EpaperRaster(naveSvg, 560);
    this.shipMat = new THREE.MeshBasicMaterial({
      map: this.shipRaster.texture,
      transparent: true,
      depthWrite: false,
    });
    this.ship = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shipMat);
    this.ship.renderOrder = 10;
    this.scene.add(this.ship);

    // propulsión: DOS llamas marker (la nave tiene dos propulsores),
    // parpadeo mínimo y desfasado entre sí en update()
    const flameTex = makeFlameTexture();
    this.propTextures.push(flameTex);
    this.flameMat = new THREE.MeshBasicMaterial({
      map: flameTex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    this.flames = [0, 1].map(() => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flameMat);
      // por ENCIMA de la nave (renderOrder 11 > 10): la llama vive DENTRO del
      // dibujo de los propulsores, no colgando por detrás/debajo
      f.renderOrder = 11;
      this.scene.add(f);
      return f;
    });

    // escudo (power-up): anillo azul alrededor de la nave, oculto por defecto
    this.shieldMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.72, 40),
      new THREE.MeshBasicMaterial({
        color: "#2E86FF",
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.shieldMesh.renderOrder = 12;
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);

    this.onResize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    const cv = this.renderer.domElement;
    cv.addEventListener("pointerdown", this.onPointerDown);
    cv.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);

    this.cb.onLives(this.lives);
    this.cb.onScore(this.score);
    this.cb.onMult(this.mult);

    this.lastNow = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastNow) / 1000);
      this.lastNow = now;
      if (!this.paused) this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  setPaused(p: boolean) {
    if (this.ended) return;
    this.paused = p;
    this.mixer.setPaused(p);
  }

  /* ------------------------------ input ------------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase()) || e.key === " ")
      e.preventDefault();
    if (k === " ") this.firing = true;
    else this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === " ") this.firing = false;
    else this.keys.delete(k);
  };
  private pointerToWorld(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * this.W;
    const y = -((e.clientY - r.top) / r.height - 0.5) * H;
    return new THREE.Vector2(x, y);
  }
  private onPointerDown = (e: PointerEvent) => {
    this.touchTarget = this.pointerToWorld(e);
    this.firing = true;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (this.touchTarget) this.touchTarget = this.pointerToWorld(e);
  };
  private onPointerUp = () => {
    this.touchTarget = null;
    this.firing = this.keys.has(" ");
  };

  private onResize = () => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = Math.max(0.45, Math.min(2.4, w / h));
    const oldPlayW = this.playW;
    this.W = H * aspect;
    this.playW = Math.min(this.W * 0.92, H * 0.82);
    this.camera.left = -this.W / 2;
    this.camera.right = this.W / 2;
    this.camera.top = H / 2;
    this.camera.bottom = -H / 2;
    this.camera.updateProjectionMatrix();

    this.shipW = this.playW * 0.19;
    this.shipH = this.shipW * this.shipRaster.aspect;
    this.ship.scale.set(this.shipW, this.shipH, 1);

    const k = this.playW / oldPlayW;
    if (isFinite(k) && k > 0 && k !== 1) {
      for (const e of this.enemies) {
        e.home.x *= k;
        const spec = VILLAINS[e.key];
        e.w = this.playW * spec.wFrac * (e.eco ? 0.82 : 1);
        e.h = e.w * e.raster.aspect;
      }
    }
  };

  /* ------------------------------ oleadas ------------------------------ */

  private currentWave(): Wave | null {
    return this.waveIdx >= 0 && this.waveIdx < WAVES.length ? WAVES[this.waveIdx] : null;
  }

  private enterWave(idx: number) {
    this.waveIdx = idx;
    const w = WAVES[idx];
    this.waveCleared = false;
    this.ecoTimer = 0;
    (this.scene.background as THREE.Color).set(w.bg);
    this.cb.onWave({ villain: w.villain, world: w.world, title: w.title, stem: w.stem, stemLabel: w.stemLabel });
    this.spawnFormation(w.villain, false);
    if (w.boss) this.cb.onBossHp(1);
  }

  private spawnFormation(key: VillainKey, eco: boolean) {
    const spec = VILLAINS[key];
    const svg = this.svgs.get(key)!;
    const rows = eco ? 1 : spec.rows;
    const cols = eco ? Math.max(2, spec.cols - 1) : spec.cols;
    const size = eco ? 0.82 : 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const raster = new EpaperRaster(svg, spec.px);
        raster.drawAll();
        const mat = new THREE.MeshBasicMaterial({ map: raster.texture, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        mesh.renderOrder = 8;
        const w = this.playW * spec.wFrac * size;
        const h = w * raster.aspect;
        mesh.scale.set(w, h, 1);
        // la formación ocupa el tercio superior; CACKLE (el mayor) más espaciado
        const spread = this.playW * (0.62 + 0.1 * (cols - 3));
        const x = cols === 1 ? 0 : -spread / 2 + (spread * c) / (cols - 1);
        const y = H * 0.31 - r * (h * 1.12);
        const e: Enemy = {
          mesh,
          mat,
          raster,
          key,
          hp: eco ? 2 : spec.hp,
          w,
          h,
          home: new THREE.Vector2(x, y),
          phase: r * 1.7 + c * 0.9 + (eco ? 2.3 : 0),
          alive: true,
          eco,
          dying: 0,
          regen: 1,
          entering: 0,
          retreating: false,
        };
        mesh.position.set(x, y + H * 0.45, 1);
        this.scene.add(mesh);
        this.enemies.push(e);
      }
    }
  }

  private removeEnemy(e: Enemy) {
    this.scene.remove(e.mesh);
    e.mesh.geometry.dispose();
    e.mat.dispose();
    e.raster.dispose();
    this.jitters.delete(e.mesh);
  }

  /* --------------------------- mundo / props --------------------------- */

  /** asteriscos a tinta en deriva lenta detrás de la acción (sin planetas:
   *  pedido 2026-07-03 — el cielo queda limpio, solo estrellas de cómic) */
  private spawnWorldProps() {
    const mk = (tex: THREE.Texture, size: number, opacity: number, z: number, order: number) => {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = order;
      mesh.scale.set(size, size, 1);
      mesh.position.set((Math.random() - 0.5) * this.W, (Math.random() - 0.5) * H, 0.3 + z);
      this.scene.add(mesh);
      return mesh;
    };
    const star = makeAsteriskTexture();
    this.propTextures.push(star);
    for (let i = 0; i < 26; i++) {
      const size = 0.8 + Math.random() * 1.5;
      this.drifters.push({ mesh: mk(star, size, 0.35 + Math.random() * 0.3, 0, 1), vy: 2 + Math.random() * 3, vr: 0, size });
    }
    this.asteroidTex = [makeAsteroidTexture(7), makeAsteroidTexture(31), makeAsteroidTexture(97)];
    this.propTextures.push(...this.asteroidTex);
  }

  /** asteroide-obstáculo: cae, gira, se puede romper a tiros y daña la nave */
  private spawnAsteroid() {
    const tex = this.asteroidTex[Math.floor(Math.random() * this.asteroidTex.length)];
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 5;
    const r = this.playW * (0.035 + Math.random() * 0.02);
    mesh.scale.set(r * 2.2, r * 2.2, 1);
    mesh.position.set((Math.random() - 0.5) * this.playW * 0.9, H * 0.56, 0.9);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    this.asteroids.push({
      mesh,
      mat,
      hp: 2,
      vx: (Math.random() - 0.5) * 6,
      vy: -(13 + Math.random() * 8),
      vr: (Math.random() - 0.5) * 1.4,
      r,
      dying: 0,
    });
  }

  private removeAsteroid(a: Asteroid) {
    this.scene.remove(a.mesh);
    a.mesh.geometry.dispose();
    a.mat.dispose();
  }

  /** el villano suelta el instrumento robado: cae y queda flotando hasta atraparlo */
  private spawnItem(kind: StemName, x: number, y: number) {
    if (this.items.some((it) => it.kind === kind)) return;
    const tex = makeInstrumentTexture(kind);
    this.propTextures.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 7;
    const s = this.playW * 0.1;
    mesh.scale.set(s, s, 1);
    mesh.position.set(Math.max(-this.playW * 0.45, Math.min(this.playW * 0.45, x)), y, 1.2);
    this.scene.add(mesh);
    this.items.push({ mesh, mat, kind, hover: false, phase: Math.random() * 6 });
  }

  private removeItem(it: Item) {
    this.scene.remove(it.mesh);
    it.mesh.geometry.dispose();
    it.mat.dispose();
  }

  /* ------------------------------ power-ups ---------------------------- */

  private updatePowerups(dt: number, t: number) {
    // decae el tiempo restante de cada efecto
    this.rapidT = Math.max(0, this.rapidT - dt);
    this.spreadT = Math.max(0, this.spreadT - dt);
    if (this.shieldT > 0) {
      this.shieldT = Math.max(0, this.shieldT - dt);
      this.invuln = Math.max(this.invuln, 0.12); // con escudo, intocable
    }
    // escudo visual (anillo alrededor de la nave)
    const sm = this.shieldMesh;
    if (sm) {
      sm.visible = this.shieldT > 0;
      if (sm.visible) {
        const r = this.shipW * 0.62 * (1 + Math.sin(this.clock * 6) * 0.03);
        sm.scale.set(r, r, 1);
        sm.position.set(this.ship.position.x, this.ship.position.y, 2.05);
        (sm.material as THREE.MeshBasicMaterial).opacity =
          (0.32 + 0.28 * Math.abs(Math.sin(this.clock * 5))) * (this.shieldT < 1.2 ? 0.55 : 1);
      }
    }
    // aparición periódica (solo tras el crawl y con la partida viva)
    if (!this.ended && this.waveIdx >= 0 && t > INTRO_SAFE) {
      this.powerTimer -= dt;
      if (this.powerTimer <= 0 && this.powerups.length < 2) {
        this.spawnPowerup();
        this.powerTimer = 15 + Math.random() * 9;
      }
    }
    // caída + captura
    for (const pu of this.powerups) {
      pu.mesh.position.y -= 11 * dt;
      pu.mesh.rotation.z = Math.sin(this.clock * 2 + pu.phase) * 0.22;
      const s = this.shipW * 0.12 * (1 + Math.sin(this.clock * 4 + pu.phase) * 0.06);
      pu.mesh.scale.set(s, s, 1);
      if (
        this.lives > 0 &&
        !this.ended &&
        Math.hypot(pu.mesh.position.x - this.pos.x, pu.mesh.position.y - this.pos.y) <
          this.shipW * 0.5 + 1.5
      ) {
        this.applyPower(pu.kind);
        this.removePowerup(pu); // scene.remove deja pu.mesh.parent === null
      }
    }
    this.powerups = this.powerups.filter((pu) => {
      if (pu.mesh.parent === null) return false;
      if (pu.mesh.position.y < -H * 0.6) {
        this.removePowerup(pu);
        return false;
      }
      return true;
    });
  }

  private powerGlyph(kind: PowerType): string {
    return kind === "rapid" ? "»»" : kind === "spread" ? "W" : kind === "shield" ? "◈" : "+";
  }

  private makePowerupTex(kind: PowerType): THREE.CanvasTexture {
    const cached = this.powerTex.get(kind);
    if (cached) return cached;
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, 160, 160);
    // cápsula de papel a tinta (monocromo e-paper, sin color)
    x.strokeStyle = "#1b1b1b";
    x.lineWidth = 7;
    x.fillStyle = "rgba(244,243,238,0.96)";
    x.beginPath();
    x.arc(80, 80, 62, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.lineWidth = 4;
    x.beginPath();
    x.arc(80, 80, 50, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = "#1b1b1b";
    x.font = "800 72px 'Titan One', system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(this.powerGlyph(kind), 80, 88);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.powerTex.set(kind, tex);
    return tex;
  }

  private spawnPowerup() {
    const roll = Math.random();
    const kind: PowerType =
      roll < 0.34 ? "rapid" : roll < 0.64 ? "spread" : roll < 0.86 ? "shield" : "life";
    const tex = this.makePowerupTex(kind);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 7;
    const s = this.shipW * 0.12;
    mesh.scale.set(s, s, 1);
    mesh.position.set((Math.random() - 0.5) * this.playW * 0.8, H * 0.5, 1.3);
    this.scene.add(mesh);
    this.powerups.push({ mesh, mat, kind, phase: Math.random() * 6 });
  }

  private removePowerup(pu: PowerUp) {
    this.scene.remove(pu.mesh);
    pu.mesh.geometry.dispose();
    pu.mat.dispose();
  }

  private applyPower(kind: PowerType) {
    switch (kind) {
      case "rapid":
        this.rapidT = 9;
        break;
      case "spread":
        this.spreadT = 9;
        break;
      case "shield":
        this.shieldT = 6;
        this.invuln = Math.max(this.invuln, 6);
        break;
      case "life":
        this.lives = Math.min(MAX_LIVES, this.lives + 2);
        this.cb.onLives(this.lives);
        break;
    }
    this.addScore(150);
    this.cb.onPowerup(kind);
  }

  /* ------------------------------ balas ------------------------------- */

  private getBullet(pool: Bullet[], tex: THREE.CanvasTexture, w: number, h: number): Bullet {
    let b = pool.find((x) => !x.active);
    if (!b) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      b = { mesh, vx: 0, vy: 0, active: false };
      pool.push(b);
    }
    b.mesh.scale.set(w, h, 1);
    b.mesh.visible = true;
    b.active = true;
    return b;
  }

  private firePlayer() {
    // triple disparo con el power-up «spread»; si no, un solo tiro recto
    const angles = this.spreadT > 0 ? [-0.26, 0, 0.26] : [0];
    for (const a of angles) {
      const b = this.getBullet(this.playerBullets, this.dashTex, this.shipW * 0.075, this.shipH * 0.42);
      b.mesh.position.set(this.pos.x, this.pos.y + this.shipH * 0.5, 1.5);
      b.vx = Math.sin(a) * 62;
      b.vy = 95 * Math.cos(a);
      b.mesh.rotation.z = -a;
    }
    this.mixer.laser();
  }

  private fireEnemy(e: Enemy, aimed: boolean, angle = 0) {
    const b = this.getBullet(this.enemyBullets, this.enemyDashTex, e.w * 0.08, e.h * 0.3);
    b.mesh.position.set(e.mesh.position.x, e.mesh.position.y - e.h * 0.45, 1.4);
    const speed = 44 + this.mixer.energy() * 22; // balas enemigas más rápidas
    if (aimed) {
      const dx = this.pos.x - e.mesh.position.x;
      const dy = this.pos.y - e.mesh.position.y;
      const len = Math.hypot(dx, dy) || 1;
      b.vx = (dx / len) * speed + Math.sin(angle) * 6;
      b.vy = (dy / len) * speed;
    } else {
      b.vx = Math.sin(angle) * speed * 0.55;
      b.vy = -speed * Math.cos(angle * 0.5);
    }
    b.mesh.rotation.z = Math.atan2(b.vx, -b.vy);
  }

  /* ------------------------------ update ------------------------------ */

  private update(dt: number) {
    const t = this.mixer.time;
    const dur = this.mixer.duration || 293;
    this.clock += dt;
    this.cb.onProgress(Math.min(1, t / dur));

    this.syncClock += dt;
    if (this.syncClock > 2) {
      this.syncClock = 0;
      this.mixer.syncTick();
    }

    // ------ pulso musical (batería cruda) ------
    const drum = this.mixer.drumEnergy();
    this.emaFast = this.emaFast * 0.72 + drum * 0.28;
    this.emaSlow = this.emaSlow * 0.985 + drum * 0.015;
    this.sinceBeat += dt;
    let beat = false;
    if (this.emaFast > this.emaSlow * 1.28 && this.emaFast > 0.06 && this.sinceBeat > 0.24) {
      beat = true;
      this.sinceBeat = 0;
    }

    // ------ línea de tiempo de la canción → oleadas ------
    if (!this.ended) {
      const next = this.waveIdx + 1;
      if (next < WAVES.length && t >= WAVES[next].t0) {
        // los que sigan vivos se retiran (la envidia no muere: se va)
        for (const e of this.enemies) if (e.alive) e.retreating = true;
        if (this.currentWave()?.boss) this.cb.onBossHp(null);
        this.enterWave(next);
      }
      const w = this.currentWave();
      // formaciones eco: la envidia siempre vuelve mientras dure su tramo
      if (w && !w.boss && this.waveCleared && t < w.t1 - 10) {
        this.ecoTimer -= dt;
        if (this.ecoTimer <= 0 && !this.enemies.some((e) => e.alive && !e.retreating)) {
          this.spawnFormation(w.villain, true);
        }
      }
      if (t >= dur - 0.25) {
        // terminó la canción: si CAPO cayó es victoria; si no, escapó con el mic
        this.endGame(this.bossDefeated ? "victory" : "escape");
      } else if (this.waveIdx === WAVES.length - 1 && t >= WAVES[WAVES.length - 1].t1 && !this.bossDefeated) {
        this.endGame("escape");
      }
    }

    // la CANCIÓN llegó a su fin (aunque el juego ya hubiera acabado por victoria
    // y el usuario siguiera escuchando): se cierra la partida y se abre la TABLA
    // de records para escribir el nick. Se dispara una sola vez.
    if (!this.songEnded && t >= dur - 0.12) {
      this.songEnded = true;
      this.ended = true;
      this.firing = false;
      this.cb.onSongEnd(this.score);
    }

    // ------ jitter e-paper (por sprite, ~8 fps) ------
    this.jitterClock += dt;
    if (this.jitterClock > 0.125) {
      this.jitterClock = 0;
      const set = (m: THREE.Mesh) => {
        let j = this.jitters.get(m);
        if (!j) {
          j = new THREE.Vector2();
          this.jitters.set(m, j);
        }
        j.set((Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16);
      };
      set(this.ship);
      for (const e of this.enemies) set(e.mesh);
    }

    // ------ nave ------
    if (this.entrance < 1) {
      this.entrance = Math.min(1, this.entrance + dt / 2.6);
      this.shipRaster.drawTo(this.shipRaster.total * this.entrance);
    } else if (this.shipRegen < 1) {
      this.shipRegen = Math.min(1, this.shipRegen + dt / 1.1);
      this.shipRaster.shake = (1 - this.shipRegen) * 4;
      this.shipRaster.drawTo(this.shipRaster.total * (0.55 + 0.45 * this.shipRegen));
      if (this.shipRegen >= 1) this.shipRaster.shake = 0;
    }

    const acc = 380; // nave ágil: responde rápido y planea suelta
    const input = new THREE.Vector2(
      (this.keys.has("arrowright") || this.keys.has("d") ? 1 : 0) -
        (this.keys.has("arrowleft") || this.keys.has("a") ? 1 : 0),
      (this.keys.has("arrowup") || this.keys.has("w") ? 1 : 0) -
        (this.keys.has("arrowdown") || this.keys.has("s") ? 1 : 0),
    );
    if (input.lengthSq() > 0) {
      input.normalize().multiplyScalar(acc * dt);
      this.vel.add(input);
    }
    if (this.touchTarget) {
      const d = new THREE.Vector2(this.touchTarget.x - this.pos.x, this.touchTarget.y - this.pos.y);
      this.vel.add(d.multiplyScalar(12 * dt));
    }
    this.vel.multiplyScalar(Math.pow(0.0015, dt)); // fricción (flotar, no frenar)
    this.vel.clampLength(0, 80);
    this.pos.addScaledVector(this.vel, dt);
    const xb = Math.min(this.W * 0.46, this.playW * 0.62);
    this.pos.x = Math.max(-xb, Math.min(xb, this.pos.x));
    this.pos.y = Math.max(-H * 0.5 + this.shipH * 0.55, Math.min(-H * 0.04, this.pos.y));

    // flotación idle (spec del demo, a escala del mundo) + jitter
    const fx = Math.sin(this.clock * 0.7) * 1.4 + Math.sin(this.clock * 1.9) * 0.4;
    const fy = Math.sin(this.clock * 1.1 + 1) * 0.8;
    const sj = this.jitters.get(this.ship) || { x: 0, y: 0 };
    this.ship.position.set(this.pos.x + fx + sj.x, this.pos.y + fy + sj.y, 2);
    if (this.invuln > 0) {
      this.invuln -= dt;
      this.shipMat.opacity = 0.35 + 0.55 * Math.abs(Math.sin(this.clock * 14));
    } else this.shipMat.opacity = 1;

    // dos llamas de propulsión: van DENTRO del dibujo de los propulsores (no
    // colgando por debajo): cortas, sobre la nave (z 2.1 > 2, renderOrder 11),
    // en la boca de cada propulsor; parpadeo mínimo desfasado
    this.flames.forEach((f, i) => {
      const thrust =
        0.6 + (this.vel.length() / 80) * 0.55 + Math.sin(this.clock * 57 + i * 2.4) * 0.1;
      f.scale.set(this.shipW * 0.13, this.shipH * 0.3 * thrust, 1);
      f.position.set(
        this.ship.position.x + (i === 0 ? -1 : 1) * this.shipW * 0.16,
        this.ship.position.y - this.shipH * (0.3 + 0.06 * thrust),
        2.1,
      );
    });
    this.flameMat.opacity = this.entrance >= 1 ? this.shipMat.opacity * 0.95 : 0;

    // ------ power-ups: caída, captura y efectos ------
    this.updatePowerups(dt, t);

    // disparo del jugador (tras terminar de dibujarse)
    this.fireCooldown -= dt;
    if (this.firing && this.entrance >= 1 && this.fireCooldown <= 0 && this.lives > 0 && !this.ended) {
      this.firePlayer();
      this.fireCooldown = this.rapidT > 0 ? 0.1 : 0.2; // power-up: disparo rápido
    }
    this.dashTex.offset.y = (this.clock / 0.5) % 1; // loop del trazo (0.5 s)
    this.enemyDashTex.offset.y = 1 - ((this.clock / 0.5) % 1);

    // ------ enemigos ------
    const w = this.currentWave();
    const sway = Math.sin(this.clock * 0.22) * this.playW * 0.08;
    let anyAlive = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.dying > 0) {
        e.dying += dt / 0.45;
        e.raster.drawTo(e.raster.total * Math.max(0, 1 - e.dying));
        if (e.dying >= 1) {
          e.alive = false;
          this.removeEnemy(e);
        }
        continue;
      }
      if (e.retreating) {
        e.mesh.position.y += 60 * dt;
        e.mat.opacity = Math.max(0, e.mat.opacity - dt * 1.2);
        if (e.mesh.position.y > H * 0.62) {
          e.alive = false;
          this.removeEnemy(e);
        }
        continue;
      }
      anyAlive = true;
      if (e.entering < 1) e.entering = Math.min(1, e.entering + dt / 1.2);
      const enterY = (1 - Math.pow(e.entering, 2)) * H * 0.45;
      if (e.regen < 1) {
        e.regen = Math.min(1, e.regen + dt / 0.5);
        e.raster.shake = (1 - e.regen) * 5;
        e.raster.drawTo(e.raster.total * (0.62 + 0.38 * e.regen));
        if (e.regen >= 1) e.raster.shake = 0;
      }

      const tt = this.clock;
      const j = this.jitters.get(e.mesh) || { x: 0, y: 0 };
      let ix = 0,
        iy = 0,
        rot = 0,
        scale = 1;
      switch (e.key) {
        case "loll": // péndulo + bob
          rot = ((3 + Math.sin(tt * 1.4 + e.phase) * 4) * Math.PI) / 180;
          iy = Math.sin(tt * 0.9 + e.phase) * 0.45;
          break;
        case "cackle": // late a carcajadas (solo la mitad positiva)
          scale = 1 + Math.max(0, Math.sin(tt * 5 + e.phase)) * 0.05;
          iy = Math.sin(tt * 0.55 + e.phase) * 0.4;
          break;
        case "smirk": // respiración de dormido
          iy = Math.sin(tt * 0.5 + e.phase) * 0.75;
          scale = 1 + Math.sin(tt * 0.5 + e.phase) * 0.012;
          rot = (-2 * Math.PI) / 180;
          break;
        case "capo": // deriva impredecible
          ix = Math.sin(tt * 0.45) * this.playW * 0.14 + Math.sin(tt * 1.7) * this.playW * 0.035;
          iy = Math.sin(tt * 0.8) * 1.2;
          rot = (-3 * Math.PI) / 180;
          break;
      }
      const groupSway = e.key === "capo" ? 0 : sway;
      const descend = w && !w.boss ? Math.min(9, (this.mixer.time - w.t0) * 0.2) : 0;
      e.mesh.position.set(e.home.x + groupSway + ix + j.x, e.home.y + enterY + iy + j.y - descend, 1);
      e.mesh.rotation.z = rot;
      e.mesh.scale.set(e.w * scale, e.h * scale, 1);
    }

    // ¿oleada limpia? → el stem vuelve a la mezcla
    if (w && !this.waveCleared && !anyAlive && this.clock > 1 && !this.ended) {
      if (this.enemies.length > 0 || w.boss) {
        this.waveCleared = true;
        this.ecoTimer = 3;
        if (!w.boss) {
          // el último villano suelta el instrumento robado: hay que atraparlo
          this.spawnItem(w.stem, this.lastKillPos.x, this.lastKillPos.y);
          this.addScore(500);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // fuego enemigo al pulso de la batería (tregua mientras corre el crawl)
    // dificultad SUBIDA: mucho más fuego enemigo al pulso de la batería
    if (beat && !this.ended && t > INTRO_SAFE) this.beatFireBudget += w?.boss ? 3.6 : 2.6;
    while (this.beatFireBudget >= 1 && !this.ended) {
      this.beatFireBudget -= 1;
      const shooters = this.enemies.filter((e) => e.alive && !e.retreating && e.dying === 0 && e.entering >= 1);
      if (!shooters.length) break;
      const e = shooters[Math.floor(Math.random() * shooters.length)];
      if (e.key === "capo") {
        // abanico de 7 «murmullos» dirigidos
        for (const a of [-1.1, -0.73, -0.36, 0, 0.36, 0.73, 1.1]) this.fireEnemy(e, true, a);
      } else {
        this.fireEnemy(e, Math.random() < 0.72, (Math.random() - 0.5) * 0.95);
      }
    }

    // ------ balas ------
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      if (b.mesh.position.y > H * 0.55) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      for (const e of this.enemies) {
        if (!e.alive || e.dying > 0 || e.retreating || e.entering < 0.6) continue;
        if (
          Math.abs(b.mesh.position.x - e.mesh.position.x) < e.w * 0.36 &&
          Math.abs(b.mesh.position.y - e.mesh.position.y) < e.h * 0.4
        ) {
          b.active = false;
          b.mesh.visible = false;
          this.hitEnemy(e);
          break;
        }
      }
    }
    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      if (Math.abs(b.mesh.position.y) > H * 0.56 || Math.abs(b.mesh.position.x) > this.W * 0.56) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      if (
        this.invuln <= 0 &&
        this.lives > 0 &&
        Math.hypot(b.mesh.position.x - this.pos.x, b.mesh.position.y - this.pos.y) < this.shipW * 0.22
      ) {
        b.active = false;
        b.mesh.visible = false;
        this.hitPlayer();
      }
    }

    // ------ mundo: asteriscos y planetas en deriva ------
    for (const d of this.drifters) {
      d.mesh.position.y -= d.vy * dt;
      d.mesh.rotation.z += d.vr * dt;
      if (d.mesh.position.y < -H * 0.56) {
        d.mesh.position.y = H * 0.56;
        d.mesh.position.x = (Math.random() - 0.5) * this.W;
      }
    }

    // ------ asteroides-obstáculo (tras el crawl de apertura) ------
    if (!this.ended && this.waveIdx >= 0 && t > INTRO_SAFE) {
      this.asteroidTimer -= dt;
      if (this.asteroidTimer <= 0 && this.asteroids.length < 7) {
        this.spawnAsteroid();
        this.asteroidTimer = 2 + Math.random() * 3; // más asteroides, más seguido
      }
    }
    for (const a of this.asteroids) {
      if (a.dying > 0) {
        a.dying += dt / 0.22;
        const k = Math.max(0, 1 - a.dying);
        a.mesh.scale.set(a.r * 2.2 * (1 + (1 - k) * 0.6), a.r * 2.2 * k, 1);
        a.mat.opacity = k;
        continue;
      }
      a.mesh.position.x += a.vx * dt;
      a.mesh.position.y += a.vy * dt;
      a.mesh.rotation.z += a.vr * dt;
      if (
        this.invuln <= 0 &&
        this.lives > 0 &&
        !this.ended &&
        Math.hypot(a.mesh.position.x - this.pos.x, a.mesh.position.y - this.pos.y) <
          a.r * 0.8 + this.shipW * 0.2
      ) {
        a.dying = 0.001;
        this.hitPlayer();
        continue;
      }
      for (const b of this.playerBullets) {
        if (!b.active) continue;
        if (Math.hypot(b.mesh.position.x - a.mesh.position.x, b.mesh.position.y - a.mesh.position.y) < a.r) {
          b.active = false;
          b.mesh.visible = false;
          a.hp -= 1;
          if (a.hp <= 0) {
            a.dying = 0.001;
            this.bumpStreak();
            this.addScore(25);
          }
          break;
        }
      }
    }
    this.asteroids = this.asteroids.filter((a) => {
      if (a.dying >= 1 || a.mesh.position.y < -H * 0.6) {
        this.removeAsteroid(a);
        return false;
      }
      return true;
    });

    // ------ instrumentos sueltos: caen, flotan y se atrapan con la nave ------
    for (const it of this.items) {
      if (!it.hover) {
        it.mesh.position.y -= 12 * dt;
        if (it.mesh.position.y <= -H * 0.28) it.hover = true;
      } else {
        it.mesh.position.y += Math.sin(this.clock * 1.6 + it.phase) * dt * 1.8;
      }
      it.mesh.rotation.z = Math.sin(this.clock * 0.9 + it.phase) * 0.14;
      if (
        this.lives > 0 &&
        Math.hypot(it.mesh.position.x - this.pos.x, it.mesh.position.y - this.pos.y) <
          this.shipW * 0.55 + 1.5
      ) {
        this.catchItem(it);
      }
    }
    this.items = this.items.filter((it) => it.mesh.parent !== null);
  }

  /** instrumento atrapado: puntos, spotlight musical y HUD; el mic cierra la victoria */
  private catchItem(it: Item) {
    this.removeItem(it);
    this.addScore(1000);
    this.mixer.spotlight(it.kind);
    this.cb.onStemRecovered(it.kind);
    if (it.kind === "voice") this.endGame("victory");
  }

  private hitEnemy(e: Enemy) {
    e.hp -= 1;
    const spec = VILLAINS[e.key];
    if (e.key === "capo") {
      this.addScore(15);
      this.cb.onBossHp(Math.max(0, e.hp / spec.hp));
    }
    if (e.hp <= 0) {
      e.dying = 0.001;
      this.bumpStreak();
      if (e.key === "capo") {
        this.bossDefeated = true;
        this.addScore(spec.score);
        this.cb.onBossHp(null);
        // CAPO suelta el mic al caer: atraparlo cierra la victoria
        this.spawnItem("voice", e.mesh.position.x, e.mesh.position.y);
      } else {
        this.addScore(spec.score);
        if (!e.eco) this.lastKillPos.set(e.mesh.position.x, e.mesh.position.y);
      }
    } else {
      // los trazos del grupo golpeado se des-dibujan y regresan con temblor
      e.regen = 0;
      e.raster.shake = 5;
      e.raster.drawTo(e.raster.total * 0.62);
    }
  }

  private hitPlayer() {
    this.lives -= 1;
    this.cb.onLives(this.lives);
    this.invuln = 1.3; // dificultad SUBIDA: menos invulnerabilidad tras el golpe
    this.shipRegen = 0;
    // NO se hace duck: al ser golpeada la nave, la música NO se apaga —
    // siempre suena firme, el show sigue sonando pase lo que pase.
    // el golpe rompe la racha: el multiplicador vuelve a ×1
    this.streak = 0;
    if (this.mult !== 1) {
      this.mult = 1;
      this.cb.onMult(1);
    }
    // la canción NUNCA se apaga: aunque te borren, el show sigue sonando
    if (this.lives <= 0) this.endGame("defeat");
  }

  /** cada baja sin recibir daño acerca el siguiente escalón del multiplicador (×1–×5) */
  private bumpStreak() {
    this.streak += 1;
    const m = Math.min(5, 1 + Math.floor(this.streak / 6));
    if (m !== this.mult) {
      this.mult = m;
      this.cb.onMult(m);
    }
  }

  private addScore(n: number) {
    this.score += n * this.mult;
    this.cb.onScore(this.score);
  }

  private endGame(result: EndResult) {
    if (this.ended) return;
    this.ended = true;
    this.firing = false;
    if (result === "defeat") {
      // la nave se des-dibuja: vuelve al cuaderno
      this.shipRegen = 1;
      this.entrance = 1;
      const undraw = () => {
        if (this.disposed) return;
        const p = this.shipRaster.progress - 0.03;
        this.shipRaster.drawTo(this.shipRaster.total * p);
        if (p > 0) requestAnimationFrame(undraw);
      };
      undraw();
    }
    if (result === "escape") {
      for (const e of this.enemies) e.retreating = true;
      this.cb.onBossHp(null);
    }
    this.cb.onEnd(result, this.score);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerup", this.onPointerUp);
    for (const e of this.enemies) this.removeEnemy(e);
    for (const f of this.flames) {
      this.scene.remove(f);
      f.geometry.dispose();
    }
    this.flameMat?.dispose();
    for (const b of [...this.playerBullets, ...this.enemyBullets]) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    for (const a of this.asteroids) this.removeAsteroid(a);
    for (const it of this.items) this.removeItem(it);
    for (const pu of this.powerups) this.removePowerup(pu);
    for (const tex of this.powerTex.values()) tex.dispose();
    if (this.shieldMesh) {
      this.scene.remove(this.shieldMesh);
      this.shieldMesh.geometry.dispose();
      (this.shieldMesh.material as THREE.Material).dispose();
    }
    for (const d of this.drifters) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    for (const t of this.propTextures) t.dispose();
    this.shipRaster?.dispose();
    this.dashTex?.dispose();
    this.enemyDashTex?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
