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
- Optional speech-to-text (Azure Speech or local Whisper)
- A floating, always-on-top overlay UI
- Session-based context memory

Use it for meeting notes and follow-ups, live summarisation of a discussion, research and reading, or explaining something on screen. It is a personal assistance tool — you are responsible for using it in line with the rules and consent expectations of whatever you are participating in, including any recording or note-taking policies.

---

## Requirements

- Node.js 18+ (20+ recommended) and npm
- An Anthropic API key
- Optional, for speech input: an Azure Speech key, or a local Whisper install plus `sox`

---

## Quick start

```bash
git clone https://github.com/omg775/Open-Cluely.git
cd Open-Cluely
npm install

cp env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

npm start
```

`./setup.sh` does the same thing interactively and can additionally install audio dependencies and set up a local Whisper environment (`./setup.sh --help` for options).

Nothing but `ANTHROPIC_API_KEY` is required to get the screenshot and chat flows working. Speech input stays off until you configure a provider.

You can also paste the key into Settings (`Cmd/Ctrl+,`) at runtime; the `.env` value always wins on startup.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Required. Used for all reasoning. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Set to `claude-opus-4-5` for deeper answers at higher latency. |
| `ANTHROPIC_STREAMING` | `true` | Stream tokens into the overlay as they arrive. |
| `ANTHROPIC_MAX_TOKENS` | `4096` | Response cap. |
| `ANTHROPIC_TIMEOUT` | `60000` | Per-request timeout in ms. |
| `LLM_MIN_REQUEST_INTERVAL_MS` | `1200` | Floor between outgoing requests. |
| `LLM_TRANSCRIPT_DEBOUNCE_MS` | `900` | Pause before a transcript burst is sent as one request. |
| `SPEECH_PROVIDER` | `azure` | `azure` or `whisper`; speech input is optional. |

The default is Sonnet 4.5 because overlay responsiveness matters more than peak reasoning here; Opus is a one-line change in `.env`.

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
 ├── Voice Input (Azure / Whisper)
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

Transcription is a separate step and does not go through Claude: audio is transcribed by Azure or Whisper, and only the resulting text is reasoned over.

---

## Troubleshooting

- **"Claude is not configured"** — `ANTHROPIC_API_KEY` is missing from `.env` and no key was set in Settings.
- **Overlay shows an error line** — the message is the API failure reason (auth, rate limit, timeout, network). Settings → Test Connection isolates credential problems.
- **No transcription** — speech input needs either `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`, or a working `whisper` command and `sox`.
- **Screen capture is empty on macOS** — grant Screen Recording permission to the app and restart it.
