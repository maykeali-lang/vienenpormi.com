#!/usr/bin/env python3
"""
analyze-orgullo.py — Fase 1 de la escena «Orgullo» (barquito papercraft).

Lee el master REMASTERIZADO (orgullo.wav) + los 4 stems, codifica
mixdown.mp3/ogg con ffmpeg y emite orgullo.analysis.json con:
  - bpm + beats[] (beat grid, s)     -> cabeceo del barco
  - duration (s)
  - hop (s) + energy[] (RMS 0..1)    -> oleaje / inflado de vela
  - sections[]                       -> niveles de orgullo por estribillo
  - stems{drums,bass,guitar,voice}   -> env[] RMS 0..1 + onsets[[t,fuerza]]
       (los stems NO se publican como audio: solo sus curvas van al JSON;
        relámpagos=batería, oleaje=bajo, viento/vela=guitarra, ballena=voz)

Las secciones salen de los timestamps de la letra que entregó la banda
("orgullo letra.txt"); el remaster 2026 está alineado con ellos
(REMASTER_OFFSET queda para masters futuros desplazados).

Uso:  /root/.venvs/audio/bin/python scripts/analyze-orgullo.py
"""
import json
import os
import subprocess

import numpy as np
import librosa

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SONG_DIR = os.path.join(ROOT, "public", "assets", "songs", "orgullo")
RAW = os.path.join(ROOT, "audio_raw", "orgullo")
# master crudo (NO se publica; vive fuera de public/)
WAV = os.path.join(RAW, "orgullo.wav")
STEMS = {
    "drums": os.path.join(RAW, "stem-drums.wav"),
    "bass": os.path.join(RAW, "stem-bass.wav"),
    "guitar": os.path.join(RAW, "stem-guitar.wav"),
    "voice": os.path.join(RAW, "stem-voice.wav"),
}
OUT_JSON = os.path.join(SONG_DIR, "orgullo.analysis.json")

SR = 44100
HOP = 1024  # ~23 ms @ 44.1k

# El remaster 2026 va +1.2 s respecto a los timestamps autorados (confirmado
# a oído: «ya no aguanto…» se canta en 0:17 = t16+1.2; y por onsets de voz
# 17.0/112.1/190.4). El primer onset del stem de voz (15.86) es un pickup,
# NO el arranque de la frase — no calibrar contra él.
REMASTER_OFFSET = 1.2

# Secciones en TIEMPO DEL MASTER VIEJO (se les suma el offset al exportar).
# Cada "estribillo" dispara un nivel de orgullo del barco.
SECTIONS = [
    {"t": 0.0,   "type": "intro"},
    {"t": 16.0,  "type": "verso"},       # 00:16 «ya no aguanto la presión»
    {"t": 30.0,  "type": "estribillo"},  # 00:30 «ya... no estaré»
    {"t": 60.0,  "type": "puente"},      # tras «orgullo» (00:55)
    {"t": 73.0,  "type": "verso"},       # 01:13 verso II
    {"t": 90.0,  "type": "estribillo"},  # 01:30 coro II
    {"t": 120.0, "type": "puente"},      # solo instrumental (aquí anochece)
    {"t": 189.0, "type": "estribillo"},  # 03:09 coro final
]


def encode(src: str, dst: str, args: list[str]) -> None:
    if os.path.exists(dst):
        os.remove(dst)  # remaster: siempre re-encodear
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, *args, dst],
        check=True,
        capture_output=True,
    )
    print(f"   ok {os.path.basename(dst)}")


def rms_env(y: np.ndarray) -> np.ndarray:
    """RMS suavizado y comprimido (sqrt) a 0..1."""
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    kernel = np.hanning(9)
    kernel /= kernel.sum()
    rms = np.convolve(rms, kernel, mode="same")
    rms = np.sqrt(rms / max(rms.max(), 1e-9))
    return np.clip(rms, 0.0, 1.0)


def stem_onsets(y: np.ndarray) -> list[list[float]]:
    """Onsets del stem como [t, fuerza 0..1] (fuerza = pico de onset_strength)."""
    strength = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    frames = librosa.onset.onset_detect(
        onset_envelope=strength, sr=SR, hop_length=HOP, backtrack=False,
    )
    if len(frames) == 0:
        return []
    peak = float(np.percentile(strength[frames], 96)) or 1.0
    times = librosa.frames_to_time(frames, sr=SR, hop_length=HOP)
    out = []
    for fr, t in zip(frames, times):
        k = float(np.clip(strength[fr] / peak, 0.0, 1.0))
        if k >= 0.12:  # descarta roces inaudibles
            out.append([round(float(t), 3), round(k, 2)])
    return out


def main() -> None:
    print(">> codificando mixdown (remaster 2026)…")
    encode(WAV, os.path.join(SONG_DIR, "mixdown.mp3"), ["-codec:a", "libmp3lame", "-q:a", "2"])
    encode(WAV, os.path.join(SONG_DIR, "mixdown.ogg"), ["-codec:a", "libvorbis", "-q:a", "5"])

    print(">> cargando master…")
    y, sr = librosa.load(WAV, sr=SR, mono=True)
    duration = float(len(y) / sr)

    print(">> beat grid…")
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP)
    beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP)
    bpm = float(np.atleast_1d(tempo)[0])

    print(">> envelope RMS del mix…")
    energy = rms_env(y)

    print(">> stems…")
    stems = {}
    for name, path in STEMS.items():
        ys, _ = librosa.load(path, sr=SR, mono=True)
        env = rms_env(ys)
        onsets = stem_onsets(ys)
        stems[name] = {
            "env": [round(float(v), 3) for v in env],
            "onsets": onsets,
        }
        print(f"   {name}: frames={len(env)} onsets={len(onsets)}")

    # secciones al tiempo del remaster; recorte de las que caen fuera
    sections = [
        {"t": round(s["t"] + (REMASTER_OFFSET if s["t"] > 0 else 0.0), 2), "type": s["type"]}
        for s in SECTIONS
        if s["t"] + REMASTER_OFFSET < duration
    ]

    data = {
        "bpm": round(bpm, 2),
        "duration": round(duration, 3),
        "hop": round(HOP / sr, 6),
        "beats": [round(float(t), 3) for t in beats],
        "energy": [round(float(v), 3) for v in energy],
        "sections": sections,
        "stems": stems,
    }
    with open(OUT_JSON, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    size = os.path.getsize(OUT_JSON) // 1024
    print(
        f">> {os.path.basename(OUT_JSON)}: bpm={data['bpm']} dur={duration:.1f}s "
        f"beats={len(beats)} frames={len(energy)} sections={len(sections)} ({size} KB)"
    )


if __name__ == "__main__":
    main()
