#!/usr/bin/env python3
"""
bake_envelopes.py — Pipeline de audio offline para "Vienen por mi" / Libreta.

Lee los stems crudos, calcula envelopes RMS (0..1) + onsets por instrumento,
estima beat grid (bpm + offset) desde la bateria, y exporta envelopes.json.
Tambien codifica mixdown.mp3 + mixdown.ogg desde mixdown.wav via ffmpeg.

En runtime el navegador SOLO reproduce el mixdown; la reactividad por
instrumento sale de estas curvas pre-bakeadas. Stems != audio que suena.

Uso:
    python scripts/bake_envelopes.py
"""
import json
import os
import subprocess
import sys

import numpy as np

try:
    import librosa
except ImportError:
    sys.exit("Falta librosa. Instala: pip install librosa soundfile")

# ---------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
# Tema a procesar (carpeta bajo audio_raw/ y bajo public/assets/songs/).
SONG = os.environ.get("SONG", "libreta")
# Fuente cruda (NO se publica). Editable via env por si la mueves.
RAW_DIR = os.environ.get("RAW_DIR", os.path.join(ROOT, "audio_raw", SONG))
STEMS_DIR = os.path.join(RAW_DIR, "stems")
MIXDOWN_WAV = os.path.join(RAW_DIR, "mixdown.wav")
# Salida publicada (ships): solo json + mp3/ogg.
SONG_DIR = os.path.join(ROOT, "public", "assets", "songs", SONG)
OUT_JSON = os.path.join(SONG_DIR, "envelopes.json")

HOP = 512                 # ~11.6 ms @ 44.1k
SR = 44100

# Stems esperados (algunos opcionales). El pipeline sigue si faltan.
STEMS = {
    "kick":   "kick.wav",
    "snare":  "snare.wav",
    "hihat":  "hihat.wav",
    "bass":   "bass.wav",
    "guitar": "guitar.wav",
    "vocals": "vocals.wav",
}
# Stems usados para detectar el beat grid (percusivos), en orden de preferencia.
BEAT_SOURCES = ["kick", "snare", "hihat"]


def smooth(x, k=3):
    """Suavizado leve (media movil) para que el envelope no titile."""
    if k <= 1:
        return x
    kern = np.ones(k) / k
    return np.convolve(x, kern, mode="same")


def process_stem(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    # Envelope RMS por hop fijo
    rms = librosa.feature.rms(y=y, hop_length=HOP, frame_length=HOP * 4)[0]
    rms = smooth(rms, 3)
    peak = float(rms.max()) if rms.size else 0.0
    env = (rms / peak) if peak > 0 else rms
    env = np.clip(env, 0.0, 1.0)
    # Onsets (tiempos en s)
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=SR, hop_length=HOP, backtrack=True, units="frames"
    )
    onsets = librosa.frames_to_time(onset_frames, sr=SR, hop_length=HOP)
    return env.astype(np.float32), onsets.astype(np.float32), float(len(y) / SR)


def round_list(arr, nd=4):
    return [round(float(v), nd) for v in arr]


def main():
    if not os.path.isdir(STEMS_DIR):
        sys.exit(f"No existe carpeta de stems: {STEMS_DIR}")

    instruments = {}
    durations = []
    beat_grid_source = None
    onset_envelopes = {}  # name -> (env, onsets, dur)

    print(f"Stems dir: {STEMS_DIR}\n")
    for name, fname in STEMS.items():
        p = os.path.join(STEMS_DIR, fname)
        if not os.path.isfile(p):
            print(f"  [skip] {name:7s} (no encontrado: {fname})")
            continue
        env, onsets, dur = process_stem(p)
        onset_envelopes[name] = (env, onsets, dur)
        durations.append(dur)
        instruments[name] = {
            "envelope": round_list(env, 4),
            "onsets": round_list(onsets, 4),
        }
        print(f"  [ok]   {name:7s} frames={len(env):5d} onsets={len(onsets):4d} dur={dur:6.2f}s")

    if not instruments:
        sys.exit("No se proceso ningun stem.")

    # ----- Beat grid desde el mejor stem percusivo disponible -----
    for cand in BEAT_SOURCES:
        if cand in onset_envelopes:
            beat_grid_source = cand
            break
    if beat_grid_source is None:
        beat_grid_source = next(iter(onset_envelopes))

    y_beat, _ = librosa.load(os.path.join(STEMS_DIR, STEMS[beat_grid_source]), sr=SR, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y_beat, sr=SR, hop_length=HOP)
    bpm = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beats, sr=SR, hop_length=HOP)
    beat_offset = float(beat_times[0]) if len(beat_times) else 0.0

    # Duracion de referencia = mixdown si existe, si no el minimo de stems.
    if os.path.isfile(MIXDOWN_WAV):
        duration = float(librosa.get_duration(path=MIXDOWN_WAV))
    else:
        duration = float(min(durations))

    out = {
        "song": SONG,
        "bpm": round(bpm, 3),
        "beatOffset": round(beat_offset, 4),
        "duration": round(duration, 3),
        "hop": round(HOP / SR, 6),
        "beatGridSource": beat_grid_source,
        "instruments": instruments,
    }

    os.makedirs(SONG_DIR, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_JSON) / 1024
    print(f"\n  envelopes.json -> {OUT_JSON}  ({size_kb:.0f} KB)")
    print(f"  bpm={bpm:.2f}  beatOffset={beat_offset:.3f}s  duration={duration:.2f}s  source={beat_grid_source}")

    # ----- Encode mixdown a mp3 + ogg -----
    if os.path.isfile(MIXDOWN_WAV):
        for ext, args in (
            ("mp3", ["-codec:a", "libmp3lame", "-b:a", "192k"]),
            ("ogg", ["-codec:a", "libvorbis", "-q:a", "5"]),
        ):
            outp = os.path.join(SONG_DIR, f"mixdown.{ext}")
            cmd = ["ffmpeg", "-y", "-i", MIXDOWN_WAV, *args, outp]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                print(f"  mixdown.{ext} -> {os.path.getsize(outp)/1024/1024:.1f} MB")
            else:
                print(f"  [warn] no pude codificar mixdown.{ext}:\n{r.stderr[-500:]}")
    else:
        print(f"  [warn] no hay mixdown.wav en {RAW_DIR}; no se codifico mp3/ogg")


if __name__ == "__main__":
    main()