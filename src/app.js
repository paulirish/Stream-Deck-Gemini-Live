import { StreamDeckManager } from './managers/StreamDeckManager.js';
import { IconGenerator } from './utils/icon-generator.js';
import { AudioManager } from './managers/AudioManager.js';
import { GeminiClient } from './network/GeminiClient.js';

class StreamDeckGeminiApp {
    constructor() {
        this.streamDeckManager = new StreamDeckManager();
        this.iconGenerator = new IconGenerator();
        this.audioManager = new AudioManager();
        this.geminiClient = new GeminiClient();
        
        // App State
        this.state = {
            pttActive: false,
            toggleActive: false,
            connected: false,
            geminiConnected: false
        };

        this.init();
    }

    async init() {
        this.setupUI();
        await this.setupAudio();
        // Auto-connect Stream Deck if possible
        this.tryAutoConnect();
    }

    async tryAutoConnect() {
        try {
            const connected = await this.streamDeckManager.autoConnect();
            if (connected) {
                this.onStreamDeckConnected();
            }
        } catch (e) {
            console.log('Auto-connect failed:', e);
        }
    }

    async setupAudio() {
        try {
            // Populate device lists
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput');
            const speakers = devices.filter(d => d.kind === 'audiooutput');

            const micSelect = /** @type {HTMLSelectElement} */ (document.getElementById('mic-select'));
            const speakerSelect = /** @type {HTMLSelectElement} */ (document.getElementById('speaker-select'));

            // Load saved selections
            const savedMic = localStorage.getItem('selected_mic');
            const savedSpeaker = localStorage.getItem('selected_speaker');

            mics.forEach(mic => {
                const option = document.createElement('option');
                option.value = mic.deviceId;
                option.textContent = mic.label || `Microphone ${micSelect.options.length + 1}`;
                micSelect.appendChild(option);
            });
            if (savedMic) micSelect.value = savedMic;

            speakers.forEach(speaker => {
                const option = document.createElement('option');
                option.value = speaker.deviceId;
                option.textContent = speaker.label || `Speaker ${speakerSelect.options.length + 1}`;
                speakerSelect.appendChild(option);
            });
            if (savedSpeaker) speakerSelect.value = savedSpeaker;

            // Save on change
            micSelect.addEventListener('change', () => localStorage.setItem('selected_mic', micSelect.value));
            speakerSelect.addEventListener('change', () => localStorage.setItem('selected_speaker', speakerSelect.value));
            
        } catch (error) {
            console.error('Error setting up audio devices:', error);
            this.log(`Audio Setup Error: ${error.message}`);
        }
    }

    setupUI() {
        const connectBtn = document.getElementById('connect-streamdeck');
        const apiKeyInput = /** @type {HTMLInputElement} */ (document.getElementById('api-key'));
        const debugCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('debug-mode'));

        // Load saved API Key
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) apiKeyInput.value = savedKey;

        // Debug Mode Toggle
        if (debugCheckbox) {
            debugCheckbox.addEventListener('change', () => {
                this.streamDeckManager.debugMode = debugCheckbox.checked;
                this.log(`Debug Mode: ${debugCheckbox.checked ? 'ON' : 'OFF'}`);
            });
        }

        connectBtn.addEventListener('click', async () => {
            try {
                const apiKey = apiKeyInput.value.trim();
                if (!apiKey) {
                    throw new Error('Please enter a Gemini API Key');
                }
                localStorage.setItem('gemini_api_key', apiKey);

                // Connect Stream Deck
                await this.streamDeckManager.connect();
                this.onStreamDeckConnected();
            } catch (error) {
                console.error('Connection failed:', error);
                this.updateStatus('Connection Failed', 'disconnected');
                this.log(`Error: ${error.message}`);
            }
        });

        // Listen for Stream Deck events
        this.streamDeckManager.addEventListener('keydown', (e) => this.handleButtonPress(/** @type {CustomEvent} */(e).detail.keyIndex, true));
        this.streamDeckManager.addEventListener('keyup', (e) => this.handleButtonPress(/** @type {CustomEvent} */(e).detail.keyIndex, false));

        // Listen for Audio Input (Mic -> Gemini)
        this.audioManager.addEventListener('audioinput', (e) => {
            if (this.state.geminiConnected) {
                this.geminiClient.sendAudio(/** @type {CustomEvent} */(e).detail);
            }
        });

        // Listen for Gemini Output (Gemini -> Speaker)
        this.geminiClient.addEventListener('audiooutput', (e) => {
            this.audioManager.playAudio(/** @type {CustomEvent} */(e).detail);
        });
        
        this.geminiClient.addEventListener('error', (e) => {
            this.log(`Gemini Error: ${/** @type {CustomEvent} */(e).detail.message || 'Unknown error'}`);
        });
    }

    async onStreamDeckConnected() {
        const apiKeyInput = /** @type {HTMLInputElement} */ (document.getElementById('api-key'));
        const apiKey = apiKeyInput.value.trim();
        
        // Initialize Audio
        const micSelect = /** @type {HTMLSelectElement} */ (document.getElementById('mic-select'));
        const micId = micSelect.value;
        await this.audioManager.initialize(micId);

        // Connect to Gemini if Key is present
        if (apiKey) {
            try {
                await this.geminiClient.connect(apiKey, {
                    systemInstruction: "You are a helpful voice assistant."
                });
                this.state.geminiConnected = true;
            } catch (e) {
                this.log('Gemini Connection Failed');
            }
        }
        
        this.state.connected = true;
        this.updateStatus('Connected & Live', 'live');
        
        await this.updateIcons();
        this.log('System Connected');
    }

    updateStatus(text, type) {
        const statusText = document.getElementById('streamdeck-status');
        statusText.textContent = text;
        statusText.className = `status-text status-${type}`;
        statusText.style.color = `var(--status-${type})`;
    }

    async handleButtonPress(keyIndex, isDown) {
        if (!this.state.connected) return;

        this.log(`Key ${keyIndex} ${isDown ? 'Down' : 'Up'}`);

        // Key 0: Push-to-Talk
        if (keyIndex === 0) {
            this.state.pttActive = isDown;
            if (isDown) {
                this.audioManager.startStreaming();
            } else {
                this.audioManager.stopStreaming();
                // Send empty message or specific end signal if needed, 
                // but usually stopping audio is enough for PTT if we rely on VAD or just silence.
                // Actually, for PTT, we might want to explicitly commit.
                // But Gemini Live is continuous. Stopping audio input is effectively "done speaking".
            }
            await this.updateIcons();
        }

        // Key 1: Toggle
        if (keyIndex === 1 && isDown) {
            this.state.toggleActive = !this.state.toggleActive;
            if (this.state.toggleActive) {
                this.audioManager.startStreaming();
            } else {
                this.audioManager.stopStreaming();
            }
            await this.updateIcons();
        }
    }

    async updateIcons() {
        if (!this.state.connected) return;

        // PTT Icon
        const pttBuffer = await this.iconGenerator.createIcon('ptt', this.state.pttActive ? 'active' : 'idle');
        await this.streamDeckManager.setKeyImage(0, pttBuffer);

        // Toggle Icon
        const toggleBuffer = await this.iconGenerator.createIcon('toggle', this.state.toggleActive ? 'active' : 'idle');
        await this.streamDeckManager.setKeyImage(1, toggleBuffer);
    }

    log(message) {
        const logDiv = document.getElementById('transcript-log');
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logDiv.appendChild(entry);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
    window.app = new StreamDeckGeminiApp();
});
