// 2 · Separación cromática: la imagen se posteriza y sus canales rojo, verde y azul
// se separan; la nueva entra canal por canal (rojo, verde, azul).
export default {
  id: 'cromatica',
  nombre: 'Separación cromática',
  params: [
    { nombre: 'Niveles de color en el punto medio', min: 2, max: 16, paso: 1, def: 11 },
    { nombre: 'Desplazamiento de canales', min: 0, max: 0.2, paso: 0.005, def: 0.165 },
    { nombre: 'Escalonado entre canales', min: 0, max: 0.3, paso: 0.01, def: 0.21 },
  ],
  glsl: /* glsl */ `
vec4 efecto(vec2 uv) {
  float m = arco();
  float niveles = mix(64.0, uParam.x, smoothstep(0.0, 1.0, m));
  float n = fbm(uv * 3.0 + uSeed * 10.0);
  float d = uParam.y * m * (0.4 + n);
  float a0 = uSeed * 6.2831;
  vec2 corr = vec2(1.0 / aspPantalla(), 1.0);
  vec2 oR = vec2(cos(a0), sin(a0)) * d * corr;
  vec2 oG = vec2(cos(a0 + 2.094), sin(a0 + 2.094)) * d * corr;
  vec2 oB = vec2(cos(a0 + 4.189), sin(a0 + 4.189)) * d * corr;
  float e = uParam.z;
  float tR = smoothstep(0.35 - e, 0.65 - e, uP);
  float tG = smoothstep(0.35, 0.65, uP);
  float tB = smoothstep(0.35 + e, 0.65 + e, uP);
  vec3 c = vec3(
    mix(colA(uv + oR).r, colB(uv - oR).r, tR),
    mix(colA(uv + oG).g, colB(uv - oG).g, tG),
    mix(colA(uv + oB).b, colB(uv - oB).b, tB));
  c = floor(c * niveles + 0.5) / niveles;
  return vec4(c, 1.0);
}
`,
};
