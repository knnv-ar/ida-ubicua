// Indicaciones laterales de la nave central: «‹ créditos» y «video ›».
// No se tocan: a las naves laterales solo se llega deslizando el dedo.
// · Al llegar a la nave central no se muestran (solo la guía de desplazamiento).
// · Primer asomo: después de pasar al menos 4 fotos y con el dedo quieto 2 s, el
//   carrusel se corre un poco hacia los créditos y vuelve; aparece solo «‹ créditos».
// · Segundo asomo: en la detención siguiente (tras recorrer algo más), hacia el
//   video; aparece solo «video ›».
// · Después, con el dedo quieto 2 s, reaparece un solo texto, alternando créditos
//   y video, de los lados que todavía no se visitaron.
// · Cada asomo ocurre una sola vez y no ocurre si ya se visitó ese lado.
// · Con «reducir movimiento» no hay asomo: el texto aparece solo.

export const AJUSTES_LATERALES = {
  ocultarTras: 60,      // px de scroll vertical que apagan el texto
  quieto: 2000,         // ms con el dedo quieto para el asomo o para que vuelva un texto
  fotosPrimerAsomo: 4,  // fotos que hay que pasar antes del primer asomo
  recorridoAsomo: 1.2,  // pantallas recorridas antes del segundo asomo
  asomo: 0.14,          // cuánto se corre el carrusel (fracción del ancho)
  ida: 650, pausa: 450, vuelta: 950,   // ms de cada fase del asomo
};

const IZQ = 0, DER = 2;   // índices de las naves laterales en el carrusel
const salida = (t) => 1 - Math.pow(1 - t, 3);
const rebote = (t) => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export function crearLaterales({ naves, cinta, izquierda, derecha, indiceFoto }) {
  const A = AJUSTES_LATERALES;
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const texto = { [IZQ]: izquierda, [DER]: derecha };
  const visitadas = { [IZQ]: false, [DER]: false };
  const asomados = { [IZQ]: false, [DER]: false };
  let activa = false;
  let turno = IZQ;
  let fotosVistas = new Set();
  let recorrido = 0;            // pantallas recorridas desde el último asomo
  let ultimoTop = cinta.scrollTop;
  let topAlMostrar = cinta.scrollTop;
  let reloj = 0;
  let enAsomo = false, pedidoAsomo = 0;

  function anotarFoto() {
    const i = indiceFoto();
    if (Number.isFinite(i)) fotosVistas.add(i);
  }

  function mostrar(lado) {
    topAlMostrar = cinta.scrollTop;
    const t = texto[lado];
    t.classList.remove('apagandose');
    t.classList.add('visible');
    if (!reducir) { t.classList.remove('empuja'); void t.offsetWidth; t.classList.add('empuja'); }
  }
  function apagar() {
    for (const t of [izquierda, derecha]) {
      if (t.classList.contains('visible')) { t.classList.add('apagandose'); t.classList.remove('visible'); }
    }
  }

  // Un texto por vez, alternando, de los lados ya asomados y todavía no visitados.
  function mostrarAlternado() {
    const pendientes = [IZQ, DER].filter((l) => asomados[l] && !visitadas[l]);
    if (!pendientes.length) return;
    const l = pendientes.includes(turno) ? turno : pendientes[0];
    turno = l === IZQ ? DER : IZQ;
    mostrar(l);
  }

  function asomar(lado) {
    asomados[lado] = true;
    turno = lado === IZQ ? DER : IZQ;
    recorrido = 0;
    mostrar(lado);
    if (reducir) return;
    enAsomo = true;
    const ancho = naves.clientWidth;
    const centro = ancho;   // la nave central es la segunda
    const dist = (lado === IZQ ? -1 : 1) * ancho * A.asomo;
    naves.style.scrollSnapType = 'none';
    const t0 = performance.now();
    const paso = (t) => {
      if (!enAsomo) return;
      const e = t - t0;
      let x;
      if (e < A.ida) x = dist * salida(e / A.ida);
      else if (e < A.ida + A.pausa) x = dist;
      else if (e < A.ida + A.pausa + A.vuelta) x = dist * (1 - rebote((e - A.ida - A.pausa) / A.vuelta));
      else { terminarAsomo(); return; }
      naves.scrollLeft = centro + x;
      pedidoAsomo = requestAnimationFrame(paso);
    };
    pedidoAsomo = requestAnimationFrame(paso);
  }
  function terminarAsomo() {
    if (!enAsomo) return;
    enAsomo = false;
    cancelAnimationFrame(pedidoAsomo);
    naves.scrollLeft = naves.clientWidth;
    naves.style.scrollSnapType = '';
  }
  // Cualquier toque durante el asomo lo interrumpe: la persona manda.
  for (const ev of ['touchstart', 'pointerdown', 'wheel']) {
    naves.addEventListener(ev, terminarAsomo, { passive: true });
  }

  function proximoAsomo() {
    if (!asomados[IZQ] && !visitadas[IZQ]) return IZQ;
    if (!asomados[DER] && !visitadas[DER]) return DER;
    return -1;
  }

  // Con el dedo quieto: el asomo que corresponda o, si no, un texto.
  function alQuedarQuieto() {
    if (!activa || enAsomo) return;
    const lado = proximoAsomo();
    const primero = !asomados[IZQ] && !asomados[DER];
    const listo = primero ? fotosVistas.size - 1 >= A.fotosPrimerAsomo : recorrido >= A.recorridoAsomo;
    if (lado >= 0 && listo) asomar(lado);
    else mostrarAlternado();
  }

  cinta.addEventListener('scroll', () => {
    const top = cinta.scrollTop;
    const alto = cinta.clientHeight || window.innerHeight;
    const d = Math.abs(top - ultimoTop);
    if (d < alto) recorrido += d / alto;   // sin contar las recolocaciones de la cinta
    ultimoTop = top;
    anotarFoto();
    if (Math.abs(top - topAlMostrar) > A.ocultarTras) apagar();
    clearTimeout(reloj);
    if (activa) reloj = setTimeout(alQuedarQuieto, A.quieto);
  }, { passive: true });

  return {
    // Lo llama main.js cada vez que cambia la nave en pantalla.
    alCambiarNave(nombre) {
      clearTimeout(reloj);
      activa = nombre === 'central';
      if (nombre === 'izquierda') visitadas[IZQ] = true;
      if (nombre === 'derecha') visitadas[DER] = true;
      if (activa) {
        ultimoTop = topAlMostrar = cinta.scrollTop;
        anotarFoto();
      } else {
        apagar();
      }
    },
    // Pausa del sistema (celular en horizontal, app en segundo plano).
    detener() {
      clearTimeout(reloj);
      activa = false;
      terminarAsomo();
    },
  };
}
