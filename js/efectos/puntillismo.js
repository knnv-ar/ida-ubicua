// 3 · Puntillismo: la imagen se vuelve una trama hexagonal de puntos cuyo tamaño
// depende del brillo; los puntos de A se encogen y derivan, los de B crecen.
export default {
  id: 'puntillismo',
  nombre: 'Puntillismo',
  params: [
    { nombre: 'Separación máxima entre puntos', unidad: 'px', min: 6, max: 48, paso: 1, def: 7 },
    { nombre: 'Deriva de los puntos', min: 0, max: 1, paso: 0.01, def: 0 },
    { nombre: 'Oscuridad del fondo', min: 0, max: 0.8, paso: 0.01, def: 0.68 },
  ],
  glsl: /* glsl */ `
vec4 efecto(vec2 uv) {
  float m = arco();
  float s = mix(1.5, max(2.0, uParam.x * escalaPx()), smoothstep(0.0, 0.7, m));
  vec2 px = uv * uRes;
  vec2 r = vec2(1.0, 1.7320508) * s;
  vec2 h = r * 0.5;
  vec2 a = mod(px, r) - h;
  vec2 b = mod(px - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;     // distancia al centro más cercano
  vec2 centro = px - g;
  vec2 cuv = centro / uRes;
  vec4 cA = colABloque(cuv, s);
  vec4 cB = colBBloque(cuv, s);
  float LA = dot(cA.rgb, vec3(0.299, 0.587, 0.114));
  float LB = dot(cB.rgb, vec3(0.299, 0.587, 0.114));
  float kA = 1.0 - smoothstep(0.1, 0.75, uP);
  float kB = smoothstep(0.25, 0.9, uP);
  vec2 deriva = (vec2(ruido(centro * 0.013 + 3.0), ruido(centro * 0.013 + 11.0)) - 0.5)
                * uParam.y * 0.7 * s * m;
  float rA = 0.62 * s * kA * (0.55 + 0.45 * LA);
  float rB = 0.62 * s * kB * (0.55 + 0.45 * LB);
  float inA = 1.0 - smoothstep(rA - 1.0, rA + 1.0, length(g - deriva));
  float inB = 1.0 - smoothstep(rB - 1.0, rB + 1.0, length(g + deriva));
  vec3 c = mix(colA(uv, 6.0).rgb, colB(uv, 6.0).rgb, uP) * (1.0 - uParam.z);
  if (kA >= kB) { c = mix(c, cB.rgb, inB); c = mix(c, cA.rgb, inA); }
  else          { c = mix(c, cA.rgb, inA); c = mix(c, cB.rgb, inB); }
  return vec4(c, 1.0);
}
`,
};
