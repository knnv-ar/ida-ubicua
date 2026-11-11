// Laboratorio de efectos de IDA ubicua.
// El scroll vertical maneja la cinta: cada tramo tiene un reposo (paneo de la foto)
// y una transición (el efecto elegido). Dos imágenes alternan para probar el empalme.
import * as THREE from 'three';
import { efectos, vertice, fragmentoDe, valoresPorDefecto } from '../js/efectos/index.js';

const IMAGENES = [
  new URL('../img/fotos/fotos-03.webp', import.meta.url).href,
  new URL('../img/flores/flores-07.webp', import.meta.url).href,
];
const TRAMOS = 40;            // largo de la cinta del laboratorio
const INICIO = 20;            // se arranca en el medio para poder subir y bajar
const CLAVE = 'ida-lab-v1';

// ---------- estado ----------
const estado = {
  efecto: 0,
  shuffle: false,
  valores: efectos.map(valoresPorDefecto),
  suavizado: 0.15,           // 1 = sin suavizado
  reposo: 0.5,               // fracción del tramo dedicada al paneo
  tramo: 2.0,                // largo de un tramo en alturas de pantalla
  semilla: 0,
};
try {
  const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null');
  if (guardado && Array.isArray(guardado.valores)) {
    // Conserva los ajustes ya hechos; los efectos nuevos arrancan con sus valores por defecto.
    const valores = efectos.map((ef, i) =>
      Array.isArray(guardado.valores[i]) && guardado.valores[i].length === ef.params.length
        ? guardado.valores[i] : valoresPorDefecto(ef));
    Object.assign(estado, guardado, { valores });
    if (!(estado.efecto >= 0 && estado.efecto < efectos.length)) estado.efecto = 0;
  }
} catch (e) { /* sin almacenamiento: se usan los valores por defecto */ }
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* nada */ }
}

// ---------- WebGL ----------
const lienzo = document.getElementById('lienzo');
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

function armarTodo() { armarBotones(); armarParams(); armarGenerales(); ultimaClave = ''; }

ui.abrir.addEventListener('click', () => {
  const abierto = ui.ajustes.hidden;
  ui.ajustes.hidden = !abierto;
  ui.abrir.setAttribute('aria-expanded', String(abierto));
  ui.abrir.textContent = abierto ? 'cerrar' : 'ajustes';
});
ui.shuffle.addEventListener('click', () => { estado.shuffle = !estado.shuffle; guardar(); armarTodo(); });
document.getElementById('semilla').addEventListener('click', () => { estado.semilla += 1; guardar(); ultimaClave = ''; });
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
function cuadro(ahora) {
  requestAnimationFrame(cuadro);
  if (!texturas.length) return;
  const objetivo = window.scrollY;
  sSuave += (objetivo - sSuave) * estado.suavizado;
  if (Math.abs(objetivo - sSuave) < 0.05) sSuave = objetivo;
  if (objetivo === sSuave) recolocarSiHaceFalta(ahora);

  const s = sSuave / altoTramo;
  const i = Math.floor(s);
  const f = s - i;
  const ia = ((i % 2) + 2) % 2;
  const ib = 1 - ia;
  const nEf = efectoDelTramo(i);
  let p = 0, panA;
  if (f < estado.reposo) {
    const t = suave(f / estado.reposo);
    panA = direccionPaneo[ia] * (t * 2 - 1);
  } else {
    p = (f - estado.reposo) / (1 - estado.reposo);
    panA = direccionPaneo[ia];
  }
  const clave = `${i}|${f.toFixed(5)}|${nEf}|${uniforms.uRes.value.x}`;
  if (clave === ultimaClave) return;
  ultimaClave = clave;

  plano.material = materiales[nEf];
  uniforms.uA.value = texturas[ia];
  uniforms.uB.value = texturas[ib];
  uniforms.uAspA.value = proporciones[ia];
  uniforms.uAspB.value = proporciones[ib];
  uniforms.uPanA.value = panA;
  uniforms.uPanB.value = -direccionPaneo[ib];
  uniforms.uP.value = p;
  uniforms.uSeed.value = semillaDe(i);
  uniforms.uParam.value.fromArray(estado.valores[nEf]);
  const conPuntos = nube && efectos[nEf].tipo === 'particulas' && p > 0;
  if (nube) {
    nube.visible = conPuntos;
    if (conPuntos) prepararGrilla(estado.valores[nEf][0]);
  }
  renderer.render(escena, camara);

  ui.nombre.textContent = f < estado.reposo ? 'Reposo · paneo' : efectos[nEf].nombre;
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
  for (const mat of materiales) { plano.material = mat; renderer.compile(escena, camara); }
  if (nube) nube.visible = false;
  ultimaClave = '';
  requestAnimationFrame(cuadro);
}).catch((e) => {
  ui.nombre.textContent = 'No se pudieron cargar las imágenes';
  console.error(e);
});
