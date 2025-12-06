# Stream Deck + Gemini Live 🎙️✨

Te **Stream Deck Gemini Live WebApp** lets you talk to Google's Gemini (the Multimodal Live API version) directly from your Elgato Stream Deck.

No complex servers, no Node.js backend required. Just you, your browser, your Stream Deck, and Gemini.

## What does it do?

It turns your Stream Deck into a physical interface for Gemini. You get two modes:

*   **Push-to-Talk (PTT):** Hold the button to talk, release to send. Like a walkie-talkie for AI.
*   **Open Mic Toggle:** Tap to start a convo, tap again to stop.

Plus, the icons on your Stream Deck update in real-time to show you what's happening (listening, processing, error, etc.).

## How to Run It

Since this uses modern browser APIs like WebHID and AudioWorklets, you can't just open the `index.html` file directly. You need a local web server.

1.  **Clone this repo.**
2.  **Fire up a local server.**
    If you have Python installed (you probably do):
    ```bash
    python3 -m http.server 8000
    ```
    Or if you prefer Node:
    ```bash
    npx http-server .
    ```
3.  **Open your browser.**
    Go to `http://localhost:8000` (or whatever port your server picked).
    *Note: You need a browser that supports WebHID, like Chrome, Edge, or Opera.*

## How to Use

1.  **Get an API Key:** You'll need a Google Gemini API key. Grab one from [Google AI Studio](https://aistudio.google.com/).
2.  **Enter Key:** Paste your API key into the settings panel on the web page.
3.  **Connect Stream Deck:** Click the "Connect Stream Deck" button. Your browser will ask for permission to access the device. Pick your Stream Deck from the list.
4.  **Chat!**
    *   **Button 1 (Top Left usually):** Push-to-Talk.
    *   **Button 2:** Toggle Conversation.

## Tech Stack

*   **Vanilla JS:** No frameworks, just raw power.
*   **WebHID:** For talking to the Stream Deck hardware.
*   **WebSockets:** For streaming audio to/from Gemini.
*   **Web Audio API:** For capturing your beautiful voice and playing back Gemini's response.

## Troubleshooting

*   **"No device found":** Make sure your Stream Deck isn't being hogged by the official Elgato software. You might need to quit the Stream Deck app completely.
*   **Audio issues:** Check the "Device Selector" in the UI to make sure the right mic and speakers are selected.

Enjoy talking to the machine! 🤖
