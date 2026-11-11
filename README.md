# IDA ubicua

Sitio de la obra *IDA ubicua* de Luciana Estévez (2026). Transposición multimedial: Raúl Federico Lacabanne.

Pensado para celular en vertical. En computadoras muestra un código QR para abrirlo en el teléfono.

## Probar en la computadora

Desde esta carpeta:

```
python -m http.server 8000
```

- Sitio: http://localhost:8000/?movil (el parámetro `movil` saltea el aviso de escritorio; conviene usar el modo dispositivo de las herramientas de desarrollo del navegador).
- Con `?movil&depurar`, la consola expone `ida` (audio, video, naves, cinta, secuencia).
- Laboratorio de efectos: http://localhost:8000/laboratorio/

Para probar en el celular dentro de la misma red wifi: `python -m http.server 8000 --bind 0.0.0.0` y abrir `http://<IP de la computadora>:8000/` en el teléfono.

## Publicar en GitHub Pages

1. Crear el repositorio `ida-ubicua` en la cuenta `knnv-ar`.
2. Subir esta carpeta (la carpeta `originales/` queda afuera por `.gitignore`).
3. En el repositorio: Settings › Pages › Deploy from a branch › `main` / `(root)`.
4. El sitio queda en https://knnv-ar.github.io/ida-ubicua/

## Estructura

- `index.html`, `css/ida.css`, `manifest.webmanifest`
- `js/main.js` arranque, avisos y estados · `js/naves.js` carrusel horizontal · `js/cinta.js` scroll vertical de la nave central · `js/secuencia.js` shuffle de imágenes y efectos · `js/audio.js` loop del audio · `js/video.js` video · `js/efectos/` shaders de transición
- `img/`, `audio/`, `video/`, `data/imagenes.json` medios preparados (ver `herramientas/preparar_medios.py`)
- `fonts/` Cormorant Garamond (SIL Open Font License) · `lib/` three.js r169 (MIT) · íconos de Tabler Icons (MIT, tabler.io/icons) dentro de `index.html` · separador de créditos tomado de «Decorative text dividers» de FreeSVG.org (dominio público, CC0), copia en `img/separador.svg`
