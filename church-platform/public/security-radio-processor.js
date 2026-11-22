// Resample the microphone to 8 kHz mono and send 200 ms packets with 8-bit μ-law companding.
class SecurityRadioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.samples = 0;
    this.frame = new Uint8Array(1600);
    this.pos = 0;
    this.active = true;
    this.port.onmessage = () => {
      this.active = false;
      this.send(true);
    };
  }

  send(final) {
    const audio = this.frame.slice(0, this.pos);
    this.port.postMessage({ audio, final }, [audio.buffer]);
    this.pos = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!this.active || !channel) return true;
    for (const sample of channel) {
      this.sum += sample;
      this.samples++;
      this.phase += 8000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const average = Math.max(-1, Math.min(1, this.sum / this.samples));
      const compressed = Math.sign(average) * Math.log1p(255 * Math.abs(average)) / Math.log(256);
      this.frame[this.pos++] = Math.round((compressed + 1) * 127.5);
      this.sum = 0;
      this.samples = 0;
      if (this.pos === this.frame.length) this.send(false);
    }
    return true;
  }
}

registerProcessor("security-radio", SecurityRadioProcessor);
