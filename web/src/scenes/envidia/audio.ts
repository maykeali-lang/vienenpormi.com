// Mezcla de «envidia 2026»: LA CANCIÓN SIEMPRE SUENA COMPLETA — los villanos
// robaron los INSTRUMENTOS físicos de la banda (batería, bajo, guitarra, mic),
// no el sonido. Los 4 stems suenan a pleno desde el segundo 0; al recuperar
// un instrumento su stem recibe un «spotlight» breve como celebración.
// 4 <audio> sincronizados vía WebAudio: source → gain → master.
// El reloj maestro es la batería; el resto se corrige por drift.

export type StemName = "bass" | "drum" | "guitar" | "voice";
export const STEMS: StemName[] = ["bass", "drum", "guitar", "voice"];

interface Stem {
  el: HTMLAudioElement;
  src: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class StemMixer {
  readonly ctx: AudioContext;
  private master: GainNode;
  private masterAnalyser: AnalyserNode;
  private drumAnalyser: AnalyserNode; // pulso del juego: la batería manda
  private stems = new Map<StemName, Stem>();
  private buf: Uint8Array<ArrayBuffer>;
  private drumBuf: Uint8Array<ArrayBuffer>;
  private sfx: GainNode; // efectos (láser) fuera del master: no ensucian energy()
  onEnded: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.22; // muy por debajo de la música
    this.sfx.connect(this.ctx.destination);
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.drumAnalyser = this.ctx.createAnalyser();
    this.drumAnalyser.fftSize = 512;
    this.master.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.buf = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.drumBuf = new Uint8Array(this.drumAnalyser.frequencyBinCount);
  }

  async load(base: string): Promise<void> {
    const jobs = STEMS.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const el = new Audio();
          el.src = `${base}/${name}.mp3`;
          el.preload = "auto";
          el.crossOrigin = "anonymous";
          const src = this.ctx.createMediaElementSource(el);
          const gain = this.ctx.createGain();
          gain.gain.value = 1;
          src.connect(gain);
          gain.connect(this.master);
          if (name === "drum") src.connect(this.drumAnalyser);
          this.stems.set(name, { el, src, gain });
          el.addEventListener("canplaythrough", () => resolve(), { once: true });
          el.addEventListener("error", () => reject(new Error(`Couldn't load the "${name}" stem`)), {
            once: true,
          });
          el.load();
        }),
    );
    await Promise.all(jobs);
    this.stems.get("drum")!.el.addEventListener("ended", () => this.onEnded?.());
  }

  /** Modo mixdown único: la canción no tiene stems separados (p.ej. «libreta»),
   *  así que suena una sola pista. Se registra como el stem «drum» (el reloj
   *  maestro) y alimenta tanto el analizador de mezcla como el de pulso, de
   *  modo que el juego late con toda la canción. spotlight()/syncTick() sobre
   *  los otros instrumentos quedan como no-ops (mecánica cosmética). */
  async loadMix(url: string): Promise<void> {
    const el = new Audio();
    el.src = url;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain);
    gain.connect(this.master);
    src.connect(this.drumAnalyser); // el pulso sale de la mezcla completa
    this.stems.set("drum", { el, src, gain });
    await new Promise<void>((resolve, reject) => {
      el.addEventListener("canplaythrough", () => resolve(), { once: true });
      el.addEventListener("error", () => reject(new Error("Couldn't load the libreta mix")), {
        once: true,
      });
      el.load();
    });
    el.addEventListener("ended", () => this.onEnded?.());
  }

  async start() {
    await this.ctx.resume();
    await Promise.all([...this.stems.values()].map((s) => s.el.play()));
  }

  get time(): number {
    return this.stems.get("drum")?.el.currentTime ?? 0;
  }
  get duration(): number {
    return this.stems.get("drum")?.el.duration ?? 0;
  }

  /** pew de láser sintetizado para el disparo de la nave: barrido descendente
   *  corto a poco volumen — nunca debe saturar la música */
  laser() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(900 + Math.random() * 140, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 0.11);
    g.gain.setValueAtTime(0.055, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.12);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.13);
  }

  /** instrumento recuperado: su stem brilla un momento sobre la mezcla */
  spotlight(name: StemName, seconds = 1.6) {
    const s = this.stems.get(name);
    if (!s) return;
    const t = this.ctx.currentTime;
    const g = s.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1.45, t + 0.15);
    g.linearRampToValueAtTime(1, t + seconds);
  }

  /** golpe al jugador: la mezcla se hunde un instante (pero nunca se apaga) */
  duck(seconds = 0.8) {
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.35, t + 0.06);
    g.linearRampToValueAtTime(0.9, t + seconds);
  }

  setPaused(p: boolean) {
    for (const s of this.stems.values()) {
      if (p) s.el.pause();
      else void s.el.play();
    }
  }

  /** RMS 0..1 de la mezcla */
  energy(): number {
    this.masterAnalyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 2.2);
  }

  /** RMS 0..1 de la batería (para detectar beats) */
  drumEnergy(): number {
    this.drumAnalyser.getByteTimeDomainData(this.drumBuf);
    let sum = 0;
    for (let i = 0; i < this.drumBuf.length; i++) {
      const v = (this.drumBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.drumBuf.length) * 2.2);
  }

  /** corrige drift entre stems contra el reloj de la batería (llamar ~cada 2 s) */
  syncTick() {
    const master = this.stems.get("drum")!.el;
    if (master.paused) return;
    for (const [name, s] of this.stems) {
      if (name === "drum") continue;
      const d = s.el.currentTime - master.currentTime;
      if (Math.abs(d) > 0.08) s.el.currentTime = master.currentTime;
    }
  }

  dispose() {
    for (const s of this.stems.values()) {
      s.el.pause();
      s.el.src = "";
    }
    void this.ctx.close();
  }
}
