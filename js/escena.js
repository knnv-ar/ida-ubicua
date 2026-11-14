// Dibujante WebGL de la nave central: un plano a pantalla completa con el shader
// del efecto de cada transición (más la nube de puntos del polvo de partículas y
// la malla de trozos de la fractura). En el reposo la foto se dibuja "viva"
// (js/vida): paralaje, respiración, inercia elástica, luz, cinemagraph y foco,
// una capa por reposo, con sus parámetros desviados al azar.
// Calidad adaptativa: si los cuadros tardan demasiado, baja la resolución del lienzo.
// Misma interfaz que el dibujante CSS: dibujar(estado), precargar(imagenes), medir().
// dibujar() devuelve false si todavía no puede dibujar (texturas en camino o
// contexto perdido); en ese caso se muestra el dibujante CSS de respaldo.
import * as THREE from 'three';
import { efectos, vertice, fragmentoDe, valoresPorDefecto } from './efectos/index.js';
import {
  capas, AJUSTES_VIDA, valoresVidaPorDefecto, recetaDe, pesosConDeriva, crearResorte, uniformesVida,
  muestrasProfundidad, rangoVisible,
  datosRuido, LADO_RUIDO, verticeVida, fragmentoVida,
} from './vida/index.js';

const MAX_TEXTURAS = 8;

export function crearDibujanteWebGL(lienzo) {
  const renderer = new THREE.WebGLRenderer({
    canvas: lienzo, antialias: false, alpha: false, powerPreference: 'high-performance',
  });
  // Resolución del lienzo: hasta 1.5 píxeles por píxel CSS (las fotos no tienen más
  // detalle que eso) y se baja de a un escalón si el celular no llega (ver tiempoDeCuadro).
  const ESCALONES = [1.5, 1.25, 1].filter((r) => r <= Math.max(1, window.devicePixelRatio || 1));
  let escalon = 0;
  renderer.setPixelRatio(ESCALONES[0]);
  const escena = new THREE.Scene();
  const camara = new THREE.Camera();
  const valores = efectos.map(valoresPorDefecto);
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
  escena.add(plano);

  // Nube de puntos del polvo de partículas.
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
  // Malla de trozos de la fractura (vidrio estallado), también sobre el fondo.
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
  // ---------- vida de la foto ----------
  const ruido = new THREE.DataTexture(datosRuido(), LADO_RUIDO, LADO_RUIDO);
  ruido.wrapS = ruido.wrapT = THREE.RepeatWrapping;
  ruido.minFilter = THREE.LinearMipmapLinearFilter;
  ruido.magFilter = THREE.LinearFilter;
  ruido.generateMipmaps = true;
  ruido.needsUpdate = true;
  const uVida = {
    uImg: { value: null }, uProf: { value: null }, uRuido: { value: ruido },
    uBal: { value: new THREE.Vector2() }, uZf: { value: 0.5 }, uRangoZ: { value: 1 }, uAliento: { value: 0 },
    uRes: uniforms.uRes, uAsp: { value: 1 }, uPan: { value: 0 },
    uT: { value: 0 }, uRecorrido: { value: 0 }, uElast: { value: 0 }, uSem: { value: 0 },
    uW: { value: [0, 0, 0, 0, 0, 0] },
    uC: { value: capas.map(() => new THREE.Vector3()) },
  };
  const escenaVida = new THREE.Scene();
  escenaVida.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: verticeVida, fragmentShader: fragmentoVida, uniforms: uVida, depthTest: false, depthWrite: false,
  })));
  // Durante la transición la foto viva se dibuja en una textura que el efecto lee como foto.
  const opcionesRT = {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false, depthBuffer: false, colorSpace: THREE.NoColorSpace,
  };
  const rtA = new THREE.WebGLRenderTarget(1, 1, opcionesRT);
  const rtB = new THREE.WebGLRenderTarget(1, 1, opcionesRT);
  const valoresVida = valoresVidaPorDefecto();
  const semillaVida = (Math.random() * 1e6) | 0;
  const recetas = new Map();
  const resorte = crearResorte();
  let tAnterior = null;
  // Profundidad neutra mientras llega el mapa de cada foto.
  const profNeutra = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  profNeutra.needsUpdate = true;

  function vidaDe(i, t) {
    let r = recetas.get(i);
    if (!r) {
      if (recetas.size > 32) recetas.clear();
      r = recetaDe(i, semillaVida, valoresVida);
      recetas.set(i, r);
    }
    return { pesos: pesosConDeriva(r, t), valores: r.valores, semilla: r.semilla };
  }
  function dibujarVida(destino, t, pan, vida, factor) {
    uVida.uImg.value = t.tex;
    uVida.uProf.value = t.prof || profNeutra;
    uVida.uAsp.value = t.asp;
    uVida.uPan.value = pan;
    uVida.uSem.value = vida.semilla;
    const sa = uniforms.uRes.value.x / uniforms.uRes.value.y;
    const u = uniformesVida(vida, uVida.uT.value, pan, resorte.valor, rangoVisible(t.muestras, t.asp, sa, pan));
    uVida.uBal.value.fromArray(u.bal);
    // el plano de foco se acerca suave a su objetivo (el rango visible cambia con el paneo)
    t.zf = t.zf === undefined ? u.zf : t.zf + (u.zf - t.zf) * 0.12;
    uVida.uZf.value = t.zf;
    uVida.uRangoZ.value = u.rangoZ;
    uVida.uAliento.value = u.aliento;
    uVida.uElast.value = u.elast;
    for (let k = 0; k < capas.length; k++) {
      uVida.uW.value[k] = vida.pesos[k] * factor * AJUSTES_VIDA.intensidad;
      uVida.uC.value[k].fromArray(vida.valores[k]);
    }
    renderer.setRenderTarget(destino);
    renderer.render(escenaVida, camara);
    renderer.setRenderTarget(null);
  }

  function prepararGrilla() {
    const res = uniforms.uRes.value;
    const celda = valores[efectos.indexOf(efPart)][0];
    const clave = `${res.x}x${res.y}x${celda}`;
    if (clave === claveGrilla) return;
    claveGrilla = clave;
    const g = efPart.grilla(res.x, res.y, celda);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
    geo.setAttribute('aUv', new THREE.BufferAttribute(g.uv, 2));
    geo.setAttribute('aRand', new THREE.BufferAttribute(g.azar, 4));
    nube.geometry.dispose();
    nube.geometry = geo;
    uniforms.uCelda.value = g.celda;
  }

  // ---------- texturas ----------
  const texturas = new Map();     // src → { tex, asp, lista, error, uso }
  let reloj = 0;
  let ultimo = null;
  let perdido = false;

  function configurar(tex) {
    tex.colorSpace = THREE.NoColorSpace;          // valores sRGB tal cual
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  async function decodificar(src) {
    // Decodifica fuera del hilo principal cuando el navegador lo permite.
    if ('createImageBitmap' in window) {
      try {
        const blob = await (await fetch(src)).blob();
        const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
        const tex = new THREE.Texture(bmp);
        tex.flipY = false;
        return configurar(tex);
      } catch (e) { /* se prueba con el cargador común */ }
    }
    const tex = await new THREE.TextureLoader().loadAsync(src);
    return configurar(tex);
  }

  function cargar(im) {
    let t = texturas.get(im.src);
    if (!t) {
      t = { tex: null, prof: null, asp: im.ancho / im.alto, lista: false, error: false, uso: 0 };
      texturas.set(im.src, t);
      // Mapa de profundidad: mismo nombre en img/profundidad/<carpeta>/.
      decodificar(im.src.replace('img/', 'img/profundidad/')).then((prof) => {
        if (!texturas.has(im.src)) { prof.dispose(); prof.image?.close?.(); return; }
        t.prof = prof;
        try { t.muestras = muestrasProfundidad(prof.image); } catch (e) { /* sin muestras: rango completo */ }
        if (!perdido) renderer.initTexture(prof);
      }).catch(() => { /* sin mapa: profundidad neutra */ });
      decodificar(im.src).then((tex) => {
        t.tex = tex;
        t.asp = tex.image.width / tex.image.height;
        if (!perdido) renderer.initTexture(tex);     // sube a la GPU antes de usarla
        t.lista = true;
        if (ultimo && (ultimo.a.src === im.src || ultimo.b.src === im.src)) dibujar(ultimo);
      }).catch(() => { t.error = true; });
      podar();
    }
    t.uso = ++reloj;
    return t;
  }

  // Libera las texturas menos usadas, nunca las que están en pantalla.
  function podar() {
    if (texturas.size <= MAX_TEXTURAS) return;
    const enUso = ultimo ? [ultimo.a.src, ultimo.b.src] : [];
    const orden = [...texturas.entries()].filter(([src]) => !enUso.includes(src)).sort((x, y) => x[1].uso - y[1].uso);
    while (texturas.size > MAX_TEXTURAS && orden.length) {
      const [src, t] = orden.shift();
      if (!t.lista) continue;
      t.tex.dispose();
      t.tex.image?.close?.();
      if (t.prof) { t.prof.dispose(); t.prof.image?.close?.(); }
      texturas.delete(src);
    }
  }

  // ---------- dibujo ----------
  function medir() {
    const w = lienzo.clientWidth || window.innerWidth;
    const h = lienzo.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const dpr = renderer.getPixelRatio();
    uniforms.uRes.value.set(Math.round(w * dpr), Math.round(h * dpr));
    rtA.setSize(uniforms.uRes.value.x, uniforms.uRes.value.y);
    rtB.setSize(uniforms.uRes.value.x, uniforms.uRes.value.y);
    claveGrilla = '';
    if (ultimo) dibujar(ultimo);
  }

  // e: { indice, a, b, panA, panB, p, efecto, semilla, t (s), velocidad (pantallas/s), recorrido (pantallas) }
  function dibujar(e) {
    ultimo = e;
    if (perdido) return false;
    const ta = cargar(e.a);
    const tb = cargar(e.b);
    if (!ta.lista || (e.p > 0 && !tb.lista)) { lienzo.style.visibility = 'hidden'; return false; }

    // Vida: tiempo, scroll recorrido y resorte de la inercia elástica.
    const t = e.t ?? performance.now() / 1000;
    const dt = tAnterior === null ? 1 / 30 : Math.max(0, Math.min(0.1, t - tAnterior));
    tAnterior = t;
    resorte.paso(dt, Math.max(-4, Math.min(4, e.velocidad || 0)), valoresVida[2][1]);
    uVida.uT.value = t;
    uVida.uRecorrido.value = e.recorrido || 0;
    const vidaA = vidaDe(e.indice, t);

    if (e.p === 0) {
      // Reposo: la foto viva directo a la pantalla.
      dibujarVida(null, ta, e.panA, vidaA, 1);
      lienzo.style.visibility = 'visible';
      return true;
    }

    const n = e.efecto;
    const sa = uniforms.uRes.value.x / uniforms.uRes.value.y;
    plano.material = materiales[n];
    uniforms.uA.value = ta.tex;
    uniforms.uB.value = tb.tex;
    uniforms.uAspA.value = ta.asp;
    uniforms.uAspB.value = tb.asp;
    uniforms.uPanA.value = e.panA;
    uniforms.uPanB.value = e.panB;
    // Relevo: la foto que sale pierde la vida suavemente hasta la mitad de la
    // transición y la que entra la gana desde la mitad (una sola foto viva a la vez).
    const suave = (x) => x * x * (3 - 2 * x);
    const fA = 1 - suave(Math.min(1, e.p / AJUSTES_VIDA.salida));
    const fB = AJUSTES_VIDA.antes > 0
      ? suave(Math.max(0, Math.min(1, (e.p - (1 - AJUSTES_VIDA.antes)) / AJUSTES_VIDA.antes))) : 0;
    if (fA > 0.001) {
      dibujarVida(rtA, ta, e.panA, vidaA, fA);
      uniforms.uA.value = rtA.texture; uniforms.uAspA.value = sa; uniforms.uPanA.value = 0;
    }
    if (fB > 0.001) {
      dibujarVida(rtB, tb, e.panB, vidaDe(e.indice + 1, t), fB);
      uniforms.uB.value = rtB.texture; uniforms.uAspB.value = sa; uniforms.uPanB.value = 0;
    }
    uniforms.uP.value = e.p;
    uniforms.uSeed.value = e.semilla;
    uniforms.uParam.value.fromArray(valores[n]);
    if (nube) {
      nube.visible = efectos[n] === efPart;
      if (nube.visible) prepararGrilla();
    }
    if (vidrio) vidrio.visible = efectos[n] === efVid;
    renderer.render(escena, camara);
    lienzo.style.visibility = 'visible';
    return true;
  }

  // Calidad adaptativa: la cinta informa cuánto tardó el cuadro que siguió a cada
  // dibujo. Si el promedio pasa de ~26 ms (menos de 40 cuadros por segundo), se baja
  // un escalón de resolución. Nunca se vuelve a subir en la misma visita.
  let promedio = 16.7, muestras = 0;
  function tiempoDeCuadro(ms) {
    if (!(ms > 0) || ms > 250) return;          // pausas, pestaña oculta
    promedio += (ms - promedio) * 0.08;
    muestras++;
    if (muestras > 45 && promedio > 26 && escalon < ESCALONES.length - 1) {
      escalon++;
      renderer.setPixelRatio(ESCALONES[escalon]);
      medir();
      promedio = 16.7; muestras = 0;
    }
  }

  // Compila los shaders de una vez para que el primer uso de cada efecto no trabe.
  function precompilar() {
    if (nube) { prepararGrilla(); nube.visible = true; }
    if (vidrio) vidrio.visible = true;
    for (const m of materiales) { plano.material = m; renderer.compile(escena, camara); }
    renderer.compile(escenaVida, camara);
    if (nube) nube.visible = false;
    if (vidrio) vidrio.visible = false;
  }

  lienzo.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    perdido = true;
    lienzo.style.visibility = 'hidden';
  });
  lienzo.addEventListener('webglcontextrestored', () => {
    perdido = false;
    for (const t of texturas.values()) {
      if (t.lista) t.tex.needsUpdate = true;
      if (t.prof) t.prof.needsUpdate = true;
    }
    claveGrilla = '';
    if (ultimo) dibujar(ultimo);
  });

  return {
    dibujar,
    precargar(imagenes) { imagenes.forEach(cargar); },
    medir,
    precompilar,
    tiempoDeCuadro,
    get resolucion() { return ESCALONES[escalon]; },
  };
}
