export class WaveformVisualizer {
    /**
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.analyser = null;
        this.isRunning = false;
        this.isStreaming = false; // Controls whether we record data
        
        // History for "SoundCloud" style visualization
        // Stores RMS values (0.0 - 1.0)
        this.history = [];
        this.maxHistoryLength = 2000; // Cap to prevent infinite memory growth, though visual will squeeze
        
        // Resize observer to handle responsive canvas
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this.resize();
            }
        });
        this.resizeObserver.observe(canvas);
        
        // Initial setup
        this.resize();
        this.draw = this.draw.bind(this);
    }

    setAnalyser(analyser) {
        this.analyser = analyser;
        if (analyser) {
            this.bufferLength = analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            this.start();
        } else {
            this.stop();
        }
    }

    setStreaming(isStreaming) {
        this.isStreaming = isStreaming;
    }

    /**
     * Manually inject silence into the visualization history.
     * @param {number} durationMs Duration of silence in milliseconds
     */
    pushSilence(durationMs) {
        // Assume 60fps for visualization (approx 16.67ms per frame)
        // This is an estimation, but sufficient for visual feedback
        const frameDuration = 1000 / 60;
        const frames = Math.ceil(durationMs / frameDuration);
        
        for (let i = 0; i < frames; i++) {
            this.pushValue(0);
        }
    }

    pushValue(rms) {
        this.history.push(rms);
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.draw();
        }
    }

    stop() {
        this.isRunning = false;
        this.clear();
    }

    resize() {
        // Match internal resolution to display size for sharpness
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.draw();
    }

    clear() {
        if (!this.ctx) return;
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;
        this.ctx.clearRect(0, 0, width, height);
        
        // Draw baseline
        this.ctx.beginPath();
        this.ctx.moveTo(0, height / 2);
        this.ctx.lineTo(width, height / 2);
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }

    draw() {
        if (!this.isRunning) return;

        requestAnimationFrame(this.draw);

        if (!this.analyser) return;

        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        // 1. Process Data
        if (this.isStreaming) {
            this.analyser.getByteTimeDomainData(this.dataArray);

            // Calculate RMS (Root Mean Square) for volume
            let sum = 0;
            for (let i = 0; i < this.bufferLength; i++) {
                const amplitude = (this.dataArray[i] - 128) / 128; // Normalize -1 to 1
                sum += amplitude * amplitude;
            }
            const rms = Math.sqrt(sum / this.bufferLength);
            
            this.pushValue(rms);
        }

        // 2. Render
        this.ctx.clearRect(0, 0, width, height);
        
        // Background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, width, height);

        if (this.history.length === 0) {
            this.clear(); // Draw baseline
            return;
        }

        const totalBars = this.history.length;
        // Calculate bar width to fit all bars in the canvas width
        const barWidth = width / totalBars;
        
        this.ctx.fillStyle = '#4a90e2'; // Accent Color

        for (let i = 0; i < totalBars; i++) {
            const rms = this.history[i];
            // Scale height. RMS is usually small (0.0-0.5), so we amplify it.
            // Cap at 1.0
            const val = Math.min(1.0, rms * 5); 
            
            const barHeight = val * height;
            const x = i * barWidth;
            const y = (height - barHeight) / 2; // Centered vertically

            this.ctx.fillRect(x, y, barWidth, barHeight);
        }
    }
}
