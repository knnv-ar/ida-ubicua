import { vertice, cabecera, pie } from './comun.js';
import mosaico from './mosaico.js';
import cromatica from './cromatica.js';
import puntillismo from './puntillismo.js';
import fractura from './fractura.js';
import liquido from './liquido.js';
import particulas from './particulas.js';

export const efectos = [mosaico, cromatica, puntillismo, fractura, liquido, particulas];
export { vertice };

export function fragmentoDe(efecto) {
  return cabecera + efecto.glsl + pie;
}

export function valoresPorDefecto(efecto) {
  return efecto.params.map((p) => p.def);
}
