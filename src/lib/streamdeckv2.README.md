# StreamDeckV2 Library

A generalized, dependency-free JavaScript library for interacting with the Elgato Stream Deck V2 directly in the browser using the [WebHID API](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API).

## Features

*   **Zero Dependencies:** specialized for the Stream Deck V2.
*   **Connection Management:** Handles connecting, disconnecting, and auto-reconnecting.
*   **Input Handling:** Dispatches standard `keydown` and `keyup` CustomEvents.
*   **Graphics:** Built-in helpers to fill buttons with colors, images (URL), or Canvas elements. Automatically handles the V2's JPEG format and packet fragmentation.
*   **Device Control:** Set brightness, reset device, get serial number/firmware version.

## Usage

1.  Include the library in your project.

```html
<script src="streamdeckv2.js"></script>
```

2.  Instantiate and connect.

```javascript
const sd = new StreamDeckV2();

// Check if WebHID is supported
if (sd.isSupported) {
  // Connect (must be triggered by a user gesture like a button click)
  document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
      const connected = await sd.connect(true); // true to show device picker
      if (connected) {
        console.log('Connected to Stream Deck V2');
      }
    } catch (e) {
      console.error(e);
    }
  });
}
```

3.  Listen for events.

```javascript
sd.addEventListener('keydown', (e) => {
  console.log('Button pressed:', e.detail.buttonId);
});

sd.addEventListener('keyup', (e) => {
  console.log('Button released:', e.detail.buttonId);
});
```

4.  Update keys.

```javascript
// Set a key to a solid color
await sd.fillColor(0, '#FF0000');

// Set a key to an image URL
await sd.fillURL(1, 'https://example.com/icon.png');

// Set a key from a canvas
await sd.fillCanvas(2, myCanvasElement);

// Clear a key
await sd.clearButton(0);
```

## API

### Properties

*   `isSupported` (boolean): Returns true if the browser supports WebHID.
*   `isConnected` (boolean): Returns true if a device is currently connected.

### Methods

*   `connect(showPicker)`: Request a device connection.
*   `disconnect()`: Close the connection.
*   `setBrightness(percentage)`: Set brightness (0-100).
*   `reset()`: Reset the device to the default logo.
*   `fillColor(buttonId, colorString, cache)`: Fill a button with a CSS color string.
*   `fillURL(buttonId, url, cache)`: Fill a button with an image from a URL.
*   `fillCanvas(buttonId, canvas)`: Fill a button from a generic Canvas element.
*   `clearButton(buttonId)`: Clear a specific button (black).
*   `clearAllButtons()`: Clear all buttons.
