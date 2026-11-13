// 3 · Glitch: la imagen A se rompe como un archivo de video dañado y en cada rotura
// se cuelan rasgos de la imagen B: bandas horizontales corridas, bloques que
// intercambian canales de color con B, que se deforman con los colores de B, que
// toman la luz de B o que se arrastran como un datamosh. De a poco los bloques
// pasan a B (rota a su vez con rasgos de A) hasta que la imagen se recompone.
// Los bloques "muertos" se ven negros. El patrón cambia a saltos, no de forma
// continua, como un error digital.
export default {
  id: 'glitch',
  nombre: 'Glitch',
  params: [
    { nombre: 'Tamaño de bloque', unidad: 'px', min: 4, max: 48, paso: 1, def: 8 },
    { nombre: 'Intensidad de la rotura', min: 0, max: 1, paso: 0.01, def: 0.83 },
    { nombre: 'Saltos del patrón', min: 4, max: 60, paso: 1, def: 20 },
  ],
  glsl: /* glsl */ `
// Muestreo sin mipmaps: las coordenadas saltan por bloques y bandas, y con
// derivadas aparecerían líneas en los bordes. Además deja el píxel crudo.
vec3 pa(vec2 uv) { return textureLod(uA, cubrir(fract(uv), uAspA, uPanA), 0.0).rgb; }
vec3 pb(vec2 uv) { return textureLod(uB, cubrir(fract(uv), uAspB, uPanB), 0.0).rgb; }
vec3 propia(vec2 uv, bool esA) { return esA ? pa(uv) : pb(uv); }
vec3 ajena(vec2 uv, bool esA) { return esA ? pb(uv) : pa(uv); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec4 efecto(vec2 uv) {
  float m = arco();
  float g = clamp(m * (0.3 + uParam.y), 0.0, 1.0);        // fuerza de la rotura
  float paso = floor(uP * uParam.z);                       // el patrón cambia a saltos
  float bl = max(2.0, floor(uParam.x * escalaPx()));
  vec2 px = uv * uRes;

  // Bandas horizontales de alto variable (1, 2, 4 u 8 por franja de 8 bloques).
  float franja = bl * 8.0;
  float fila = floor(px.y / franja);
  float n = exp2(floor(hash21(vec2(fila, paso + 1.0)) * 4.0));
  float banda = fila * 8.0 + floor(fract(px.y / franja) * n);
  float hb = hash21(vec2(banda, paso + 7.0));
  bool activa = hb < g * 0.7;
  float corr = 0.0;
  if (activa) {
    corr = (hash21(vec2(banda, paso + 13.0)) - 0.5) * 0.8 * g;
    corr = floor(corr * uRes.x / bl) * bl / uRes.x;       // corrimiento en bloques enteros
  }
  vec2 u = vec2(uv.x + corr, uv.y);                       // fract() al muestrear: la fila "da la vuelta"

  // Cada banda activa se corta en tramos de 2, 4, 8 o 16 bloques; cada tramo
  // tiene su propia rotura (así el daño forma tiras, no ruido suelto).
  float largo = bl * exp2(1.0 + floor(hash21(vec2(banda, paso + 19.0)) * 4.0));
  float tramo = floor(fract(u.x) * uRes.x / largo);
  float hs = hash21(vec2(tramo, banda) + paso * 3.17);
  float hs2 = hash21(vec2(banda, tramo) + paso * 5.31 + 11.0);
  vec2 bq = floor(u * uRes / bl);
  vec2 ub = (bq + 0.5) * bl / uRes;                        // centro del bloque
  float hk = hash21(bq + paso * 1.73 + 29.0);

  // ¿Ya pasó a B? Avanza con uP: en las bandas activas por tramo, en las demás
  // la banda entera.
  float azar = activa ? hs2 : hash21(vec2(banda, 41.0));
  bool esA = azar > smoothstep(0.12, 0.88, uP + (hb - 0.5) * 0.2);

  // Separación de canales en las bandas activas.
  float o = activa ? (hs2 - 0.5) * 0.05 * g : 0.0;
  vec3 col = vec3(propia(u + vec2(o, 0.0), esA).r, propia(u, esA).g, propia(u - vec2(o, 0.0), esA).b);

  float k = activa ? hs / (0.25 + 0.75 * g) : 2.0;         // modo del tramo
  if (k < 0.12) {
    // Canales intercambiados con la otra imagen, color recortado a 4 bits.
    vec3 y = ajena(u, esA);
    float r = fract(hs2 * 7.0);
    col = r < 0.5 ? vec3(col.r, y.g, col.b) : vec3(y.r, col.g, y.b);
    col = floor(col * 16.0) / 16.0;
  } else if (k < 0.27) {
    // Deformada por los colores de la otra imagen (desplazamiento por bloque).
    vec3 y = ajena(ub, esA);
    col = propia(u + (y.rg - 0.5) * 0.25 * g, esA);
  } else if (k < 0.40) {
    // Color propio con la luz de la otra imagen, en pocos niveles.
    vec3 c = propia(u, esA);
    float L = floor(lum(ajena(u, esA)) * 5.0 + 0.5) / 5.0;
    col = clamp(c / max(lum(c), 0.04) * L, 0.0, 1.0);
  } else if (k < 0.55) {
    // Arrastre (datamosh): la otra imagen estirada hacia abajo desde una fila.
    float alto = bl * (2.0 + floor(hs2 * 10.0));
    float y0 = (floor(px.y / alto) * alto + 0.5) / uRes.y;
    col = ajena(vec2(u.x, y0), esA);
  } else if (k < 0.66) {
    // Macrobloques: la otra imagen muy comprimida.
    col = ajena(ub, esA);
  } else if (k < 0.71) {
    col = vec3(0.0);                                       // tramo muerto
  }
  // Algunos macrobloques sueltos fuera de las bandas: negros o de la otra imagen.
  if (!activa && hk < 0.05 * g) col = hk < 0.02 * g ? vec3(0.0) : ajena(ub, esA);

  // Líneas de barrido en las bandas activas.
  if (activa) col *= 0.85 + 0.15 * mod(floor(px.y / max(1.0, floor(escalaPx()))), 2.0);
  return vec4(col, 1.0);
}
`,
};
