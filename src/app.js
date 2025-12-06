
// @ts-ignore
import { StreamDeckV2 } from './lib/streamdeckv2.js';
import { AudioManager } from './managers/AudioManager.js';
import { GeminiClient } from './network/GeminiClient.js';
import { IconGenerator } from './utils/icon-generator.js';

class StreamDeckGeminiApp {
    constructor() {
        this.deck = new StreamDeckV2();
        this.audioManager = new AudioManager();
        this.geminiClient = new GeminiClient();
        this.iconGenerator = new IconGenerator();
        
        // App State
        this.state = {
            connected: false,
            geminiConnected: false,
            isPTTActive: false,
            isToggleActive: false
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
            const connected = await this.deck.connect(false); // false = no picker
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
                // StreamDeckV2 doesn't have a public debugMode property, 
                // but we can log events manually if needed.
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
                const connected = await this.deck.connect(true); // true = show picker
                if (!connected) throw new Error('Device selection cancelled');
                
                this.onStreamDeckConnected();
            } catch (error) {
                console.error('Connection failed:', error);
                this.updateStatus('Connection Failed', 'disconnected');
                this.log(`Error: ${error.message}`);
            }
        });

        // Listen for Stream Deck events
        this.deck.addEventListener('keydown', (e) => this.handleButtonPress(/** @type {CustomEvent} */(e).detail.buttonId, true));
        this.deck.addEventListener('keyup', (e) => this.handleButtonPress(/** @type {CustomEvent} */(e).detail.buttonId, false));

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
        
        // Reset and Clear
        try {
            await this.deck.reset();
            await this.deck.clearAllButtons();
        } catch (e) {
            console.warn('Stream Deck Reset/Clear failed:', e);
        }

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

        // Key 0: Push-to-Talk
        if (keyIndex === 0) {
            this.state.isPTTActive = isDown;
            if (isDown) {
                this.audioManager.startStreaming();
                this.log('PTT Active (Listening...)');
            } else {
                this.audioManager.stopStreaming();
                this.log('PTT Inactive');
            }
            await this.updateIcons();
        }

        // Key 1: Toggle Mic
        if (keyIndex === 1 && isDown) { // Toggle on press down
            this.state.isToggleActive = !this.state.isToggleActive;
            if (this.state.isToggleActive) {
                this.audioManager.startStreaming();
                this.log('Mic Toggled ON');
            } else {
                this.audioManager.stopStreaming();
                this.log('Mic Toggled OFF');
            }
            await this.updateIcons();
        }
    }

    async updateIcons() {
        if (!this.state.connected) return;

        const previewContainer = document.getElementById('key-previews');
        previewContainer.innerHTML = ''; // Clear previous

        // Key 0: PTT (Mic)
        const micState = this.state.isPTTActive ? 'active' : 'idle';
        const micIcon = await this.iconGenerator.createIcon('mic', micState);
        await this.deck.fillBuffer(0, micIcon.buffer);
        this.addPreview(previewContainer, micIcon.blob, 'PTT');

        // Key 1: Toggle (Bubble)
        const toggleState = this.state.isToggleActive ? 'active' : 'idle';
        const toggleIcon = await this.iconGenerator.createIcon('bubble', toggleState);
        await this.deck.fillBuffer(1, toggleIcon.buffer);
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
        const transcript = document.getElementById('transcript-log');
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        transcript.appendChild(entry);
        transcript.scrollTop = transcript.scrollHeight;
    }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
    // @ts-ignore
    window.app = new StreamDeckGeminiApp();
});
