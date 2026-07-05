#!/usr/bin/env python3
"""
process-orgullo-assets.py — Adapta los assets reales del mundo «Orgullo»
(audio_raw/orgullo/new assets mundo orgullo/) a PNGs limpios con fondo
transparente en public/assets/orgullo/:

  LUNA.HEIC            → luna.png        (sticker Méliès recortado del fondo)
  NUBE DIA 1.PNG       → nube-dia-1.png  (ya trae alfa: autocrop + resize)
  NUBE DIA 2.PNG       → nube-dia-2.png  (JPEG fondo blanco → recorte)
  NUBE NOCHE  1.JPG    → nube-noche-1.png (checkerboard falso → recorte)
  NUBE NOCHE 2.JPG     → nube-noche-2.png (checkerboard falso → recorte)

Método: máscara por umbral → componente conexa mayor → relleno de huecos
(las figuras son cerradas) → erosión leve + pluma en el borde.

Uso: /root/.venvs/audio/bin/python scripts/process-orgullo-assets.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from pillow_heif import register_heif_opener

register_heif_opener()

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SRC = os.path.join(ROOT, "audio_raw", "orgullo", "new assets mundo orgullo")
OUT = os.path.join(ROOT, "public", "assets", "orgullo")
os.makedirs(OUT, exist_ok=True)


def biggest_filled(mask: np.ndarray) -> np.ndarray:
    """componente conexa mayor + huecos rellenos"""
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    big = lab == (int(np.argmax(sizes)) + 1)
    return ndimage.binary_fill_holes(big)


def finish(rgb: np.ndarray, mask: np.ndarray, erode: int, feather: float, max_w: int, name: str):
    """erosión + pluma, autocrop y resize; guarda PNG optimizado"""
    m = mask
    if erode > 0:
        m = ndimage.binary_erosion(m, iterations=erode)
    alpha = Image.fromarray((m * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(feather)
    )
    a = np.array(alpha)
    img = Image.merge(
        "RGBA",
        (*Image.fromarray(rgb).split(), Image.fromarray(a)),
    )
    # autocrop al contenido con margen
    ys, xs = np.where(a > 8)
    pad = 6
    box = (
        max(0, xs.min() - pad), max(0, ys.min() - pad),
        min(img.width, xs.max() + pad), min(img.height, ys.max() + pad),
    )
    img = img.crop(box)
    if img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, optimize=True)
    print(f"  {name}: {img.width}x{img.height} ({os.path.getsize(path)//1024} KB)")


def luna():
    im = Image.open(os.path.join(SRC, "LUNA.HEIC")).convert("RGB")
    im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)  # sobra resolución
    rgb = np.array(im)
    lum = rgb.mean(axis=2)
    # el sticker tiene borde de papel BLANCO sobre fondo gris rayado:
    # umbral alto → borde+cuerpo claros; el cañón/cara oscuros quedan
    # como huecos que el fill_holes cierra
    # apertura: corta los puentes finos hacia las vetas claras de la madera
    mask = biggest_filled(ndimage.binary_opening(lum > 178, iterations=4))
    finish(rgb, mask, erode=2, feather=1.6, max_w=420, name="luna.png")


def nube_dia_1():
    # OJO: el PNG dice tener alfa pero es 255 en todas partes y trae un
    # checkerboard falso horneado → recorte por luminancia (nube gris
    # sobre cuadros claros), como las nocturnas
    im = Image.open(os.path.join(SRC, "NUBE DIA 1.PNG")).convert("RGBA")
    rgb = np.array(im.convert("RGB"))
    a = np.array(im.split()[3])
    if a.min() > 200:
        lum = rgb.mean(axis=2)
        mask = biggest_filled(ndimage.binary_opening(lum < 226, iterations=2))
    else:
        mask = a > 24
    finish(rgb, mask, erode=1, feather=1.2, max_w=720, name="nube-dia-1.png")


def nube_dia_2():
    im = Image.open(os.path.join(SRC, "NUBE DIA 2.PNG")).convert("RGB")
    rgb = np.array(im)
    # fondo blanco puro; la nube (blanca con sombras azules) es cerrada
    dist = 255 - rgb.min(axis=2).astype(int)  # distancia a blanco
    mask = biggest_filled(dist > 10)
    finish(rgb, mask, erode=1, feather=1.2, max_w=720, name="nube-dia-2.png")


def nube_noche(src: str, name: str):
    im = Image.open(os.path.join(SRC, src)).convert("RGB")
    rgb = np.array(im)
    # checkerboard falso (grises claros ~200/230): la nube es oscura/púrpura;
    # su brillo interior queda como hueco → fill_holes
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2).astype(int) - rgb.min(axis=2).astype(int)
    mask = biggest_filled((lum < 185) | (sat > 26))
    finish(rgb, mask, erode=2, feather=1.4, max_w=640, name=name)


print(">> procesando assets del mundo orgullo…")
luna()
nube_dia_1()
nube_dia_2()
nube_noche("NUBE NOCHE  1.JPG.jpeg", "nube-noche-1.png")
nube_noche("NUBE NOCHE 2.JPG.jpeg", "nube-noche-2.png")
print(">> listo → public/assets/orgullo/")
