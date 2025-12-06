/**
 * Manages the connection and interaction with the Elgato Stream Deck via WebHID.
 * Wraps the StreamDeckV2 library.
 */
// @ts-ignore
import {StreamDeckV2} from '../lib/streamdeckv2.js';

export class StreamDeckManager extends EventTarget {
    constructor() {
        super();
        // @ts-ignore
        this.deck = new StreamDeckV2();
        this.debugMode = false;

        // Forward events
        this.deck.addEventListener('keydown', (e) => {
            if (this.debugMode) console.log('Key Down:', e.detail);
            this.dispatchEvent(new CustomEvent('keydown', { detail: { keyIndex: e.detail.buttonId } }));
        });
        this.deck.addEventListener('keyup', (e) => {
            if (this.debugMode) console.log('Key Up:', e.detail);
            this.dispatchEvent(new CustomEvent('keyup', { detail: { keyIndex: e.detail.buttonId } }));
        });
        this.deck.addEventListener('connect', () => {
            if (this.debugMode) console.log('Stream Deck Connected');
            this.dispatchEvent(new Event('connect'));
        });
        this.deck.addEventListener('disconnect', () => {
            if (this.debugMode) console.log('Stream Deck Disconnected');
            this.dispatchEvent(new Event('disconnect'));
        });
    }

    /**
     * Request a connection to a Stream Deck device.
     */
    async connect() {
        try {
            const connected = await this.deck.connect(true); // true = show picker
            if (!connected) {
                throw new Error('Failed to connect to Stream Deck.');
            }
            await this.initializeDevice();
        } catch (error) {
            console.error('Error connecting to Stream Deck:', error);
            throw error;
        }
    }

    async autoConnect() {
        try {
            const connected = await this.deck.connect(false); // false = no picker
            if (connected) {
                await this.initializeDevice();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Auto-connect failed:', error);
            return false;
        }
    }

    async initializeDevice() {
        console.log(`Stream Deck connected: ${this.deck.getDeviceName()}`);
        
        // Reset and Clear
        try {
            await this.deck.reset();
        } catch (e) {
            console.warn('Stream Deck Reset failed (ignoring):', e);
        }

        try {
            await this.deck.clearAllButtons();
        } catch (e) {
            console.warn('Stream Deck Clear Keys failed:', e);
        }
    }

    /**
     * Sets the image for a specific key.
     * @param {number} keyIndex 
     * @param {ArrayBuffer} imageBuffer JPEG image buffer
     */
    async setKeyImage(keyIndex, imageBuffer) {
        if (!this.deck.isConnected) return;
        await this.deck.fillBuffer(keyIndex, imageBuffer);
    }

    async disconnect() {
        await this.deck.disconnect();
    }
}
