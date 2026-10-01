"""
Mr. Pilo · los cuadros de su cara, a partir de las imágenes aprobadas.

Lee los PNG autorizados de public/pilo-moods (Recurso 11 a 18 y 32) y escribe
en public/pilo-face lo que anima PiloFace.tsx. No redibuja nada: cada cuadro es
la imagen base (Recurso 12) con la zona que cambia tomada de otra imagen
aprobada, unida con un borde fundido de pocos píxeles.

  open / closed / tongue   el pico: cuadros completos, se muestra uno a la vez
  eyes / wink              parches transparentes: ojos cerrados y guiño
  plate / pupils / white   para que la mirada siga al puntero: el blanco del ojo
                           sin pupila, las pupilas sueltas y la máscara que las
                           recorta al blanco del ojo
  pensar / graduado / obra poses de una sola imagen

También rehace los .webp cuadrados que usan el lienzo de la presentación y el
lanzador (public/pilo-moods/<gesto>-160|320.webp, public/pilo-96|192|384.webp).

Recurso 11 (pico cerrado) no calza con las demás ni desplazándola: por eso solo
se toma de ella la zona del pico.

Uso:  python scripts/pilo-face.py        (requiere Pillow)
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
SRC = os.path.join(ROOT, "pilo-moods")
OUT = os.path.join(ROOT, "pilo-face")
W, H = 450, 631


def load(n, dx=0):
    """Una imagen aprobada sobre el lienzo común de 450 × 631."""
    im = Image.open(os.path.join(SRC, f"Recurso {n}.png")).convert("RGBA")
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(im, (dx, 0))
    return out


BASE = load(12)


def diff_mask(a, box, threshold=40):
    """Dónde difiere `a` de la base, dentro de `box`."""
    d = ImageChops.difference(a, BASE).convert("L").point(lambda v: 255 if v > threshold else 0)
    m = Image.new("L", (W, H), 0)
    m.paste(d.crop(box), box[:2])
    return m


def grow(m, dilate, close, feather):
    m = m.filter(ImageFilter.MinFilter(3))  # fuera las líneas de registro de 1 px
    m = m.filter(ImageFilter.MaxFilter(dilate))  # margen alrededor de lo que cambia de verdad
    m = m.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))  # sin huecos
    return m.filter(ImageFilter.GaussianBlur(feather))


def frame(a, mask):
    """La base con la zona de `mask` tomada de `a`, transparencia incluida."""
    out = BASE.copy()
    out.paste(a, (0, 0), mask)
    return out


def patch(a, mask):
    """Solo la zona de `mask` de `a`; lo demás, transparente."""
    p = a.copy()
    p.putalpha(ImageChops.multiply(a.getchannel("A"), mask))
    return p


def blobs(mask, box):
    """El recuadro de lo marcado en `mask` dentro de `box`."""
    b = mask.crop(box).getbbox()
    return None if b is None else (box[0] + b[0], box[1] + b[1], box[0] + b[2], box[1] + b[3])


def eye_parts():
    """
    La mirada. Las pupilas son elipses: se miden en la imagen aprobada y se
    separan con su brillo. La placa es el blanco del ojo sin pupila, del mismo
    color liso que ya la rodea. El ojo izquierdo queda en parte detrás del
    pico: su pupila se completa por debajo con su mismo color y la proporción
    de la derecha, para que al moverse no deje un hueco.
    """
    rgb = BASE.convert("RGB")
    r, g, b = rgb.split()
    mul = ImageChops.multiply
    solid = BASE.getchannel("A").point(lambda v: 255 if v > 250 else 0)
    dark = mul(mul(mul(r.point(lambda v: 255 if v < 80 else 0), g.point(lambda v: 255 if v < 80 else 0)), b.point(lambda v: 255 if v < 80 else 0)), solid)
    light = mul(mul(mul(r.point(lambda v: 255 if v > 215 else 0), g.point(lambda v: 255 if v > 200 else 0)), b.point(lambda v: 255 if v > 185 else 0)), solid)

    def inside(mask, box):
        zone = Image.new("L", (W, H), 0)
        zone.paste(255, box)
        return mul(mask, zone)

    def opened(mask, k):
        return mask.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))

    def ellipse(box, grow=0):
        m = Image.new("L", (W * 4, H * 4), 0)  # a 4× y reducida: borde suave sin dientes
        ImageDraw.Draw(m).ellipse([(box[0] - grow) * 4, (box[1] - grow) * 4, (box[2] + grow) * 4 - 1, (box[3] + grow) * 4 - 1], fill=255)
        return m.resize((W, H), Image.LANCZOS)

    def median(mask):
        px = sorted((p for p, k in zip(rgb.getdata(), mask.getdata()) if k > 200), key=sum)
        return px[len(px) // 2] if px else None

    right, left = (186, 198, 250, 262), (62, 196, 122, 262)
    # Ojo derecho: la pupila entera a la vista.
    rp = opened(inside(dark, right), 7).getbbox()
    ratio = (rp[2] - rp[0]) / (rp[3] - rp[1])
    # Ojo izquierdo: se ven el borde izquierdo, el de arriba y el de abajo; el derecho lo tapa el pico.
    lv = opened(inside(dark, left), 7).getbbox()
    lp = (lv[0], lv[1], lv[0] + round((lv[3] - lv[1]) * ratio), lv[3])
    ink = median(opened(inside(dark, right), 9)) or (29, 29, 27)

    # Color y transparencia van por separado: pegar con máscara sobre un lienzo
    # transparente oscurece los bordes y deja un aro gris.
    plate_rgb, plate_a = Image.new("RGB", (W, H), (0, 0, 0)), Image.new("L", (W, H), 0)
    pupil_rgb, pupil_a = BASE.convert("RGB"), Image.new("L", (W, H), 0)
    white = Image.new("L", (W, H), 0)
    for box, pb, hidden in ((right, rp, False), (left, lp, True)):
        shape = ellipse(pb, 1)
        # Lo que se ve del ojo: el blanco unido a la pupila (no el brillo del pico, que también es claro).
        field = ImageChops.lighter(inside(light, box), mul(inside(dark, box), ellipse(pb, 1 if hidden else 6)))
        field = field.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).point(lambda v: 255 if v > 127 else 0)
        ImageDraw.floodfill(field, ((pb[0] + pb[2]) // 2 - (pb[2] - pb[0]) // 4, (pb[1] + pb[3]) // 2), 128)
        seen = field.point(lambda v: 255 if v == 128 else 0)
        if hidden:
            # La pupila completa, lisa; lo que la imagen aprobada sí muestra de ella (con su brillo) se conserva.
            under = mul(shape, ImageChops.invert(seen)).point(lambda v: 255 if v > 127 else 0)
            pupil_rgb.paste(ink, (0, 0), under)
        pupil_a = ImageChops.lighter(pupil_a, shape)
        # El recorte de la pupila entra dos píxeles bajo el contorno vecino (del mismo tono oscuro): sin filo claro entre ambos.
        white = ImageChops.lighter(white, seen.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(0.6)))
        tone = median(mul(seen, ImageChops.invert(ellipse(pb, 4)))) or (238, 226, 218)
        # La placa cubre todo el blanco del ojo, que es de un solo color: así no queda rastro de la pupila.
        plate_rgb.paste(tone, (box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8))
        plate_a = ImageChops.lighter(plate_a, seen.filter(ImageFilter.GaussianBlur(0.5)))
    plate, pupils = plate_rgb.convert("RGBA"), pupil_rgb.convert("RGBA")
    plate.putalpha(plate_a)
    pupils.putalpha(pupil_a)
    return plate, pupils, white


def square(im, size):
    """Encaja la imagen en un cuadro transparente sin deformarla."""
    box = im.getbbox()
    cut = im.crop(box)
    k = size * 0.94 / max(cut.size)
    cut = cut.resize((max(1, round(cut.width * k)), max(1, round(cut.height * k))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(cut, ((size - cut.width) // 2, (size - cut.height) // 2))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    closed_src, tongue_src = load(11, 1), load(16)
    closed = frame(closed_src, grow(diff_mask(closed_src, (0, 225, 250, 440)), 25, 31, 3.0))
    tongue = frame(tongue_src, grow(diff_mask(tongue_src, (40, 330, 220, 440)), 17, 21, 3.0))
    eyes_src, wink_src = load(15), load(14)
    eyes = patch(eyes_src, grow(diff_mask(eyes_src, (40, 170, 270, 285)), 13, 17, 2.0))
    wink = patch(wink_src, grow(diff_mask(wink_src, (165, 170, 270, 285)), 13, 17, 2.0))
    plate, pupils, white = eye_parts()

    parts = {"open": BASE, "closed": closed, "tongue": tongue, "eyes": eyes, "wink": wink, "plate": plate, "pupils": pupils}
    for name, im in parts.items():
        im.save(os.path.join(OUT, f"{name}.png"), optimize=True)
    mask = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mask.putalpha(white)
    mask.save(os.path.join(OUT, "white.png"), optimize=True)
    for name, n in (("pensar", 32), ("graduado", 17), ("obra", 18)):
        Image.open(os.path.join(SRC, f"Recurso {n}.png")).convert("RGBA").save(os.path.join(OUT, f"{name}.png"), optimize=True)

    # Los cuadros fijos que todavía pide el lienzo de la presentación y el lanzador.
    def over(b, *layers):
        out = b.copy()
        for layer in layers:
            out.alpha_composite(layer)
        return out

    pensar = Image.open(os.path.join(SRC, "Recurso 32.png")).convert("RGBA")
    graduado = Image.open(os.path.join(SRC, "Recurso 17.png")).convert("RGBA")
    still = {
        "feliz": BASE,
        "bien": over(BASE, wink),
        "idea": graduado,
        "excelente": over(BASE, eyes),
        "piensa": pensar,
        "piensa2": pensar,
        "duda": closed,
        "cuidado": closed,
    }
    for mood, im in still.items():
        for size in (160, 320):
            square(im, size).save(os.path.join(SRC, f"{mood}-{size}.webp"), lossless=True)
    for size in (96, 192, 384):
        square(BASE, size).save(os.path.join(ROOT, f"pilo-{size}.webp"), lossless=True)
    print("Listo:", ", ".join(sorted(os.listdir(OUT))))


if __name__ == "__main__":
    main()
