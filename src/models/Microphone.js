// import Recorder from 'audio-recorder-worklet-processor';
import noiseGeneratorUrl from './Microphone/AudioWorkletMic.js';

let microphonesDevicesList = [];

let recorder;
let socket;
let audioContext;

let micStream;
let micSource;
let deviceEmitter;

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener("click", () => {
    if (audioContext) {
      audioContext.resume().catch(() => {
        console.error("[*] - Error to get microphone access");
      });
    }
  });
}

async function init(io, sampleRate, deviceEmitterInstance) {
  socket = io;
  deviceEmitter = deviceEmitterInstance;
}

const start = async () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  await audioContext.audioWorklet.addModule(noiseGeneratorUrl);
  await audioContext.audioWorklet.addModule(
    'https://cdn.jsdelivr.net/npm/@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js'
  );

  deviceEmitter.emit("microphone_audioctx_change_state", {
    audio_context: audioContext,
    state: audioContext?.state
  });
  
  audioContext.onstatechange = () => {
    deviceEmitter.emit("microphone_audioctx_change_state", {
      audio_context: audioContext,
      state: audioContext?.state
    });
  };
  
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

async function fetchMicrophones() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    microphonesDevicesList = devices
      .filter(device => device.kind === 'audioinput')
      .map(mic => ({
        label: mic.label || 'Unnamed Microphone',
        deviceId: mic.deviceId,
      }));
    console.log("Microphones updated:", microphonesDevicesList);
  } catch (error) {
    console.error("Error fetching microphones:", error);
  }
}

function getMicrophones() {
  return microphonesDevicesList;
}

function getAudioContext() {
  return audioContext;
}

async function requestMicrophonePermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('Permissão concedida para o microfone.');

    stream.getTracks().forEach(track => track.stop());
  } catch (error) {
    if (error.name === 'NotAllowedError') {
      console.log('Permissão para o microfone foi negada.');
    } else if (error.name === 'NotFoundError') {
      console.log('Nenhum microfone disponível no dispositivo.');
    } else {
      console.error('Erro ao solicitar permissão para o microfone:', error);
    }
  }
}

async function checkMicrophonePermission() {
  try {
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

    switch (permissionStatus.state) {
      case 'granted':
        console.log('Permissão concedida para o microfone.');
        break;
      case 'denied':
        console.log('Permissão negada para o microfone.');
        break;
      case 'prompt':
        await requestMicrophonePermission();

        break;
    }

    return permissionStatus.state;
  } catch (error) {
    console.error('Erro ao verificar permissão:', error);
    return false;
  }
}

async function checkError() {
  let permission = await checkMicrophonePermission();

  if (microphonesDevicesList.length === 0) {
    return {
      type: "no_microphone_available",
      message: "Não há microfone disponivel para uso"
    };
  } else if (permission !== "granted") {
    return {
      type: "no_microphone_permission",
      message: "Sem permissão para acessar o microfone"
    };
  } else if (audioContext && audioContext.state !== "running") {
    return {
      type: "audio_context",
      message: "Não foi possível obter acesso ao microfone"
    };
  } else if (navigator.userActivation?.hasBeenActive && audioContext?.state !== "running") {
    return {
      type: "audio_context",
      message: "Você precisa interagir com a página para liberar a permissão do microfone"
    };
  } else {
    console.log("[MICROPHONE] - Permission success to access microphone device");
    return false;
  }
}

// ✅ Protegido para Jest o navegador
if (
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices &&
  typeof navigator.mediaDevices.addEventListener === 'function'
) {
  navigator.mediaDevices.addEventListener('devicechange', fetchMicrophones);
}

if (
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices &&
  typeof navigator.mediaDevices.enumerateDevices === 'function'
) {
  fetchMicrophones();
}

export default {
  init,
  start,
  stop,
  requestMicrophonePermission,
  checkMicrophonePermission,
  fetchMicrophones,
  getMicrophones,
  getAudioContext,
  checkError
};