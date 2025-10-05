/**
 * An AudioWorkletProcessor that captures raw audio data, converts it to 16-bit PCM,
 * and posts it back to the main thread. This is more robust than ScriptProcessorNode.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  /**
   * The process method is called for each block of audio data.
   * @param {Float32Array[][]} inputs - An array of inputs, each with an array of channels.
   * @returns {boolean} - Return true to keep the processor alive.
   */
  process(inputs) {
    // We only use the first input and the first channel.
    const inputChannelData = inputs[0][0];

    // If there's no data, do nothing. This can happen when the stream is starting or stopping.
    if (!inputChannelData) {
      return true;
    }

    // Convert the Float32Array audio data to 16-bit PCM format (Int16Array).
    // This is the format expected by the Gemini API for raw audio.
    const pcmData = new Int16Array(inputChannelData.length);
    for (let i = 0; i < inputChannelData.length; i++) {
      // Clamp the values to the -1.0 to 1.0 range before conversion
      const s = Math.max(-1, Math.min(1, inputChannelData[i]));
      // Convert to 16-bit integer
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Post the PCM data buffer back to the main thread.
    // The second argument is a list of transferable objects. Transferring the buffer
    // avoids a copy, improving performance.
    this.port.postMessage(pcmData.buffer, [pcmData.buffer]);

    // Return true to indicate the processor should continue running.
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
