# Session recording (`js/record_session/`)

`recordingTimestamps.js`, `recordingCapture.js`, and `recordingEncode.js` implement continuous session recording. Root `recording.js` wires them into the global `SessionRecorder` API.

**Load order:** `expressionTiming.js` → these three modules → `recording.js` (see `index.html`).
