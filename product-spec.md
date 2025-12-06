# Product Specification: Stream Deck Gemini Live WebApp

## 1\. Executive Summary

A browser-based single-page application (SPA) that interfaces directly with an Elgato Stream Deck via WebHID. It enables real-time voice interaction with the Google Gemini Multimodal Live API. The user can communicate via two distinct hardware interaction modes: **Push-to-Talk (PTT)** and **Open Mic Toggle**.

## 2\. Technical Architecture

  * **Platform:** Web Application (Chrome/Edge/Opera only due to WebHID support).
  * **Framework:** Vanilla JS.
  * **Core APIs:**
      * **WebHID API:** For direct communication with the Stream Deck hardware (no local server/Node.js required).
      * **WebSockets:** For bidirectional streaming audio/JSON to Gemini Live API.
      * **Web Audio API:** For capturing microphone input, resampling, and playing back raw PCM audio response.

## 3\. Hardware Interface (Stream Deck)

WebHID browser API.

see these:

https://raw.githubusercontent.com/petele/StreamDeck-Meet/refs/heads/main/src/StreamDeck.js
https://raw.githubusercontent.com/petele/StreamDeck-Meet/refs/heads/main/src/StreamDeckV2.js


### Button Mapping

The application will map two specific keys on the Stream Deck (configurable index, defaulting to Key 0 and Key 1).

| Function | Interaction Type | Behavior | Visual State (Icon) |
| :--- | :--- | :--- | :--- |
| **Push-to-Talk** | **Momentary** | • **Key Down:** Open mic, stream audio to Gemini.<br>• **Key Up:** Mute mic, commit stream (end of turn). | **Idle:** Gray Mic Icon<br>**Pressed:** Red "Recording" Icon |
| **Conversation** | **Toggle** | • **Press 1:** Open mic, start continuous session.<br>• **Press 2:** Mute mic, end session. | **Idle:** Gray Bubble Icon<br>**Active:** Green "Listening" Icon |

### Visual Feedback System

  * **Canvas Rendering:** Icons must be generated dynamically using an HTML Canvas (offscreen), then converted to the byte buffer format required by the Stream Deck.  see https://raw.githubusercontent.com/petele/StreamDeck-Meet/refs/heads/main/src/CanvasToBMP.js but also consider using OffscreenCanvas.
  * **State Management:** The buttons must strictly reflect the *application state*, not just the physical press.
      * *Example:* If the WebSocket disconnects, the buttons should turn "Yellow/Error" or flash.

## 4\. Audio Pipeline

**Constraint:** User is utilizing **Open Speakers** (No Headphones).
**Solution:** Native Browser Echo Cancellation (AEC).

### Input (Microphone)

1.  **Capture:** `navigator.mediaDevices.getUserMedia()`
2.  **Constraints:**
    ```javascript
    {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000, // Ideal for Gemini, but browser may force hardware native rate
        channelCount: 1
      }
    }
    ```
3.  **Processing:**
      * Browser audio is typically Float32 at 44.1/48kHz.
      * **Must convert to:** 16-bit PCM, 16kHz, Mono (Little Endian) before sending to WebSocket.
      * Use an `AudioWorklet` or `ScriptProcessorNode` to handle downsampling and PCM conversion efficiently.

### Output (Speaker)

  * **Format:** The Gemini API returns raw 24kHz PCM audio chunks (in `serverContent` messages).
  * **Playback:**
      * Buffer incoming chunks.
      * Convert PCM data back to Float32.
      * Schedule playback on the `AudioContext.destination` queue to ensure smooth, gapless audio.

## 5\. Gemini API Integration

  * **Protocol:** WebSocket Secure (`wss://`)
  * **Endpoint:** `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=YOUR_API_KEY`
  * **Message Flow:**
    1.  **Setup:** Send `setup` JSON payload with:
          * `model`: `models/gemini-2.0-flash-exp` (or current Live-supported model).
          * `systemInstruction`: "You are a helpful, concise voice assistant."
          * `generationConfig`: Define voice tone (e.g., `Puck`, `Charon`).
    2.  **Streaming:**
          * Send `realtimeInput` (Blob of PCM audio) while user is speaking.
          * Listen for `serverContent` (Audio bytes) and `turnComplete`.
    3.  **VAD (Voice Activity Detection):**
          * For the **Toggle** button mode, rely on Gemini's server-side VAD to determine when the user has finished a sentence.

## 6\. User Interface (Browser Window)

Since the primary controller is the hardware, the screen UI is for configuration only.

  * **Header:** Status Indicator (Disconnected / Connected / Live).
  * **Settings Panel:**
      * **API Key Input:** (Masked, save to `localStorage`).
      * **Device Selector:** Dropdown for Microphone and Speaker (uses `enumerateDevices`).
      * **Stream Deck Status:** "Device Connected" (Green/Red).
  * **Logs/Transcript:** A scrolling text div showing the conversation transcript (User text vs Model text) and communication metadata (for debugging and history.

## 7\. Implementation Roadmap for Coding Agent

2.  **Hardware Connection:** Implement the "Connect Device" button and basic "Fill Key Red/Green" test.
3.  **Audio Engine:** Implement `AudioContext` setup with `echoCancellation` and the PCM conversion utils (Float32 \<-\> Int16).
4.  **Network Layer:** Build the `GeminiClient` class handling WebSocket handshake and message parsing. 
5.  **Integration:** Wire the Stream Deck `keydown` events to trigger the `GeminiClient` streaming methods.

As this is a complicated setup and pipeline.. the architecture be modular enough to support unit tests of the various components.  We'll need unit tests written for them as well.  Let's use mocha in the browser to do tests. Chai for assertions works.

Use JavaScript with jsdoc types. We'll use typescript to with checkJs to catch errors.


## 8\. Reference Material

  * **Stream Deck WebHID Demo:** `https://julusian.github.io/node-elgato-stream-deck/` (View Source for connection logic).
  * **Gemini Live API Docs:** Reference the `BidiGenerateContent` WebSocket protocols.
  * **Inspiration:** `https://github.com/petele/StreamDeck-Meet` (Specifically look at how they manage connection resilience).

