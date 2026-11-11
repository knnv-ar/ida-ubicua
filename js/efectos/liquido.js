// 5 · Flujo líquido: A se arrastra en un campo turbulento, como tinta en agua,
// y se disuelve donde la corriente es más fuerte; B emerge del mismo flujo.
export default {
  id: 'liquido',
  nombre: 'Flujo líquido',
  params: [
    { nombre: 'Fuerza de la corriente', min: 0, max: 0.6, paso: 0.01, def: 0.25 },
    { nombre: 'Escala de los remolinos', min: 0.5, max: 6, paso: 0.1, def: 2.2 },
    { nombre: 'Suavidad del borde', min: 0.02, max: 0.3, paso: 0.01, def: 0.1 },
  ],
  glsl: /* glsl */ `
vec4 efecto(vec2 uv) {
  float m = arco();
  vec2 p = vec2(uv.x * aspPantalla(), uv.y) * uParam.y + uSeed * 5.0;
  vec2 q = vec2(fbm(p + vec2(0.0, uP * 1.5)), fbm(p + vec2(5.2, 1.3) - vec2(uP * 1.2, 0.0)));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2)), fbm(p + 4.0 * q + vec2(8.3, 2.8)));
  vec2 w = (r - 0.5) * uParam.x * m;
  w.x /= aspPantalla();
  float n = clamp((fbm(p * 0.8 + 3.0 * r) - 0.2) / 0.6, 0.0, 1.0);
  float b = uParam.z;
  float umbral = mix(-b, 1.0 + b, uP);
  float quedaA = smoothstep(umbral - b, umbral + b, n);
  vec3 c = mix(colB(uv - w * 0.7).rgb, colA(uv + w).rgb, quedaA);
  return vec4(c, 1.0);
}
`,
};
