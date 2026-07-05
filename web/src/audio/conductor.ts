// conductor.ts — El "reloj musical" de la experiencia.
//
// Contrato de audio (no romper):
//  - En el navegador suena UN SOLO archivo: el mixdown.
//  - Los stems NO se reproducen; se analizaron offline -> envelopes.json.
//  - La reactividad por instrumento sale de esas curvas pre-bakeadas.
//
// El conductor mantiene UN unico AudioBufferSourceNode (sample-accurate) y,
// cada frame, expone energy/onsets/fases derivados de `ctx.currentTime`.
// Nada se anima contra el reloj del render -> cero drift.

import type { InstrumentName } from "../config/song";

export interface Envelopes {
  song: string;
  bpm: number;
  beatOffset: number;
  duration: number;
  hop: number;
  beatGridSource: string;
  instruments: Record<
    InstrumentName,
    { envelope: number[]; onsets: number[] }
  >;
}

export type EnergyMap = Record<InstrumentName, number>;

export interface Frame {
  /** segundos transcurridos del tema (clamp 0..duration) */
  t: number;
  /** 0..1 dentro del beat actual */
  beatPhase: number;
  /** 0..1 dentro del compas (4 beats) */
  barPhase: number;
  /** energia continua 0..1 por instrumento (RMS bakeado) */
  energy: EnergyMap;
  /** impulso de onset 0..1 con decay por instrumento (golpe) */
  pulse: EnergyMap;
  /** true SOLO en el frame en que cruzo un onset */
  hit: Record<InstrumentName, boolean>;
  playing: boolean;
  paused: boolean;
  ended: boolean;
}

const INSTRUMENTS: InstrumentName[] = [
  "kick",
  "snare",
  "hihat",
  "bass",
  "guitar",
  "vocals",
];

const zeroMap = (): EnergyMap => ({
  kick: 0,
  snare: 0,
  hihat: 0,
  bass: 0,
  guitar: 0,
  vocals: 0,
});

const falseMap = () => ({
  kick: false,
  snare: false,
  hihat: false,
  bass: false,
  guitar: false,
  vocals: false,
});

// Velocidad de decay del impulso de onset (1/seg). Mas alto = golpe mas seco.
const PULSE_DECAY: Record<InstrumentName, number> = {
  kick: 9,
  snare: 11,
  hihat: 16,
  bass: 7,
  guitar: 8,
  vocals: 5,
};

export class Conductor {
  ctx: AudioContext | null = null;
  buffer: AudioBuffer | null = null;
  env: Envelopes | null = null;

  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  // Analizador FFT conectado al mixdown (para visuales reactivos al audio real).
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private startTime = 0;
  private _playing = false;
  private _paused = false;
  /** pausa provocada por el navegador (cambio de pestana/app), no por el usuario */
  private _autoPaused = false;
  /** posicion congelada (seg) mientras esta en pausa */
  private pausedT = 0;
  private _ended = false;
  private _volume = 1;
  private lifecycleAttached = false;
  /** impulso de interaccion del usuario (tap) con decay; lo leen luces/bloom */
  userPulse = 0;

  // estado de onsets: indice + tiempo del ultimo golpe por instrumento
  private onsetIdx: Record<InstrumentName, number> = {
    kick: 0,
    snare: 0,
    hihat: 0,
    bass: 0,
    guitar: 0,
    vocals: 0,
  };
  private lastHitT: Record<InstrumentName, number> = {
    kick: -10,
    snare: -10,
    hihat: -10,
    bass: -10,
    guitar: -10,
    vocals: -10,
  };

  // El frame mutable que leen los componentes en useFrame (sin re-render).
  readonly frame: Frame = {
    t: 0,
    beatPhase: 0,
    barPhase: 0,
    energy: zeroMap(),
    pulse: zeroMap(),
    hit: falseMap(),
    playing: false,
    paused: false,
    ended: false,
  };

  get duration() {
    return this.env?.duration ?? this.buffer?.duration ?? 0;
  }
  get isPlaying() {
    return this._playing;
  }
  get isPaused() {
    return this._paused;
  }

  /** Carga envelopes + decodifica mixdown a AudioBuffer. Idempotente. */
  async load(envUrl: string, audioUrls: { mp3: string; ogg: string }) {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AC();
    }
    const [envRes, audioBuf] = await Promise.all([
      fetch(envUrl).then((r) => {
        if (!r.ok) throw new Error(`envelopes.json: ${r.status}`);
        return r.json() as Promise<Envelopes>;
      }),
      this.fetchBestAudio(audioUrls),
    ]);
    this.env = envRes;
    this.buffer = await this.ctx.decodeAudioData(audioBuf);
  }

  private async fetchBestAudio(urls: {
    mp3: string;
    ogg: string;
  }): Promise<ArrayBuffer> {
    const a = document.createElement("audio");
    const canOgg = a.canPlayType('audio/ogg; codecs="vorbis"');
    const order = canOgg ? [urls.ogg, urls.mp3] : [urls.mp3, urls.ogg];
    let lastErr: unknown;
    for (const u of order) {
      try {
        const r = await fetch(u);
        if (r.ok) return await r.arrayBuffer();
        lastErr = new Error(`${u}: ${r.status}`);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("No se pudo cargar el audio");
  }

  /** Arranca el audio (requiere gesto del usuario por autoplay policy). */
  async start() {
    if (!this.ctx || !this.buffer) throw new Error("Conductor sin cargar");
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._paused = false;
    this._autoPaused = false;
    this.frame.paused = false;
    this.initLifecycle();
    this.spawnSource(0);
  }

  /**
   * Pausa preservando la posicion. `auto` = la disparo el navegador al ocultar
   * la pestana (no el usuario), para poder reanudar solo en ese caso al volver.
   */
  pause(auto = false) {
    if (!this._playing || this._paused) return;
    const t =
      this.ctx && this._playing ? this.ctx.currentTime - this.startTime : this.frame.t;
    this.pausedT = Math.max(0, Math.min(t, this.duration));
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* noop */
      }
      this.source.disconnect();
      this.source = null;
    }
    this._playing = false;
    this._paused = true;
    this._autoPaused = auto;
    this.frame.t = this.pausedT;
    this.frame.playing = false;
    this.frame.paused = true;
  }

  /** Reanuda desde la posicion congelada (recrea el source, recupera el ctx). */
  async resume() {
    if (!this._paused || !this.ctx || !this.buffer) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._paused = false;
    this._autoPaused = false;
    this.frame.paused = false;
    this.spawnSource(this.pausedT);
  }

  /** Alterna play/pausa (boton del HUD). */
  async toggle() {
    if (this._paused) await this.resume();
    else this.pause(false);
  }

  /** Marca un impulso de interaccion del usuario (tap en la escena). */
  tap() {
    this.userPulse = 1;
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  /**
   * Soluciona el "se queda en pausa al volver" en movil: al ocultar la pestana
   * (cambiar de app) el SO suspende el AudioContext; al volver hay que pausar y
   * reanudar recreando el source para no perder sincronia ni quedar congelado.
   */
  private initLifecycle() {
    if (this.lifecycleAttached || typeof document === "undefined") return;
    this.lifecycleAttached = true;

    const onHide = () => {
      if (this._playing && !this._paused) this.pause(true);
    };
    const onShow = () => {
      if (this._paused && this._autoPaused) {
        void this.resume();
      } else if (this.ctx && this.ctx.state === "suspended" && this._playing) {
        void this.ctx.resume();
      }
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
      else onShow();
    });
    // iOS Safari no siempre dispara visibilitychange al hacer back/forward.
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    // Si el SO suspende el contexto por su cuenta, intenta recuperarlo al tocar.
    if (this.ctx) {
      this.ctx.addEventListener?.("statechange", () => {
        if (
          this.ctx?.state === "suspended" &&
          this._playing &&
          document.visibilityState === "visible"
        ) {
          void this.ctx.resume();
        }
      });
    }
  }

  /** (Re)crea el AudioBufferSourceNode reproduciendo desde `offset` seg. */
  private spawnSource(offset: number) {
    if (!this.ctx || !this.buffer) return;
    if (!this.gain) {
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this._volume;
      // gain -> analyser -> destination (el analyser "escucha" el mixdown)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    // matar el source anterior sin marcar "ended"
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* noop */
      }
      this.source.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.onended = () => {
      this._playing = false;
      this._ended = true;
    };
    const off = Math.max(0, Math.min(offset, this.duration - 0.05));
    src.start(0, off);
    this.source = src;
    this.startTime = this.ctx.currentTime - off;
    this._playing = true;
    this._paused = false;
    this._autoPaused = false;
    this._ended = false;
    this.frame.paused = false;
    this.resetOnsetPointers(off);
  }

  /** Salta a `to` segundos (adelantar/atrasar) sin perder sincronia. */
  async seek(to: number) {
    if (!this.ctx || !this.buffer) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.spawnSource(to);
  }

  /** Atajo: avanzar/retroceder relativo a la posicion actual. */
  async skip(delta: number) {
    await this.seek(this.frame.t + delta);
  }

  stop() {
    try {
      if (this.source) this.source.onended = null;
      this.source?.stop();
    } catch {
      /* noop */
    }
    this._playing = false;
  }

  /** Detiene y deja el tema al inicio (volver a INICIO). */
  reset() {
    this.stop();
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* noop */
      }
      this.source = null;
    }
    this._paused = false;
    this._autoPaused = false;
    this._ended = false;
    this.pausedT = 0;
    this.frame.t = 0;
    this.frame.playing = false;
    this.frame.paused = false;
    this.frame.ended = false;
    this.resetOnsetPointers(0);
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.04);
    }
  }

  get volume() {
    return this._volume;
  }

  /** Nivel medio del espectro del mixdown (0..1) para visuales reactivos. */
  audioLevel(): number {
    if (!this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0;
    for (let i = 0; i < this.freqData.length; i++) sum += this.freqData[i];
    return sum / this.freqData.length / 255;
  }

  private resetOnsetPointers(from = 0) {
    for (const n of INSTRUMENTS) {
      const onsets = this.env?.instruments[n]?.onsets;
      let idx = 0;
      let last = -10;
      if (onsets) {
        while (idx < onsets.length && onsets[idx] <= from) {
          last = onsets[idx];
          idx++;
        }
      }
      this.onsetIdx[n] = idx;
      this.lastHitT[n] = last;
    }
  }

  private envAt(name: InstrumentName, idx: number): number {
    const arr = this.env?.instruments[name]?.envelope;
    if (!arr || arr.length === 0) return 0;
    if (idx < 0) return 0;
    if (idx >= arr.length) return 0;
    return arr[idx];
  }

  /** Llamar cada frame ANTES de leer `frame`. */
  update() {
    const f = this.frame;
    // reset de flags de hit
    f.hit.kick = f.hit.snare = f.hit.hihat = false;
    f.hit.bass = f.hit.guitar = f.hit.vocals = false;

    // decay del impulso de interaccion del usuario (independiente de play/pausa)
    if (this.userPulse > 0.001) this.userPulse *= 0.9;
    else this.userPulse = 0;

    if (!this.ctx || !this.env || !this._playing) {
      f.playing = this._playing;
      f.paused = this._paused;
      f.ended = this._ended;
      return;
    }

    const { bpm, beatOffset, hop, duration } = this.env;
    let t = this.ctx.currentTime - this.startTime;
    if (t < 0) t = 0;
    if (t > duration) t = duration;
    f.t = t;

    const beatDur = 60 / bpm;
    const sinceOffset = t - beatOffset;
    f.beatPhase = wrap01(sinceOffset / beatDur);
    f.barPhase = wrap01(sinceOffset / (beatDur * 4));

    const idx = Math.floor(t / hop);
    for (const n of INSTRUMENTS) {
      // energia continua
      f.energy[n] = this.envAt(n, idx);

      // onsets: avanzar puntero y marcar golpes cruzados este frame
      const onsets = this.env.instruments[n]?.onsets;
      if (onsets && onsets.length) {
        let i = this.onsetIdx[n];
        let crossed = false;
        while (i < onsets.length && onsets[i] <= t) {
          crossed = true;
          this.lastHitT[n] = onsets[i];
          i++;
        }
        this.onsetIdx[n] = i;
        if (crossed) f.hit[n] = true;
      }

      // impulso con decay exponencial desde el ultimo golpe
      const dt = t - this.lastHitT[n];
      f.pulse[n] = dt >= 0 ? Math.exp(-dt * PULSE_DECAY[n]) : 0;
    }

    f.playing = this._playing;
    f.paused = this._paused;
    f.ended = this._ended;
  }
}

function wrap01(x: number): number {
  const v = x % 1;
  return v < 0 ? v + 1 : v;
}

// Singleton compartido por toda la app.
export const conductor = new Conductor();
