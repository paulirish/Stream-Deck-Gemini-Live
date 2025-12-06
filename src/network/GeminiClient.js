/**
 * Manages the WebSocket connection to the Gemini Multimodal Live API.
 */
export class GeminiClient extends EventTarget {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.model = 'models/gemini-2.0-flash-exp';
        this.host = 'generativelanguage.googleapis.com';
        this.uri = `wss://${this.host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;
    }

    /**
     * Connect to the Gemini API.
     * @param {string} apiKey 
     * @param {object} config Optional configuration (system instructions, voice)
     */
    connect(apiKey, config = {}) {
        return new Promise((resolve, reject) => {
            const url = `${this.uri}?key=${apiKey}`;
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.sendSetup(config);
                resolve();
            };

            this.ws.onmessage = this.handleMessage.bind(this);
            
            this.ws.onerror = (error) => {
                console.error('WebSocket Error:', error);
                if (!this.isConnected) reject(error);
                this.dispatchEvent(new CustomEvent('error', { detail: error }));
            };

            this.ws.onclose = (e) => {
                console.warn('WebSocket closed', e.reason);
                this.isConnected = false;
                this.dispatchEvent(new Event('close'));
            };
        });
    }

    sendSetup(config) {
        const setupMessage = {
            setup: {
                model: this.model,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: config.voiceName || 'Puck'
                            }
                        }
                    }
                }
            }
        };
        
        if (config.systemInstruction) {
            setupMessage.setup.systemInstruction = {
                parts: [{ text: config.systemInstruction }]
            };
        }

        this.send(setupMessage);
    }

    /**
     * Send PCM audio data.
     * @param {ArrayBuffer} pcmData 16-bit PCM, 16kHz, Mono
     */
    sendAudio(pcmData) {
        if (!this.isConnected) return;

        // Convert ArrayBuffer to Base64
        const base64Audio = this.arrayBufferToBase64(pcmData);

        const message = {
            realtimeInput: {
                mediaChunks: [{
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Audio
                }]
            }
        };

        this.send(message);
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    async handleMessage(event) {
        let data;
        if (event.data instanceof Blob) {
            // Should be JSON text, but if binary, we might need to handle differently
            const text = await event.data.text();
            data = JSON.parse(text);
        } else {
            data = JSON.parse(event.data);
        }

        // Handle Server Content (Audio)
        if (data.serverContent) {
            if (data.serverContent.modelTurn) {
                const parts = data.serverContent.modelTurn.parts;
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                        // Decode Base64 audio
                        const pcmData = this.base64ToArrayBuffer(part.inlineData.data);
                        this.dispatchEvent(new CustomEvent('audiooutput', { detail: pcmData }));
                    }
                }
            }
            
            if (data.serverContent.turnComplete) {
                this.dispatchEvent(new Event('turncomplete'));
            }
        }
        
        // Handle Tool Calls or other messages if needed
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // Utils
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}
