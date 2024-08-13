import noiseGeneratorUrl from './AudioWorklet.js';

class AudioWorkletStream {
  aw;

  constructor({
    sampleRate,
    numberOfChannels = 1,
    latencyHint = 0,
    workletOptions = {},
  } = {}) {
    this.mediaStreamTrack = new Promise(async resolve => {
      const ac = new AudioContext({
        sampleRate,
        numberOfChannels,
        latencyHint,
        channelCount: 1,
        numberOfOutputs: 1,
      });

      await ac.suspend();
      ac.onstatechange = ev => {
        // console.log(ev, "ac.onstatechange");
      };

      await ac.audioWorklet.addModule(noiseGeneratorUrl);
      resolve();
      const aw = new AudioWorkletNode(
        ac,
        'audio-data-worklet-stream',
        workletOptions
      );
      aw.connect(ac.destination);
      ac.resume();
      this.aw = aw;
    });
  }
}

export default AudioWorkletStream;
