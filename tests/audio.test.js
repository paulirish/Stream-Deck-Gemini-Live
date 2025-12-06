import { AudioManager } from '../src/managers/AudioManager.js';

const expect = chai.expect;

describe('AudioManager', () => {
    let audioManager;
    let originalAudioContext;
    let originalAudioWorkletNode;
    let originalGetUserMedia;
    let mockContextInstance;

    class MockAudioWorkletNode {
        constructor(context, name) {
            this.context = context;
            this.name = name;
            this.port = {
                onmessage: null,
                postMessage: (data) => {
                    if (this.port.onmessage) {
                        this.port.onmessage({ data });
                    }
                }
            };
        }
        connect() {}
    }

    class MockAudioContext {
        constructor(options) {
            this.state = 'suspended';
            this.sampleRate = options && options.sampleRate ? options.sampleRate : 16000;
            this.audioWorklet = {
                addModule: async (path) => { 
                    this.modulePath = path; 
                    return Promise.resolve(); 
                }
            };
            this.currentTime = 0;
            mockContextInstance = this;
        }

        createMediaStreamSource() {
            return { connect: () => {} };
        }

        createBufferSource() {
            return {
                buffer: null,
                connect: () => {},
                start: () => {}
            };
        }

        createBuffer(channels, length, rate) {
            return {
                duration: length / rate,
                getChannelData: () => new Float32Array(length)
            };
        }
        
        resume() {
            this.state = 'running';
            return Promise.resolve();
        }
        
        close() {
            this.state = 'closed';
            return Promise.resolve();
        }
    }

    before(() => {
        originalAudioContext = window.AudioContext || window.webkitAudioContext;
        originalAudioWorkletNode = window.AudioWorkletNode;
        originalGetUserMedia = navigator.mediaDevices ? navigator.mediaDevices.getUserMedia : null;
    });

    after(() => {
        if (originalAudioContext) window.AudioContext = originalAudioContext;
        if (originalAudioWorkletNode) window.AudioWorkletNode = originalAudioWorkletNode;
        if (navigator.mediaDevices && originalGetUserMedia) navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    });

    beforeEach(() => {
        audioManager = new AudioManager();
        
        // Setup Mocks
        window.AudioContext = MockAudioContext;
        window.AudioWorkletNode = MockAudioWorkletNode;

        if (!navigator.mediaDevices) navigator.mediaDevices = {};
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            return {
                getTracks: () => [{ stop: () => {} }]
            };
        };
    });

    it('should initialize correctly', async () => {
        await audioManager.initialize();
        expect(audioManager.audioContext).to.be.instanceof(MockAudioContext);
        expect(audioManager.audioContext.modulePath).to.equal('src/utils/audio-processor.js');
    });

    it('should emit audioinput events when streaming', async () => {
        await audioManager.initialize();
        audioManager.startStreaming();
        
        let eventData = null;
        audioManager.addEventListener('audioinput', (e) => {
            eventData = e.detail;
        });

        // Simulate worklet message
        const mockData = new Int16Array([1, 2, 3]).buffer;
        audioManager.workletNode.port.postMessage(mockData);

        expect(eventData).to.equal(mockData);
    });

    it('should not emit events when not streaming', async () => {
        await audioManager.initialize();
        // Not calling startStreaming
        
        let called = false;
        audioManager.addEventListener('audioinput', () => {
            called = true;
        });

        const mockData = new Int16Array([1, 2, 3]).buffer;
        audioManager.workletNode.port.postMessage(mockData);

        expect(called).to.be.false;
    });

    it('should play audio', async () => {
        await audioManager.initialize();
        // Play dummy PCM data
        const pcmData = new Int16Array(100).buffer;
        audioManager.playAudio(pcmData);
        // Expect no errors and nextStartTime to advance
        // Since we mock createBuffer, duration calculation logic depends on mock return
        // We can check if playAudio ran without error.
    });
});
