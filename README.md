<div align="center">

# OpenCluely

<p align="center">
  <img src="https://img.shields.io/badge/Status-Under%20Active%20Development-FFA500?style=for-the-badge&logo=github&logoColor=white" />
</p>

<p align="center">
  An AI-powered desktop assistant exploring real-time screen analysis, speech input, and overlay-based UI systems using Electron and Gemini.
</p>

<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&size=28&duration=3000&pause=1000&color=2D9CDB&center=true&vCenter=true&width=600&lines=OpenCluely;AI+Desktop+Assistant;Screen+%2B+Voice+%2B+Chat+Integration" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Cross%20Platform-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/AI-Gemini%20Powered-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/Speech-Whisper%20%7C%20Azure-blueviolet?style=flat-square" />
</p>

</div>

---

## 🎬 Demo

This demo showcases the main workflow of the application including overlay interaction, screenshot capture, and AI responses.

https://github.com/user-attachments/assets/896a7140-1e85-405d-bfbe-e05c9f3a816b

---

##  Overview

OpenCluely is a cross-platform desktop application built with Electron that combines:

- Screen capture and image-based AI analysis
- Conversational AI using Gemini
- Optional speech-to-text input
- Floating overlay UI system
- Session-based context memory

The project explores how AI can be integrated into desktop workflows using lightweight overlays and multimodal inputs.

---

##  Features

###  Desktop Interface
- Floating overlay command bar
- Draggable UI windows
- Always-on-top response panels
- Global keyboard shortcuts
- Multi-monitor support

###  AI Capabilities
- Screenshot-based analysis using Gemini
- Context-aware conversation memory
- Markdown + code formatting support
- Language-aware responses (DSA / programming)

###  Speech Input (Optional)
- Azure Speech integration
- Local Whisper support
- Real-time transcription mode
- Auto-enable mic when configured

---

##  Architecture

```text
Input Layer
 ├── Screenshot Capture
 ├── Voice Input
 └── Text Chat

        ↓

AI Processing Layer
 ├── Gemini API (Vision + Text)
 ├── Context Memory
 └── Prompt Handler

        ↓

UI Layer
 ├── Overlay Bar
 ├── Chat Window
 └── Answer Panel
