// Dibujante WebGL de la nave central: un plano a pantalla completa con el shader
// del efecto de cada transición (más la nube de puntos del polvo de partículas y
// la malla de trozos de la fractura).
// Misma interfaz que el dibujante CSS: dibujar(estado), precargar(imagenes), medir().
// dibujar() devuelve false si todavía no puede dibujar (texturas en camino o
// contexto perdido); en ese caso se muestra el dibujante CSS de respaldo.
import * as THREE from 'three';
import { efectos, vertice, fragmentoDe, valoresPorDefecto } from './efectos/index.js';

const MAX_TEXTURAS = 8;

export function crearDibujanteWebGL(lienzo) {
  const renderer = new THREE.WebGLRenderer({
    canvas: lienzo, antialias: false, alpha: false, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
      t = { tex: null, asp: im.ancho / im.alto, lista: false, error: false, uso: 0 };
      texturas.set(im.src, t);
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
    claveGrilla = '';
    if (ultimo) dibujar(ultimo);
  }

  function dibujar(e) {
    ultimo = e;
    if (perdido) return false;
    const ta = cargar(e.a);
    const tb = cargar(e.b);
    if (!ta.lista || (e.p > 0 && !tb.lista)) { lienzo.style.visibility = 'hidden'; return false; }
    const tbTex = tb.lista ? tb.tex : ta.tex;
    const n = e.p > 0 ? e.efecto : 0;
    plano.material = materiales[n];
    uniforms.uA.value = ta.tex;
    uniforms.uB.value = tbTex;
    uniforms.uAspA.value = ta.asp;
    uniforms.uAspB.value = tb.lista ? tb.asp : ta.asp;
    uniforms.uPanA.value = e.panA;
    uniforms.uPanB.value = e.panB;
    uniforms.uP.value = e.p;
    uniforms.uSeed.value = e.semilla;
    uniforms.uParam.value.fromArray(valores[n]);
    if (nube) {
      nube.visible = e.p > 0 && efectos[n] === efPart;
      if (nube.visible) prepararGrilla();
    }
    if (vidrio) vidrio.visible = e.p > 0 && efectos[n] === efVid;
    renderer.render(escena, camara);
    lienzo.style.visibility = 'visible';
    return true;
  }

  // Compila los shaders de una vez para que el primer uso de cada efecto no trabe.
  function precompilar() {
    if (nube) { prepararGrilla(); nube.visible = true; }
    if (vidrio) vidrio.visible = true;
    for (const m of materiales) { plano.material = m; renderer.compile(escena, camara); }
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
    for (const t of texturas.values()) if (t.lista) t.tex.needsUpdate = true;
    claveGrilla = '';
    if (ultimo) dibujar(ultimo);
  });

  return {
    dibujar,
    precargar(imagenes) { imagenes.forEach(cargar); },
    medir,
    precompilar,
  };
}
