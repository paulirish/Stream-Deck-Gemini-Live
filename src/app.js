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

        const previewContainer = document.getElementById('key-previews');
        previewContainer.innerHTML = ''; // Clear previous

        // Key 0: PTT (Mic)
        const micState = this.state.pttActive ? 'active' : 'idle';
        const micIcon = await this.iconGenerator.createIcon('mic', micState);
        await this.streamDeckManager.setKeyImage(0, micIcon.buffer);
        this.addPreview(previewContainer, micIcon.blob, 'PTT');

        // Key 1: Toggle (Bubble)
        const toggleState = this.state.toggleActive ? 'active' : 'idle';
        const toggleIcon = await this.iconGenerator.createIcon('bubble', toggleState);
        await this.streamDeckManager.setKeyImage(1, toggleIcon.buffer);
        this.addPreview(previewContainer, toggleIcon.blob, 'Toggle');
    }

    addPreview(container, blob, label) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.style.width = '72px';
        img.style.height = '72px';
        img.style.border = '1px solid #555';
        img.style.borderRadius = '8px';
        
        const text = document.createElement('span');
        text.textContent = label;
        text.style.fontSize = '12px';
        text.style.marginTop = '4px';
        text.style.color = '#ccc';

        wrapper.appendChild(img);
        wrapper.appendChild(text);
        container.appendChild(wrapper);
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
