class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2048; // Send chunks of this size
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input.length) return true;

        const channelData = input[0]; // Mono

        // Simple downsampling and buffering
        // Note: Ideally, we should use a proper resampling algorithm if the context sample rate 
        // is different from the target (16kHz). For now, we assume the context is set to 16kHz 
        // or we rely on the browser's native resampling if we requested 16kHz in getUserMedia 
        // (though AudioContext usually runs at system rate).
        
        // If we need to downsample from 48k to 16k, we take every 3rd sample.
        // But let's try to enforce 16kHz context first.
        
        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex++] = channelData[i];

            if (this.bufferIndex >= this.bufferSize) {
                this.flush();
            }
        }

        return true;
    }

    flush() {
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(this.bufferSize);
        for (let i = 0; i < this.bufferSize; i++) {
            const s = Math.max(-1, Math.min(1, this.buffer[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
        this.bufferIndex = 0;
    }
}

registerProcessor('audio-processor', AudioProcessor);
