// «Vida» de las fotos en reposo: seis capas sutiles; cada reposo usa UNA, con sus
// parámetros desviados alrededor de los valores ajustados (por rendimiento: la
// superposición de varias capas era demasiado para la GPU de un celular medio).
// Un solo shader dibuja la foto viva en espacio de pantalla (con el recorte cover y
// el paneo ya aplicados). Durante las transiciones se dibuja en una textura que el
// efecto de transición lee como si fuera la foto.
//   1 paralaje     · desplazamiento según el mapa de profundidad (paneo + balanceo)
//   2 respiración  · exposición, viñeta y grano que respiran
//   3 elástica     · estiramiento y rebote según la velocidad del scroll (y un vaivén mínimo)
//   4 luz          · luz moteada que nace de la propia foto (profundidad, brillo, ruido)
//   5 cinemagraph  · vaivén de la vegetación, deriva del agua y el cielo, reverberación
//   6 foco         · el plano de foco se desliza entre cerca y lejos
// Rendimiento: el ruido fractal se lee de una textura precalculada (datosRuido) y lo
// que es igual para toda la pantalla (balanceo, foco, respiración, resorte) se
// calcula una vez por cuadro en JavaScript (uniformesVida).

export const capas = [
  { id: 'paralaje', nombre: 'Paralaje 2.5D', continua: true, params: [
    { nombre: 'Profundidad del paralaje', min: 0, max: 0.06, paso: 0.001, def: 0.05 },
    { nombre: 'Balanceo con el dedo quieto', min: 0, max: 1, paso: 0.01, def: 1 },
    { nombre: 'Velocidad del balanceo', min: 0.02, max: 0.5, paso: 0.01, def: 0.2 },
  ] },
  { id: 'respiracion', nombre: 'Respiración', continua: true, params: [
    { nombre: 'Exposición que respira', min: 0, max: 0.1, paso: 0.002, def: 0.084 },
    { nombre: 'Período de la respiración', unidad: 's', min: 2, max: 14, paso: 0.5, def: 3.5 },
    { nombre: 'Grano', min: 0, max: 0.15, paso: 0.005, def: 0.06 },
  ] },
  { id: 'elastica', nombre: 'Inercia elástica', continua: false, params: [
    { nombre: 'Estiramiento', min: 0, max: 0.1, paso: 0.002, def: 0.016 },
    { nombre: 'Amortiguación del rebote', min: 0.08, max: 1, paso: 0.01, def: 0.66 },
    { nombre: 'Borde cromático', min: 0, max: 0.01, paso: 0.0005, def: 0.001 },
  ] },
  { id: 'luz', nombre: 'Luz', continua: true, params: [
    { nombre: 'Intensidad de la luz', min: 0, max: 0.6, paso: 0.01, def: 0.36 },
    { nombre: 'Detalle de la luz', min: 0.5, max: 8, paso: 0.1, def: 7.1 },
    { nombre: 'Velocidad de la luz', min: 0, max: 0.3, paso: 0.005, def: 0.21 },
  ] },
  { id: 'cinemagraph', nombre: 'Cinemagraph', continua: true, params: [
    { nombre: 'Amplitud del movimiento', min: 0, max: 0.015, paso: 0.0005, def: 0.003 },
    { nombre: 'Velocidad', min: 0.05, max: 2, paso: 0.05, def: 0.8 },
    { nombre: 'Escala de las ondas', min: 1, max: 30, paso: 0.5, def: 15.5 },
  ] },
  { id: 'foco', nombre: 'Cambio de foco', continua: true, params: [
    { nombre: 'Desenfoque máximo', unidad: 'px', min: 0, max: 14, paso: 0.5, def: 2.5 },
    { nombre: 'Velocidad de la deriva del foco', min: 0, max: 0.6, paso: 0.005, def: 0.3 },
    { nombre: 'Recorrido del foco con el paneo', min: 0, max: 1, paso: 0.01, def: 1 },
  ] },
];

// Ajustes generales (valores elegidos en el laboratorio, 2026-11-14).
export const AJUSTES_VIDA = {
  // Relevo durante la transición (fundido suave, como en cine): la foto que sale va
  // perdiendo la vida hasta la mitad y la que entra la va ganando desde la mitad.
  // En cada momento hay una sola foto viva, así que no suma costo de GPU.
  antes: 0.5,          // la foto que entra gana la vida en la segunda mitad de la transición
  salida: 0.5,         // la foto que sale la pierde en la primera mitad
  intensidad: 1.5,     // multiplica todas las capas
};

export const valoresVidaPorDefecto = () => capas.map((c) => c.params.map((p) => p.def));

// ---------- recetas ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Capa de cada reposo: bolsa mezclada por bloques de seis, sin repetir la misma
// capa en dos reposos seguidos.
function capaDe(i, semilla) {
  const n = capas.length;
  const bolsa = (b) => {
    const r = mulberry32((b * 7919 + semilla * 104729) | 0);
    const orden = capas.map((_, k) => k);
    for (let k = n - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [orden[k], orden[j]] = [orden[j], orden[k]]; }
    return orden;
  };
  const b = Math.floor(i / n), k = ((i % n) + n) % n;
  const orden = bolsa(b);
  if (k === 0) {
    const anterior = bolsa(b - 1)[n - 1];
    if (orden[0] === anterior) [orden[0], orden[1]] = [orden[1], orden[0]];
  }
  return orden[k];
}

export const DESVIO = 0.3;   // cada parámetro varía ±30 % alrededor del valor ajustado

// Receta del reposo i: una sola capa, con sus parámetros desviados al azar.
export function recetaDe(i, semilla, valores) {
  const azar = mulberry32((i * 2654435761 + semilla * 97 + 13) | 0);
  const capa = capaDe(i, semilla);
  const pesos = capas.map((_, k) => (k === capa ? 1 : 0));
  const vals = valores.map((vs, k) => vs.map((v, q) => {
    const p = capas[k].params[q];
    return Math.min(p.max, Math.max(p.min, v * (1 - DESVIO + 2 * DESVIO * azar())));
  }));
  return { capa, pesos, valores: vals, fase: azar() * 100, semilla: azar() };
}

// Ruido suave de una dimensión.
function ruido1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  return h(i) + (h(i + 1) - h(i)) * u;
}
// La intensidad de la capa deriva lento: la foto cambia mientras se la mira.
export function pesosConDeriva(receta, t) {
  return receta.pesos.map((w) => w * (0.7 + 0.3 * ruido1(t * 0.05 + receta.fase)));
}

// Valores iguales para toda la pantalla, calculados una vez por cuadro.
//   bal: balanceo del paralaje · zf: plano de foco · aliento: respiración ·
//   elast: resorte de la inercia elástica más un vaivén mínimo con el dedo quieto.
// rango: profundidades de lo que está a la vista ({ lejos, cerca }, ver rangoVisible):
// el foco solo recorre ese rango, así nunca enfoca algo que quedó fuera de pantalla.
export function uniformesVida(vida, t, pan, resorte, rango = { lejos: 0, cerca: 1 }) {
  const c = vida.valores;
  const s0 = vida.semilla * 37;
  const tb = t * c[0][2];
  const bal = [
    (ruido1(tb + s0) - 0.5) * 2 * c[0][1],
    (ruido1(tb * 0.83 + s0 + 17.3) - 0.5) * 2 * c[0][1],
  ];
  // fase 0 = lo más lejano a la vista, 1 = lo más cercano; el paneo la lleva de un
  // extremo al otro (recorrido) y una deriva lenta la mueve con el dedo quieto.
  let fase = 0.5 + 0.5 * c[5][2] * pan + 0.45 * (ruido1(t * c[5][1] + s0 + 3.7) - 0.5) * 2;
  fase = Math.min(1, Math.max(0, fase));
  const zf = rango.lejos + (rango.cerca - rango.lejos) * fase;
  const aliento = Math.sin(t * 2 * Math.PI / c[1][1] + vida.semilla * 6.2831) * 0.7
    + (ruido1(t * 0.17 + s0 + 9.1) - 0.5) * 0.6;
  const elast = resorte + (ruido1(t * 0.6 + s0 + 5.5) - 0.5) * 0.7;
  return { bal, zf, aliento, elast, rangoZ: Math.max(0.25, rango.cerca - rango.lejos) };
}

// Muestras del mapa de profundidad en la CPU (96 px de ancho) para saber qué
// profundidades hay a la vista en cada momento del paneo.
export function muestrasProfundidad(imagen) {
  const ancho = 96;
  const alto = Math.max(1, Math.round(ancho * (imagen.height / imagen.width)));
  const lienzo = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ancho, alto)
    : Object.assign(document.createElement('canvas'), { width: ancho, height: alto });
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  const rgba = ctx.getImageData(0, 0, ancho, alto).data;
  const datos = new Uint8Array(ancho * alto);
  for (let k = 0; k < datos.length; k++) datos[k] = rgba[k * 4];
  return { ancho, alto, datos };
}

// Profundidades de la parte visible de la foto (recorte cover con el paneo):
// percentil 15 (lejos) y 90 (cerca). El recorte vertical es simétrico, así que no
// importa si las filas vienen invertidas.
export function rangoVisible(m, aspImg, aspPantalla, pan) {
  if (!m) return { lejos: 0, cerca: 1 };
  let sx = 1, sy = 1;
  if (aspImg > aspPantalla) sx = aspPantalla / aspImg; else sy = aspImg / aspPantalla;
  const x0 = (1 - sx) * 0.5 + pan * (1 - sx) * 0.5, y0 = (1 - sy) * 0.5;
  const c0 = Math.floor(x0 * m.ancho), c1 = Math.min(m.ancho, Math.ceil((x0 + sx) * m.ancho));
  const f0 = Math.floor(y0 * m.alto), f1 = Math.min(m.alto, Math.ceil((y0 + sy) * m.alto));
  const hist = new Uint32Array(256);
  let n = 0;
  for (let f = f0; f < f1; f++) for (let c = Math.max(0, c0); c < c1; c++) { hist[m.datos[f * m.ancho + c]]++; n++; }
  if (!n) return { lejos: 0, cerca: 1 };
  const percentil = (q) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= q * n) return v / 255; } return 1; };
  return { lejos: percentil(0.15), cerca: percentil(0.9) };
}

// Resorte de la inercia elástica: sigue la velocidad del scroll y rebota al frenar.
export function crearResorte() {
  let x = 0, v = 0;
  return {
    paso(dt, objetivo, amortiguacion) {
      const k = 70, c = 2 * Math.sqrt(k) * amortiguacion;
      dt = Math.min(dt, 0.05);
      for (let n = 0; n < 4; n++) {
        const h = dt / 4;
        v += (k * (objetivo - x) - c * v) * h;
        x += v * h;
      }
      return x;
    },
    get valor() { return x; },
  };
}

// Textura de ruido fractal (4 octavas, repetible) precalculada: cuatro campos
// independientes en R, G, B y A. Cada canal vale la suma de 4 octavas (0..0.94,
// media 0.47), como el fbm que antes se calculaba en cada píxel.
export const LADO_RUIDO = 256;
export function datosRuido(n = LADO_RUIDO) {
  const acc = new Float32Array(n * n * 4);
  for (let c = 0; c < 4; c++) {
    const r = mulberry32(1234 + c * 977);
    let amp = 0.5;
    for (const P of [4, 8, 16, 32]) {
      const g = new Float32Array(P * P);
      for (let k = 0; k < g.length; k++) g[k] = r();
      for (let y = 0; y < n; y++) {
        const fy = (y / n) * P, iy = Math.floor(fy), ty = fy - iy, uy = ty * ty * (3 - 2 * ty);
        const y0 = iy % P, y1 = (iy + 1) % P;
        for (let x = 0; x < n; x++) {
          const fx = (x / n) * P, ix = Math.floor(fx), tx = fx - ix, ux = tx * tx * (3 - 2 * tx);
          const x0 = ix % P, x1 = (ix + 1) % P;
          const a = g[y0 * P + x0] + (g[y0 * P + x1] - g[y0 * P + x0]) * ux;
          const b = g[y1 * P + x0] + (g[y1 * P + x1] - g[y1 * P + x0]) * ux;
          acc[(y * n + x) * 4 + c] += amp * (a + (b - a) * uy);
        }
      }
      amp *= 0.5;
    }
  }
  const datos = new Uint8Array(n * n * 4);
  for (let k = 0; k < datos.length; k++) datos[k] = Math.round(Math.min(1, acc[k]) * 255);
  return datos;
}

// ---------- shader ----------
export const verticeVida = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const fragmentoVida = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImg;       // foto
uniform sampler2D uProf;      // mapa de profundidad (1 = cerca), mismo encuadre que la foto
uniform sampler2D uRuido;     // ruido fractal precalculado (repetible)
uniform vec2  uRes;           // lienzo en píxeles de dispositivo
uniform float uAsp, uPan;     // proporción de la foto y paneo (-1..1)
uniform float uT;             // tiempo en segundos
uniform float uRecorrido;     // scroll acumulado, en pantallas
uniform float uSem;           // azar propio de la receta, 0..1
uniform float uW[6];          // peso de cada capa (solo una distinta de 0)
uniform vec3  uC[6];          // parámetros de cada capa
uniform vec2  uBal;           // balanceo del paralaje
uniform float uZf;            // plano de foco (0 lejos, 1 cerca)
uniform float uRangoZ;        // ancho del rango de profundidades a la vista (mín. 0.25)
uniform float uAliento;       // respiración (-1..1)
uniform float uElast;         // resorte de la inercia elástica

#define PI 3.14159265
float sa() { return uRes.x / uRes.y; }
vec2 escalaCubrir() {
  vec2 s = vec2(1.0);
  if (uAsp > sa()) s.x = sa() / uAsp; else s.y = uAsp / sa();
  return s;
}
vec2 cubrir(vec2 uv) {
  vec2 s = escalaCubrir();
  vec2 off = (1.0 - s) * 0.5;
  off.x += uPan * (1.0 - s.x) * 0.5;
  return off + clamp(uv, 0.0, 1.0) * s;
}
// fbm de la textura: una unidad de p = una celda de la octava más grande.
vec4 R(vec2 p) { return texture2D(uRuido, p * 0.25); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// Azar entero (pcg3d): sin patrones de franjas en el grano.
float azarPix(vec2 p, float t) {
  uvec3 v = uvec3(uint(int(p.x) + 4096), uint(int(p.y) + 4096), uint(int(t)));
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return float(v.x) / 4294967295.0;
}

void main() {
  vec2 uv = vUv;
  vec2 s0 = vec2(uSem * 37.0, uSem * 53.0);
  vec2 tc0 = cubrir(uv);
  float z = texture2D(uProf, tc0).r;
  vec2 d = vec2(0.0);

  // 1 · Paralaje: lo cercano se corre más que lo lejano con el paneo y el balanceo.
  if (uW[0] > 0.001) {
    vec2 camara = vec2(uPan * 0.6, 0.0) + uBal;
    d += (z - 0.45) * uC[0].x * camara * vec2(1.0, sa()) * uW[0];
  }
  // 3 · Inercia elástica: se estira en la dirección del scroll, lo cercano llega tarde.
  float cromo = 0.0;
  if (uW[2] > 0.001) {
    vec3 c = uC[2];
    float e = clamp(uElast, -4.0, 4.0) * uW[2];
    d.y -= (uv.y - 0.5) * e * c.x;
    d.y += e * c.x * 0.35 * (z - 0.4);
    cromo = e * c.z;
  }
  // 5 · Cinemagraph: zonas detectadas por color y profundidad.
  if (uW[4] > 0.001) {
    vec3 c = uC[4];
    vec3 cb = textureLod(uImg, tc0, 3.0).rgb;
    float verde = smoothstep(0.015, 0.12, cb.g - max(cb.r, cb.b));
    float azul = smoothstep(0.02, 0.14, cb.b - max(cb.r, cb.g) * 0.97);
    float lejos = 1.0 - smoothstep(0.15, 0.55, z);
    float t = uT * c.y;
    vec2 q = tc0 * c.z;
    vec2 dc = vec2(0.0);
    // vegetación: vaivén con fase propia por zona
    float fase = (R(q * 0.35 + s0).r - 0.47) * 4.0 * 6.2831;
    dc.x += sin(t * 1.7 + fase) * c.x * verde * (0.5 + 0.5 * z);
    dc.y += cos(t * 1.3 + fase) * c.x * 0.4 * verde * (0.5 + 0.5 * z);
    // agua y cielo: deriva con ruido que fluye
    vec2 flujo = R(q + s0 + vec2(t * 0.25, t * 0.1)).gb - 0.47;
    dc += flujo * c.x * 1.6 * azul;
    // lejanía: reverberación muy leve, y un aliento mínimo en todo el cuadro
    dc += (R(q * 2.0 + vec2(-t, t * 0.6)).ba - 0.47) * 1.6 * c.x * (0.6 * lejos + 0.25);
    d += dc * uW[4];
  }
  vec2 tc = cubrir(uv + d);

  // 6 · Cambio de foco: desenfoque por nivel de mipmap según la distancia al plano de foco.
  vec3 col;
  float lodF = 0.0;
  vec2 radio = vec2(0.0);
  if (uW[5] > 0.001) {
    float zt = texture2D(uProf, tc).r;
    // desenfoque relativo al rango visible: siempre hay algo nítido y algo difuso
    float px = uC[5].x * (uRes.x / 390.0) * min(1.0, abs(zt - uZf) / uRangoZ * 1.6) * uW[5];
    float texPorPx = float(textureSize(uImg, 0).y) * escalaCubrir().y / uRes.y;
    lodF = log2(max(px * texPorPx * 0.7, 1.0));
    radio = px * 0.5 / uRes;
  }
  if (lodF > 0.01) {
    col = (textureLod(uImg, cubrir(uv + d + vec2(radio.x, radio.y * 0.3)), lodF).rgb
         + textureLod(uImg, cubrir(uv + d - vec2(radio.x, radio.y * 0.3)), lodF).rgb
         + textureLod(uImg, cubrir(uv + d + vec2(-radio.x * 0.3, radio.y)), lodF).rgb
         + textureLod(uImg, cubrir(uv + d - vec2(-radio.x * 0.3, radio.y)), lodF).rgb) * 0.25;
  } else {
    col = texture2D(uImg, tc).rgb;
  }
  if (abs(cromo) > 0.0002) {
    col.r = textureLod(uImg, cubrir(uv + d + vec2(0.0, cromo)), lodF).r;
    col.b = textureLod(uImg, cubrir(uv + d - vec2(0.0, cromo)), lodF).b;
  }

  // 4 · Luz: manchas de luz de ruido fractal que deriva; caen más sobre lo cercano
  // y lo claro, toman el tono de las luces de la propia foto y tienen paralaje.
  if (uW[3] > 0.001) {
    vec3 c = uC[3];
    vec3 media = textureLod(uImg, vec2(0.5), 12.0).rgb;
    vec3 tono = mix(vec3(1.0, 0.93, 0.82), media / max(max(media.r, max(media.g, media.b)), 0.02), 0.45);
    float tl = uT * c.z + uRecorrido * 0.12;
    vec2 p = vec2(tc.x * uAsp, tc.y) * c.y * (1.3 - 0.6 * z) + vec2(uPan * 0.25 * (0.3 + z), 0.0);
    vec2 alabeo = R(p * 0.7 + s0 + vec2(tl * 0.6, -tl * 0.45)).rg - 0.47;
    float n = R(p + alabeo * 1.2 + vec2(tl, tl * 0.7)).b * 0.6
            + R(p * 1.37 - alabeo + vec2(-tl * 0.8, tl * 0.5) + 3.1).a * 0.4;
    n = 0.47 + (n - 0.47) * 1.2;      // misma dispersión que el fbm calculado por píxel
    float mancha = smoothstep(0.42, 0.78, n);
    float recibe = mix(0.35, 1.0, z) * (0.45 + 0.55 * smoothstep(0.08, 0.7, lum(col)));
    float k = c.x * uW[3];
    col = 1.0 - (1.0 - col) * (1.0 - clamp(mancha * recibe * k * tono, 0.0, 1.0));
    col *= 1.0 - k * 0.18 * (1.0 - mancha);
  }

  // 2 · Respiración: exposición y viñeta que respiran, y grano vivo de película.
  if (uW[1] > 0.001) {
    vec3 c = uC[1];
    col *= 1.0 + c.x * uAliento * uW[1];
    float r = length((uv - 0.5) * vec2(sa(), 1.0));
    float vin = smoothstep(1.05, 0.3, r * (1.0 - 0.05 * uAliento));
    col *= mix(1.0, vin, 0.3 * uW[1]);
    float tam = max(1.0, floor(uRes.x / 390.0 + 0.5));
    float g = azarPix(floor(uv * uRes / tam), floor(uT * 24.0)) - 0.5;
    float medios = 1.0 - abs(lum(col) * 2.0 - 1.0);
    col += g * c.z * uW[1] * (0.35 + 0.65 * medios);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
