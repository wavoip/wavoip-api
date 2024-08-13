import Recorder from 'audio-recorder-worklet-processor';

let recorder;
let socket;

const init = async (io, sampleRate) => {
  if (recorder) {
    await stop();
  }

  socket = io;
  recorder = new Recorder();

  recorder.init({
    analyserOptions: {
      open: true,
    },
    processOptions: {
      processSize: sampleRate / 25,
      numChannels: 1,
      sampleBits: 16,
      sampleRate: sampleRate,
    },
    onDataProcess: data => {
      if (!recorder) {
        return;
      }

      const pcmData = recorder.encodePCM(data.buffer);
      socket.socket_audio_transport.volatile
        .timeout(250)
        .emit('microphone_buffer', pcmData.buffer);
    },
  });

  console.info('[*] - Microphone stream initied with samplerate', sampleRate);
};

const start = async () => {
  console.info('[*] - Microphone stream called started');
  await recorder.start();
};

const stop = async () => {
  if(recorder) {
    const duration = await recorder.stop();

    console.info('[*] - Microphone stream stopped with duration', duration);
    recorder = null;
    return duration;
  }
};

export default {
  init,
  start,
  stop,
};
