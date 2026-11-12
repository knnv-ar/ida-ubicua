// Código GLSL compartido por todos los efectos de transición de IDA ubicua.
// Cada efecto de pantalla completa define `vec4 efecto(vec2 uv)`;
// uP va de 0 (imagen A entera) a 1 (imagen B entera).

export const vertice = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Uniforms y utilidades válidas tanto en shaders de vértices como de fragmentos.
export const utiles = /* glsl */ `
uniform sampler2D uA;     // imagen de origen
uniform sampler2D uB;     // imagen de destino
uniform float uP;         // progreso de la transición, 0..1
uniform vec2  uRes;       // tamaño del lienzo en píxeles de dispositivo
uniform float uAspA;      // proporción ancho/alto de A
uniform float uAspB;      // proporción ancho/alto de B
uniform float uPanA;      // paneo horizontal de A, -1..1
uniform float uPanB;      // paneo horizontal de B, -1..1
uniform float uSeed;      // semilla de la transición, 0..1
uniform vec3  uParam;     // tres parámetros propios del efecto

#define PI 3.14159265

float aspPantalla() { return uRes.x / uRes.y; }
// Escala para medir en "px CSS de un celular de 390 px de ancho".
float escalaPx() { return uRes.x / 390.0; }

// Equivalente a object-fit: cover, con paneo horizontal.
vec2 cubrir(vec2 uv, float aspImg, float pan) {
  float sa = aspPantalla();
  vec2 s = vec2(1.0);
  if (aspImg > sa) s.x = sa / aspImg; else s.y = aspImg / sa;
  vec2 off = (1.0 - s) * 0.5;
  off.x += pan * (1.0 - s.x) * 0.5;
  return off + clamp(uv, 0.0, 1.0) * s;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed * 17.0);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.17));
}
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * ruido(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
// 0 en los extremos, 1 en la mitad de la transición.
float arco() { return sin(uP * PI); }
mat2 rotar(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

// Muestreo de las imágenes (solo en fragmentos: usa desenfoque por mipmap).
export const muestreo = /* glsl */ `
vec4 colA(vec2 uv) { return texture2D(uA, cubrir(uv, uAspA, uPanA)); }
vec4 colB(vec2 uv) { return texture2D(uB, cubrir(uv, uAspB, uPanB)); }
// Con desenfoque (lod > 0 = más difuso).
vec4 colA(vec2 uv, float lod) { return texture2D(uA, cubrir(uv, uAspA, uPanA), lod); }
vec4 colB(vec2 uv, float lod) { return texture2D(uB, cubrir(uv, uAspB, uPanB), lod); }

// Promedio de un bloque de "px" píxeles de pantalla con nivel de mipmap explícito.
// Se usa cuando las coordenadas son constantes por bloque (mosaico, puntillismo):
// con texture2D + bias, la GPU calcula el nivel a partir de las derivadas y en los
// bordes de cada bloque salta al mipmap más difuso, lo que dibuja líneas de grilla.
float lodBloque(sampler2D t, float aspImg, float px) {
  float sa = aspPantalla();
  float sy = aspImg > sa ? 1.0 : aspImg / sa;
  float texelesPorPx = float(textureSize(t, 0).y) * sy / uRes.y;
  return log2(max(px * texelesPorPx, 1.0));
}
vec4 colABloque(vec2 uv, float px) { return textureLod(uA, cubrir(uv, uAspA, uPanA), lodBloque(uA, uAspA, px)); }
vec4 colBBloque(vec2 uv, float px) { return textureLod(uB, cubrir(uv, uAspB, uPanB), lodBloque(uB, uAspB, px)); }
`;

export const cabecera = /* glsl */ `
precision highp float;
varying vec2 vUv;
` + utiles + muestreo;

// Cerca de los extremos se mezcla con la imagen pura: la transición siempre
// empieza exactamente en A y termina exactamente en B.
export const pie = /* glsl */ `
void main() {
  vec4 e = efecto(vUv);
  vec3 puro = uP < 0.5 ? colA(vUv).rgb : colB(vUv).rgb;
  float k = smoothstep(0.0, 0.12, arco());
  gl_FragColor = vec4(mix(puro, e.rgb, k), 1.0);
}
`;
