// import { CODECS } from './codecs.js';
class AudioDataWorkletStream extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    Object.assign(this, options.processorOptions, {
      uint8: new Uint8Array(0),
    });
    this.port.onmessage = this.appendBuffers.bind(this);
  }

  async appendBuffers({ data: { buffer } }) {
    const result = new Uint8Array(this.uint8.length + buffer.length);
    result.set(this.uint8, 0);
    result.set(buffer, this.uint8.length);

    this.uint8 = result;
    return true;
  }

  endOfStream() {
    this.port.postMessage({
      ended: true,
      currentTime,
      currentFrame,
    });
  }

  process(inputs, outputs) {
    const channels = outputs[0];

    if (this.offset >= this.uint8.length) {
      return true;
    }

    const uint8 = new Uint8Array(256);
    for (let i = 0; i < 256; i++, this.offset++) {
      if (this.offset >= this.uint8.length) {
        break;
      }
      uint8[i] = this.uint8[this.offset];
    }
    const uint16 = new Uint16Array(uint8.buffer);

    for (let i = 0; i < uint16.length; i++) {
      const int = uint16[i];
      // If the high bit is on, then it is a negative number, and actually counts backwards.
      const float = int >= 0x8000 ? -(0x10000 - int) / 0x8000 : int / 0x7fff;
      // interleave

      channels[0][i] = float;
    }

    // Retorna true para indicar que o processamento foi bem-sucedido.
    return true;
  }
}
registerProcessor('audio-data-worklet-stream', AudioDataWorkletStream);
