// La cinta de la nave central: el scroll vertical nativo se traduce en
// (imagen A, imagen B, paneo, progreso de la transición) y se le pasa a un
// "dibujante" (WebGL con los efectos; CSS como respaldo).
// Mientras la nave central está activa se dibuja siempre, porque la foto en
// reposo está "viva": con el dedo quieto, a 30 cuadros por segundo; mientras se
// desliza, en cada cuadro.

export const AJUSTES = {
  tramo: 2.0,        // largo de cada imagen, en alturas de pantalla
  reposo: 0.5,       // parte del tramo dedicada al paneo
  inercia: 0.15,     // seguimiento del dedo (1 = inmediato)
  cuadrosQuieta: 30, // cuadros por segundo con el dedo quieto (vida de la foto)
};

const TRAMOS = 400;   // largo físico del espaciador
const MEDIO = 200;    // se arranca en el medio para poder subir y bajar
const BORDE = 40;     // cerca de un extremo se recoloca (con la cinta quieta)

const suave = (t) => t * t * (3 - 2 * t);

export function crearCinta({ scroller, espaciador, avance, indicaciones, secuencia, dibujante }) {
  let alto = 1;
  let altoTramo = 1;
  let desplazamiento = 0;     // índice lógico = índice físico + desplazamiento
  let sSuave = null;
  let inicioScroll = 0;
  let activa = false;
  let quietaDesde = 0;
  let ultimaClave = '';
  let pedido = 0;
  let ultimoDibujo = 0;
  let sAnterior = null;
  let tAnterior = 0;
  let velocidad = 0;
  let dibujoPrevio = 0;   // momento del último dibujo, para medir cuánto tardó

  function medir() {
    const anterior = altoTramo;
    alto = scroller.clientHeight || window.innerHeight;
    altoTramo = Math.max(200, alto * AJUSTES.tramo);
    espaciador.style.height = `${TRAMOS * altoTramo + alto}px`;
    if (sSuave === null) {
      scroller.scrollTop = MEDIO * altoTramo;
      sSuave = inicioScroll = scroller.scrollTop;
    } else if (anterior !== altoTramo) {
      scroller.scrollTop = (scroller.scrollTop / anterior) * altoTramo;
      sSuave = scroller.scrollTop;
    }
    dibujante.medir?.();
    ultimaClave = '';
  }

  // Recoloca un número par de tramos (misma carpeta) sin cambiar lo que se ve.
  function recolocar() {
    const s = scroller.scrollTop / altoTramo;
    if (s > BORDE && s < TRAMOS - BORDE) return;
    let salto = Math.round((MEDIO - Math.floor(s)) / 2) * 2;
    if (!salto) return;
    scroller.scrollTop += salto * altoTramo;
    sSuave += salto * altoTramo;
    desplazamiento -= salto;
  }

  scroller.addEventListener('scroll', () => {
    quietaDesde = performance.now();
    if (indicaciones && Math.abs(scroller.scrollTop - inicioScroll) > 60) indicaciones.classList.add('oculto');
    if (activa && !pedido) pedido = requestAnimationFrame(cuadro);
  }, { passive: true });

  // Velocidad del scroll en pantallas por segundo (sin contar las recolocaciones).
  function medirVelocidad(ahora) {
    const dt = tAnterior ? Math.min(0.1, (ahora - tAnterior) / 1000) : 1 / 60;
    tAnterior = ahora;
    const continuo = sSuave + desplazamiento * altoTramo;   // posición lógica, sin saltos
    let ds = sAnterior === null ? 0 : (continuo - sAnterior) / alto;
    if (Math.abs(ds) > 3) ds = 0;
    sAnterior = continuo;
    velocidad += (ds / Math.max(dt, 1e-3) - velocidad) * 0.35;
  }

  function cuadro(ahora) {
    pedido = 0;
    if (!activa) return;
    pedido = requestAnimationFrame(cuadro);
    const objetivo = scroller.scrollTop;
    sSuave += (objetivo - sSuave) * AJUSTES.inercia;
    if (Math.abs(objetivo - sSuave) < 0.05) sSuave = objetivo;
    medirVelocidad(ahora);

    const s = sSuave / altoTramo;
    const fisico = Math.floor(s);
    const f = s - fisico;
    const i = fisico + desplazamiento;
    const sentidoA = secuencia.sentidoPaneo(i);
    let p = 0, panA;
    if (f < AJUSTES.reposo) {
      panA = sentidoA * (suave(f / AJUSTES.reposo) * 2 - 1);
    } else {
      p = (f - AJUSTES.reposo) / (1 - AJUSTES.reposo);
      panA = sentidoA;
    }
    // Tiempo del cuadro que siguió a un dibujo (calidad adaptativa del dibujante).
    if (dibujoPrevio) { dibujante.tiempoDeCuadro?.(ahora - dibujoPrevio); dibujoPrevio = 0; }
    const clave = `${i}|${f.toFixed(5)}`;
    const cambio = clave !== ultimaClave;
    // Con el dedo quieto se dibuja a menor ritmo (la vida es lenta y ahorra batería).
    if (cambio || ahora - ultimoDibujo >= 1000 / AJUSTES.cuadrosQuieta - 2) {
      ultimoDibujo = ahora;
      dibujoPrevio = ahora;
      dibujante.dibujar({
        indice: i,
        a: secuencia.imagen(i),
        b: secuencia.imagen(i + 1),
        panA,
        panB: -secuencia.sentidoPaneo(i + 1),
        p,
        efecto: secuencia.efecto(i),
        semilla: secuencia.semillaTransicion(i),
        t: ahora / 1000,
        velocidad,
        recorrido: (sSuave + desplazamiento * altoTramo) / alto,
      });
    }
    if (cambio) {
      ultimaClave = clave;
      if (avance) avance.style.transform = `scaleY(${p})`;
      dibujante.precargar?.([i - 1, i + 2, i + 3].map((k) => secuencia.imagen(k)));
    }
    if (sSuave === objetivo && ahora - quietaDesde > 250) recolocar();
  }

  window.addEventListener('resize', () => { if (activa) medir(); });

  return {
    medir,
    activar() {
      activa = true;
      dibujoPrevio = 0;
      ultimaClave = '';
      if (!pedido) pedido = requestAnimationFrame(cuadro);
    },
    desactivar() {
      activa = false;
      if (pedido) cancelAnimationFrame(pedido);
      pedido = 0;
    },
    get indice() { return Math.floor(scroller.scrollTop / altoTramo) + desplazamiento; },
  };
}

// Dibujante provisorio (etapa 4): dos capas con background-size: cover,
// paneo con background-position y un fundido como transición.
export function crearDibujanteCSS(capaA, capaB) {
  const cache = new Map();
  let srcA = '', srcB = '';
  const url = (im) => `url("${im.src}")`;
  return {
    dibujar({ a, b, panA, panB, p }) {
      if (a.src !== srcA) { srcA = a.src; capaA.style.backgroundImage = url(a); }
      if (b.src !== srcB) { srcB = b.src; capaB.style.backgroundImage = url(b); }
      capaA.style.backgroundPositionX = `${(panA + 1) * 50}%`;
      capaB.style.backgroundPositionX = `${(panB + 1) * 50}%`;
      capaB.style.opacity = String(p);
    },
    precargar(imagenes) {
      for (const im of imagenes) {
        if (cache.has(im.src)) continue;
        const img = new Image();
        img.decoding = 'async';
        img.src = im.src;
        cache.set(im.src, img);
        if (cache.size > 12) cache.delete(cache.keys().next().value);
      }
    },
  };
}
