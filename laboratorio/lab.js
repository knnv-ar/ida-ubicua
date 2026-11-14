// Laboratorio de efectos de IDA ubicua.
// El scroll vertical maneja la cinta: cada tramo tiene un reposo (paneo de la foto)
// y una transición (el efecto elegido). Dos imágenes alternan para probar el empalme.
import * as THREE from 'three';
import { efectos, vertice, fragmentoDe, valoresPorDefecto } from '../js/efectos/index.js';
import {
  capas, AJUSTES_VIDA, valoresVidaPorDefecto, recetaDe, pesosConDeriva, crearResorte, uniformesVida,
  datosRuido, LADO_RUIDO, verticeVida, fragmentoVida,
} from '../js/vida/index.js';

const IMAGENES = [
  new URL('../img/fotos/fotos-03.webp', import.meta.url).href,
  new URL('../img/flores/flores-07.webp', import.meta.url).href,
];
const PROFUNDIDADES = [
  new URL('../img/profundidad/fotos/fotos-03.webp', import.meta.url).href,
  new URL('../img/profundidad/flores/flores-07.webp', import.meta.url).href,
];
const TRAMOS = 40;            // largo de la cinta del laboratorio
const INICIO = 20;            // se arranca en el medio para poder subir y bajar
const CLAVE = 'ida-lab-v1';

// ---------- estado ----------
function firmaDe(ef) { return ef.params.map((p) => p.nombre).join('|'); }
const estado = {
  efecto: 0,
  shuffle: false,
  valores: efectos.map(valoresPorDefecto),
  suavizado: 0.15,           // 1 = sin suavizado
  reposo: 0.5,               // fracción del tramo dedicada al paneo
  tramo: 3.0,                // largo de un tramo en alturas de pantalla (igual que el sitio)
  version: 2,                // 2: tramo de 3 pantallas y relevo de la vida a mitad de transición
  semilla: 0,
  vida: {
    modo: 'receta',          // 'receta' (una capa al azar por foto), 'capa' (la elegida) o 'apagada'
    capa: 0,                 // capa elegida para ver sola y ajustar
    valores: valoresVidaPorDefecto(),
    intensidad: AJUSTES_VIDA.intensidad,
  },
};
function firmaCapa(c) { return c.params.map((p) => p.nombre).join('|'); }
try {
  const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null');
  if (guardado && Array.isArray(guardado.valores)) {
    // Conserva los ajustes ya hechos; los efectos nuevos arrancan con sus valores por defecto.
    // Un efecto cuyos parámetros cambiaron (otros nombres o rangos) vuelve a sus valores por defecto.
    const firmas = Array.isArray(guardado.firmas) ? guardado.firmas : [];
    const valores = efectos.map((ef, i) =>
      Array.isArray(guardado.valores[i]) && guardado.valores[i].length === ef.params.length
        && firmas[i] === firmaDe(ef)
        && ef.params.every((p, k) => guardado.valores[i][k] >= p.min && guardado.valores[i][k] <= p.max)
        ? guardado.valores[i] : valoresPorDefecto(ef));
    const vg = guardado.vida || {};
    const firmasVida = Array.isArray(vg.firmas) ? vg.firmas : [];
    const valoresVida = capas.map((c, k) =>
      Array.isArray(vg.valores?.[k]) && vg.valores[k].length === c.params.length && firmasVida[k] === firmaCapa(c)
        && c.params.every((p, q) => vg.valores[k][q] >= p.min && vg.valores[k][q] <= p.max)
        ? vg.valores[k] : c.params.map((p) => p.def));
    const vida = { ...estado.vida, ...vg, valores: valoresVida };
    if (!['receta', 'capa', 'apagada'].includes(vida.modo)) vida.modo = 'receta';
    if (!(vida.capa >= 0 && vida.capa < capas.length)) vida.capa = 0;
    delete vida.antes;
    // Ajustes guardados antes de la versión 2: se pasa al tramo de 3 pantallas.
    const tramo = guardado.version === 2 ? guardado.tramo : 3.0;
    Object.assign(estado, guardado, { valores, vida, tramo, version: 2 });
    if (!(estado.efecto >= 0 && estado.efecto < efectos.length)) estado.efecto = 0;
  }
} catch (e) { /* sin almacenamiento: se usan los valores por defecto */ }
function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({
      ...estado, firmas: efectos.map(firmaDe), vida: { ...estado.vida, firmas: capas.map(firmaCapa) },
    }));
  } catch (e) { /* nada */ }
}

// ---------- WebGL ----------
const lienzo = document.getElementById('lienzo');
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));   // igual que el sitio
const escena = new THREE.Scene();
const camara = new THREE.Camera();
const uniforms = {
  uA: { value: null }, uB: { value: null }, uP: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uAspA: { value: 1 }, uAspB: { value: 1 }, uPanA: { value: 0 }, uPanB: { value: 0 },
  uSeed: { value: 0 }, uParam: { value: new THREE.Vector3() },
  uCelda: { value: 8 },
};
const materiales = efectos.map((ef) => new THREE.ShaderMaterial({
  vertexShader: vertice, fragmentShader: fragmentoDe(ef), uniforms,
  depthTest: false, depthWrite: false,
}));
const plano = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materiales[0]);
plano.renderOrder = 0;
escena.add(plano);

// Nube de puntos para los efectos de tipo "particulas" (se dibuja sobre el fondo).
const efPart = efectos.find((ef) => ef.tipo === 'particulas');
const nube = efPart ? new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
  vertexShader: efPart.verticePuntos, fragmentShader: efPart.fragmentoPuntos, uniforms,
  transparent: true, depthTest: false, depthWrite: false,
})) : null;
let claveGrilla = '';
if (nube) {
  nube.frustumCulled = false;
  nube.renderOrder = 1;
  nube.visible = false;
  escena.add(nube);
}
// Malla de trozos para los efectos de tipo "vidrio" (fractura): también va sobre el fondo.
const efVid = efectos.find((ef) => ef.tipo === 'vidrio');
let vidrio = null;
if (efVid) {
  const m = efVid.malla();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  geo.setAttribute('aCelda', new THREE.BufferAttribute(m.celda, 4));
  geo.setAttribute('aEsquina', new THREE.BufferAttribute(m.esquina, 1));
  vidrio = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader: efVid.verticeVidrio, fragmentShader: efVid.fragmentoVidrio, uniforms,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }));
  vidrio.frustumCulled = false;
  vidrio.renderOrder = 1;
  vidrio.visible = false;
  escena.add(vidrio);
}
// Vida de la foto: un plano con su propio shader, dibujado en pantalla (reposo) o
// en una textura que la transición lee como si fuera la foto.
const ruido = new THREE.DataTexture(datosRuido(), LADO_RUIDO, LADO_RUIDO);
ruido.wrapS = ruido.wrapT = THREE.RepeatWrapping;
ruido.minFilter = THREE.LinearMipmapLinearFilter;
ruido.magFilter = THREE.LinearFilter;
ruido.generateMipmaps = true;
ruido.needsUpdate = true;
const uVida = {
  uImg: { value: null }, uProf: { value: null }, uRuido: { value: ruido },
  uBal: { value: new THREE.Vector2() }, uZf: { value: 0.5 }, uAliento: { value: 0 },
  uRes: uniforms.uRes, uAsp: { value: 1 }, uPan: { value: 0 },
  uT: { value: 0 }, uRecorrido: { value: 0 }, uElast: { value: 0 }, uSem: { value: 0 },
  uW: { value: [0, 0, 0, 0, 0, 0] },
  uC: { value: capas.map(() => new THREE.Vector3()) },
};
const escenaVida = new THREE.Scene();
const materialVida = new THREE.ShaderMaterial({
  vertexShader: verticeVida, fragmentShader: fragmentoVida, uniforms: uVida, depthTest: false, depthWrite: false,
});
escenaVida.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materialVida));
const opcionesRT = {
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  generateMipmaps: false, depthBuffer: false, colorSpace: THREE.NoColorSpace,
};
const rtA = new THREE.WebGLRenderTarget(1, 1, opcionesRT);
const rtB = new THREE.WebGLRenderTarget(1, 1, opcionesRT);
const resorte = crearResorte();
const recetas = new Map();
function recetaDelReposo(i) {
  const clave = `${i}|${estado.semilla}`;
  if (!recetas.has(clave)) {
    if (recetas.size > 64) recetas.clear();
    recetas.set(clave, recetaDe(i, estado.semilla, estado.vida.valores));
  }
  return recetas.get(clave);
}
// Pesos y parámetros de la vida del reposo i en el instante t.
function vidaDe(i, t) {
  const v = estado.vida;
  if (v.modo === 'apagada') return { pesos: capas.map(() => 0), valores: v.valores, semilla: 0.5 };
  if (v.modo === 'capa') return { pesos: capas.map((_, k) => (k === v.capa ? 1 : 0)), valores: v.valores, semilla: 0.37 };
  const r = recetaDelReposo(i);
  return { pesos: pesosConDeriva(r, t), valores: r.valores, semilla: r.semilla };
}
function dibujarVida(destino, tex, prof, asp, pan, vida, factor) {
  uVida.uImg.value = tex;
  uVida.uProf.value = prof;
  uVida.uAsp.value = asp;
  uVida.uPan.value = pan;
  uVida.uSem.value = vida.semilla;
  const u = uniformesVida(vida, uVida.uT.value, pan, resorte.valor);
  uVida.uBal.value.fromArray(u.bal);
  uVida.uZf.value = u.zf;
  uVida.uAliento.value = u.aliento;
  uVida.uElast.value = u.elast;
  for (let k = 0; k < capas.length; k++) {
    uVida.uW.value[k] = vida.pesos[k] * factor * estado.vida.intensidad;
    uVida.uC.value[k].fromArray(vida.valores[k]);
  }
  renderer.setRenderTarget(destino);
  renderer.render(escenaVida, camara);
  renderer.setRenderTarget(null);
}
function describir(vida) {
  const partes = capas.map((c, k) => [c.nombre, vida.pesos[k]]).filter(([, w]) => w > 0.01)
    .sort((a, b) => b[1] - a[1]).map(([n, w]) => `${n.toLowerCase()} ${w.toFixed(2)}`);
  return partes.length ? partes.join(' + ') : 'sin vida';
}

function prepararGrilla(celdaCss) {
  const res = uniforms.uRes.value;
  const clave = `${res.x}x${res.y}x${celdaCss}`;
  if (clave === claveGrilla) return;
  claveGrilla = clave;
  const g = efPart.grilla(res.x, res.y, celdaCss);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('aUv', new THREE.BufferAttribute(g.uv, 2));
  geo.setAttribute('aRand', new THREE.BufferAttribute(g.azar, 4));
  nube.geometry.dispose();
  nube.geometry = geo;
  uniforms.uCelda.value = g.celda;
}

const texturas = [];
const profundidades = [];
const proporciones = [];
const direccionPaneo = [1, -1];

async function cargar() {
  const cargador = new THREE.TextureLoader();
  for (const url of IMAGENES) {
    const t = await cargador.loadAsync(url);
    t.colorSpace = THREE.NoColorSpace;          // se muestran los valores sRGB tal cual
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    texturas.push(t);
    proporciones.push(t.image.width / t.image.height);
  }
  for (const url of PROFUNDIDADES) {
    const t = await cargador.loadAsync(url);
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    profundidades.push(t);
  }
}

// ---------- scroll ----------
const cinta = document.getElementById('cinta');
let altoTramo = 1;
let sSuave = null;
let ultimaClave = '';

function medir() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, true);
  const dpr = renderer.getPixelRatio();
  uniforms.uRes.value.set(Math.round(w * dpr), Math.round(h * dpr));
  rtA.setSize(uniforms.uRes.value.x, uniforms.uRes.value.y);
  rtB.setSize(uniforms.uRes.value.x, uniforms.uRes.value.y);
  const tramoAnterior = altoTramo;
  altoTramo = Math.max(200, h * estado.tramo);
  cinta.style.height = `${TRAMOS * altoTramo + h}px`;
  if (sSuave === null) {
    window.scrollTo(0, INICIO * altoTramo);
    sSuave = INICIO * altoTramo;
  } else if (tramoAnterior !== altoTramo) {
    const pos = (window.scrollY / tramoAnterior) * altoTramo;
    window.scrollTo(0, pos);
    sSuave = pos;
  }
  ultimaClave = '';
}

// Cinta "infinita": con la cinta quieta, si se acerca a un extremo se recoloca
// un número par de tramos (misma imagen, mismo efecto) sin que se note.
let quietaDesde = 0;
function recolocarSiHaceFalta(ahora) {
  if (ahora - quietaDesde < 250) return;
  const s = window.scrollY / altoTramo;
  let salto = 0;
  if (s < 6) salto = 10;
  else if (s > TRAMOS - 6) salto = -10;
  if (salto) {
    const nuevo = window.scrollY + salto * altoTramo;
    window.scrollTo(0, nuevo);
    sSuave += salto * altoTramo;
  }
}
window.addEventListener('scroll', () => { quietaDesde = performance.now(); }, { passive: true });

function semillaDe(i) {
  const x = Math.sin((i + estado.semilla * 101) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
// Bolsa de efectos mezclada por bloques (uno de cada efecto por bloque).
function efectoDelTramo(i) {
  if (!estado.shuffle) return estado.efecto;
  const n = efectos.length;
  const bloque = Math.floor(i / n);
  const orden = efectos.map((_, k) => k);
  let r = semillaDe(bloque * 7 + 3);
  for (let k = n - 1; k > 0; k--) {
    r = (r * 9301 + 49297) % 233280 / 233280;
    const j = Math.floor(r * (k + 1));
    [orden[k], orden[j]] = [orden[j], orden[k]];
  }
  return orden[((i % n) + n) % n];
}
const suave = (t) => t * t * (3 - 2 * t);

// ---------- interfaz ----------
const ui = {
  nombre: document.getElementById('nombre-efecto'),
  progreso: document.getElementById('progreso'),
  barra: document.getElementById('barra'),
  ajustes: document.getElementById('ajustes'),
  abrir: document.getElementById('abrir'),
  botones: document.getElementById('botones-efecto'),
  shuffle: document.getElementById('shuffle'),
  params: document.getElementById('params'),
  generales: document.getElementById('generales'),
  valores: document.getElementById('valores'),
  salida: document.getElementById('salida'),
  botonesVida: document.getElementById('botones-vida'),
  paramsVida: document.getElementById('params-vida'),
  generalesVida: document.getElementById('generales-vida'),
};

function formato(v, paso) {
  const dec = paso >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(paso)));
  return Number(v).toFixed(dec);
}

function deslizador(contenedor, id, etiqueta, unidad, min, max, paso, valor, alCambiar) {
  const fila = document.createElement('div');
  fila.className = 'param';
  fila.innerHTML = `<label for="${id}"><span></span><output></output></label>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${paso}">`;
  fila.querySelector('span').textContent = etiqueta;
  const entrada = fila.querySelector('input');
  const salida = fila.querySelector('output');
  entrada.value = valor;
  entrada.disabled = min === max;            // parámetro fijo: se muestra pero no se mueve
  const mostrar = () => { salida.textContent = formato(entrada.value, paso) + (unidad ? ` ${unidad}` : ''); };
  mostrar();
  entrada.addEventListener('input', () => { mostrar(); alCambiar(parseFloat(entrada.value)); });
  contenedor.appendChild(fila);
}

function armarBotones() {
  ui.botones.innerHTML = '';
  efectos.forEach((ef, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${i + 1} · ${ef.nombre}`;
    b.setAttribute('aria-pressed', String(!estado.shuffle && i === estado.efecto));
    b.addEventListener('click', () => {
      estado.efecto = i; estado.shuffle = false; guardar(); armarTodo();
    });
    ui.botones.appendChild(b);
  });
  ui.shuffle.setAttribute('aria-pressed', String(estado.shuffle));
}

function armarParams() {
  ui.params.innerHTML = '';
  const ef = efectos[estado.efecto];
  const titulo = document.createElement('p');
  titulo.className = 'subtitulo';
  titulo.textContent = `Parámetros de ${ef.nombre}`;
  ui.params.appendChild(titulo);
  ef.params.forEach((p, k) => {
    deslizador(ui.params, `p-${ef.id}-${k}`, p.nombre, p.unidad, p.min, p.max, p.paso,
      estado.valores[estado.efecto][k], (v) => { estado.valores[estado.efecto][k] = v; guardar(); ultimaClave = ''; });
  });
}

function armarGenerales() {
  ui.generales.innerHTML = '';
  deslizador(ui.generales, 'g-tramo', 'Largo de cada imagen', 'pantallas', 1, 4, 0.1, estado.tramo,
    (v) => { estado.tramo = v; guardar(); medir(); });
  deslizador(ui.generales, 'g-reposo', 'Parte del tramo para el paneo', '', 0.1, 0.8, 0.05, estado.reposo,
    (v) => { estado.reposo = v; guardar(); ultimaClave = ''; });
  deslizador(ui.generales, 'g-suave', 'Inercia del seguimiento', '', 0.04, 1, 0.01, estado.suavizado,
    (v) => { estado.suavizado = v; guardar(); });
}

function armarVida() {
  const v = estado.vida;
  ui.botonesVida.innerHTML = '';
  const boton = (texto, activo, alHacer) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.setAttribute('aria-pressed', String(activo));
    b.addEventListener('click', alHacer);
    ui.botonesVida.appendChild(b);
  };
  capas.forEach((c, k) => boton(`${k + 1} · ${c.nombre}`, v.modo === 'capa' && v.capa === k,
    () => { v.modo = 'capa'; v.capa = k; guardar(); armarVida(); }));
  boton('una capa al azar por foto', v.modo === 'receta', () => { v.modo = 'receta'; guardar(); armarVida(); });
  boton('sin vida', v.modo === 'apagada', () => { v.modo = 'apagada'; guardar(); armarVida(); });

  ui.paramsVida.innerHTML = '';
  const c = capas[v.capa];
  const titulo = document.createElement('p');
  titulo.className = 'subtitulo';
  titulo.textContent = v.modo === 'receta' ? `Parámetros de ${c.nombre} (base del sorteo, ±30 %)` : `Parámetros de ${c.nombre}`;
  ui.paramsVida.appendChild(titulo);
  c.params.forEach((p, q) => {
    deslizador(ui.paramsVida, `v-${c.id}-${q}`, p.nombre, p.unidad, p.min, p.max, p.paso, v.valores[v.capa][q],
      (x) => { v.valores[v.capa][q] = x; recetas.clear(); guardar(); });
  });
  ui.generalesVida.innerHTML = '';
  deslizador(ui.generalesVida, 'v-intensidad', 'Intensidad general de la vida', '', 0, 2, 0.05, v.intensidad,
    (x) => { v.intensidad = x; guardar(); });
}

function armarTodo() { armarBotones(); armarParams(); armarGenerales(); armarVida(); ultimaClave = ''; }

ui.abrir.addEventListener('click', () => {
  const abierto = ui.ajustes.hidden;
  ui.ajustes.hidden = !abierto;
  ui.abrir.setAttribute('aria-expanded', String(abierto));
  ui.abrir.textContent = abierto ? 'cerrar' : 'ajustes';
});
ui.shuffle.addEventListener('click', () => { estado.shuffle = !estado.shuffle; guardar(); armarTodo(); });
document.getElementById('semilla').addEventListener('click', () => { estado.semilla += 1; guardar(); ultimaClave = ''; });
document.getElementById('otra-receta').addEventListener('click', () => {
  estado.semilla += 1; estado.vida.modo = 'receta'; recetas.clear(); guardar(); armarVida(); ultimaClave = '';
});
document.getElementById('restaurar-vida').addEventListener('click', () => {
  estado.vida.valores[estado.vida.capa] = capas[estado.vida.capa].params.map((p) => p.def);
  recetas.clear(); guardar(); armarVida();
});
document.getElementById('restaurar').addEventListener('click', () => {
  estado.valores[estado.efecto] = valoresPorDefecto(efectos[estado.efecto]);
  guardar(); armarParams();
  ultimaClave = '';
});
ui.valores.addEventListener('click', () => {
  const datos = {
    efectos: Object.fromEntries(efectos.map((ef, i) => [ef.id,
      Object.fromEntries(ef.params.map((p, k) => [p.nombre, estado.valores[i][k]]))])),
    largoTramoPantallas: estado.tramo, fraccionPaneo: estado.reposo, inercia: estado.suavizado,
    vida: {
      capas: Object.fromEntries(capas.map((c, k) => [c.id,
        Object.fromEntries(c.params.map((p, q) => [p.nombre, estado.vida.valores[k][q]]))])),
      intensidadGeneral: estado.vida.intensidad,
    },
  };
  const texto = JSON.stringify(datos, null, 1);
  ui.salida.hidden = false;
  ui.salida.textContent = texto;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(texto).then(
      () => { ui.valores.textContent = 'valores copiados'; },
      () => { ui.valores.textContent = 'seleccioná el texto para copiarlo'; });
  }
});

// ---------- cuadro a cuadro ----------
// Con la vida activa se dibuja en cada cuadro: la foto nunca queda quieta.
let tAnterior = 0;
let sAnterior = null;
let velocidad = 0;
function cuadro(ahora) {
  requestAnimationFrame(cuadro);
  if (!texturas.length) return;
  const objetivo = window.scrollY;
  sSuave += (objetivo - sSuave) * estado.suavizado;
  if (Math.abs(objetivo - sSuave) < 0.05) sSuave = objetivo;
  if (objetivo === sSuave) recolocarSiHaceFalta(ahora);

  // velocidad del scroll en pantallas por segundo (sin contar los saltos de la cinta infinita)
  const t = ahora / 1000;
  const dt = tAnterior ? Math.min(0.1, t - tAnterior) : 1 / 60;
  tAnterior = t;
  const alto = window.innerHeight;
  let ds = sAnterior === null ? 0 : (sSuave - sAnterior) / alto;
  if (Math.abs(ds) > 3) ds = 0;
  sAnterior = sSuave;
  velocidad += (ds / Math.max(dt, 1e-3) - velocidad) * 0.35;
  resorte.paso(dt, Math.max(-4, Math.min(4, velocidad)), estado.vida.valores[2][1]);

  const s = sSuave / altoTramo;
  const i = Math.floor(s);
  const f = s - i;
  const ia = ((i % 2) + 2) % 2;
  const ib = 1 - ia;
  const nEf = efectoDelTramo(i);
  let p = 0, panA;
  if (f < estado.reposo) {
    const tt = suave(f / estado.reposo);
    panA = direccionPaneo[ia] * (tt * 2 - 1);
  } else {
    p = (f - estado.reposo) / (1 - estado.reposo);
    panA = direccionPaneo[ia];
  }
  const panB = -direccionPaneo[ib];
  const conVida = estado.vida.modo !== 'apagada';
  const clave = `${i}|${f.toFixed(5)}|${nEf}|${uniforms.uRes.value.x}`;
  if (!conVida && clave === ultimaClave) return;
  ultimaClave = clave;

  uVida.uT.value = t;
  uVida.uRecorrido.value = sSuave / alto;
  const vidaA = vidaDe(i, t);
  const sa = uniforms.uRes.value.x / uniforms.uRes.value.y;

  if (p === 0) {
    // Reposo: la foto viva directo a la pantalla.
    dibujarVida(null, texturas[ia], profundidades[ia], proporciones[ia], panA, vidaA, 1);
  } else {
    // Transición: la foto que sale conserva la vida al principio; la que entra la
    // recibe desde la mitad (relevo: una sola foto viva a la vez).
    const fA = 1 - suave(Math.min(1, p / AJUSTES_VIDA.salida));
    const fB = suave(Math.max(0, Math.min(1, (p - (1 - AJUSTES_VIDA.antes)) / AJUSTES_VIDA.antes)));
    uniforms.uA.value = texturas[ia];
    uniforms.uAspA.value = proporciones[ia];
    uniforms.uPanA.value = panA;
    uniforms.uB.value = texturas[ib];
    uniforms.uAspB.value = proporciones[ib];
    uniforms.uPanB.value = panB;
    if (conVida && fA > 0.001) {
      dibujarVida(rtA, texturas[ia], profundidades[ia], proporciones[ia], panA, vidaA, fA);
      uniforms.uA.value = rtA.texture; uniforms.uAspA.value = sa; uniforms.uPanA.value = 0;
    }
    if (conVida && fB > 0.001) {
      dibujarVida(rtB, texturas[ib], profundidades[ib], proporciones[ib], panB, vidaDe(i + 1, t), fB);
      uniforms.uB.value = rtB.texture; uniforms.uAspB.value = sa; uniforms.uPanB.value = 0;
    }
    plano.material = materiales[nEf];
    uniforms.uP.value = p;
    uniforms.uSeed.value = semillaDe(i);
    uniforms.uParam.value.fromArray(estado.valores[nEf]);
    const conPuntos = nube && efectos[nEf].tipo === 'particulas';
    if (nube) {
      nube.visible = conPuntos;
      if (conPuntos) prepararGrilla(estado.valores[nEf][0]);
    }
    if (vidrio) vidrio.visible = efectos[nEf] === efVid;
    renderer.render(escena, camara);
  }

  ui.nombre.textContent = f < estado.reposo ? `Reposo · ${describir(vidaA)}` : efectos[nEf].nombre;
  ui.progreso.textContent = f < estado.reposo ? '' : `${Math.round(p * 100)} %`;
  ui.barra.style.transform = `scaleX(${f < estado.reposo ? 0 : p})`;
}

window.addEventListener('resize', medir);
armarTodo();
medir();
cargar().then(() => {
  document.body.classList.add('listo');
  // compila los cinco shaders de entrada para que el cambio de efecto no trabe
  if (nube) { prepararGrilla(efPart.params[0].def); nube.visible = true; }
  if (vidrio) vidrio.visible = true;
  for (const mat of materiales) { plano.material = mat; renderer.compile(escena, camara); }
  renderer.compile(escenaVida, camara);
  if (nube) nube.visible = false;
  if (vidrio) vidrio.visible = false;
  ultimaClave = '';
  requestAnimationFrame(cuadro);
}).catch((e) => {
  ui.nombre.textContent = 'No se pudieron cargar las imágenes';
  console.error(e);
});
