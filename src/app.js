
// @ts-ignore
import { StreamDeckV2 } from './lib/streamdeckv2.js';
import { AudioManager } from './managers/AudioManager.js';
import { GeminiClient } from './network/GeminiClient.js';
import { IconGenerator } from './utils/icon-generator.js';
import { WaveformVisualizer } from './ui/WaveformVisualizer.js';

class StreamDeckGeminiApp {
    constructor() {
        this.deck = new StreamDeckV2();
        this.audioManager = new AudioManager();
        this.geminiClient = new GeminiClient();
        this.iconGenerator = new IconGenerator();
        this.visualizer = null;
        
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
        const connectDeckBtn = document.getElementById('connect-streamdeck');
        const connectGeminiBtn = document.getElementById('connect-gemini');
        const apiKeyInput = /** @type {HTMLInputElement} */ (document.getElementById('api-key'));
        const brightnessSlider = /** @type {HTMLInputElement} */ (document.getElementById('brightness-slider'));
        const voiceSelect = /** @type {HTMLSelectElement} */ (document.getElementById('voice-select'));

        // Load saved Voice
        const savedVoice = localStorage.getItem('gemini_voice');
        if (savedVoice) voiceSelect.value = savedVoice;
        voiceSelect.addEventListener('change', () => localStorage.setItem('gemini_voice', voiceSelect.value));

        // Load saved API Key
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) apiKeyInput.value = savedKey;
        apiKeyInput.addEventListener('change', () => localStorage.setItem('gemini_api_key', apiKeyInput.value));

        // Initialize Visualizer
        const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('audio-waveform'));
        if (canvas) {
            this.visualizer = new WaveformVisualizer(canvas);
        }

        GeminiClient.fetchModels(apiKeyInput.value).then(models => {
            console.log('Models:', models);
        });

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

        connectDeckBtn.addEventListener('click', () => this.toggleStreamDeckConnection());
        connectGeminiBtn.addEventListener('click', () => this.toggleGeminiConnection());

        // Listen for Stream Deck events
        this.deck.addEventListener('keydown', (e) => this.handleButtonPress(/** @type {CustomEvent} */(e).detail.buttonId, true));
        this.deck.addEventListener('keyup', (e) => this.handleButtonPress(/** @type {CustomEvent} */(e).detail.buttonId, false));

        // Listen for Audio Input (Mic -> Gemini)
        this.audioManager.addEventListener('audioinput', (e) => {
            if (this.state.geminiConnected) {
                this.geminiClient.sendAudio(/** @type {CustomEvent} */(e).detail);
            }
        });

        // Listen for Audio Manager Warnings (e.g. Autoplay blocked)
        this.audioManager.addEventListener('warning', (e) => {
            this.log(`System: ${/** @type {CustomEvent} */(e).detail.message}`);
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
            this.state.geminiConnected = false;
            const connectGeminiBtn = document.getElementById('connect-gemini');
            if (connectGeminiBtn) {
                connectGeminiBtn.textContent = 'Connect Gemini';
                connectGeminiBtn.classList.remove('disconnect-active');
            }
        });

        this.geminiClient.addEventListener('transcription', (e) => {
            const { role, text } = /** @type {CustomEvent} */(e).detail;
            this.appendChat(role, text);
        });

        this.geminiClient.addEventListener('usage', (e) => {
            this.updateTokenStats(/** @type {CustomEvent} */(e).detail);
        });

        this.geminiClient.addEventListener('silence', (e) => {
            if (this.visualizer) {
                this.visualizer.pushSilence(/** @type {CustomEvent} */(e).detail.durationMs);
            }
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

    async toggleStreamDeckConnection() {
        const connectBtn = document.getElementById('connect-streamdeck');
        
        if (this.state.connected) {
            // Disconnect
            try {
                await this.deck.disconnect();
                this.state.connected = false;
                connectBtn.textContent = 'Connect Stream Deck';
                connectBtn.classList.remove('disconnect-active');
                this.updateStatus('Disconnected', 'disconnected');
                this.log('Stream Deck Disconnected');
            } catch (error) {
                console.error('Disconnection failed:', error);
                this.log(`Error disconnecting: ${error.message}`);
            }
        } else {
            // Connect
            try {
                const connected = await this.deck.connect(true); // true = show picker
                if (!connected) throw new Error('Device selection cancelled');
                
                this.onStreamDeckConnected();
            } catch (error) {
                console.error('Connection failed:', error);
                this.updateStatus('Connection Failed', 'disconnected');
                this.log(`Error: ${error.message}`);
            }
        }
    }

    async toggleGeminiConnection() {
        const connectBtn = document.getElementById('connect-gemini');
        const apiKeyInput = /** @type {HTMLInputElement} */ (document.getElementById('api-key'));
        const apiKey = apiKeyInput.value.trim();

        if (this.state.geminiConnected) {
            // Disconnect
                            this.geminiClient.disconnect();
                            connectBtn.classList.remove('disconnect-active');
                            // The 'close' event listener will handle state update and UI text
                        } else {
                            // Connect
                            if (!apiKey) {
                                this.log('Please enter a Gemini API Key');
                                return;
                            }

                            // Initialize Audio (ensuring user gesture if clicked)
                            const micSelect = /** @type {HTMLSelectElement} */ (document.getElementById('mic-select'));
                            try {
                                await this.audioManager.initialize(micSelect.value);
                                if (this.visualizer && this.audioManager.analyser) {
                                    this.visualizer.setAnalyser(this.audioManager.analyser);
                                }
                            } catch (err) {
                                this.log(`Audio Init Failed: ${err.message}`);
                                console.error(err);
                                return;
                            }
            
                            const voiceSelect = /** @type {HTMLSelectElement} */ (document.getElementById('voice-select'));
                            const config = {
                                model: this.geminiClient.model,
                                voiceName: voiceSelect.value,
                                systemInstruction: "You are a helpful voice assistant."
                            };
            
                            try {
                                connectBtn.textContent = 'Connecting...';
                                connectBtn.disabled = true;
            
                                await this.geminiClient.connect(apiKey, config);
                                this.state.geminiConnected = true;
                                connectBtn.textContent = 'Disconnect Gemini';
                                connectBtn.classList.add('disconnect-active');
                                connectBtn.disabled = false;
                                this.log('Gemini Connected');
                            } catch (e) {
                                this.log('Gemini Connection Failed');
                                console.error(e);
                                connectBtn.textContent = 'Connect Gemini';
                                connectBtn.classList.remove('disconnect-active');
                                connectBtn.disabled = false;
                            }        }
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
        const connectDeckBtn = document.getElementById('connect-streamdeck');
        connectDeckBtn.textContent = 'Disconnect Stream Deck';
        connectDeckBtn.classList.add('disconnect-active');

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
        
        // see pricing-deets.md 
        // Live API (2.5-flash-native-audio-preview-09-2025)
        const RATES = { 
            PROMPT: { TEXT: 0.50, AUDIO: 3.00 }, 
            RESPONSE: { TEXT: 2.00, AUDIO: 12.00 } 
        };

        // Flash API (2.0-flash-exp)
        // const RATES = { 
        //     PROMPT: { TEXT: 0.35, AUDIO: 2.10 }, 
        //     RESPONSE: { TEXT: 1.50, AUDIO: 8.50 } 
        // };

       // Flatten and calculate costs
        const rows = [
            ...usage.promptTokensDetails.map(d => ({ ...d, label: 'Input', rate: RATES.PROMPT[d.modality] })),
            ...usage.responseTokensDetails.map(d => ({ ...d, label: 'Output', rate: RATES.RESPONSE[d.modality] }))
        ].filter(d => d.tokenCount > 0)
         .map(d => ({ ...d, cost: (d.tokenCount / 1e6) * d.rate }));

        const totalCost = rows.reduce((acc, curr) => acc + curr.cost, 0);
        
        // Formatters
        const num = n => n.toLocaleString('en-US');
        const money = v => totalCost < 1 
            ? `${(v * 100).toFixed(2)}¢` 
            : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 });


          document.getElementById('token-stats').innerHTML = `
            <table>
                <tbody>
                    <tr>
                        <th></th>
                        ${rows.map(r => `
                            <td>
                                <div class="item-cell" style="justify-content: flex-end">
                                    ${r.label} <span class="badge ${r.modality.toLowerCase()}">${r.modality.toLowerCase()}</span>
                                </div>
                            </td>
                        `).join('')}
                        <td style="font-weight: 700">Total</td>
                    </tr>
                    <tr>
                        <th>Tokens</th>
                        ${rows.map(r => `<td>${num(r.tokenCount)}</td>`).join('')}
                        <td style="font-weight: 700">${num(usage.totalTokenCount)}</td>
                    </tr>
                    <tr>
                        <th>Cost</th>
                        ${rows.map(r => `<td>${money(r.cost)}</td>`).join('')}
                        <td style="font-weight: 700; background-color: #f1f5f924;">${money(totalCost)}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    async handleButtonPress(keyIndex, isDown) {
        if (!this.state.connected) return;

        // Key 0: Push-to-Talk
        if (keyIndex === 0) {
            this.state.isPTTActive = isDown;
            if (isDown) {
                if (!this.state.geminiConnected) {
                    this.log('Warning: Gemini not connected. Audio will not be sent.');
                }
                this.geminiClient.cancelSilence();
                this.audioManager.startStreaming();
                if (this.visualizer) this.visualizer.setStreaming(true);
                // this.log('PTT Active (Listening...)');
            } else {
                this.audioManager.stopStreaming();
                if (this.visualizer) this.visualizer.setStreaming(false);
                // this.log('PTT Inactive');
                if (this.state.geminiConnected) {
                    this.geminiClient.sendSilence();
                }
            }
            await this.updateIcons();
        }

        // Key 1: Toggle Mic
        if (keyIndex === 1 && isDown) { // Toggle on press down
            this.state.isToggleActive = !this.state.isToggleActive;
            if (this.state.isToggleActive) {
                if (!this.state.geminiConnected) {
                    this.log('Warning: Gemini not connected. Audio will not be sent.');
                }
                this.geminiClient.cancelSilence();
                this.audioManager.startStreaming();
                if (this.visualizer) this.visualizer.setStreaming(true);
                // this.log('Mic Toggled ON');
            } else {
                this.audioManager.stopStreaming();
                if (this.visualizer) this.visualizer.setStreaming(false);
                // this.log('Mic Toggled OFF');
                if (this.state.geminiConnected) {
                    this.geminiClient.sendSilence();
                }
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
            wrapper.classList.add('key-preview-wrapper');
            wrapper.onmouseover = () => wrapper.classList.add('hover');
            wrapper.onmouseout = () => wrapper.classList.remove('hover');

            const img = document.createElement('img');
            img.classList.add('key-preview-image');
            
            const text = document.createElement('span');
            text.classList.add('key-preview-label');

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
        
    }

    appendChat(role, text) {
        const transcript = document.getElementById('transcript-log');
        const plaintextLog = document.getElementById('plaintext-log');
        
        // --- Visual Transcript ---
        const lastRow = transcript.lastElementChild;
        let bubble;

        // Determine if we can append to the last message
        // We match if the last row exists, has the same role, and for 'model' roles, 
        // we generally group them unless switching between thought and response.
        const canGroup = lastRow && lastRow.dataset.role === role;

        if (canGroup) {
            bubble = lastRow.querySelector('.chat-bubble') || lastRow.querySelector('.message');
            if (role === 'model_thought' && !bubble.innerHTML.includes('brain-icon')) {
                 // Should have icon, but if we are appending, it's already there
            }
            // For text nodes, we just append
            // Use textContent for safety, but for thoughts we might have HTML (icon)
            // So for thoughts, we append a text node
            bubble.appendChild(document.createTextNode(text));
        } else {
            // Create new row
            const row = document.createElement('div');
            row.className = `chat-row ${role === 'model_thought' ? 'model thought' : role}`;
            row.dataset.role = role;

            if (role === 'user' || role === 'model' || role === 'model_thought') {
                bubble = document.createElement('div');
                bubble.className = 'chat-bubble';
                
                if (role === 'model_thought') {
                    const icon = document.createElement('span');
                    icon.className = 'brain-icon';
                    icon.textContent = '🧠'; // Brain icon
                    bubble.appendChild(icon);
                }
                
                bubble.appendChild(document.createTextNode(text));
                row.appendChild(bubble);
            } else {
                // Fallback for unknown roles, treat as system/center
                const msg = document.createElement('div');
                msg.className = 'message';
                msg.textContent = text;
                row.appendChild(msg);
            }
            
            transcript.appendChild(row);
        }
        
        transcript.scrollTop = transcript.scrollHeight;

        // --- Plaintext Transcript ---
        // Only for user/model/model_thought
        if (['user', 'model'].includes(role)) {
            // Check if we should append to the last line of text
            // We can store the last active role in a property or check the text content
            // Easier to check if the text ends with a newline? 
            // Actually, the prompt says "Retain the lastEntry role logic".
            
            // We'll track the last appended role for plaintext separately to ensure sync
            if (this._lastPlaintextRole === role) {
                plaintextLog.appendChild(document.createTextNode(text));
            } else {
                // New block
                if (plaintextLog.textContent.length > 0) {
                    plaintextLog.appendChild(document.createTextNode('\n'));
                }
                const label = role === 'model_thought' ? 'Thought' : (role.charAt(0).toUpperCase() + role.slice(1));
                plaintextLog.appendChild(document.createTextNode(`[${label}]: ${text}`));
                this._lastPlaintextRole = role;
            }
        }
    }

    log(message) {
        const transcript = document.getElementById('transcript-log');
        
        const row = document.createElement('div');
        row.className = 'chat-row system';
        // row.dataset.role = 'system'; // Optional, helps with logic if we wanted to group system messages

        const msg = document.createElement('div');
        msg.className = 'message';
        msg.textContent = message; // System messages usually don't need streaming updates
        
        row.appendChild(msg);
        transcript.appendChild(row);
        transcript.scrollTop = transcript.scrollHeight;
    }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
    // @ts-ignore
    window.app = new StreamDeckGeminiApp();
});
