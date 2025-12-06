import {StreamDeckV2} from '../src/lib/streamdeckv2.js';


describe('StreamDeckV2 Library', () => {
  let sd;
  let mockDevice;
  let mockHid;

  // Mocking setup helpers
  function createMockDevice() {
    return {
      productId: 0x006d, // StreamDeckV2.PRODUCT_ID
      vendorId: 0x0fd9,
      opened: false,
      productName: 'Mock Stream Deck V2',
      collections: [],
      open: async function() { this.opened = true; },
      close: async function() { this.opened = false; },
      sendReport: async function(id, data) { return true; },
      sendFeatureReport: async function(id, data) { return true; },
      receiveFeatureReport: async function(id, length) {
        // Return a dummy buffer
        return new DataView(new ArrayBuffer(length));
      },
      addEventListener: function(type, fn) { 
        if (!this.listeners) this.listeners = {};
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
      }
    };
  }

  before(() => {
    // Basic browser capability check
    if (!('hid' in navigator)) {
        console.warn('WebHID not supported in this browser. Some tests may be skipped or fail.');
    }
  });

  beforeEach(() => {
    sd = new StreamDeckV2();
    mockDevice = createMockDevice();
    
    // Stub navigator.hid.requestDevice if we want to test connect flow without user interaction
    // Note: In a real browser, we can't easily overwrite navigator.hid completely if it's read-only, 
    // but we can try to stub the method if configurable.
    try {
        if (navigator.hid) {
            // We can't easily mock the native API in a live browser for the 'connect' test 
            // without a proxy or if the browser allows it. 
            // For the scope of this file, we will focus on unit testing the logic 
            // assuming the device object is obtained, or by manually injecting the mock if possible.
            // Since `sd.#device` is private, we can't inject it directly.
            // We will test the public API surface.
        }
    } catch (e) {
        console.log('Could not mock navigator.hid', e);
    }
  });

  it('should instantiate correctly', () => {
    expect(sd).to.be.an.instanceof(StreamDeckV2);
  });

  it('should have correct constants', () => {
    expect(StreamDeckV2.PRODUCT_ID).to.equal(0x006d);
    expect(StreamDeckV2.VENDOR_ID).to.equal(0x0fd9);
  });

  it('should report support status', () => {
    // This depends on the actual browser running the test
    const expected = 'hid' in navigator;
    expect(sd.isSupported).to.equal(expected);
  });

  it('should report disconnected initially', () => {
    expect(sd.isConnected).to.be.false;
  });

  describe('Packet Generation', () => {
    it('should generate correct packet headers for an image buffer', () => {
        // Create a dummy buffer representing an image
        const bufferSize = 1000;
        const buffer = new ArrayBuffer(bufferSize);
        // Fill with some data
        new Uint8Array(buffer).fill(255);

        const buttonId = 0;
        const packets = sd.getPacketsFromBuffer(buttonId, buffer);

        expect(packets).to.be.an('array');
        expect(packets.length).to.be.greaterThan(0);

        // Check first packet header
        const firstPacket = packets[0];
        // Header length is 8
        // Byte 0: 0x02 (report ID)
        // Byte 1: 0x07 (always 7)
        // Byte 2: buttonId
        // Byte 3: isLastPacket (1 or 0)
        // Byte 4-5: byteCount
        // Byte 6-7: page number

        expect(firstPacket[0]).to.equal(0x02); // Report ID
        expect(firstPacket[1]).to.equal(0x07); // Command
        expect(firstPacket[2]).to.equal(buttonId); // Button ID
        
        // Check page numbering
        packets.forEach((pkt, index) => {
             const view = new DataView(pkt.buffer);
             const page = view.getUint16(6, true);
             expect(page).to.equal(index);
        });
    });
  });

  describe('Canvas/Image Helpers', () => {
      it('should handle OffscreenCanvas if available', async function() {
          if (typeof OffscreenCanvas === 'undefined') {
              this.skip();
          }
          const canvas = new OffscreenCanvas(72, 72);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'red';
          ctx.fillRect(0,0, 72, 72);

          const buffer = await sd.getImageBufferFromCanvas(canvas);
          expect(buffer).to.be.an.instanceof(ArrayBuffer);
          expect(buffer.byteLength).to.be.greaterThan(0);
      });

      it('should handle HTMLCanvasElement', async function() {
        const canvas = document.createElement('canvas');
        canvas.width = 72;
        canvas.height = 72;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'blue';
        ctx.fillRect(0,0, 72, 72);

        const buffer = await sd.getImageBufferFromCanvas(canvas);
        expect(buffer).to.be.an.instanceof(ArrayBuffer);
        expect(buffer.byteLength).to.be.greaterThan(0);
      });
  });

  describe('Event Handling', () => {
      it('should register and unregister event listeners', () => {
          const handler = () => {};
          sd.addEventListener('keydown', handler);
          // We can't inspect private handlers array, but we can check if it doesn't throw
          // and hopefully if we could trigger it.
          
          sd.removeEventListener('keydown', handler);
      });
  });
});
