<div align="center">

# OpenCluely

<p align="center">
  <img src="https://img.shields.io/badge/Status-Under%20Active%20Development-FFA500?style=for-the-badge&logo=github&logoColor=white" />
</p>

<p align="center">
  A live-context desktop assistant: it reads what is on your screen or what is being said, and answers in a small overlay — built with Electron and Claude.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Cross%20Platform-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/AI-Claude%20Powered-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/Speech-Whisper%20%7C%20Azure-blueviolet?style=flat-square" />
</p>

</div>

---

## Demo

Overlay interaction, screenshot capture, and AI responses:

https://github.com/user-attachments/assets/896a7140-1e85-405d-bfbe-e05c9f3a816b

---

## Overview

OpenCluely is a cross-platform Electron app for keeping an AI assistant one keystroke away while you are doing something else — a call, a meeting, reading docs, or working through a problem. It combines:

- Screen capture with image-based analysis
- Conversation with Claude, streamed into the overlay as it is generated
- Live speech-to-text of your mic and the other side of a call, free and on-device via whisper.cpp (Azure Speech optional)
- A floating, always-on-top overlay UI
- Session-based context memory

Use it for meeting notes and follow-ups, live summarisation of a discussion, research and reading, or explaining something on screen. It is a personal assistance tool — you are responsible for using it in line with the rules and consent expectations of whatever you are participating in, including any recording or note-taking policies.

---

## Requirements

- Node.js 18+ (20+ recommended) and npm
- An account on the dashboard to link the app to (or an Anthropic API key, to run it standalone)
- For speech input: `ffmpeg`, plus either whisper.cpp (free, offline — `./setup.sh` builds it) or an Azure Speech key

---

## Quick start

```bash
git clone https://github.com/omg775/Open-Cluely.git
cd Open-Cluely
npm install

cp env.example .env

npm start
```

`./setup.sh --install-system-deps` does the same thing interactively and additionally installs `ffmpeg`, builds whisper.cpp, downloads a model and points `.env` at them (`./setup.sh --help` for options).

No API key is needed locally: open the dashboard, click **Launch assistant**, and the app is linked through `opencluely://` — the server holds the key. Setting `ANTHROPIC_API_KEY` in `.env` runs the app standalone instead, and takes precedence over a linked account. Speech input stays off until you configure a provider.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Optional. Runs the app standalone instead of through a linked account. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Set to `claude-opus-4-5` for deeper answers at higher latency. |
| `ANTHROPIC_STREAMING` | `true` | Stream tokens into the overlay as they arrive. |
| `ANTHROPIC_MAX_TOKENS` | `4096` | Response cap. |
| `ANTHROPIC_TIMEOUT` | `60000` | Per-request timeout in ms. |
| `LLM_MIN_REQUEST_INTERVAL_MS` | `1200` | Floor between outgoing requests. |
| `LLM_TRANSCRIPT_DEBOUNCE_MS` | `900` | Pause before a transcript burst is sent as one request. |
| `SPEECH_PROVIDER` | `whisper` | `whisper` (free, local) or `azure`. |
| `SPEECH_AUDIO_SOURCE` | `both` | `both`, `system` (far end of the call only) or `microphone`. |
| `SPEECH_AUDIO_DEVICE` | — | Explicit ffmpeg input, e.g. `pulse:…monitor`, `dshow:audio=CABLE Output`, `avfoundation::2`. |
| `WHISPER_MODEL` | `base.en` | `tiny.en` transcribes in about a second; `base.en` is more accurate and roughly twice as slow. |
| `SPEECH_ENDPOINT_SILENCE_MS` | `600` | Silence that ends an utterance and triggers a response. |

The default is Sonnet 4.5 because overlay responsiveness matters more than peak reasoning here; Opus is a one-line change in `.env`.

### Hearing the other side of a call

Microphone capture works out of the box. Capturing what you *hear* needs an OS-level loopback source, which the app auto-detects:

- **Linux** — any PulseAudio/PipeWire `.monitor` source (`pactl list short sources`).
- **macOS** — a virtual output device such as [BlackHole](https://github.com/ExistentialAudio/BlackHole) (free); route the call app's output to it.
- **Windows** — enable *Stereo Mix* in Sound settings, or install VB-Cable / VoiceMeeter.

With no loopback device, `SPEECH_AUDIO_SOURCE=both` falls back to microphone-only and says so in the overlay status; `system` reports what to install. Settings → Test Connection prints which source was detected.

Audio never leaves the machine when using local Whisper: ffmpeg captures 16 kHz mono PCM, an energy-based voice-activity detector cuts it at each pause, whisper.cpp transcribes the utterance locally, and only the resulting text is sent to Claude. On this machine `tiny.en` returned each utterance about 0.8–1.2 s after the speaker stopped.

---

## Hosted web app

`web/` is a Next.js app that contains the landing page, the account dashboard **and** the assistant itself, deployable as a single Vercel project with any Postgres database, including Neon. Visitors sign up and use it in the browser — no clone, no install, no API key.

```bash
cd web
cp .env.example .env.local   # DATABASE_URL, SESSION_SECRET, ANTHROPIC_API_KEY, NEXT_PUBLIC_APP_URL
npm install
npm run dev
```

**Where the Anthropic key lives.** Only `web/src/lib/anthropic.ts` reads `process.env.ANTHROPIC_API_KEY`, and that module is `server-only`. The browser posts to `/api/assistant`, which authenticates the session cookie, calls Claude server-side and streams text back. No key is stored per user, returned by any response, or included in a deep link. Because one key serves everyone, `ASSISTANT_DAILY_REQUEST_LIMIT` caps answers per account per rolling 24 hours.

**In the browser.** `getDisplayMedia()` captures the window or tab you choose and frames are sent as JPEG image blocks; `getUserMedia()` plus the Web Speech API (Chrome and Edge) produce the transcript. A browser tab cannot hide itself from a screen share and cannot capture the far end's audio unless that audio plays in a shared tab — the desktop app below is still the way to get the invisible overlay and system-loopback capture.

The dashboard keeps a model preference, grounding documents, and session metadata only — start time, duration, utterance and answer counts. No transcript, screenshot or answer content is stored.

**Linking the desktop app.** Dashboard → Desktop app mints a single-use token valid for two minutes and opens `opencluely://auth?token=…&api=…`. The desktop app registers that protocol, exchanges the token for a long-lived device token at `POST /api/device/exchange`, stores it in the Electron user-data directory with `0600` permissions, and then applies the account's model and documents — never a key; the desktop build uses its own `ANTHROPIC_API_KEY` from `.env`. `GET /api/device/config` refreshes them on later launches; revoking the device in the dashboard makes the next refresh fail and unlinks the desktop app.

If the OS routes `opencluely://` somewhere else (running from source, the handler can land on a bare Electron binary), copy the link from the launch page and start the app with it directly: `npm start -- "opencluely://auth?token=…&api=…"`.

Launch links are attacker-reachable, so the desktop app only accepts an `api=` origin that is `https` (or loopback for local development). Set `OPENCLUELY_API_URL` in the desktop app's `.env` to pin it to a single dashboard origin.

---

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+Shift+S` | Capture the screen and ask Claude about it |
| `Cmd/Ctrl+Shift+C` | Open the chat window |
| `Cmd/Ctrl+Shift+V` | Show/hide all windows |
| `Cmd/Ctrl+Shift+I` / `Alt+A` | Toggle click-through vs. interactive |
| `Alt+R` | Start/stop speech recognition |
| `Cmd/Ctrl+Shift+\` | Clear session memory |
| `Cmd/Ctrl+,` | Settings |

---

## Architecture

```text
Input Layer
 ├── Screenshot Capture
 ├── Voice Input (ffmpeg capture → VAD → whisper.cpp / Azure)
 └── Text Chat

        ↓

Reasoning Layer
 ├── Anthropic Messages API (vision + text, streaming)
 ├── Context Memory
 └── Prompt Handler

        ↓

UI Layer
 ├── Overlay Bar
 ├── Chat Window
 └── Response Panel (loading → streaming → final / error)
```

Transcription is a separate step and does not go through Claude: audio is transcribed locally by whisper.cpp (or by Azure), and only the resulting text is reasoned over.

---

## Troubleshooting

- **"Claude is not configured"** — `ANTHROPIC_API_KEY` is missing from `.env`.
- **Overlay shows an error line** — the message is the API failure reason (auth, rate limit, timeout, network). Settings → Test Connection isolates credential problems.
- **No transcription** — run `npm run test-speech`. Local Whisper needs `ffmpeg` on `PATH` (or `FFMPEG_PATH`) and a whisper.cpp binary plus a model in `WHISPER_MODEL_DIR`; Azure needs `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`.
- **Only your own voice is transcribed** — no loopback device was found; see "Hearing the other side of a call".
- **Sentences are cut into fragments** — raise `SPEECH_ENDPOINT_SILENCE_MS`; lower it to get answers sooner.
- **Screen capture is empty on macOS** — grant Screen Recording permission to the app and restart it.
