import Recorder from 'audio-recorder-worklet-processor';
import noiseGeneratorUrl from './Microphone/AudioWorklet.js';
let recorder;
let socket;
let audioContext;


let micStream;
let micSource;

async function init(io, sampleRate) {
  socket = io;
}

const start = async () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)(); // Cria o contexto de áudio
  }

  await audioContext.audioWorklet.addModule(noiseGeneratorUrl);
  await audioContext.audioWorklet.addModule(
    'https://cdn.jsdelivr.net/npm/@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js'
  );

  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  micSource = audioContext.createMediaStreamSource(micStream);

  const resampleNode = new AudioWorkletNode(audioContext, 'resample-processor', {
    processorOptions: {
      sampleRate: audioContext.sampleRate
    }
  });

  // Adiciona um listener para capturar os buffers enviados pelo Audio Worklet
  resampleNode.port.onmessage = (event) => {
    socket.socket_audio_transport.volatile
      .timeout(250)
      .emit('microphone_buffer', event.data);
  };

  micSource.connect(resampleNode);
};

const stop = async () => {
  if (micSource) {
    micSource.disconnect(); // Desconecta o mediaStreamSource
    micSource = null;
  }
  
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop()); // Para todos os tracks de áudio
    micStream = null;
  }
  
  if (audioContext) {
    audioContext.close(); // Fecha o AudioContext
    audioContext = null;
  }

  console.log('Microfone desconectado e stream parado.');
 
  if (recorder) {

    // const duration = await recorder.stop();

    // console.info('[*] - Microphone stream stopped with duration', duration);
    // recorder = null;
    // return duration;
  }
};

export default {
  init,
  start,
  stop,
};
