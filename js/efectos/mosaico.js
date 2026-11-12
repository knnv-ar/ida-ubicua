// 1 · Mosaico: los píxeles se agrupan en bloques de color plano, cada región
// cambia a la imagen nueva en su propio momento y los bloques vuelven a achicarse.
// Todos los bloques pertenecen a una misma grilla: el bloque más grande mide una
// potencia de 2 en píxeles y cada tamaño intermedio es la mitad del anterior, así
// que los cuadrados de la imagen que sale y de la que entra siempre se alinean.
export default {
  id: 'mosaico',
  nombre: 'Mosaico',
  params: [
    { nombre: 'Tamaño máximo de celda', unidad: 'px', min: 8, max: 120, paso: 1, def: 64 },
    { nombre: 'Dispersión del cambio', min: 0, max: 0.8, paso: 0.01, def: 0.69 },
    { nombre: 'Curva de crecimiento', min: 0.3, max: 3, paso: 0.05, def: 0.8 },
  ],
  glsl: /* glsl */ `
vec4 efecto(vec2 uv) {
  float m = pow(arco(), uParam.z);
  // Celda máxima: potencia de 2 más cercana al tamaño pedido (en píxeles de dispositivo).
  float nivelMax = max(1.0, floor(log2(max(2.0, uParam.x * escalaPx())) + 0.5));
  float maxC = exp2(nivelMax);
  // Tamaño actual: escalones 1, 2, 4, 8… hasta la celda máxima (todos la dividen).
  float tam = exp2(floor(m * nivelMax + 0.5));
  // La grilla se centra en la pantalla para que los bordes queden parejos.
  vec2 px = uv * uRes - mod(uRes, maxC) * 0.5;
  vec2 q = ((floor(px / tam) + 0.5) * tam + mod(uRes, maxC) * 0.5) / uRes;
  // Cada celda máxima cambia de imagen en su propio momento (contiene bloques enteros).
  float h = hash21(floor(px / maxC));
  float umbral = 0.5 + (h - 0.5) * uParam.y;
  float t = smoothstep(umbral - 0.015, umbral + 0.015, uP);
  return mix(colABloque(q, tam), colBBloque(q, tam), t);
}
`,
};
