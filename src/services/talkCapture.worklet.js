/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class TalkCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = Math.round(sampleRate / 50);
    this.frame = new Float32Array(this.frameSize);
    this.offset = 0;
  }

  process(inputs) {
    // Never copy input into the outputs: this graph is silent and does not
    // play the microphone back through the user's speakers.
    const input = inputs[0]?.[0];
    if (!input) return true;
    let index = 0;
    while (index < input.length) {
      const size = Math.min(input.length - index, this.frameSize - this.offset);
      this.frame.set(input.subarray(index, index + size), this.offset);
      index += size;
      this.offset += size;
      if (this.offset === this.frameSize) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(this.frameSize);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('talk-capture', TalkCapture);
