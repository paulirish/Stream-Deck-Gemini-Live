/**
 * Manages the connection to the Gemini Multimodal Live API using @google/genai SDK.
 */
import { GoogleGenAI } from "https://esm.run/@google/genai";

export class GeminiClient extends EventTarget {
    constructor() {
        super();
        this.client = null;
        this.session = null;
        this.isConnected = false;
        this.model = 'gemini-2.5-flash-native-audio-preview-09-2025';
    }


    // /**
    //  * Fetch available models from the Gemini API. there's basically 3 unique models available rn.
    //  * @param {string} apiKey 
    //  * @returns {Promise<Array<{name: string, displayName: string}>>}
    //  */
    static async fetchModels(apiKey) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`);
            if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
            const data = await response.json();
            const models =  data.models.filter(model => model.supportedGenerationMethods?.includes('bidiGenerateContent') && !model.name.includes('image') && !model.name.includes('preview-09-2025'));
            return models || [];
        } catch (error) {
            console.error('Error fetching models:', error);
            return [];
        }
    }

    /**
     * Connect to the Gemini API.
     * @param {string} apiKey 
     * @param {object} config Optional configuration (system instructions, voice, model)
     */
    async connect(apiKey, config = {}) {
        this.client = new GoogleGenAI({ apiKey: apiKey });
        
        if (config.model) {
            this.model = config.model;
        }

        const sessionConfig = {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: config.voiceName || 'Puck'
                    }
                }
            }
        };

        if (config.systemInstruction) {
            sessionConfig.systemInstruction = config.systemInstruction;
        }

        try {
            this.session = await this.client.live.connect({
                model: this.model,
                config: sessionConfig,
                callbacks: {
                    onopen: () => {
                        console.debug('Session Opened');
                        this.isConnected = true;
                    },
                    onmessage: (message) => {
                        this.handleMessage(message);
                    },
                    onerror: (e) => {
                        console.error('Session Error:', e);
                        this.dispatchEvent(new CustomEvent('error', { detail: e }));
                    },
                    onclose: (e) => {
                        console.debug('Session Closed:', e);
                        this.isConnected = false;
                        this.dispatchEvent(new Event('close'));
                    }
                }
            });
            // The connect promise resolves when the session is established
            this.isConnected = true;
        } catch (error) {
            console.error('Connection failed:', error);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Send PCM audio data.
     * @param {ArrayBuffer} pcmData 16-bit PCM, 16kHz, Mono
     */
    sendAudio(pcmData) {
        if (!this.isConnected || !this.session) return;

        // Convert ArrayBuffer to Base64
        const base64Audio = this.arrayBufferToBase64(pcmData);

        this.session.sendRealtimeInput({
            audio: {
                data: base64Audio,
                mimeType: "audio/pcm;rate=16000"
            }
        });
    }

    send(data) {
        // Fallback for direct send if needed, but session.sendRealtimeInput should be used.
        // This method might be called by legacy code if any.
        console.warn('send() called but using SDK session. Use sendAudio() instead.');
    }

    handleMessage(message) {
        // Handle Server Content (Audio & Transcription)
        // message.serverContent contains the data
        
        const serverContent = message.serverContent;
        
        if (serverContent) {
            if (serverContent.modelTurn) {
                const parts = serverContent.modelTurn.parts;
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                        // Decode Base64 audio
                        const pcmData = this.base64ToArrayBuffer(part.inlineData.data);
                        this.dispatchEvent(new CustomEvent('audiooutput', { detail: pcmData }));
                    }
                    if (part.text) {
                         this.dispatchEvent(new CustomEvent('transcription', { 
                             detail: { role: 'model', text: part.text } 
                         }));
                    }
                }
            }
            
            if (serverContent.turnComplete) {
                this.dispatchEvent(new Event('turncomplete'));
            }
        }

        // Handle Usage Metadata
        // It might be on the message object directly in some SDK versions
        if (message.usageMetadata) {
            this.dispatchEvent(new CustomEvent('usage', { detail: message.usageMetadata }));
        }

        // console.log('Server Content:', serverContent);
    }

    disconnect() {
        if (this.session) {
            this.session.close();
            this.session = null;
            this.isConnected = false;
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
