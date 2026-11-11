// Video de la nave derecha: arranca al llegar, se pausa al salir y retoma en el
// mismo punto (el elemento conserva currentTime; además se guarda por si el
// navegador lo descarta de memoria).

const CLAVE = 'ida-video-posicion';

export class VideoNave {
  constructor(video, botonTocar) {
    this.el = video;
    this.boton = botonTocar;
    this.activo = false;
    this.desbloqueado = false;
    this._fundido = 0;
    let guardado = 0;
    try { guardado = parseFloat(sessionStorage.getItem(CLAVE)) || 0; } catch (e) { /* nada */ }
    if (guardado > 0) {
      const aplicar = () => { if (guardado < this.el.duration) this.el.currentTime = guardado; };
      if (this.el.readyState >= 1) aplicar();
      else this.el.addEventListener('loadedmetadata', aplicar, { once: true });
    }
    this.boton.addEventListener('click', () => {
      this.boton.hidden = true;
      this.activo = true;
      this._reproducir(true);
    });
    this.el.addEventListener('pause', () => this._guardar());
  }

  // Se llama dentro del toque en «iniciar»: un play() en el gesto habilita
  // después la reproducción con sonido sin otro toque (iPhone incluido).
  desbloquear() {
    this.el.muted = false;
    const p = this.el.play();
    if (p && p.then) {
      p.then(() => { this.desbloqueado = true; if (!this.activo) this.el.pause(); })
       .catch(() => { /* se pedirá un toque al llegar a la nave */ });
    }
  }

  precargar() {
    if (this.el.preload !== 'auto') this.el.preload = 'auto';
  }

  activar() {
    this.activo = true;
    this._reproducir(false);
  }

  desactivar() {
    this.activo = false;
    this.boton.hidden = true;
    if (this.el.paused) return;
    this._fundir(0, 300, () => { if (!this.activo) this.el.pause(); });
  }

  _reproducir(conToque) {
    this.precargar();
    this.el.volume = 0;
    const p = this.el.play();
    const ok = () => { this.boton.hidden = true; this._fundir(1, 600); };
    if (p && p.then) {
      p.then(ok).catch(() => {
        // El navegador pidió un gesto: se ofrece un botón para reproducir.
        this.el.volume = 1;
        if (this.activo && !conToque) this.boton.hidden = false;
      });
    } else ok();
  }

  // En iPhone el volumen es de solo lectura: ahí el cambio es directo.
  _fundir(destino, ms, alTerminar) {
    const id = ++this._fundido;
    const desde = this.el.volume;
    const t0 = performance.now();
    const paso = (ahora) => {
      if (id !== this._fundido) return;
      const k = Math.min(1, (ahora - t0) / ms);
      try { this.el.volume = desde + (destino - desde) * k; } catch (e) { /* nada */ }
      if (k < 1) requestAnimationFrame(paso);
      else if (alTerminar) alTerminar();
    };
    requestAnimationFrame(paso);
  }

  _guardar() {
    try { sessionStorage.setItem(CLAVE, String(this.el.currentTime)); } catch (e) { /* nada */ }
  }
}
