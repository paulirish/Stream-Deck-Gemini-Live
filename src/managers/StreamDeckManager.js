/**
 * Manages the connection and interaction with the Elgato Stream Deck via WebHID.
 * Currently supports Stream Deck MK.2 (PID 0x006d) and likely V2.
 */
export class StreamDeckManager extends EventTarget {
    constructor() {
        super();
        this.device = null;
        this.VENDOR_ID = 0x0fd9; // Elgato Systems GmbH
        this.PRODUCT_ID_V2 = 0x006d; // Stream Deck MK.2
        
        // Protocol Constants for V2
        this.OFFSET = 4;
        this.NUM_KEYS = 15;
        this.ICON_SIZE = 72;
        this.PACKET_SIZE = 1024;
        this.PACKET_HEADER_LENGTH = 8;
        this.MAX_PAYLOAD_LENGTH = this.PACKET_SIZE - this.PACKET_HEADER_LENGTH;
        
        this.keyState = new Array(this.NUM_KEYS).fill(false);
    }

    /**
     * Request a connection to a Stream Deck device.
     */
    async connect() {
        try {
            const devices = await navigator.hid.requestDevice({
                filters: [{ vendorId: this.VENDOR_ID }]
            });

            if (devices.length === 0) {
                throw new Error('No device selected.');
            }

            this.device = devices[0];
            await this.device.open();
            
            console.log(`Stream Deck connected: ${this.device.productName} (PID: 0x${this.device.productId.toString(16)})`);
            
            this.device.addEventListener('inputreport', this.handleInputReport.bind(this));
            
            // Reset to clear any old state
            await this.reset();
            await this.clearAllKeys();

        } catch (error) {
            console.error('Error connecting to Stream Deck:', error);
            throw error;
        }
    }

    /**
     * Handle incoming input reports (button presses).
     * @param {HIDInputReportEvent} event 
     */
    handleInputReport(event) {
        const { data } = event;
        
        // V2 Input Report:
        // Header: 4 bytes
        // Data: NUM_KEYS bytes (1 = pressed, 0 = released)
        
        if (data.byteLength < this.OFFSET + this.NUM_KEYS) return;

        for (let i = 0; i < this.NUM_KEYS; i++) {
            const isPressed = data.getUint8(this.OFFSET + i) === 1;
            
            if (isPressed !== this.keyState[i]) {
                this.keyState[i] = isPressed;
                const eventName = isPressed ? 'keydown' : 'keyup';
                this.dispatchEvent(new CustomEvent(eventName, { 
                    detail: { keyIndex: i } 
                }));
            }
        }
    }

    async reset() {
        if (!this.device) return;
        // Feature Report 0x03: Reset
        const data = new Uint8Array([0x02]);
        await this.device.sendFeatureReport(0x03, data);
    }

    async clearAllKeys() {
        // Create a black 72x72 image
        const canvas = new OffscreenCanvas(this.ICON_SIZE, this.ICON_SIZE);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, this.ICON_SIZE, this.ICON_SIZE);
        
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
        const buffer = await blob.arrayBuffer();

        for (let i = 0; i < this.NUM_KEYS; i++) {
            await this.setKeyImage(i, buffer);
        }
    }

    /**
     * Sets the image for a specific key.
     * @param {number} keyIndex 
     * @param {ArrayBuffer} imageBuffer JPEG image buffer
     */
    async setKeyImage(keyIndex, imageBuffer) {
        if (!this.device) return;

        const packets = this.generateImagePackets(keyIndex, imageBuffer);
        
        for (const packet of packets) {
            await this.device.sendReport(0x02, packet);
        }
    }

    generateImagePackets(keyIndex, buffer) {
        const packets = [];
        let page = 0;
        let start = 0;
        let bytesRemaining = buffer.byteLength;

        while (bytesRemaining > 0) {
            const byteCount = Math.min(bytesRemaining, this.MAX_PAYLOAD_LENGTH);
            const isLastPacket = bytesRemaining <= this.MAX_PAYLOAD_LENGTH;
            const header = new ArrayBuffer(this.PACKET_HEADER_LENGTH);
            const dv = new DataView(header);

            dv.setUint8(0, 0x02); // Report ID
            dv.setUint8(1, 0x07); // Command: Set Icon
            dv.setUint8(2, keyIndex);
            dv.setUint8(3, isLastPacket ? 1 : 0);
            dv.setUint16(4, byteCount, true);
            dv.setUint16(6, page++, true);

            const packet = new Uint8Array(this.PACKET_SIZE);
            packet.set(new Uint8Array(header));
            packet.set(new Uint8Array(buffer.slice(start, start + byteCount)), this.PACKET_HEADER_LENGTH);

            packets.push(packet);
            
            start += byteCount;
            bytesRemaining -= byteCount;
        }
        return packets;
    }

    async disconnect() {
        if (this.device) {
            await this.device.close();
            this.device = null;
        }
    }
}
