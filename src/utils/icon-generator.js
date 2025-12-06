export class IconGenerator {
    constructor() {
        this.size = 72;
    }

    async createIcon(type, state) {
        const canvas = new OffscreenCanvas(this.size, this.size);
        const ctx = canvas.getContext('2d');

        // Stream Deck MK.2 often requires 180 degree rotation
        ctx.translate(this.size, this.size);
        ctx.rotate(Math.PI);

        // Background
        ctx.fillStyle = state === 'active' ? (type === 'mic' ? '#ff4444' : '#44ff44') : '#333333';
        ctx.fillRect(0, 0, this.size, this.size);

        // Icon Style
        ctx.fillStyle = '#ffffff';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw Icon (Simple Text for now)
        const iconChar = type === 'mic' ? '🎤' : '💬';
        ctx.fillText(iconChar, this.size / 2, this.size / 2);

        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        const buffer = await blob.arrayBuffer();
        
        // Return both buffer (for device) and blob (for UI)
        return { buffer, blob };
    }
}
