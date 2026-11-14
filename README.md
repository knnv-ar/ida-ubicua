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

## Indicaciones de la nave central

Al llegar a la nave central solo se ve la guía de desplazamiento (`img/scrolling.svg`). Las indicaciones «‹ créditos» y «video ›» van a media altura (abajo las tapaba el aviso de pantalla completa de Android), no se tocan y aparecen de a una (`js/laterales.js`, valores en `AJUSTES_LATERALES`):

- Primer asomo: después de pasar al menos 4 fotos y con el dedo quieto 2 s, el carrusel se corre un 14 % hacia los créditos y vuelve con un rebote mínimo; aparece solo «‹ créditos».
- Segundo asomo: en la detención siguiente (tras recorrer algo más de una pantalla), hacia el video; aparece solo «video ›».
- Después, con el dedo quieto 2 s, reaparece un solo texto, alternando, de los lados que todavía no se visitaron. Se apagan con 60 px de scroll.
- Cada asomo ocurre una sola vez y no ocurre si ya se visitó ese lado; un toque lo interrumpe. Con «reducir movimiento» no hay asomo: el texto aparece solo.

## Nave central: transiciones y vida de las fotos

La nave central es una cinta infinita de fotos manejada por el scroll vertical. Cada foto ocupa un tramo de 4 pantallas de desplazamiento (`AJUSTES.tramo` en `js/cinta.js`): la primera mitad es el reposo (la foto se panea) y la segunda, la transición hacia la foto siguiente. Todo se dibuja con three.js sobre un único lienzo.

### Transiciones (`js/efectos/`)

Seis efectos, sorteados sin repetición; cada transición tiene su propia semilla. Los valores por defecto de cada archivo son los definitivos del laboratorio.

| Efecto | Archivo | Valores |
| --- | --- | --- |
| Mosaico | `mosaico.js` | celda 64 px · dispersión 0.69 · curva 0.8 |
| Separación cromática | `cromatica.js` | niveles 11 · desplazamiento 0.165 · escalonado 0.21 |
| Glitch | `glitch.js` | bloque 8 px · intensidad 0.83 · saltos 20 |
| Fractura (vidrio estallado) | `fractura.js` | grietas 27 · anillos 10 · fuerza 1 |
| Flujo líquido | `liquido.js` | corriente 0.25 · remolinos 2.2 · borde 0.1 |
| Polvo de partículas | `particulas.js` | 1 px (fijo) · viento 1.03 · remolinos 5.3 |

`comun.js` reúne el GLSL compartido (recorte *cover* con paneo, ruido, muestreo por bloques con `textureLod`) y el «pie» que funde cada efecto con la imagen pura cerca de los extremos. Fractura y polvo de partículas dibujan además una malla de trozos y una nube de puntos (`escena.js`). En los efectos que rompen la imagen el fondo es negro. `puntillismo.js` quedó sin usar (lo reemplazó el glitch).

### Vida de las fotos en reposo (`js/vida/index.js`)

La foto paneada nunca queda quieta. Hay seis capas sutiles y cada reposo usa una sola (sorteada sin repetir la del reposo anterior), con sus parámetros desviados al azar.

| Capa | Qué hace | Valores |
| --- | --- | --- |
| Paralaje 2.5D | lo cercano se corre más que lo lejano con el paneo; balanceo lento con el dedo quieto | profundidad 0.05 · balanceo 1 · velocidad 0.2 |
| Respiración | exposición y viñeta que respiran, grano vivo | exposición 0.084 · período 3.5 s · grano 0.06 |
| Inercia elástica | estiramiento según la velocidad del scroll y rebote al frenar | estiramiento 0.016 · amortiguación 0.66 · borde cromático 0.001 |
| Luz | manchas de luz de ruido fractal según profundidad y brillo, con el tono de la foto | intensidad 0.36 · detalle 7.1 · velocidad 0.21 |
| Cinemagraph | vegetación que se mece, agua y cielo que derivan, lejanía que reverbera | amplitud 0.003 · velocidad 0.8 · ondas 15.5 |
| Cambio de foco | el plano de foco se desliza entre lo más lejano y lo más cercano **de lo que está a la vista** | desenfoque 2.5 px · deriva 0.3 · recorrido 1 |

- Variación: cada parámetro se desvía ±30 % del valor ajustado (`DESVIO`) y la intensidad deriva lento mientras se mira la foto. La inercia elástica tiene además un vaivén mínimo para no quedar quieta con el dedo quieto.
- Rendimiento: el ruido fractal se lee de una textura precalculada (`datosRuido`), lo que es igual para toda la pantalla se calcula una vez por cuadro (`uniformesVida`) y el lienzo se dibuja a 1.5 píxeles por píxel CSS; si los cuadros tardan más de ~26 ms, `escena.js` baja la resolución a 1.25 y después a 1. (Una primera versión superponía hasta tres capas y era demasiado para la GPU de un celular medio.)
- Foco: `rangoVisible` lee el mapa de profundidad en la CPU (96 px de ancho) y calcula las profundidades de la parte de la foto que está en pantalla con el paneo actual (percentiles 15 y 90); el foco recorre solo ese rango y el desenfoque es relativo a él.
- `AJUSTES_VIDA`: relevo durante la transición, como un fundido de cine: la foto que sale pierde la vida suavemente hasta la mitad y la que entra la gana desde la mitad (nunca hay dos fotos vivas a la vez); intensidad general 1.5. Durante la transición la foto viva se dibuja en una textura (*render target*) que el efecto lee como si fuera la foto.
- La cinta dibuja a 30 cuadros por segundo con el dedo quieto y en cada cuadro mientras se desliza; se pausa en horizontal o en segundo plano. Durante la transición la foto viva se dibuja en una textura sin mipmaps.

### Mapas de profundidad (`img/profundidad/`)

Uno por foto, con el mismo nombre (`img/profundidad/fotos/fotos-01.webp`): gris, 384 px del lado largo, blanco = cerca. Generados con Depth Anything V2 Small. Para regenerarlos (necesita Python con `onnxruntime`, `numpy` y `Pillow`, y el modelo `depth_anything_v2_vits.onnx` de github.com/fabio-sim/Depth-Anything-ONNX, versión v2.0.0):

```
python herramientas/generar-profundidad.py depth_anything_v2_vits.onnx img img/profundidad
```

El script saltea los mapas que ya existen: para rehacer uno, borralo antes.

### Laboratorio (`laboratorio/`)

Página de ajuste con dos fotos: un botón por transición y por capa de vida, «una capa al azar por foto», controles de cada parámetro y «ver y copiar valores» para pasar los ajustes al código. Los cambios se guardan en el navegador.

## Publicar en GitHub Pages

1. Crear el repositorio `ida-ubicua` en la cuenta `knnv-ar`.
2. Subir esta carpeta (la carpeta `originales/` queda afuera por `.gitignore`).
3. En el repositorio: Settings › Pages › Deploy from a branch › `main` / `(root)`.
4. El sitio queda en https://knnv-ar.github.io/ida-ubicua/

## Estructura

- `index.html`, `css/ida.css`, `manifest.webmanifest`
- `js/main.js` arranque, avisos y estados · `js/naves.js` carrusel horizontal · `js/cinta.js` scroll vertical de la nave central · `js/laterales.js` indicaciones «‹ créditos» / «video ›» y asomos del carrusel · `js/secuencia.js` shuffle de imágenes y efectos · `js/audio.js` loop del audio · `js/video.js` video · `js/escena.js` dibujante WebGL · `js/efectos/` shaders de transición · `js/vida/` vida de las fotos en reposo
- `laboratorio/` página de ajuste de efectos y vida · `herramientas/` scripts de preparación (`preparar_medios.py`, `generar-profundidad.py`)
- `img/profundidad/` mapas de profundidad de cada foto
- `img/`, `audio/`, `video/`, `data/imagenes.json` medios preparados (ver `herramientas/preparar_medios.py`)
- `fonts/` Cormorant Garamond (SIL Open Font License) · `lib/` three.js r169 (MIT) · íconos de Tabler Icons (MIT, tabler.io/icons) dentro de `index.html` · separador de créditos tomado de «Decorative text dividers» de FreeSVG.org (dominio público, CC0), copia en `img/separador.svg` · mapas de profundidad generados con Depth Anything V2 Small (Apache-2.0)
