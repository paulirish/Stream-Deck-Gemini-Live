# Stream Deck + Gemini Live 🎙️✨

The **Stream Deck Gemini Live WebApp** lets you talk to Google's Gemini (the Multimodal Live API version) directly from your Elgato Stream Deck.

No complex servers, no Node.js backend required. Just you, your browser, your Stream Deck, and Gemini.

## What does it do?

It turns your Stream Deck into a physical interface for Gemini. You get two modes:

*   **Push-to-Talk (PTT):** Hold the button to talk, release to send. Like a walkie-talkie for AI.
*   **Open Mic Toggle:** Tap to start a convo, tap again to stop.

Plus, the icons on your Stream Deck update in real-time to show you what's happening (listening, processing, error, etc.).

## How to Use

0. Open the github io link: https://paulirish.github.io/Stream-Deck-Gemini-Live/
1.  **Get an API Key:** You'll need a Google Gemini API key. Grab one from [Google AI Studio](https://aistudio.google.com/).
2.  **Enter Key:** Paste your API key into the settings panel on the web page.
3.  **Connect Stream Deck:** Click the "Connect Stream Deck" button. Your browser will ask for permission to access the device. Pick your Stream Deck from the list.
4.  **Chat!**
    *   **Button 1 (Top Left usually):** Push-to-Talk.
    *   **Button 2:** Toggle Conversation.

## Tech Stack

Vanilla JS, WebHID, WebSockets, Web Audio API. 

## Troubleshooting

*   **"No device found":** Make sure your Stream Deck isn't being hogged by the official Elgato software. You might need to quit the Stream Deck app completely.
*   **Audio issues:** Check the "Device Selector" in the UI to make sure the right mic and speakers are selected.
*   You have some other streamdeck that's not the v2 (like xl, mini, etc). You can PR to adapt, probably using streamdeck-meet for heavy inspiration, but... yeah. All you :)


----------


(Yeah of course this is almost all vibecoded.  Gem 3 for initial product spec prompt, Antigravity, Gemini CLI. Etc)

Thanks to Pete Lepage for the awesome https://github.com/petele/StreamDeck-Meet which worked when the model output didn't.

