export class IconGenerator {
    constructor() {
        this.size = 72;
    }

    createIcon(type, state) {
        const canvas = new OffscreenCanvas(this.size, this.size);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.size, this.size);

        // Icon Style
        let color = '#555555'; // Default Gray
        let iconChar = '?';

        if (type === 'ptt') {
            iconChar = '🎤'; // Mic
            if (state === 'active') {
                color = '#ff0000'; // Red
            }
        } else if (type === 'toggle') {
            iconChar = '💬'; // Bubble
            if (state === 'active') {
                color = '#00ff00'; // Green
            }
        }

        // Draw Icon
        ctx.fillStyle = color;
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(iconChar, this.size / 2, this.size / 2);

        // Add border/indicator for active state
        if (state === 'active') {
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, this.size - 4, this.size - 4);
        }

        return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
            .then(blob => blob.arrayBuffer());
    }
}
