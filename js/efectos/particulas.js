// 6 · Polvo de partículas: la imagen se descompone en partículas (una por celda de
// la pantalla) que se levantan siguiendo un viento turbulento y, a medida que
// vuelven a su lugar, cambian al color de la imagen nueva.
// A diferencia de los otros cinco, no es solo un shader de pantalla completa:
// dibuja un fondo (la mezcla difusa de A y B) y encima una nube de puntos.
import { utiles } from './comun.js';

export default {
  id: 'particulas',
  nombre: 'Polvo de partículas',
  tipo: 'particulas',
  params: [
    { nombre: 'Tamaño de cada partícula', unidad: 'px', min: 3, max: 12, paso: 0.5, def: 3 },
    { nombre: 'Fuerza del viento', min: 0, max: 1.5, paso: 0.01, def: 1.03 },
    { nombre: 'Escala de los remolinos', min: 0.5, max: 6, paso: 0.1, def: 5.3 },
  ],

  // Fondo: la mezcla difusa y oscurecida de A y B que se ve entre partículas.
  glsl: /* glsl */ `
vec4 efecto(vec2 uv) {
  float m = arco();
  vec3 c = mix(colA(uv, 4.5).rgb, colB(uv, 4.5).rgb, smoothstep(0.3, 0.7, uP));
  return vec4(c * (1.0 - 0.55 * m), 1.0);
}
`,

  verticePuntos: /* glsl */ `
precision highp float;
` + utiles + /* glsl */ `
uniform float uCelda;     // tamaño de celda en píxeles de dispositivo
attribute vec2 aUv;       // lugar de la partícula en la imagen (0..1)
attribute vec4 aRand;     // azar propio de cada partícula
varying vec3 vCol;
varying float vAlfa;
varying float vForma;

vec2 rizo(vec2 p) {       // campo sin divergencia: remolinos
  float e = 0.08;
  float n1 = ruido(p + vec2(0.0, e)), n2 = ruido(p - vec2(0.0, e));
  float n3 = ruido(p + vec2(e, 0.0)), n4 = ruido(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

void main() {
  float m = arco();
  float sa = aspPantalla();
  vec2 dirS = normalize(hash22(vec2(uSeed * 13.0, 3.0)) - 0.5 + 1e-3);
  float barrido = clamp(dot(aUv - 0.5, dirS) + 0.5, 0.0, 1.0);
  float retardo = mix(aRand.x, barrido, 0.6);
  float lp = clamp((uP - retardo * 0.45) / 0.55, 0.0, 1.0);   // progreso propio
  float vuelo = sin(lp * PI);

  vec2 q = vec2(aUv.x * sa, aUv.y) * uParam.z + vec2(0.0, lp * 1.5) + uSeed * 7.0;
  vec2 viento = rizo(q) + 0.5 * rizo(q * 2.1 + 5.0);
  vec2 off = (viento * 0.07 + (aRand.zw - 0.5) * 0.22 + vec2(0.0, 0.14 * aRand.y))
             * uParam.y * pow(vuelo, 1.3);
  off.x /= sa;

  vec3 cA = textureLod(uA, cubrir(aUv, uAspA, uPanA), 1.5).rgb;
  vec3 cB = textureLod(uB, cubrir(aUv, uAspB, uPanB), 1.5).rgb;
  vCol = mix(cA, cB, smoothstep(0.42, 0.58, lp));
  float L = dot(vCol, vec3(0.299, 0.587, 0.114));

  gl_PointSize = uCelda * mix(1.5, 0.45 + 0.6 * L, smoothstep(0.0, 0.6, vuelo));
  vAlfa = smoothstep(0.0, 0.12, m);
  vForma = smoothstep(0.0, 0.5, vuelo);
  gl_Position = vec4((aUv + off) * 2.0 - 1.0, 0.0, 1.0);
}
`,

  fragmentoPuntos: /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vAlfa;
varying float vForma;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float circulo = 1.0 - smoothstep(0.36, 0.5, length(c));
  float a = mix(1.0, circulo, vForma) * vAlfa;   // cuadradas en reposo, redondas al volar
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}
`,

  // Una partícula por celda; se reconstruye si cambia el tamaño o la pantalla.
  grilla(resX, resY, celdaCss) {
    const celdaDev = Math.max(2, celdaCss * (resX / 390));
    const cols = Math.max(8, Math.round(resX / celdaDev));
    const filas = Math.max(8, Math.round(resY / (resX / cols)));
    const n = cols * filas;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const azar = new Float32Array(n * 4);
    for (let j = 0, k = 0; j < filas; j++) {
      for (let i = 0; i < cols; i++, k++) {
        uv[k * 2] = (i + 0.5) / cols;
        uv[k * 2 + 1] = (j + 0.5) / filas;
        for (let r = 0; r < 4; r++) azar[k * 4 + r] = Math.random();
      }
    }
    return { cols, filas, celda: resX / cols, pos, uv, azar };
  },
};
