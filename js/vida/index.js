// «Vida» de las fotos en reposo: seis capas sutiles que se combinan en recetas.
// Un solo shader dibuja la foto viva en espacio de pantalla (con el recorte cover y
// el paneo ya aplicados). Durante las transiciones se dibuja en una textura que el
// efecto de transición lee como si fuera la foto.
//   1 paralaje     · desplazamiento según el mapa de profundidad (paneo + balanceo)
//   2 respiración  · exposición, viñeta y grano que respiran
//   3 elástica     · estiramiento y rebote según la velocidad del scroll
//   4 luz          · luz moteada que nace de la propia foto (profundidad, brillo, ruido)
//   5 cinemagraph  · vaivén de la vegetación, deriva del agua y el cielo, reverberación
//   6 foco         · el plano de foco se desliza entre cerca y lejos

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
    { nombre: 'Estiramiento', min: 0, max: 0.1, paso: 0.002, def: 0.008 },
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
    { nombre: 'Velocidad de la deriva del foco', min: 0, max: 0.3, paso: 0.005, def: 0.06 },
    { nombre: 'Recorrido del foco con el paneo', min: 0, max: 1, paso: 0.01, def: 0.96 },
  ] },
];

// Ajustes generales (valores elegidos en el laboratorio, 2026-11-14).
export const AJUSTES_VIDA = {
  antes: 0.1,          // la vida de la foto que entra arranca en el último 10 % de la transición
  salida: 0.2,         // la foto que sale conserva su vida en el primer 20 % de la transición
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

// Capa dominante de cada reposo: bolsa mezclada por bloques de seis, sin repetir
// la misma capa en dos reposos seguidos.
function dominanteDe(i, semilla) {
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

// Receta del reposo i: una capa dominante y una o dos secundarias más débiles, con
// los parámetros sorteados alrededor de los valores ajustados. Siempre hay al menos
// una capa continua (que se mueve con el dedo quieto).
export function recetaDe(i, semilla, valores) {
  const azar = mulberry32((i * 2654435761 + semilla * 97 + 13) | 0);
  const pesos = capas.map(() => 0);
  const dom = dominanteDe(i, semilla);
  pesos[dom] = 0.8 + 0.2 * azar();
  const resto = capas.map((_, k) => k).filter((k) => k !== dom);
  for (let k = resto.length - 1; k > 0; k--) { const j = Math.floor(azar() * (k + 1)); [resto[k], resto[j]] = [resto[j], resto[k]]; }
  const nSec = azar() < 0.55 ? 1 : 2;
  for (let s = 0; s < nSec; s++) pesos[resto[s]] = 0.25 + 0.35 * azar();
  if (!capas.some((c, k) => c.continua && pesos[k] > 0)) pesos[1] = 0.35 + 0.25 * azar();
  const vals = valores.map((vs, k) => vs.map((v, q) => {
    const p = capas[k].params[q];
    return Math.min(p.max, Math.max(p.min, v * (0.75 + 0.5 * azar())));
  }));
  return { pesos, valores: vals, fase: azar() * 100, semilla: azar() };
}

// Ruido suave de una dimensión (para la deriva lenta de las intensidades).
function ruido1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  return h(i) + (h(i + 1) - h(i)) * u;
}
// Pesos que derivan con el tiempo: la foto cambia de carácter mientras se la mira.
export function pesosConDeriva(receta, t) {
  return receta.pesos.map((w, k) => w * (0.6 + 0.4 * ruido1(t * 0.05 + k * 7.31 + receta.fase)));
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
uniform vec2  uRes;           // lienzo en píxeles de dispositivo
uniform float uAsp, uPan;     // proporción de la foto y paneo (-1..1)
uniform float uT;             // tiempo en segundos
uniform float uRecorrido;     // scroll acumulado, en pantallas
uniform float uElast;         // valor del resorte (velocidad del scroll suavizada)
uniform float uSem;           // azar propio de la receta, 0..1
uniform float uW[6];          // peso de cada capa
uniform vec3  uC[6];          // parámetros de cada capa

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
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ruido3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * ruido3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
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
  float s0 = uSem * 37.0;
  vec2 tc0 = cubrir(uv);
  float z = texture2D(uProf, tc0).r;
  vec2 d = vec2(0.0);

  // 1 · Paralaje: lo cercano se corre más que lo lejano con el paneo, y un balanceo
  // lento de "cámara en mano" lo mantiene vivo con el dedo quieto.
  if (uW[0] > 0.001) {
    vec3 c = uC[0];
    float tb = uT * c.z;
    vec2 balanceo = (vec2(ruido3(vec3(tb, 1.3, s0)), ruido3(vec3(tb * 0.83, 7.1, s0))) - 0.5) * 2.0 * c.y;
    vec2 camara = vec2(uPan * 0.6, 0.0) + balanceo;
    d += (z - 0.45) * c.x * camara * vec2(1.0, sa()) * uW[0];
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
    // vegetación: vaivén con fase propia por zona
    vec2 dc = vec2(0.0);
    float fase = ruido3(vec3(q * 0.35, s0)) * 6.2831;
    dc.x += sin(t * 1.7 + fase) * c.x * verde * (0.5 + 0.5 * z);
    dc.y += cos(t * 1.3 + fase) * c.x * 0.4 * verde * (0.5 + 0.5 * z);
    // agua y cielo: deriva con ruido que fluye
    vec2 flujo = vec2(fbm3(vec3(q, t * 0.25 + s0)), fbm3(vec3(q + 5.2, t * 0.25 + s0))) - 0.5;
    dc += flujo * c.x * 1.6 * azul;
    // lejanía: reverberación muy leve, y un aliento mínimo en todo el cuadro
    dc += (vec2(ruido3(vec3(q * 2.0, t)), ruido3(vec3(q * 2.0 + 9.0, t))) - 0.5) * c.x * (0.6 * lejos + 0.25);
    d += dc * uW[4];
  }
  vec2 tc = cubrir(uv + d);

  // 6 · Cambio de foco: desenfoque por nivel de mipmap según la distancia al plano de foco.
  vec3 col;
  float lodF = 0.0;
  vec2 radio = vec2(0.0);
  if (uW[5] > 0.001) {
    vec3 c = uC[5];
    float zf = 0.5 + 0.45 * c.z * uPan + 0.4 * (ruido3(vec3(uT * c.y, 3.7, s0)) - 0.5) * 2.0;
    zf = clamp(zf, 0.05, 0.95);
    float zt = texture2D(uProf, tc).r;
    float px = c.x * (uRes.x / 390.0) * min(1.0, abs(zt - zf) * 2.2) * uW[5];
    vec2 sc = escalaCubrir();
    float texPorPx = float(textureSize(uImg, 0).y) * sc.y / uRes.y;
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

  // 4 · Luz: manchas de luz hechas con ruido fractal que deriva; caen más sobre lo
  // cercano y lo claro, toman el tono de las luces de la propia foto y tienen
  // paralaje (el dibujo de la luz sobre lo cercano es más grande y se mueve más).
  if (uW[3] > 0.001) {
    vec3 c = uC[3];
    vec3 media = textureLod(uImg, vec2(0.5), 12.0).rgb;
    vec3 tono = mix(vec3(1.0, 0.93, 0.82), media / max(max(media.r, max(media.g, media.b)), 0.02), 0.45);
    float tl = uT * c.z + uRecorrido * 0.12;
    vec2 p = vec2(tc.x * uAsp, tc.y) * c.y * (1.3 - 0.6 * z) + vec2(uPan * 0.25 * (0.3 + z), 0.0);
    vec2 alabeo = vec2(fbm3(vec3(p * 0.7, tl * 0.6 + s0)), fbm3(vec3(p * 0.7 + 4.3, tl * 0.6 + s0))) - 0.5;
    float n = fbm3(vec3(p + alabeo * 1.2, tl + s0 * 0.5));
    float mancha = smoothstep(0.42, 0.78, n);
    float recibe = mix(0.35, 1.0, z) * (0.45 + 0.55 * smoothstep(0.08, 0.7, lum(col)));
    float k = c.x * uW[3];
    col = 1.0 - (1.0 - col) * (1.0 - clamp(mancha * recibe * k * tono, 0.0, 1.0));
    col *= 1.0 - k * 0.18 * (1.0 - mancha);
  }

  // 2 · Respiración: exposición y viñeta que respiran, y grano vivo de película.
  if (uW[1] > 0.001) {
    vec3 c = uC[1];
    float aliento = sin(uT * 2.0 * PI / c.y + uSem * 6.2831) * 0.7 + (ruido3(vec3(uT * 0.17, 3.0, s0)) - 0.5) * 0.6;
    col *= 1.0 + c.x * aliento * uW[1];
    float r = length((uv - 0.5) * vec2(sa(), 1.0));
    float vin = smoothstep(1.05, 0.3, r * (1.0 - 0.05 * aliento));
    col *= mix(1.0, vin, 0.3 * uW[1]);
    float tam = max(1.0, floor(uRes.x / 390.0 + 0.5));
    float g = azarPix(floor(uv * uRes / tam), floor(uT * 24.0)) - 0.5;
    float medios = 1.0 - abs(lum(col) * 2.0 - 1.0);
    col += g * c.z * uW[1] * (0.35 + 0.65 * medios);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
