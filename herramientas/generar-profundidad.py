# Genera mapas de profundidad (blanco = cerca) con Depth Anything V2 Small (ONNX).
# Uso: python3 generar-profundidad.py depth_anything_v2_vits.onnx img img/profundidad
# Modelo: https://github.com/fabio-sim/Depth-Anything-ONNX/releases (v2.0.0, Depth Anything V2 Small, Apache-2.0).
import sys, glob, os, time
import numpy as np
from PIL import Image, ImageFilter
import onnxruntime as ort
modelo, origen, destino = sys.argv[1:4]
s = ort.InferenceSession(modelo, providers=['CPUExecutionProvider'])
nin = s.get_inputs()[0].name
media = np.array([0.485, 0.456, 0.406], np.float32); desv = np.array([0.229, 0.224, 0.225], np.float32)
archivos = sorted(glob.glob(os.path.join(origen, '*', '*.webp')))
t0 = time.time()
for f in archivos:
    carpeta = os.path.basename(os.path.dirname(f))
    salida = os.path.join(destino, carpeta, os.path.basename(f))
    if os.path.exists(salida): continue
    im = Image.open(f).convert('RGB')
    W, H = im.size
    x = (np.asarray(im.resize((518, 518), Image.BICUBIC), np.float32) / 255 - media) / desv
    d = s.run(None, {nin: x.transpose(2, 0, 1)[None]})[0][0]
    lo, hi = np.percentile(d, 1), np.percentile(d, 99)
    d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
    ancho = 384
    alto = round(ancho * H / W) if W >= H else 384
    if H > W: ancho = round(384 * W / H)
    m = Image.fromarray((d * 255).astype(np.uint8)).resize((ancho, alto), Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.2))
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    m.save(salida, 'WEBP', quality=88, method=6)
    print(carpeta, os.path.basename(f), W, H, '->', m.size, f'{time.time()-t0:.0f}s', flush=True)
