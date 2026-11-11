// 4 · Fractura: A se quiebra en polígonos de Voronoi que giran, se alejan y se
// achican desde un punto de impacto; los fragmentos de B llegan y encajan.
export default {
  id: 'fractura',
  nombre: 'Fractura',
  params: [
    { nombre: 'Fragmentos a lo ancho', min: 3, max: 24, paso: 1, def: 9 },
    { nombre: 'Propagación desde el impacto', min: 0, max: 0.7, paso: 0.01, def: 0.32 },
    { nombre: 'Giro de los fragmentos', unidad: 'rad', min: 0, max: 3, paso: 0.05, def: 2.7 },
  ],
  glsl: /* glsl */ `
// Devuelve (id de celda, centro de celda) en el espacio de celdas.
vec4 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float md = 8.0;
  vec2 mg = vec2(0.0), mc = vec2(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.15 + 0.7 * hash22(n + g);
    vec2 d = g + o - f;
    float dd = dot(d, d);
    if (dd < md) { md = dd; mg = n + g; mc = n + g + o; }
  }
  return vec4(mg, mc);
}

vec3 fragmento(vec2 xp, vec2 esp, vec2 id, vec2 c, vec2 dir, float esc, float ang, bool deA, vec3 fondo) {
  if (esc < 0.001) return fondo;
  vec2 v = xp - c - dir * (1.0 - esc) * 0.8;
  v = rotar(-ang) * v / esc;
  vec2 y = c + v;
  vec4 w = voronoi(y);
  if (w.x != id.x || w.y != id.y) return fondo;
  vec2 uvy = y / esp;
  return deA ? colA(uvy).rgb : colB(uvy).rgb;
}

vec4 efecto(vec2 uv) {
  float N = uParam.x;
  vec2 esp = vec2(N, N / aspPantalla());
  vec2 xp = uv * esp;
  vec4 v = voronoi(xp);
  vec2 id = v.xy, c = v.zw;
  vec2 impacto = (hash22(vec2(uSeed * 31.0, 7.0)) * 0.6 + 0.2) * esp;
  float dist = length(c - impacto) / length(esp);
  float sp = uParam.y;
  float lp = clamp((uP - dist * sp) / (1.0 - sp), 0.0, 1.0);
  float eA = 1.0 - smoothstep(0.0, 0.5, lp);
  float eB = smoothstep(0.5, 1.0, lp);
  float azar = hash21(id + 3.7) - 0.5;
  vec2 dir = normalize(c - impacto + 1e-4);
  vec3 col = mix(colA(uv, 5.0).rgb, colB(uv, 5.0).rgb, uP) * 0.7;
  col = fragmento(xp, esp, id, c, -dir, eB, (1.0 - eB) * uParam.z * azar * 2.0, false, col);
  col = fragmento(xp, esp, id, c,  dir, eA, (1.0 - eA) * uParam.z * azar * 2.0, true,  col);
  return vec4(col, 1.0);
}
`,
};
