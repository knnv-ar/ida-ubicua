// Carrusel horizontal de las tres naves (CSS scroll snap). Detecta cuál quedó
// en pantalla y avisa para pausar o reanudar audio, video y cinta.

export const NAVES = ['izquierda', 'central', 'derecha'];

export function crearNaves(contenedor, alCambiar) {
  const secciones = NAVES.map((n) => document.getElementById(`nave-${n}`));
  const visibilidad = new Map();
  let activa = null;
  let indice = 1;
  let observador = null;

  function irA(i, suave = false) {
    indice = i;
    contenedor.scrollTo({ left: i * contenedor.clientWidth, behavior: suave ? 'smooth' : 'instant' });
  }

  function evaluar() {
    let mejor = null, max = 0;
    for (const [sec, r] of visibilidad) if (r > max) { max = r; mejor = sec; }
    if (!mejor || max < 0.6) return;            // a mitad de camino: no cambia nada
    const nombre = mejor.id.replace('nave-', '');
    indice = NAVES.indexOf(nombre);
    if (nombre !== activa) {
      activa = nombre;
      alCambiar(nombre);
    }
  }

  function empezar() {
    irA(1);
    // Se observa recién con la nave central ya en pantalla.
    requestAnimationFrame(() => {
      observador = new IntersectionObserver((entradas) => {
        for (const e of entradas) visibilidad.set(e.target, e.intersectionRatio);
        evaluar();
      }, { root: contenedor, threshold: [0, 0.6, 1] });
      secciones.forEach((s) => observador.observe(s));
    });
  }

  // Al cambiar el tamaño (barra del navegador, rotación) se mantiene la nave.
  window.addEventListener('resize', () => {
    if (!contenedor.hidden) contenedor.scrollTo({ left: indice * contenedor.clientWidth, behavior: 'instant' });
  });

  return {
    empezar,
    irA,
    get activa() { return activa; },
  };
}
