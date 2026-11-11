// 1 · Mosaico: los píxeles se agrupan en bloques de color plano, cada región
// cambia a la imagen nueva en su propio momento y los bloques vuelven a achicarse.
export default {
  id: 'mosaico',
  nombre: 'Mosaico',
  params: [
    { nombre: 'Tamaño máximo de celda', unidad: 'px', min: 8, max: 120, paso: 1, def: 20 },
    { nombre: 'Dispersión del cambio', min: 0, max: 0.8, paso: 0.01, def: 0.66 },
    { nombre: 'Curva de crecimiento', min: 0.3, max: 3, paso: 0.05, def: 0.5 },
  ],
  glsl: /* glsl */ `
vec4 efecto(vec2 uv) {
  float m = pow(arco(), uParam.z);
  float maxC = max(2.0, uParam.x * escalaPx());
  float tam = max(1.0, mix(1.0, maxC, m));
  vec2 px = uv * uRes;
  vec2 q = (floor(px / tam) + 0.5) * tam / uRes;
  float lod = log2(tam);
  float h = hash21(floor(px / maxC));
  float umbral = 0.5 + (h - 0.5) * uParam.y;
  float t = smoothstep(umbral - 0.015, umbral + 0.015, uP);
  return mix(colA(q, lod), colB(q, lod), t);
}
`,
};
