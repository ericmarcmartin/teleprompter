# Audio Preview & Download Fix — Plan

## Top-Level Overview

Fix the broken audio download and add an in-browser audio playback preview before exporting, following a pure client-side, in-memory architecture. All audio stays in local browser RAM as a `Blob` / Object URL — no backend, no cloud storage, no IndexedDB required (the blob already survives within a single session via `savedRecordings` state).

Two things are in scope:
1. **Bug fix** — recorded audio does not download.
2. **Feature** — a play/pause preview button appears next to the Record button in the controls row (visible only after a recording is complete and `isRecording` is false), so the user can listen to the raw webm playback before triggering the MP3 export.

**Out of scope (separate task):** adding play buttons to individual saved-recording list rows.

---

## Confirmed Design Decisions

- **Playback location:** play/pause icon button in the controls row, next to Record, visible only when `!isRecording && !countdown && savedRecordings.length > 0`.
- **Playback format:** raw `audio/webm` blob via `URL.createObjectURL` assigned to a hidden `<audio>` element — no FFmpeg, instant playback in Chrome.
- **Export path unchanged:** export still converts to MP3 via FFmpeg as today.
- **Memory cleanup:** Object URLs are revoked on component unmount and when a new recording starts.

---

## Sub-Tasks

---

### Sub-Task 1 — Fix the Audio Download Bug

**Status:** `[x] done`

**Intent**

`downloadBlob` (App.jsx:74-81) calls `URL.revokeObjectURL(url)` immediately after `anchor.click()`. The click is synchronous but the browser initiates the fetch asynchronously, so the URL is revoked before the download begins — causing a silent failure on Chrome. The fix is to defer revocation until after the browser has had time to start the download, and to attach the anchor to the DOM for cross-browser reliability.

**Expected Outcomes**
- Clicking Export triggers an actual file download of the MP3.
- Transcript `.txt` downloads continue to work correctly.
- No memory leaks: the Object URL is still revoked, deferred by 100ms.

**Todo List**
1. In `downloadBlob` (App.jsx:74), append the anchor to `document.body` before `.click()`, then remove it immediately after.
2. Wrap `URL.revokeObjectURL(url)` in `setTimeout(..., 100)` so the URL outlives the async download initiation.

**Relevant Context**
- [`downloadBlob`](src/App.jsx:74) — the sole download utility; used by both audio and transcript exports.

---

### Sub-Task 2 — Store a Stable Object URL on Each Recording Session

**Status:** `[x] done`

**Intent**

Each `sessionSnapshot` in `savedRecordings` currently holds only a raw `Blob`. To enable instant playback at any point after recording stops, assign a stable `audioUrl` (Object URL) at save time. This avoids re-creating URLs on every render and gives a single place to revoke on cleanup.

**Expected Outcomes**
- Each entry in `savedRecordings` has an `audioUrl: string` field set at creation time (e.g. `blob:http://localhost:5173/...`).
- A `useEffect` cleanup revokes all outstanding Object URLs when the component unmounts.
- When a new recording starts, the previous `audioUrl` is revoked to free RAM.

**Todo List**
1. In `finalizeRecordingExport` (App.jsx:290), call `URL.createObjectURL(audioBlob)` and add the result as `audioUrl` on the `sessionSnapshot` object.
2. Add a `useEffect` with an empty dependency array whose cleanup function iterates `savedRecordingsRef.current` and calls `URL.revokeObjectURL` on each `audioUrl`.
3. Add a `savedRecordingsRef` (mirror of `savedRecordings` state) so the cleanup closure always sees the latest list without needing it in the dependency array.
4. At the start of `startActualRecording`, revoke `savedRecordings[0]?.audioUrl` if it exists (old session being replaced by a new one).

**Relevant Context**
- [`finalizeRecordingExport`](src/App.jsx:254) — where `sessionSnapshot` is assembled.
- [`savedRecordings` state](src/App.jsx:124) — array capped at 10 sessions.

---

### Sub-Task 3 — Add Play/Pause Preview Button in the Controls Row

**Status:** `[x] done`

**Intent**

Once `isRecording` is false and `savedRecordings` has at least one entry, show a circular play/pause icon button inline with the Record button in the controls row. A hidden `<audio>` element (managed via `useRef`) is assigned the latest recording's `audioUrl` and driven by the button.

**Expected Outcomes**
- A ▶ button appears next to "Record" immediately after a recording is saved.
- Clicking ▶ starts playback; icon toggles to ⏸.
- Clicking ⏸ pauses playback; icon toggles back to ▶.
- When playback ends naturally, the icon resets to ▶.
- Starting a new recording resets the preview state (pauses audio, resets icon).
- The `<audio>` element is not visible in the UI.

**Todo List**
1. Add state: `const [isPlayingPreview, setIsPlayingPreview] = useState(false)`.
2. Add ref: `const previewAudioRef = useRef(null)` to hold the hidden `<audio>` DOM node.
3. Add handler `handleTogglePreview()`:
   - Guard: if `!savedRecordings[0]?.audioUrl`, return early.
   - If currently playing: call `previewAudioRef.current.pause()`, set `isPlayingPreview(false)`.
   - If currently paused: call `previewAudioRef.current.play()`, set `isPlayingPreview(true)`.
4. On the `<audio>` element, attach `onEnded={() => setIsPlayingPreview(false)}` so the icon resets when the track finishes.
5. In `startCountdownAndRecording` (or at the top of `startActualRecording`), add: reset `isPlayingPreview` to `false` and call `previewAudioRef.current?.pause()`.
6. In the JSX controls section (App.jsx:810-826):
   - Render a hidden `<audio ref={previewAudioRef} src={savedRecordings[0]?.audioUrl ?? ''} />` element (always in DOM when a recording exists, hidden with `style={{ display: 'none' }}`).
   - After the Record button block, render the play/pause button conditionally: `{!isRecording && !countdown && savedRecordings.length > 0 && ( <button ...> )}`.
   - Button content: `{isPlayingPreview ? '⏸' : '▶'}` with `aria-label={isPlayingPreview ? 'Pause preview' : 'Play preview'}`.

**Relevant Context**
- Controls row JSX: [`App.jsx:810-826`](src/App.jsx:810).
- `startCountdownAndRecording` is called at App.jsx:813 from the Record button's `onClick`.

---

### Sub-Task 4 — Style the Play/Pause Preview Button

**Status:** `[x] done`

**Intent**

The play/pause button must fit naturally into the existing controls row. It is circular (icon-only) and uses the established glass-morphism purple/lavender palette. On mobile it must not stretch full-width like the other buttons.

**Expected Outcomes**
- Button is a 52×52px circle with a purple gradient background, matching the waveform/progress palette.
- Hover lift effect via the existing `button:hover` rule (no extra CSS needed).
- `.playing` variant uses a slightly more saturated purple to signal active playback.
- On mobile (≤700px) the button stays circular (`min-width: auto`) instead of stretching full-width.

**Todo List**
1. Add `.preview-play-btn` to `styles.css`:
   ```
   width: 52px; height: 52px; border-radius: 999px;
   background: linear-gradient(135deg, rgba(196,181,253,0.85), rgba(167,139,250,0.7));
   border: 1px solid rgba(124,58,237,0.35);
   box-shadow: 0 0 0 3px rgba(196,181,253,0.18);
   font-size: 1.2rem;
   display: flex; align-items: center; justify-content: center;
   flex-shrink: 0;
   ```
2. Add `.preview-play-btn.playing` variant:
   ```
   background: linear-gradient(135deg, rgba(167,139,250,0.95), rgba(124,58,237,0.8));
   box-shadow: 0 0 0 3px rgba(167,139,250,0.3);
   ```
3. Inside the `@media (max-width: 700px)` block, add `.preview-play-btn { min-width: auto; }` so it stays circular on small screens.

**Relevant Context**
- Existing button palette and hover: [`styles.css:56-72`](src/styles.css:56).
- Controls layout: [`styles.css:462-470`](src/styles.css:462).
- CSS color tokens: [`styles.css:14-22`](src/styles.css:14).
- Mobile breakpoint: [`styles.css:570-594`](src/styles.css:570).
