// Audio de la nave central: loop sin corte con Web Audio y memoria de posición.
// Se usa un AudioBufferSourceNode con loop porque el elemento <audio> deja un
// silencio en cada vuelta con MP3, y porque iOS ignora el volumen de <audio>
// (los fundidos se hacen con un GainNode).

const CLAVE = 'ida-audio-posicion';
const FUNDIDO_ENTRADA = 0.8;
const FUNDIDO_SALIDA = 0.4;

export class AudioCinta {
  constructor(url, { inicioLoop = 0.05 } = {}) {
    this.url = url;
    this.inicioLoop = inicioLoop;
    this.bytes = null;
    this.ctx = null;
    this.buffer = null;
    this.fuente = null;
    this.quiereSonar = false;
    this.offset = inicioLoop;
    try {
      const guardado = parseFloat(sessionStorage.getItem(CLAVE));
      if (guardado > 0) this.offset = guardado;
    } catch (e) { /* sin almacenamiento */ }
  }

  // Empieza a descargar el archivo antes del toque en «iniciar».
  precargar() {
    if (!this.bytes) this.bytes = fetch(this.url).then((r) => r.arrayBuffer());
    return this.bytes;
  }

  // Se llama dentro del gesto del usuario, con el AudioContext ya creado.
  async iniciar(ctx) {
    this.ctx = ctx;
    this.ganancia = ctx.createGain();
    this.ganancia.gain.value = 0;
    this.ganancia.connect(ctx.destination);
    const datos = await this.precargar();
    this.buffer = await new Promise((ok, mal) => ctx.decodeAudioData(datos, ok, mal));
    if (this.offset >= this.buffer.duration) this.offset = this.inicioLoop;
    if (this.quiereSonar) this._arrancar();
  }

  sonar() {
    this.quiereSonar = true;
    if (this.buffer && !this.fuente) this._arrancar();
  }

  callar() {
    this.quiereSonar = false;
    if (!this.fuente) return;
    this.offset = this.posicion();
    this._guardar();
    const t = this.ctx.currentTime;
    const g = this.ganancia.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + FUNDIDO_SALIDA);
    this.fuente.stop(t + FUNDIDO_SALIDA + 0.02);
    this.fuente = null;
  }

  // Posición actual dentro del archivo, contemplando las vueltas del loop.
  posicion() {
    if (!this.fuente) return this.offset;
    const fin = this.buffer.duration;
    let p = this.offsetInicio + (this.ctx.currentTime - this.t0);
    if (p >= fin) p = this.inicioLoop + ((p - this.inicioLoop) % (fin - this.inicioLoop));
    return p;
  }

  _arrancar() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const f = this.ctx.createBufferSource();
    f.buffer = this.buffer;
    f.loop = true;
    f.loopStart = this.inicioLoop;
    f.loopEnd = this.buffer.duration;
    f.connect(this.ganancia);
    this.t0 = this.ctx.currentTime;
    this.offsetInicio = this.offset;
    f.start(0, this.offset);
    this.fuente = f;
    const t = this.ctx.currentTime;
    const g = this.ganancia.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1, t + FUNDIDO_ENTRADA);
  }

  _guardar() {
    try { sessionStorage.setItem(CLAVE, String(this.offset)); } catch (e) { /* nada */ }
  }
}
