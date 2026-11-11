// Secuencia infinita (hacia ambos lados) de imágenes y efectos para la nave central.
// - Alterna carpetas: foto, flor, foto, flor… (la carpeta inicial se sortea).
// - Cada carpeta se recorre en "bolsas" mezcladas (Fisher–Yates): no se repite una
//   imagen hasta mostrar todas, ni dos veces seguidas entre bolsas.
// - Los efectos también salen de una bolsa, uno por transición.
// - Todo es determinista dentro de la visita: al subir se ve lo mismo que al bajar.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const piso2 = (i) => Math.floor(i / 2);
const modulo = (a, n) => ((a % n) + n) % n;

// Flujo infinito en ambos sentidos de índices 0..n-1 sacados de bolsas.
function crearFlujo(n, semilla) {
  const adelante = [];
  const atras = [];
  const rngA = mulberry32(semilla * 2 + 1);
  const rngB = mulberry32(semilla * 2 + 2);
  function bolsa(rng, evitar) {
    const b = Array.from({ length: n }, (_, k) => k);
    for (let k = n - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [b[k], b[j]] = [b[j], b[k]];
    }
    if (n > 1 && b[0] === evitar) [b[0], b[1]] = [b[1], b[0]];
    return b;
  }
  function obtener(k) {
    if (k >= 0) {
      while (adelante.length <= k) adelante.push(...bolsa(rngA, adelante[adelante.length - 1]));
      return adelante[k];
    }
    if (!adelante.length) obtener(0);
    const j = -k - 1;
    while (atras.length <= j) atras.push(...bolsa(rngB, atras.length ? atras[atras.length - 1] : adelante[0]));
    return atras[j];
  }
  return obtener;
}

export function crearSecuencia(imagenes, cantidadEfectos, semilla = (Math.random() * 2 ** 31) | 0) {
  const carpetas = [
    imagenes.filter((im) => im.carpeta === 'fotos'),
    imagenes.filter((im) => im.carpeta === 'flores'),
  ];
  const azar = mulberry32(semilla);
  const carpetaInicial = azar() < 0.5 ? 0 : 1;
  const flujos = carpetas.map((c, k) => crearFlujo(c.length, semilla + 101 * (k + 1)));
  const flujoEfectos = crearFlujo(cantidadEfectos, semilla + 977);

  function hash(i, sal) {
    const x = Math.sin((i + sal) * 12.9898 + semilla * 0.001) * 43758.5453;
    return x - Math.floor(x);
  }

  return {
    semilla,
    // Imagen en la posición i de la cinta (i puede ser negativo).
    imagen(i) {
      const c = modulo(i + carpetaInicial, 2);
      return carpetas[c][flujos[c](piso2(i))];
    },
    // Efecto de la transición que va de la imagen i a la i+1.
    efecto(i) { return flujoEfectos(i); },
    // Semilla 0..1 propia de cada transición (varía cada efecto).
    semillaTransicion(i) { return hash(i, 0.37); },
    // Sentido del paneo de cada imagen: 1 = de izquierda a derecha, -1 = al revés.
    sentidoPaneo(i) { return hash(i, 7.1) < 0.5 ? -1 : 1; },
  };
}
