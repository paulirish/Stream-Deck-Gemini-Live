export class AudioManager extends EventTarget {
    constructor() {
        super();
        this.audioContext = null;
        this.mediaStream = null;
        this.workletNode = null;
        this.isPlaying = false;
        this.audioQueue = [];
        this.nextStartTime = 0;
    }

    async initialize(micId = 'default') {
        // Cleanup previous session if active
        this.stop();

        try {
            // Create AudioContext. We try to force 16kHz to match Gemini requirements
            // and avoid manual downsampling complexity.
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000,
            });

            await this.audioContext.audioWorklet.addModule('src/utils/audio-processor.js');

            const constraints = {
                audio: {
                    deviceId: micId ? { exact: micId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: 16000
                }
            };

            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Setup Analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            source.connect(this.analyser);

            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
            
            let logCount = 0;
            this.workletNode.port.onmessage = (event) => {
                if (!this.isStreaming) return; 
                // if (logCount++ % 100 === 0) {
                //      console.log('[AudioManager] Received audio chunk from worklet. Size:', event.data.byteLength);
                // }

                // PCM Data from Worklet
                this.dispatchEvent(new CustomEvent('audioinput', { detail: event.data }));
            };

            source.connect(this.workletNode);
            // We don't connect worklet to destination to avoid self-hearing (unless desired)
            
            console.log('AudioManager initialized at', this.audioContext.sampleRate, 'Hz');

        } catch (error) {
            console.error('Error initializing AudioManager:', error);
            throw error;
        }
    }

    startStreaming() {
        console.log('[AudioManager] startStreaming called. Context state:', this.audioContext?.state);
        this.isStreaming = true;
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume()
                .then(() => {
                    console.log('[AudioManager] Context resumed');
                    if (this.audioContext.state !== 'running') {
                         this.dispatchEvent(new CustomEvent('warning', { 
                            detail: { message: 'Audio Context is not running. Check permissions or interact with the page.' } 
                        }));
                    }
                })
                .catch(err => {
                    console.error('[AudioManager] Context resume failed:', err);
                    this.dispatchEvent(new CustomEvent('warning', { 
                        detail: { message: 'Audio autoplay blocked. Click "Connect Gemini" to initialize.' } 
                    }));
                });
        }
    }

    stopStreaming() {
        console.log('[AudioManager] stopStreaming called');
        this.isStreaming = false;
    }

    /**
     * Play raw PCM audio chunk (16-bit Int, 24kHz usually from Gemini, but let's check spec).
     * Gemini 2.0 Flash Exp usually returns 24kHz.
     * @param {ArrayBuffer} pcmData 
     */
    playAudio(pcmData) {
        if (!this.audioContext) return;

        // Convert Int16 PCM to Float32
        const int16 = new Int16Array(pcmData);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        // Create AudioBuffer
        // Gemini output is often 24kHz.
        const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

        // Schedule playback
        const currentTime = this.audioContext.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }
        
        source.start(this.nextStartTime);
        this.nextStartTime += buffer.duration;
    }

    stop() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
