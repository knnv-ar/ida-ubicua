"""Prepara las imágenes de IDA ubicua para la web.

Lee originales/fotos y originales/flores (JPG), escribe img/<carpeta>/*.webp
(lado corto máx. 1600 px, calidad 80, orientación EXIF aplicada, sin metadatos)
y genera data/imagenes.json. Solo convierte lo que falta: se puede volver a correr.

Uso, desde la raíz del proyecto:  python3 herramientas/preparar_medios.py
Audio (aparte):  ffmpeg -i originales/audio/ida-audio.mp3 -map_metadata -1 -c:a libmp3lame -b:a 192k audio/ida-audio.mp3
"""
import os, json
from multiprocessing import Pool
from PIL import Image, ImageOps

LADO_CORTO, CALIDAD, CARPETAS = 1600, 80, ('fotos', 'flores')

def convertir(args):
    carpeta, nombre = args
    src = os.path.join('originales', carpeta, nombre)
    dst = os.path.join('img', carpeta, os.path.splitext(nombre)[0] + '.webp')
    im = ImageOps.exif_transpose(Image.open(src))
    icc = im.info.get('icc_profile')
    if im.mode != 'RGB':
        im = im.convert('RGB')
    w, h = im.size
    esc = min(1.0, LADO_CORTO / min(w, h))
    if esc < 1.0:
        im = im.resize((round(w * esc), round(h * esc)), Image.LANCZOS)
    kw = dict(quality=CALIDAD, method=4)
    if icc:
        kw['icc_profile'] = icc
    im.save(dst + '.part', 'WEBP', **kw)
    os.replace(dst + '.part', dst)

def main():
    for c in CARPETAS:
        os.makedirs(os.path.join('img', c), exist_ok=True)
    pendientes = [(c, n) for c in CARPETAS for n in sorted(os.listdir(os.path.join('originales', c)))
                  if n.lower().endswith(('.jpg', '.jpeg'))
                  and not os.path.exists(os.path.join('img', c, os.path.splitext(n)[0] + '.webp'))]
    with Pool() as p:
        p.map(convertir, pendientes)
    imagenes = []
    for c in CARPETAS:
        for n in sorted(os.listdir(os.path.join('img', c))):
            if n.endswith('.webp'):
                ruta = f'img/{c}/{n}'
                w, h = Image.open(ruta).size
                imagenes.append({'id': n[:-5], 'carpeta': c, 'src': ruta, 'ancho': w, 'alto': h,
                                 'orientacion': 'horizontal' if w > h else 'vertical',
                                 'kb': round(os.path.getsize(ruta) / 1024)})
    os.makedirs('data', exist_ok=True)
    with open('data/imagenes.json', 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'ladoCorto': LADO_CORTO, 'formato': 'webp', 'imagenes': imagenes},
                  f, ensure_ascii=False, indent=1)
    print(f'{len(pendientes)} convertidas, {len(imagenes)} en data/imagenes.json')

if __name__ == '__main__':
    main()
