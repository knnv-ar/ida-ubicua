// 4 · Fractura: la imagen A estalla como un vidrio. Desde un punto de impacto salen
// grietas radiales cortadas por anillos de grietas; los trozos se abren, giran en
// el espacio y caen. Detrás, la imagen B se rearma con los trozos de otro vidrio que
// llegan desde el fondo. Cada transición usa un vidrio distinto (depende de uSeed).
// Los trozos son triángulos de una malla y su borde sigue la grilla de píxeles de
// la foto: cada píxel de la imagen pertenece entero a un solo trozo.
// Detrás de los trozos, fondo negro.
import { utiles } from './comun.js';

const KMAX = 28;    // grietas radiales como máximo
const JMAX = 12;    // anillos como máximo

// Uniforms, utilidades y geometría del vidrio compartidas por los dos shaders.
const vidrio = /* glsl */ `
float capaH;                                   // 0 = vidrio de A, 1 = vidrio de B
float H(vec2 p) { return hash21(p + capaH * vec2(37.13, 91.71)); }
float K() { return floor(uParam.x + 0.5); }
float J() { return floor(uParam.y + 0.5); }
vec2 impacto() {
  return (vec2(H(vec2(7.0, 3.0)), H(vec2(11.0, 5.0))) * 0.6 + 0.2) * vec2(aspPantalla(), 1.0);
}
float distMax(vec2 P) {                        // distancia a la esquina más lejana
  float sa = aspPantalla();
  return max(max(length(P), length(P - vec2(sa, 0.0))),
             max(length(P - vec2(0.0, 1.0)), length(P - vec2(sa, 1.0))));
}
// Vértice (k, j) del vidrio: k = grieta radial, j = anillo (0 = punto de impacto).
vec2 esquina(float k, float j) {
  vec2 P = impacto();
  if (j < 0.5) return P;
  float nK = K(), nJ = J();
  k = mod(k, nK);
  float paso = 6.2831853 / nK;
  float ang = (k + 0.6 * (H(vec2(k, 101.0)) - 0.5)) * paso + H(vec2(3.0, 9.0)) * 6.2831853;
  ang += 0.3 * (H(vec2(k + 57.0, j + 13.0)) - 0.5) * paso;      // grietas quebradas
  float rMax = distMax(P) * 1.6;
  float r0 = 0.025;
  float g = pow(rMax / r0, 1.0 / (nJ - 1.0));
  float R = j > nJ - 0.5 ? rMax : r0 * pow(g, j - 1.0 + 0.7 * (H(vec2(k, j)) - 0.5));
  return P + R * vec2(cos(ang), sin(ang));
}
// Lado de q respecto de cada arista, con el signo del triángulo: todos >= 0 → adentro.
bool dentro(vec2 q, vec2 a, vec2 b, vec2 c) {
  float s = sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  float e0 = ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) * s;
  float e1 = ((c.x - b.x) * (q.y - b.y) - (c.y - b.y) * (q.x - b.x)) * s;
  float e2 = ((a.x - c.x) * (q.y - c.y) - (a.y - c.y) * (q.x - c.x)) * s;
  return min(e0, min(e1, e2)) >= -1e-7;
}
// Escala y desplazamiento de cubrir(), para poder invertirlo.
void cubrirDatos(float aspImg, float pan, out vec2 s, out vec2 off) {
  float sa = aspPantalla();
  s = vec2(1.0);
  if (aspImg > sa) s.x = sa / aspImg; else s.y = aspImg / sa;
  off = (1.0 - s) * 0.5;
  off.x += pan * (1.0 - s.x) * 0.5;
}
`;

export default {
  id: 'fractura',
  nombre: 'Fractura',
  tipo: 'vidrio',
  params: [
    { nombre: 'Grietas radiales', min: 6, max: KMAX, paso: 1, def: 27 },
    { nombre: 'Anillos de grietas', min: 3, max: JMAX, paso: 1, def: 10 },
    { nombre: 'Fuerza del estallido', min: 0.2, max: 2, paso: 0.05, def: 1 },
  ],

  // Fondo negro detrás de los trozos (cerca de los extremos el pie del shader
  // lo funde con la imagen pura, como en los demás efectos).
  glsl: /* glsl */ `
vec4 efecto(vec2 uv) {
  return vec4(0.0, 0.0, 0.0, 1.0);
}
`,

  verticeVidrio: /* glsl */ `
precision highp float;
` + utiles + vidrio + /* glsl */ `
attribute vec4 aCelda;      // k, j, triángulo (0/1), capa (0 = A, 1 = B)
attribute float aEsquina;   // vértice del triángulo: 0, 1 o 2
flat varying vec4 vTab;     // triángulo original (espacio de pantalla con proporción)
flat varying vec2 vTc;
flat varying float vCapa;
varying vec2 vUv;           // lugar original en la pantalla (0..1)
varying float vLuz;
varying float vAlfa;

const float D = 2.0;        // distancia de la cámara, en altos de pantalla

vec3 rotar3(vec3 r, vec3 eje, float a) {
  float c = cos(a), s = sin(a);
  return r * c + cross(eje, r) * s + eje * dot(eje, r) * (1.0 - c);
}
void colapsar() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); vAlfa = 0.0; }

void main() {
  float k = aCelda.x, j = aCelda.y, tri = aCelda.z;
  capaH = aCelda.w;
  vCapa = aCelda.w;
  float sa = aspPantalla();
  if (k > K() - 0.5 || j > J() - 0.5) { colapsar(); return; }

  // Cuadrilátero entre dos grietas radiales y dos anillos, partido en dos triángulos.
  vec2 q0 = esquina(k, j), q1 = esquina(k + 1.0, j);
  vec2 q2 = esquina(k + 1.0, j + 1.0), q3 = esquina(k, j + 1.0);
  bool diag = H(vec2(k + 0.5, j + 7.5)) > 0.5;
  bool separado = j < 0.5 || H(vec2(k + 3.5, j + 1.5)) < 0.6;   // ¿los triángulos vuelan solos?
  vec2 a, b, c;
  if (j < 0.5) {                                   // junto al impacto: un solo triángulo
    if (tri > 0.5) { colapsar(); return; }
    a = q0; b = q2; c = q3;
  } else if (diag) {
    if (tri < 0.5) { a = q0; b = q1; c = q2; } else { a = q0; b = q2; c = q3; }
  } else {
    if (tri < 0.5) { a = q0; b = q1; c = q3; } else { a = q1; b = q2; c = q3; }
  }
  vTab = vec4(a, b);
  vTc = c;

  // Vértice propio, agrandado un píxel y medio de la foto hacia afuera: el borde
  // exacto del trozo lo decide luego cada píxel de la foto en el fragmento.
  vec2 v = aEsquina < 0.5 ? a : (aEsquina < 1.5 ? b : c);
  vec2 vp = aEsquina < 0.5 ? c : (aEsquina < 1.5 ? a : b);
  vec2 vn = aEsquina < 0.5 ? b : (aEsquina < 1.5 ? c : a);
  vec2 sc, oc;
  if (capaH < 0.5) cubrirDatos(uAspA, uPanA, sc, oc); else cubrirDatos(uAspB, uPanB, sc, oc);
  vec2 tam = vec2(capaH < 0.5 ? textureSize(uA, 0) : textureSize(uB, 0));
  float texel = 1.0 / (tam.y * sc.y);              // un píxel de la foto, en altos de pantalla
  float orient = sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  vec2 e1 = normalize(v - vp), e2 = normalize(vn - v);
  vec2 n1 = vec2(e1.y, -e1.x) * orient, n2 = vec2(e2.y, -e2.x) * orient;
  vec2 ext = (n1 + n2) / max(1.0 + dot(n1, n2), 0.05);
  float lx = length(ext);
  v += ext * min(1.0, 4.0 / max(lx, 1e-4)) * 1.5 * texel;
  vUv = vec2(v.x / sa, v.y);

  // Movimiento del trozo (rígido).
  vec2 C = separado ? (a + b + c) / 3.0 : (q0 + q1 + q2 + q3) * 0.25;
  vec2 id = vec2(k, j) + (separado ? tri * 0.37 : 0.0);
  vec4 h = vec4(H(id + 0.11), H(id + 0.23), H(id + 0.31), H(id + 0.47));
  vec3 eje = normalize(vec3(H(id + 0.53) - 0.5, H(id + 0.61) - 0.5, 0.35 * (H(id + 0.71) - 0.5)) + 1e-4);
  vec2 P = impacto();
  float dn = clamp(length(C - P) / distMax(P), 0.0, 1.0);
  vec2 dirR = normalize(C - P + 1e-4);
  float F = uParam.z;

  vec3 desp = vec3(0.0);
  float giro = 0.0;
  vAlfa = 1.0;
  if (capaH < 0.5) {
    // A: se agrieta desde el impacto, después el trozo sale despedido y cae.
    float ini = 0.03 + 0.34 * dn + 0.06 * h.x;
    float t = clamp((uP - ini) / 0.45, 0.0, 1.0);
    if (t >= 1.0) { colapsar(); return; }
    float grieta = smoothstep(ini * 0.4, ini, uP);
    desp.xy = dirR * (0.004 * grieta + F * (0.35 + 0.6 * h.y) * t);
    desp.z = min(F * (0.2 + 0.4 * h.z), 0.9) * t;
    desp.y -= (2.0 + F) * t * t;
    giro = F * (1.5 + 3.0 * h.w) * t + 0.02 * grieta * (h.w - 0.5);
  } else {
    // B: los trozos llegan girando desde el fondo y frenan al encajar.
    float ini = 0.24 + 0.16 * dn + 0.06 * h.x;
    float l = clamp((uP - ini) / 0.5, 0.0, 1.0);
    if (l <= 0.0) { colapsar(); return; }
    float t = pow(1.0 - l, 3.0);
    desp.xy = dirR * F * (0.3 + 0.6 * h.y) * t;
    desp.z = -(1.5 + 4.5 * h.z) * (0.5 + 0.5 * F) * t;
    giro = F * (1.5 + 3.0 * h.w) * t;
    vAlfa = smoothstep(0.0, 0.12, l);
  }

  vec3 r = rotar3(vec3(v - C, 0.0), eje, giro);
  vec3 w = vec3(C, 0.0) + desp + r;
  vLuz = mix(0.6, 1.0, abs(rotar3(vec3(0.0, 0.0, 1.0), eje, giro).z));
  // Perspectiva centrada en la pantalla; w lleva la corrección de perspectiva.
  float z = min(w.z, D * 0.9);
  gl_Position = vec4((w.x - sa * 0.5) * 2.0 / sa, (w.y - 0.5) * 2.0, 0.0, (D - z) / D);
}
`,

  fragmentoVidrio: /* glsl */ `
precision highp float;
` + utiles + vidrio + /* glsl */ `
flat varying vec4 vTab;
flat varying vec2 vTc;
flat varying float vCapa;
varying vec2 vUv;
varying float vLuz;
varying float vAlfa;

void main() {
  capaH = vCapa;
  bool esA = vCapa < 0.5;
  vec2 tcA = cubrir(vUv, uAspA, uPanA), tcB = cubrir(vUv, uAspB, uPanB);
  vec3 col = esA ? texture2D(uA, tcA).rgb : texture2D(uB, tcB).rgb;
  if (vAlfa < 0.01 || vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;
  // El píxel de la foto que cae acá pertenece a este trozo si su centro está adentro.
  vec2 sc, oc;
  if (esA) cubrirDatos(uAspA, uPanA, sc, oc); else cubrirDatos(uAspB, uPanB, sc, oc);
  vec2 tam = vec2(esA ? textureSize(uA, 0) : textureSize(uB, 0));
  vec2 tc = esA ? tcA : tcB;
  vec2 centro = (floor(tc * tam) + 0.5) / tam;
  vec2 uvc = (centro - oc) / sc;
  if (!dentro(vec2(uvc.x * aspPantalla(), uvc.y), vTab.xy, vTab.zw, vTc)) discard;
  gl_FragColor = vec4(col * vLuz, vAlfa);
}
`,

  // Malla fija: para cada vidrio (primero B, que va detrás; después A) y cada celda
  // (k, j) hasta el máximo, dos triángulos. Las celdas que sobran se colapsan en el
  // shader, así que cambiar los parámetros no obliga a rearmarla.
  malla() {
    const n = 2 * KMAX * JMAX * 2 * 3;
    const pos = new Float32Array(n * 3);
    const celda = new Float32Array(n * 4);
    const esquina = new Float32Array(n);
    let v = 0;
    for (const capa of [1, 0]) {
      for (let k = 0; k < KMAX; k++) {
        for (let j = 0; j < JMAX; j++) {
          for (let t = 0; t < 2; t++) {
            for (let e = 0; e < 3; e++, v++) {
              celda.set([k, j, t, capa], v * 4);
              esquina[v] = e;
            }
          }
        }
      }
    }
    return { pos, celda, esquina };
  },
};
