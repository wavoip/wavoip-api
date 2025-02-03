import AudioWorkletStream from './Audio/AudioWorkletStream.js';

class Audio {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  workletStream;
  deviceEmitter;
  isStarted = false;

  constructor(Socket, deviceEmitter) {
    this.Socket = Socket;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.workletStream;
    this.deviceEmitter = deviceEmitter;

    this.isStarted = false;
  }

  start(sampleRate) {
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

    this.Socket.socket_audio_transport.on('audio_buffer', buffer => {
      let raw = new Uint8Array(buffer);

      workletStream.aw.port.postMessage({
        buffer: raw,
      });
    });

    this.workletStream = workletStream;

    this.workletStream.mediaStreamTrack
      .finally(() => {
        this.workletStream.ac.onstatechange = () => {
          this.deviceEmitter.emit("audio_audioctx_change_state", {
            audio_context: this.workletStream.ac,
            state: this.workletStream?.ac?.state
          })
        };
      })

    this.isStarted = true;
    this.checkPermission();
  }

  stop() {
    console.info('[*] - Audio stream stopped');
    this.workletStream = null;

    // this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(this.Socket.socket_audio_transport) {
      this.Socket.socket_audio_transport.off('audio_buffer');
    }

    this.isStarted = false;
  }

  checkPermission() {
    if(!this.isStarted) {
      return;
    }

    if(navigator.userActivation.hasBeenActive && this.workletStream?.ac) {
      this.workletStream?.ac.resume()
        .then(() => {
          console.log("[AUDIO] - Permission success to access audio device");
          return true;
        })
        .catch((error) => {
          console.error("[AUDIO] - Permission error to access audio device", error);

          setTimeout(() => {
            this.checkPermission();
          }, 250)
        });
    } else {
      setTimeout(() => {
        this.checkPermission();
      }, 250)
    }
  }

  checkError() {
    if(navigator.userActivation.hasBeenActive) {
      if(this.workletStream?.ac) {
        if(this.workletStream.ac.state !== "running") {
          return {
            type: "audio_context",
            message: "Não foi possível obter acesso ao díspositivo de audio",
          };
        }
      }
    }
    else {
      return {
        type: "audio_context",
        message: "Você precisa interagir com a página para liberar a permissão de áudio",
      };
    }

    return null;
  }
}

export default Audio;