class ResampleProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.init();
    this.src = null;
    this.accumulatedPCM = []; // Buffer acumulado de PCM
    this.sampleRate = options.processorOptions.sampleRate;
  }

  async init() {
    const { create, ConverterType } = globalThis.LibSampleRate;

    let nChannels = 1;
    let inputSampleRate = this.sampleRate || 48000;
    let outputSampleRate = 16000; // or another target sample rate

    create(nChannels, inputSampleRate, outputSampleRate, {
      converterType: ConverterType.SRC_SINC_BEST_QUALITY, // or some other quality
    }).then((src) => {
      this.src = src;
    });
  }

  process(inputs, outputs, parameters) {
    // copy ins to outs (gross)
    for (let inputNum = 0; inputNum < inputs.length; inputNum++) {
      let input = inputs[inputNum];
      // copy channels
      for (let channelNum = 0; channelNum < input.length; channelNum++) {
        let channel = input[channelNum];
        // copy samples
        for (let sampleNum = 0; sampleNum < channel.length; sampleNum++) {
          outputs[inputNum][channelNum][sampleNum] = channel[sampleNum];
        }
      }
    }

    // do something w.r.t. resampling
    if (this.src != null) {
      const resampled = this.src.full(inputs[0][0]);
      // console.log(
      //   `Resampled to ${inputs[0][0].length} samples to  ${resampled.length} samples`
      // );

      // Converte o buffer resampleado para PCM e acumula
      const pcmData = this.convertToPCM(resampled);
      this.accumulatedPCM.push(...pcmData); // Acumula os dados PCM

      // Verifica se acumulou pelo menos 320 amostras (640 bytes)
      while (this.accumulatedPCM.length >= 320) {
        // Envia os primeiros 320 amostras (640 bytes)
        const dataToSend = this.accumulatedPCM.splice(0, 320); // Remove os dados enviados

        this.port.postMessage(new Int16Array(dataToSend).buffer); // Envia como ArrayBuffer
      }
    }

    return true;
  }

  convertToPCM(floatBuffer) {
    const pcmBuffer = new Int16Array(floatBuffer.length);
    for (let i = 0; i < floatBuffer.length; i++) {
      // Converte de ponto flutuante (-1.0 a 1.0) para inteiro de 16 bits (-32768 a 32767)
      pcmBuffer[i] = Math.max(-32768, Math.min(32767, Math.floor(floatBuffer[i] * 32767)));
    }
    return pcmBuffer; // Retorna o array PCM
  }
}


registerProcessor('resample-processor', ResampleProcessor);
