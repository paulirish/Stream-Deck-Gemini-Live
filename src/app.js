
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
        const brightnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('brightness-slider'));

        // Load saved API Key
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) apiKeyInput.value = savedKey;
        apiKeyInput.addEventListener('change', () => localStorage.setItem('gemini_api_key', apiKeyInput.value));

        // Load saved Brightness
        if (brightnessSlider) {
            const savedBrightness = localStorage.getItem('streamdeck_brightness');
            if (savedBrightness) brightnessSlider.value = savedBrightness;
            
            brightnessSlider.addEventListener('input', () => {
                const val = parseInt(brightnessSlider.value, 10);
                if (this.state.connected) {
                    this.deck.setBrightness(val);
                }
                localStorage.setItem('streamdeck_brightness', String(val));
            });
        }

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

        this.geminiClient.addEventListener('close', () => {
            this.log('Disconnected from Gemini');
        });

        this.geminiClient.addEventListener('transcription', (e) => {
            const { role, text } = /** @type {CustomEvent} */(e).detail;
            this.log(`${role === 'user' ? 'User' : 'Gemini'}: ${text}`);
        });

        this.geminiClient.addEventListener('usage', (e) => {
            this.updateTokenStats(/** @type {CustomEvent} */(e).detail);
        });

        // Fetch Models if API Key is available
        const storedKey = localStorage.getItem('gemini_api_key');
        // if (storedKey) {
        //     this.loadModels(storedKey);
        // }
        
        apiKeyInput.addEventListener('change', () => {
            const newKey = apiKeyInput.value;
            localStorage.setItem('gemini_api_key', newKey);
            // if (newKey) this.loadModels(newKey);
        });
    }

    // async loadModels(apiKey) {
    //     const modelSelect = /** @type {HTMLSelectElement} */ (document.getElementById('model-select'));
    //     modelSelect.innerHTML = '<option disabled selected>Loading...</option>';
        
    //     const models = await GeminiClient.fetchModels(apiKey);
        
    //     modelSelect.innerHTML = ''; // Clear loading
        
    //     // Filter for relevant models (Gemini 2.0/Live capable) if possible, 
    //     // or just show all and let user pick.
    //     // The user mentioned: "2.0-flash, 2.5-flash , gemini-2.5-flash-native-audio-preview, gemini-live-2.5-flash-preview, etc."
    //     // I'll show all that contain "gemini" to be safe, or just all.
    //     // But sorting them might be nice.
        
    //     if (models.length === 0) {
    //          const option = document.createElement('option');
    //          option.text = "Failed to load models or Invalid Key";
    //          modelSelect.add(option);
    //          return;
    //     }

    //     models.forEach(model => {
    //         // model.name is like "models/gemini-1.5-flash"
    //         // model.displayName is "Gemini 1.5 Flash"
    //         const option = document.createElement('option');
    //         option.value = model.name;
    //         option.textContent = model.displayName || model.name.split('/').pop();
            
    //         // Auto-select a good default if it matches "gemini-2.0-flash-exp"
    //         if (model.name.includes('gemini-2.0-flash-exp')) {
    //             option.selected = true;
    //         }
            
    //         modelSelect.appendChild(option);
    //     });
        
    //     // If nothing selected, select the first one
    //     if (modelSelect.selectedIndex === -1 && modelSelect.options.length > 0) {
    //         modelSelect.selectedIndex = 0;
    //     }
    // }

    async onStreamDeckConnected() {
        const apiKeyInput = /** @type {HTMLInputElement} */ (document.getElementById('api-key'));
        const apiKey = apiKeyInput.value.trim();
        
        // Initialize Audio
        const micSelect = /** @type {HTMLSelectElement} */ (document.getElementById('mic-select'));
        const micId = micSelect.value;
        await this.audioManager.initialize(micId);

        // Get Configuration
        const modelSelect = /** @type {HTMLSelectElement} */ (document.getElementById('model-select'));
        const voiceSelect = /** @type {HTMLSelectElement} */ (document.getElementById('voice-select'));
        
        const config = {
            // hardcoded to gemini-2.0-flash-exp for now.
            model: this.geminiClient.model,
            voiceName: voiceSelect.value,
            systemInstruction: "You are a helpful voice assistant."
        };

        // Connect to Gemini if Key is present
        if (apiKey) {
            try {
                await this.geminiClient.connect(apiKey, config);
                this.state.geminiConnected = true;
                this.log('Gemini Connected');
            } catch (e) {
                this.log('Gemini Connection Failed');
                console.error(e);
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

        // Apply Brightness
        const brightnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('brightness-slider'));
        if (brightnessSlider) {
            await this.deck.setBrightness(parseInt(brightnessSlider.value, 10));
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

    updateTokenStats(usage) {
        if (!usage) return;
        
     
        const tokenString = `
        Prompt:   ${usage.promptTokensDetails.map(t => `${t.modality.toLowerCase()}: ${t.tokenCount.toLocaleString().padStart(9    )}`).join(', ')}
        Response: ${usage.responseTokensDetails.map(t => `${t.modality.toLowerCase()}: ${t.tokenCount.toLocaleString().padStart(9)}`).join(', ')}
        Total:    ${usage.totalTokenCount.toLocaleString().padStart(9)}
        `;
        
        // see pricing-deets.md 

        // // Live API (2.5-flash-native-audio-preview-09-2025)
        // const inputTextCost = ((usage.promptTokensDetails.find(t => t.modality === 'TEXT')?.tokenCount ?? 0) / 1_000_000)    * 0.50;
        // const outputTextCost = ((usage.responseTokensDetails.find(t => t.modality === 'TEXT')?.tokenCount ?? 0) / 1_000_000) * 2.00;
        // const inputAudioCost = ((usage.promptTokensDetails.find(t => t.modality === 'AUDIO')?.tokenCount ?? 0) / 1_000_000)    * 3.00;
        // const outputAudioCost = ((usage.responseTokensDetails.find(t => t.modality === 'AUDIO')?.tokenCount ?? 0) / 1_000_000) * 12.00;

        // gemini-2.0-flash-live-001
        const inputTextCost = ((usage.promptTokensDetails.find(t => t.modality === 'TEXT')?.tokenCount ?? 0) / 1_000_000)    * 0.35;
        const outputTextCost = ((usage.responseTokensDetails.find(t => t.modality === 'TEXT')?.tokenCount ?? 0) / 1_000_000) * 1.50;
        const inputAudioCost = ((usage.promptTokensDetails.find(t => t.modality === 'AUDIO')?.tokenCount ?? 0) / 1_000_000)    * 2.10;
        const outputAudioCost = ((usage.responseTokensDetails.find(t => t.modality === 'AUDIO')?.tokenCount ?? 0) / 1_000_000) * 8.50;

        const totalCost = inputTextCost + outputTextCost + inputAudioCost + outputAudioCost;

        const countEl = document.getElementById('token-count');
        const costEl = document.getElementById('cost-estimate');

        const formattedValue = Intl.NumberFormat('en', {currency: 'USD', style: 'currency', minimumFractionDigits: 4}).format(totalCost);
        
        if (countEl) countEl.textContent = tokenString;
        if (costEl) costEl.textContent = formattedValue;
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
        // Removed: previewContainer.innerHTML = ''; 

        // Key 0: PTT (Mic)
        const micState = this.state.isPTTActive ? 'active' : 'idle';
        const micIcon = await this.iconGenerator.createIcon('mic', micState);
        await this.deck.fillBuffer(0, micIcon.buffer);
        this.updateButtonVisuals(previewContainer, 0, micIcon.blob, 'Push To Talk');

        // Key 1: Toggle (Bubble)
        const toggleState = this.state.isToggleActive ? 'active' : 'idle';
        const toggleIcon = await this.iconGenerator.createIcon('bubble', toggleState);
        await this.deck.fillBuffer(1, toggleIcon.buffer);
        this.updateButtonVisuals(previewContainer, 1, toggleIcon.blob, 'Toggle Mic');
    }

    updateButtonVisuals(container, keyIndex, blob, label) {
        let wrapper = container.querySelector(`[data-key="${keyIndex}"]`);
        
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.dataset.key = String(keyIndex);
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.alignItems = 'center';
            wrapper.style.cursor = 'pointer'; 
            wrapper.style.userSelect = 'none'; 
            wrapper.style.webkitUserSelect = 'none';
            // Add slight hover effect via style or class? 
            // Inline style is easiest for now
            wrapper.onmouseover = () => wrapper.style.opacity = '0.8';
            wrapper.onmouseout = () => wrapper.style.opacity = '1.0';

            const img = document.createElement('img');
            img.style.width = '72px';
            img.style.height = '72px';
            img.style.border = '1px solid #555';
            img.style.borderRadius = '8px';
            
            const text = document.createElement('span');
            text.style.fontSize = '12px';
            text.style.marginTop = '4px';
            text.style.color = '#ccc';

            wrapper.appendChild(img);
            wrapper.appendChild(text);
            container.appendChild(wrapper);

            this.attachButtonListeners(wrapper, keyIndex);
        }

        const img = wrapper.querySelector('img');
        const text = wrapper.querySelector('span');
        
        img.src = URL.createObjectURL(blob);
        text.textContent = label;
    }

    attachButtonListeners(element, keyIndex) {
        element.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.handleButtonPress(keyIndex, true);
        });
        
        element.addEventListener('pointerup', (e) => {
            e.preventDefault();
            this.handleButtonPress(keyIndex, false);
        });
        
        element.addEventListener('pointerleave', (e) => {
             this.handleButtonPress(keyIndex, false);
        });
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
