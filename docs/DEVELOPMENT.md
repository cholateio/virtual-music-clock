# Development notes

Requires Node.js 22.12 or newer.

## Commands

- `npm install`: install dependencies.
- `npm run start:all`: run Next.js dev server and Electron together (Electron waits for port 3000).
- `npm run build`: `next build` (static export to `out/`), then `electron-builder` writes the installer to `release/`.

## Structure

- `electron/main.js`: creates the transparent clock window, a hidden audio-engine window, the tray menu and the WebSocket hub on `127.0.0.1:8080`.
- `electron/security.js`: shared check for which origins count as "the app" (`http://localhost:3000` in dev, `app://-` when packaged). Used by the WebSocket `verifyClient`, the media permission handler and navigation blocking.
- `app/audio-engine/page.jsx`: captures audio with `getUserMedia`, runs an `AnalyserNode` (FFT size 256) and sends `{ bass, frequencies }` to `/engine` about every 16 ms.
- `app/page.js`: the clock window. Connects to the hub as a viewer, draws the clock and spectrum.

## Notes

- Only messages from the `/engine` path are relayed to viewers; messages from other clients are ignored. Payloads over 64 KB are rejected.
- The analyser is routed through a zero-gain node to the destination; without that, the FFT data can come back all zeros.
- The audio loop uses `setTimeout`, not `requestAnimationFrame`, and the engine window sets `backgroundThrottling: false`, because hidden windows are throttled otherwise.
- The autoplay policy switch lets the hidden window start its `AudioContext` without a user click.
- Bass is the average of the first 5 FFT bins and drives the HSL hue.

## Rendering

- The canvas scales to `devicePixelRatio` so lines stay sharp on high-DPI displays.
- Spectrum values are smoothed with a linear interpolation factor of 0.15 per frame.
