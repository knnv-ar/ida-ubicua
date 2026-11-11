// IDA ubicua · arranque: pantalla de inicio, avisos, naves y medios.
import { crearSecuencia } from './secuencia.js';
import { crearCinta, crearDibujanteCSS } from './cinta.js';
import { crearNaves } from './naves.js';
import { AudioCinta } from './audio.js';
import { VideoNave } from './video.js';
import { efectos } from './efectos/index.js';

const $ = (id) => document.getElementById(id);
const parametros = new URLSearchParams(location.search);

// ---------- escritorio: aviso con QR ----------
const esEscritorio = matchMedia('(hover: hover) and (pointer: fine)').matches && !parametros.has('movil');
if (esEscritorio) {
  $('inicio').hidden = true;
  $('aviso-escritorio').hidden = false;
} else {
  arrancar();
}

function arrancar() {
  const botonIniciar = $('iniciar');
  const contenedorNaves = $('naves');
  const audio = new AudioCinta('audio/ida-audio.mp3');
  const video = new VideoNave($('video'), $('tocar-video'));
  audio.precargar();

  // Sugerencia de «Agregar a inicio» solo en iPhone fuera del modo app.
  const esIOS = /iP(hone|od)/.test(navigator.userAgent);
  const enModoApp = navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  if (esIOS && !enModoApp) $('sugerencia-ios').hidden = false;

  let cinta = null;
  let secuencia = null;
  let naves = null;
  let ctx = null;
  let pausadoPorSistema = false;

  // Lista de imágenes → secuencia; el botón se habilita cuando está lista.
  fetch('data/imagenes.json')
    .then((r) => r.json())
    .then((datos) => {
      secuencia = crearSecuencia(datos.imagenes, efectos.length);
      const dibujante = crearDibujante();
      dibujante.precargar([-1, 0, 1, 2].map((i) => secuencia.imagen(i)));
      cinta = crearCinta({
        scroller: $('cinta'), espaciador: $('espaciador'),
        avance: $('progreso-avance'), indicaciones: $('indicaciones'),
        secuencia, dibujante,
      });
      botonIniciar.disabled = false;
    })
    .catch(() => { botonIniciar.disabled = false; });

  // Dibujante de la nave central: WebGL con los efectos; mientras three.js carga,
  // o si el celular no tiene WebGL, se ve el respaldo CSS (fundido simple).
  function crearDibujante() {
    const css = crearDibujanteCSS($('capa-a'), $('capa-b'));
    let gl = null;
    let pendientes = [];
    let ultimo = null;
    import('./escena.js')
      .then(({ crearDibujanteWebGL }) => {
        const lienzo = $('lienzo');
        lienzo.hidden = false;
        lienzo.style.visibility = 'hidden';
        gl = crearDibujanteWebGL(lienzo);
        gl.medir();
        gl.precompilar();
        gl.precargar(pendientes);
        if (ultimo) gl.dibujar(ultimo);
      })
      .catch((e) => { console.warn('Sin WebGL: se usa el respaldo CSS', e); });
    return {
      dibujar(e) {
        ultimo = e;
        if (gl && gl.dibujar(e)) return;
        css.dibujar(e);
      },
      precargar(imagenes) {
        if (gl) gl.precargar(imagenes);
        else { pendientes = imagenes; css.precargar(imagenes); }
      },
      medir() { gl?.medir(); },
    };
  }

  function alCambiarNave(nombre) {
    if (pausadoPorSistema) return;
    if (nombre === 'central') { audio.sonar(); cinta?.activar(); }
    else { audio.callar(); cinta?.desactivar(); }
    if (nombre === 'derecha') video.activar(); else video.desactivar();
  }

  function pausarTodo() {
    audio.callar();
    video.desactivar();
    cinta?.desactivar();
  }
  function reanudar() {
    if (naves?.activa) alCambiarNave(naves.activa);
  }

  botonIniciar.addEventListener('click', () => {
    botonIniciar.disabled = true;

    // 1. Sonido: el AudioContext se crea dentro del gesto.
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* nada */ }
    ctx.resume();
    video.desbloquear();
    audio.iniciar(ctx).catch((e) => console.warn('No se pudo cargar el audio', e));

    // 2. Pantalla completa y bloqueo vertical, donde el navegador lo permita.
    const raiz = document.documentElement;
    if (raiz.requestFullscreen && !document.fullscreenElement) {
      raiz.requestFullscreen({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('portrait').catch(() => {}))
        .catch(() => {});
    }

    // 3. Naves: primero se ubica la central, después se muestra.
    contenedorNaves.hidden = false;
    naves = crearNaves(contenedorNaves, alCambiarNave);
    requestAnimationFrame(() => {
      cinta?.medir();
      naves.empezar();
      $('inicio').classList.add('saliendo');
      contenedorNaves.classList.add('visible');
      $('cinta').focus({ preventScroll: true });
      setTimeout(() => { $('inicio').hidden = true; }, 700);
      setTimeout(() => video.precargar(), 4000);
    });
  });

  // Guía de desplazamiento: se oculta con el primer deslizamiento del dedo
  // (o la rueda / arrastre con mouse al probar en la computadora). No se usa el
  // evento scroll porque la propia cinta mueve el scroll al acomodarse.
  function prepararGuia() {
    const guia = $('guia-desplazamiento');
    if (!guia) return;
    const zona = $('nave-central');
    let inicio = null;
    const ocultar = () => {
      quitar();
      guia.classList.add('oculta');
      setTimeout(() => guia.remove(), 600);
    };
    const alTocar = (e) => { const t = e.touches[0]; inicio = { x: t.clientX, y: t.clientY }; };
    const alMover = (e) => {
      const t = e.touches[0];
      if (!inicio) { inicio = { x: t.clientX, y: t.clientY }; return; }
      if (Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > 6) ocultar();
    };
    const alArrastrar = (e) => { if (e.pointerType === 'mouse' && e.buttons) ocultar(); };
    function quitar() {
      zona.removeEventListener('touchstart', alTocar);
      zona.removeEventListener('touchmove', alMover);
      zona.removeEventListener('wheel', ocultar);
      zona.removeEventListener('pointermove', alArrastrar);
    }
    zona.addEventListener('touchstart', alTocar, { passive: true });
    zona.addEventListener('touchmove', alMover, { passive: true });
    zona.addEventListener('wheel', ocultar, { passive: true });
    zona.addEventListener('pointermove', alArrastrar, { passive: true });
  }
  prepararGuia();

  // Celular en horizontal o app en segundo plano: todo en pausa.
  const horizontal = matchMedia('(orientation: landscape) and (max-height: 540px)');
  const revisarSistema = () => {
    const pausar = horizontal.matches || document.visibilityState === 'hidden';
    if (pausar && !pausadoPorSistema) { pausadoPorSistema = true; pausarTodo(); }
    else if (!pausar && pausadoPorSistema) { pausadoPorSistema = false; cinta?.medir(); reanudar(); }
  };
  horizontal.addEventListener('change', revisarSistema);
  document.addEventListener('visibilitychange', revisarSistema);

  // ?depurar en la dirección expone el estado en la consola.
  if (parametros.has('depurar')) {
    window.ida = { audio, video, get naves() { return naves; }, get cinta() { return cinta; }, get secuencia() { return secuencia; } };
  }
}
