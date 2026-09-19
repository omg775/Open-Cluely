#!/usr/bin/env bash
set -euo pipefail

DO_BUILD=0
DO_RUN=1
USE_CI=0
INSTALL_SYSTEM_DEPS=0
SETUP_WHISPER=1
WHISPER_MODEL="${WHISPER_MODEL:-base.en}"
WHISPER_LANGUAGE="${WHISPER_LANGUAGE:-en}"
SPEECH_AUDIO_SOURCE="${SPEECH_AUDIO_SOURCE:-both}"
WHISPER_ENGINE="${WHISPER_ENGINE:-cpp}"
WHISPER_CPP_DIR=".whisper-cpp"
WHISPER_VENV_DIR=".venv-whisper"
WHISPER_MODEL_DIR=".whisper-models"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_NAME="unknown"
PLATFORM_BUILD_SCRIPT="build"
PYTHON_BIN="python3"
WHISPER_PIP_PATH=""
WHISPER_COMMAND_PATH=""

print_header() {
  echo "========================================"
  echo " OpenCluely Setup"
  echo "========================================"
}

usage() {
  cat <<EOF
Usage: ./setup.sh [options]

This script will:
1. Create .env from env.example when needed
2. Install Node dependencies
3. Optionally build whisper.cpp in ${WHISPER_CPP_DIR} and fetch a model
4. Optionally install ffmpeg, which the audio capture pipeline requires
5. Optionally build the app
6. Optionally run OpenCluely

Options:
  --build                 Build a distributable for this OS
  --no-run                Do not start the app after setup
  --run                   Start the app after setup (default)
  --ci                    Use 'npm ci' instead of 'npm install'
  --install-system-deps   Attempt to install ffmpeg where possible
  --skip-whisper          Skip local speech-to-text setup
  -h, --help              Show this help

Environment variables:
  ANTHROPIC_API_KEY       If provided, writes into .env
  WHISPER_ENGINE          cpp (default, fast) or python (openai-whisper)
  WHISPER_MODEL           Model to configure: tiny.en is ~1s per utterance,
                          base.en is more accurate and about 2x slower
                          (default: base.en)
  WHISPER_LANGUAGE        Whisper language to configure (default: en)
  SPEECH_AUDIO_SOURCE     both, system or microphone (default: both)

Example:
  ANTHROPIC_API_KEY=sk-ant-... ./setup.sh --install-system-deps
EOF
}

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=1 ;;
    --no-run) DO_RUN=0 ;;
    --run) DO_RUN=1 ;;
    --ci) USE_CI=1 ;;
    --install-system-deps) INSTALL_SYSTEM_DEPS=1 ;;
    --skip-whisper) SETUP_WHISPER=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

print_header
cd "$SCRIPT_DIR"

detect_os() {
  local uname_out
  uname_out=$(uname -s || echo "unknown")
  case "$uname_out" in
    Linux*) OS_NAME="linux" ;;
    Darwin*) OS_NAME="macos" ;;
    CYGWIN*|MINGW*|MSYS*) OS_NAME="windows" ;;
    *) OS_NAME="unknown" ;;
  esac

  case "$OS_NAME" in
    macos) PLATFORM_BUILD_SCRIPT="build:mac" ;;
    windows) PLATFORM_BUILD_SCRIPT="build:win" ;;
    linux) PLATFORM_BUILD_SCRIPT="build:linux" ;;
    *) PLATFORM_BUILD_SCRIPT="build" ;;
  esac

  case "$OS_NAME" in
    windows)
      PYTHON_BIN="python"
      WHISPER_PIP_PATH="${WHISPER_VENV_DIR}/Scripts/pip.exe"
      WHISPER_COMMAND_PATH="${WHISPER_VENV_DIR}/Scripts/whisper.exe"
      ;;
    *)
      PYTHON_BIN="python3"
      WHISPER_PIP_PATH="${WHISPER_VENV_DIR}/bin/pip"
      WHISPER_COMMAND_PATH="${WHISPER_VENV_DIR}/bin/whisper"
      ;;
  esac
}

require_command() {
  local cmd="$1"
  local message="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: ${message}"
    exit 1
  fi
}

ensure_env_file() {
  if [[ ! -f .env ]]; then
    if [[ -f env.example ]]; then
      echo "Creating .env from env.example"
      cp env.example .env
    else
      echo "Error: env.example is missing"
      exit 1
    fi
  fi
}

upsert_env() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env 2>/dev/null; then
    # Key and value are passed through the environment so paths containing
    # slashes or spaces do not break the substitution.
    KEY="$key" VALUE="$value" perl -0pi -e 's{^\Q$ENV{KEY}\E=.*$}{$ENV{KEY}=$ENV{VALUE}}m' .env
  else
    printf "%s=%s\n" "$key" "$value" >> .env
  fi
}

ensure_anthropic_key() {
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    upsert_env "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
  fi

  if ! grep -q '^ANTHROPIC_API_KEY=' .env 2>/dev/null || grep -q 'your-anthropic-api-key-here' .env 2>/dev/null; then
    echo ""
    echo "=========================================="
    echo " ANTHROPIC API KEY REQUIRED"
    echo "=========================================="
    echo ""
    echo "Add your Anthropic API key to .env (ANTHROPIC_API_KEY=sk-ant-...)."
    echo "Create one at: https://console.anthropic.com/settings/keys"
    echo ""
    read -r -p "Press Enter after you've updated .env..."
  fi

  if grep -q 'your-anthropic-api-key-here' .env 2>/dev/null; then
    echo "Error: ANTHROPIC_API_KEY is still not configured in .env"
    exit 1
  fi
}

install_system_deps() {
  if [[ "$INSTALL_SYSTEM_DEPS" -ne 1 ]]; then
    return
  fi

  echo "Attempting to install system audio dependencies"

  if command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg already installed"
    return
  fi

  case "$OS_NAME" in
    macos)
      if command -v brew >/dev/null 2>&1; then
        brew install ffmpeg || echo "Could not install ffmpeg automatically. Install it manually with: brew install ffmpeg"
      else
        echo "Homebrew not found. Install ffmpeg manually."
      fi
      ;;
    linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y ffmpeg || echo "Could not install ffmpeg via apt-get"
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y ffmpeg || echo "Could not install ffmpeg via dnf"
      elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm ffmpeg || echo "Could not install ffmpeg via pacman"
      else
        echo "Unknown package manager. Install ffmpeg manually."
      fi
      ;;
    windows)
      echo "Install ffmpeg manually on Windows, for example via Chocolatey: choco install ffmpeg"
      ;;
    *)
      echo "Unknown OS. Install ffmpeg manually to capture audio."
      ;;
  esac
}

install_node_deps() {
  if [[ -f package-lock.json && "$USE_CI" -eq 1 ]]; then
    echo "Installing Node dependencies with npm ci"
    npm ci
  else
    echo "Installing Node dependencies with npm install"
    npm install
  fi
}

setup_whisper_cpp() {
  if ! command -v git >/dev/null 2>&1 || ! command -v cmake >/dev/null 2>&1; then
    echo "git and cmake are required to build whisper.cpp; falling back to Python Whisper"
    return 1
  fi

  if [[ ! -d "$WHISPER_CPP_DIR" ]]; then
    echo "Cloning whisper.cpp into $WHISPER_CPP_DIR"
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$WHISPER_CPP_DIR" || return 1
  fi

  local binary="${WHISPER_CPP_DIR}/build/bin/whisper-server"
  if [[ ! -x "$binary" ]]; then
    echo "Building whisper.cpp (this takes a few minutes the first time)"
    cmake -B "${WHISPER_CPP_DIR}/build" -S "$WHISPER_CPP_DIR" -DCMAKE_BUILD_TYPE=Release >/dev/null || return 1
    cmake --build "${WHISPER_CPP_DIR}/build" --config Release -j "$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" || return 1
  fi

  mkdir -p "$WHISPER_MODEL_DIR"
  local model_file="${WHISPER_MODEL_DIR}/ggml-${WHISPER_MODEL}.bin"
  if [[ ! -f "$model_file" ]]; then
    echo "Downloading Whisper model ${WHISPER_MODEL}"
    curl -L --fail -o "$model_file" \
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin" || {
        rm -f "$model_file"
        return 1
      }
  fi

  upsert_env "WHISPER_COMMAND" "${SCRIPT_DIR}/${binary}"
  return 0
}

setup_whisper_python() {
  require_command "$PYTHON_BIN" "Python 3 is required for local Whisper setup."

  if [[ ! -d "$WHISPER_VENV_DIR" ]]; then
    echo "Creating Whisper virtual environment at $WHISPER_VENV_DIR"
    "$PYTHON_BIN" -m venv "$WHISPER_VENV_DIR"
  fi

  echo "Installing local Whisper into $WHISPER_VENV_DIR"
  "$WHISPER_PIP_PATH" install --upgrade pip
  "$WHISPER_PIP_PATH" install openai-whisper

  mkdir -p "$WHISPER_MODEL_DIR"
  upsert_env "WHISPER_COMMAND" "${WHISPER_COMMAND_PATH}"
}

setup_whisper_env() {
  if [[ "$SETUP_WHISPER" -ne 1 ]]; then
    echo "Skipping local speech-to-text setup"
    return
  fi

  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "Warning: ffmpeg not found. Audio capture will not work until it is installed"
    echo "         (re-run with --install-system-deps, or set FFMPEG_PATH in .env)."
  fi

  if [[ "$WHISPER_ENGINE" == "cpp" ]] && setup_whisper_cpp; then
    echo "whisper.cpp ready"
  else
    setup_whisper_python
  fi

  upsert_env "SPEECH_PROVIDER" "whisper"
  upsert_env "WHISPER_MODEL_DIR" "${WHISPER_MODEL_DIR}"
  upsert_env "WHISPER_MODEL" "${WHISPER_MODEL}"
  upsert_env "WHISPER_LANGUAGE" "${WHISPER_LANGUAGE}"
  upsert_env "SPEECH_AUDIO_SOURCE" "${SPEECH_AUDIO_SOURCE}"

  echo "Running speech smoke test"
  npm run test-speech
}

build_app() {
  if [[ "$DO_BUILD" -eq 1 ]]; then
    echo "Building app for $OS_NAME with npm run $PLATFORM_BUILD_SCRIPT"
    npm run "$PLATFORM_BUILD_SCRIPT"
  fi
}

run_app() {
  if [[ "$DO_RUN" -eq 1 ]]; then
    echo "Starting app"
    npm start
  else
    echo "Setup complete. Skipping run."
  fi
}

detect_os
echo "Detected OS: $OS_NAME"
require_command node "Node.js 18+ is required."
require_command npm "npm is required."
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

ensure_env_file
ensure_anthropic_key
install_system_deps
install_node_deps
setup_whisper_env
build_app
run_app
