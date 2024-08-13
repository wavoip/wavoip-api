import AudioWorkletStream from './Audio/AudioWorkletStream.js';

class Audio {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  constructor(Socket) {
    this.Socket = Socket;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  start(sampleRate) {
    this.Socket.socket_audio_transport.on('audio_buffer', buffer => {
      let raw = new Uint8Array(buffer);

      workletStream.aw.port.postMessage({
        buffer: raw,
      });
    });

    let workletStream = new AudioWorkletStream({
      sampleRate: sampleRate,
      latencyHint: 0,
      workletOptions: {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: {
          offset: 0,
        },
      },
    });
  }

  stop() {
    console.info('[*] - Audio stream stopped');
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    this.Socket.socket_audio_transport.off('audio_buffer');
  }
}

export default Audio;
