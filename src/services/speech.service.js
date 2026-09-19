// Enhanced polyfills for Azure Speech SDK in Node.js environment
if (typeof window === 'undefined') {
  global.window = {
    navigator: {
      userAgent: 'Node.js',
      platform: 'node',
      mediaDevices: {
        getUserMedia: () => Promise.resolve({
          getAudioTracks: () => [],
          getTracks: () => [],
          stop: () => { }
        }),
        getSupportedConstraints: () => ({
          audio: true,
          video: false,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: true,
          sampleSize: true,
          channelCount: true
        }),
        enumerateDevices: () => Promise.resolve([
          {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default - Microphone',
            groupId: 'default'
          }
        ])
      }
    },
    document: {
      createElement: (tagName) => {
        const element = {
          addEventListener: () => { },
          removeEventListener: () => { },
          setAttribute: () => { },
          getAttribute: () => null,
          style: {},
          tagName: tagName.toUpperCase(),
          nodeType: 1,
          nodeName: tagName.toUpperCase(),
          appendChild: () => { },
          removeChild: () => { },
          insertBefore: () => { },
          cloneNode: () => element,
          hasAttribute: () => false,
          removeAttribute: () => { },
          click: () => { },
          focus: () => { },
          blur: () => { }
        };

        if (tagName.toLowerCase() === 'audio') {
          Object.assign(element, {
            play: () => Promise.resolve(),
            pause: () => { },
            load: () => { },
            canPlayType: () => 'probably',
            volume: 1,
            muted: false,
            paused: true,
            ended: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1,
            defaultPlaybackRate: 1,
            readyState: 4,
            networkState: 1,
            autoplay: false,
            loop: false,
            controls: false,
            crossOrigin: null,
            preload: 'metadata',
            src: '',
            currentSrc: ''
          });
        }

        return element;
      },
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => { },
        removeChild: () => { },
        insertBefore: () => { },
        style: {}
      },
      head: {
        appendChild: () => { },
        removeChild: () => { },
        insertBefore: () => { },
        style: {}
      }
    },
    location: {
      href: 'file:///',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'file://'
    },
    addEventListener: () => { },
    removeEventListener: () => { },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: (callback) => global.setTimeout(callback, 16),
    cancelAnimationFrame: global.clearTimeout,
    console: global.console || {
      log: () => { },
      error: () => { },
      warn: () => { },
      info: () => { },
      debug: () => { }
    },
    AudioContext: class AudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => { },
          setOrientation: () => { }
        };
        this.destination = {
          connect: () => { },
          disconnect: () => { },
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => { },
          disconnect: () => { },
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => { },
          disconnect: () => { },
          gain: {
            value: 1,
            setValueAtTime: () => { },
            linearRampToValueAtTime: () => { },
            exponentialRampToValueAtTime: () => { }
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => { },
          disconnect: () => { },
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => { },
          disconnect: () => { },
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => { },
          getByteTimeDomainData: () => { },
          getFloatFrequencyData: () => { },
          getFloatTimeDomainData: () => { }
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    webkitAudioContext: class webkitAudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 16000;
        this.currentTime = 0;
        this.listener = {
          setPosition: () => { },
          setOrientation: () => { }
        };
        this.destination = {
          connect: () => { },
          disconnect: () => { },
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers'
        };
      }
      createMediaStreamSource(stream) {
        return {
          connect: () => { },
          disconnect: () => { },
          mediaStream: stream
        };
      }
      createGain() {
        return {
          connect: () => { },
          disconnect: () => { },
          gain: {
            value: 1,
            setValueAtTime: () => { },
            linearRampToValueAtTime: () => { },
            exponentialRampToValueAtTime: () => { }
          }
        };
      }
      createScriptProcessor(bufferSize = 4096, inputChannels = 1, outputChannels = 1) {
        return {
          connect: () => { },
          disconnect: () => { },
          onaudioprocess: null,
          bufferSize,
          numberOfInputs: inputChannels,
          numberOfOutputs: outputChannels
        };
      }
      createAnalyser() {
        return {
          connect: () => { },
          disconnect: () => { },
          fftSize: 2048,
          frequencyBinCount: 1024,
          minDecibels: -100,
          maxDecibels: -30,
          smoothingTimeConstant: 0.8,
          getByteFrequencyData: () => { },
          getByteTimeDomainData: () => { },
          getFloatFrequencyData: () => { },
          getFloatTimeDomainData: () => { }
        };
      }
      decodeAudioData() {
        return Promise.resolve({
          length: 44100,
          sampleRate: 44100,
          numberOfChannels: 1,
          duration: 1,
          getChannelData: () => new Float32Array(44100)
        });
      }
      suspend() {
        this.state = 'suspended';
        return Promise.resolve();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    },
    URL: class URL {
      constructor(url) {
        this.href = url;
        this.protocol = 'https:';
        this.host = 'localhost';
        this.hostname = 'localhost';
        this.port = '';
        this.pathname = '/';
        this.search = '';
        this.hash = '';
        this.origin = 'https://localhost';
      }
      toString() {
        return this.href;
      }
    },
    Blob: class Blob {
      constructor(parts = [], options = {}) {
        this.size = 0;
        this.type = options.type || '';
        this.parts = parts;
      }
      slice() {
        return new Blob();
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    },
    File: class File {
      constructor(parts, name, options = {}) {
        this.name = name;
        this.size = 0;
        this.type = options.type || '';
        this.lastModified = Date.now();
        this.parts = parts;
      }
      slice() {
        return new File([], this.name);
      }
      stream() {
        return new ReadableStream();
      }
      text() {
        return Promise.resolve('');
      }
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(0));
      }
    }
  };
  // Only fill in globals the runtime lacks: the shimmed URL/Blob/File are
  // minimal stand-ins and must never shadow the real platform implementations
  // other services (e.g. the Anthropic SDK) depend on.
  const polyfillGlobal = (name, value) => {
    if (typeof global[name] === 'undefined') global[name] = value;
  };

  polyfillGlobal('document', global.window.document);
  polyfillGlobal('navigator', global.window.navigator);
  polyfillGlobal('AudioContext', global.window.AudioContext);
  polyfillGlobal('webkitAudioContext', global.window.webkitAudioContext);
  polyfillGlobal('URL', global.window.URL);
  polyfillGlobal('Blob', global.window.Blob);
  polyfillGlobal('File', global.window.File);

  if (!global.performance) {
    global.performance = {
      now: () => Date.now(),
      mark: () => { },
      measure: () => { },
      clearMarks: () => { },
      clearMeasures: () => { },
      getEntriesByName: () => [],
      getEntriesByType: () => []
    };
  }

  if (!global.crypto) {
    global.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }
    };
  }
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const logger = require('../core/logger').createServiceLogger('SPEECH');
const config = require('../core/config');

let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logger.warn('Azure Speech SDK unavailable', { error: error.message });
}

let recorder = null;
try {
  recorder = require('node-record-lpcm16');
} catch (error) {
  logger.warn('Local audio recorder dependency unavailable', { error: error.message });
}

const AudioCapture = require('./audio-capture');
const WhisperEngine = require('./whisper.engine');

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_MS = (SAMPLE_RATE * BYTES_PER_SAMPLE) / 1000;
// Energy is measured over fixed 20 ms frames so endpointing does not depend on
// how the capture process happens to chunk its output.
const FRAME_MS = 20;
const FRAME_BYTES = FRAME_MS * BYTES_PER_MS;

const rms = (pcmChunk) => {
  const samples = Math.floor(pcmChunk.length / BYTES_PER_SAMPLE);
  if (!samples) return 0;

  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const sample = pcmChunk.readInt16LE(i * BYTES_PER_SAMPLE) / 32768;
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples);
};

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this.recognizer = null;
    this.isRecording = false;
    this.audioConfig = null;
    this.speechConfig = null;
    this.sessionStartTime = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.pushStream = null;
    this.recording = null;
    this.available = false;
    this.provider = 'disabled';
    this.runtimeSettings = {};
    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.segmentTimer = null;
    this.silenceTimer = null;
    this.lastAudioTime = 0;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this.audioProgram = null;
    this.whisperCommand = null;
    this.whisperEngine = new WhisperEngine();
    this.audioCapture = null;
    this.utteranceChunks = [];
    this.utteranceBytes = 0;
    this.preRollChunks = [];
    this.preRollBytes = 0;
    this.speaking = false;
    this.silenceBytes = 0;
    this.noiseFloor = null;
    this.utteranceQueue = [];
    this.frameRemainder = Buffer.alloc(0);

    this.initializeClient();
  }

  initializeClient() {
    this._cleanup();
    this.provider = 'disabled';
    this.available = false;
    this.speechConfig = null;
    this.whisperCommand = null;

    const provider = this._getConfiguredProvider();
    this.provider = provider;

    if (provider === 'azure') {
      this._initializeAzureClient();
      return;
    }

    // Track whether we've already attempted an automatic Azure->Whisper fallback
    this._azureFallbackAttempted = false;

    if (provider === 'whisper') {
      this._initializeWhisperClient();
      return;
    }

    const reason = 'Speech recognition disabled. Configure Azure or local Whisper.';
    logger.warn(reason);
    this.emit('status', reason);
  }

  _initializeAzureClient() {
    try {
      if (!sdk) {
        throw new Error('Azure Speech SDK dependency is not installed');
      }

      const subscriptionKey = this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY;
      const region = this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION;

      if (!subscriptionKey || !region) {
        const reason = 'Azure Speech credentials not found. Speech recognition disabled.';
        logger.warn('Speech service disabled (missing Azure credentials)');
        this.emit('status', reason);
        return;
      }

      this.speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);

      const azureConfig = config.get('speech.azure') || {};
      this.speechConfig.speechRecognitionLanguage = azureConfig.language || 'en-US';
      this.speechConfig.outputFormat = sdk.OutputFormat.Detailed;
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '5000');
      this.speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
      this.speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '2000');

      if (azureConfig.enableDictation) {
        this.speechConfig.enableDictation();
      }

      if (azureConfig.enableAudioLogging) {
        this.speechConfig.enableAudioLogging();
      }

      this.available = true;
      logger.info('Azure Speech service initialized successfully', {
        region,
        language: azureConfig.language || 'en-US'
      });
      this.emit('status', 'Azure Speech Services ready');
    } catch (error) {
      logger.error('Failed to initialize Azure Speech client', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Azure speech unavailable');
    }
  }

  _initializeWhisperClient() {
    try {
      if (!AudioCapture.isAvailable()) {
        const reason = 'ffmpeg not found. Install ffmpeg to capture call audio locally.';
        logger.warn(reason);
        this.emit('status', reason);
        return;
      }

      const engine = this.whisperEngine.configure({
        command: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        model: this._getWhisperModel(),
        modelDir: this._getWhisperModelDir(),
        language: this._getWhisperLanguage(),
        threads: this._getWhisperThreads(),
        timeoutMs: this._getWhisperTimeoutMs()
      });

      if (!engine.available) {
        const reason = 'Local speech-to-text unavailable. Run ./setup.sh to install whisper.cpp and a model.';
        logger.warn(reason, { model: this._getWhisperModel() });
        this.emit('status', reason);
        return;
      }

      this.whisperCommand = engine.command;
      this.available = true;

      logger.info('Local speech-to-text initialized', { ...engine, audioSource: this._getAudioSource() });
      this.emit('status', `Local speech ready (${engine.mode}, ${this._getAudioSource()} audio)`);
    } catch (error) {
      logger.error('Failed to initialize local speech-to-text', {
        error: error.message,
        stack: error.stack
      });
      this.available = false;
      this.emit('status', 'Local speech-to-text unavailable');
    }
  }

  startRecording() {
    try {
      if (!this.available) {
        const errorMsg = `Speech provider "${this.provider}" is not available`;
        logger.error(errorMsg);
        this.emit('error', errorMsg);
        return;
      }

      if (this.isRecording) {
        logger.warn('Recording already in progress');
        return;
      }

      this.sessionStartTime = Date.now();
      this.retryCount = 0;

      if (this.provider === 'azure') {
        this._startAzureRecording();
        return;
      }

      if (this.provider === 'whisper') {
        this._startWhisperRecording();
        return;
      }

      throw new Error(`Unsupported speech provider: ${this.provider}`);
    } catch (error) {
      logger.error('Critical error in startRecording', { error: error.message, stack: error.stack });
      this.emit('error', `Speech recognition failed to start: ${error.message}`);
      this.isRecording = false;
    }
  }

  _startAzureRecording() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech client not initialized');
    }

    this.isRecording = true;
    this.emit('recording-started');
    this.emit('status', 'Azure recording started');
    this._cleanup();

    try {
      // Prefer using a pushStream + node-record capture to ensure microphone works
      // from the main process (Electron). This is more reliable across macOS/Linux.
      if (recorder && typeof recorder.record === 'function') {
        try {
          this.pushStream = sdk.AudioInputStream.createPushStream();
          this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);
          this._startMicrophoneCapture();
          this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
        } catch (pushErr) {
          logger.warn('PushStream capture failed, attempting native SDK microphone input', { error: pushErr.message });
          // Try native SDK microphone input as a fallback
          this.audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
          this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
        }
      } else {
        // If recorder lib is unavailable, attempt SDK native mic input
        logger.warn('node-record-lpcm16 unavailable; attempting SDK native microphone input');
        this.audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        this.recognizer = new sdk.SpeechRecognizer(this.speechConfig, this.audioConfig);
      }
    } catch (error) {
      logger.error('Failed to start Azure recording session', { error: error.message });
      this.emit('error', `Audio configuration failed: ${error.message}`);
      this.isRecording = false;
      return;
    }

    this.recognizer.recognizing = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
          this.emit('interim-transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognizing handler', { error: error.message });
      }
    };

    this.recognizer.recognized = (s, e) => {
      try {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text && e.result.text.trim()) {
          this.emit('transcription', e.result.text);
        }
      } catch (error) {
        logger.error('Error in recognized handler', { error: error.message });
      }
    };

    this.recognizer.canceled = (s, e) => {
      logger.warn('Recognition session canceled', {
        reason: e.reason,
        errorCode: e.errorCode,
        errorDetails: e.errorDetails
      });

      if (e.reason === sdk.CancellationReason.Error) {
        const details = e.errorDetails || '';
        if (details.includes('1006')) {
          this.emit('error', 'Network connection failed. Please check your internet connection.');
          // Attempt automatic fallback to Whisper on network errors
          if (!this._azureFallbackAttempted) {
            this._azureFallbackAttempted = true;
            logger.info('Azure network error detected, attempting automatic fallback to Whisper');
            // Switch provider and re-initialize to Whisper
            this.runtimeSettings['speechProvider'] = 'whisper';
            try {
              this.initializeClient();
              // Start whisper recording automatically if we were recording
              if (this.isRecording) {
                this._startWhisperRecording();
              }
            } catch (fbErr) {
              logger.error('Automatic fallback to Whisper failed', { error: fbErr.message });
            }
          }
        } else if (details.includes('InvalidServiceCredentials')) {
          this.emit('error', 'Invalid Azure Speech credentials. Please check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
          // If credentials invalid, try fallback once
          if (!this._azureFallbackAttempted) {
            this._azureFallbackAttempted = true;
            logger.info('Azure credentials invalid, attempting automatic fallback to Whisper');
            this.runtimeSettings['speechProvider'] = 'whisper';
            try { this.initializeClient(); if (this.isRecording) { this._startWhisperRecording(); } } catch (fbErr) { logger.error('Automatic fallback to Whisper failed', { error: fbErr.message }); }
          }
        } else if (details.includes('Forbidden')) {
          this.emit('error', 'Access denied. Please check your Azure Speech service subscription and region.');
        } else if (details.includes('AudioInputMicrophone_InitializationFailure')) {
          this.emit('error', 'Microphone initialization failed. Please check microphone permissions and availability.');
        } else {
          this.emit('error', `Recognition error: ${details}`);
        }
      }

      this.stopRecording();
    };

    this.recognizer.sessionStarted = (s, e) => {
      logger.info('Recognition session started', { sessionId: e.sessionId });
    };

    this.recognizer.sessionStopped = () => {
      this.stopRecording();
    };

    const startTimeout = setTimeout(() => {
      logger.error('Recognition start timeout');
      this.emit('error', 'Speech recognition start timeout. Please try again.');
      this.stopRecording();
    }, 10000);

    this.recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(startTimeout);
        logger.info('Continuous Azure speech recognition started successfully');
        if (global.windowManager) {
          global.windowManager.handleRecordingStarted();
        }
      },
      (error) => {
        clearTimeout(startTimeout);
        logger.error('Failed to start continuous recognition', { error: error.toString() });
        this.emit('error', `Recognition startup failed: ${error}`);
        this.isRecording = false;
        this._cleanup();
      }
    );
  }

  _startWhisperRecording() {
    this._cleanup();
    this.isRecording = true;
    this._resetUtteranceState();
    this.lastAudioTime = Date.now();

    const source = this._getAudioSource();

    try {
      this.audioCapture = new AudioCapture();
      this.audioCapture.on('data', (chunk) => this._handleAudioChunk(chunk));
      this.audioCapture.on('error', (error) => {
        logger.error('Audio capture failed', { error: error.message, source });
        this.emit('error', `Audio capture failed: ${error.message}`);
        this.stopRecording();
      });

      const descriptor = this.audioCapture.start({ source, device: this._getAudioDevice() });

      this.emit('recording-started');
      this.emit('status', descriptor.warning
        ? `Listening to microphone only — ${descriptor.warning}`
        : `Listening to ${descriptor.source} audio`);
      logger.info('[SPEECH] Streaming capture started', descriptor);
    } catch (error) {
      this.isRecording = false;
      this.audioCapture = null;
      logger.error('Failed to start audio capture', { error: error.message, source });
      this.emit('error', error.message);
      return;
    }

    if (global.windowManager) {
      global.windowManager.handleRecordingStarted();
    }
  }

  _resetUtteranceState() {
    this.utteranceChunks = [];
    this.utteranceBytes = 0;
    this.preRollChunks = [];
    this.preRollBytes = 0;
    this.speaking = false;
    this.silenceBytes = 0;
    this.noiseFloor = null;
    this.utteranceQueue = [];
    this.transcriptionInFlight = false;
    this.frameRemainder = Buffer.alloc(0);
  }


  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    logger.info('Stopping speech recognition session', {
      provider: this.provider,
      sessionDuration: `${sessionDuration}ms`
    });

    if (this.provider === 'azure' && this.recognizer) {
      try {
        this.recognizer.stopContinuousRecognitionAsync(
          () => {
            this._finalizeStop('Recording stopped');
          },
          (error) => {
            logger.error('Error during recognition stop', { error: error.toString() });
            this._finalizeStop('Recording stopped');
          }
        );
      } catch (error) {
        logger.error('Error stopping recognizer', { error: error.message });
        this._finalizeStop('Recording stopped');
      }
      return;
    }

    if (this.provider === 'whisper') {
      this._finalizeWhisperStop();
      return;
    }

    this._finalizeStop('Recording stopped');
  }

  async _finalizeWhisperStop() {
    if (this.audioCapture) {
      this.audioCapture.removeAllListeners('data');
      this.audioCapture.stop();
      this.audioCapture = null;
    }

    // Whatever was still being spoken when the user stopped is worth keeping.
    if (this.speaking && this.utteranceBytes) {
      this._closeUtterance('stopped');
    }

    try {
      await this._drainUtteranceQueue();
    } catch (error) {
      logger.error('Final transcription failed', { error: error.message });
    }

    this._finalizeStop('Recording stopped');
  }

  _finalizeStop(statusMessage) {
    this._cleanup();
    this.emit('recording-stopped');
    this.emit('status', statusMessage);
    if (global.windowManager) {
      global.windowManager.handleRecordingStopped();
    }
  }

  _cleanup() {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.audioCapture) {
      this.audioCapture.removeAllListeners('data');
      this.audioCapture.stop();
      this.audioCapture = null;
    }

    if (this.recognizer) {
      try {
        this.recognizer.close();
      } catch (error) {
        logger.error('Error closing recognizer', { error: error.message });
      }
      this.recognizer = null;
    }

    if (this.audioConfig) {
      try {
        if (typeof this.audioConfig.close === 'function') {
          this.audioConfig.close();
        }
      } catch (error) {
        logger.error('Error closing audio config', { error: error.message });
      }
      this.audioConfig = null;
    }

    if (this.recording) {
      try {
        this.recording.stop();
      } catch (error) {
        logger.error('Error stopping audio recording', { error: error.message });
      }
      this.recording = null;
    }

    if (this.pushStream) {
      try {
        if (typeof this.pushStream.close === 'function') {
          this.pushStream.close();
        }
      } catch (error) {
        logger.error('Error closing push stream', { error: error.message });
      }
      this.pushStream = null;
    }

    this.segmentBuffers = [];
    this.segmentBytes = 0;
    this.transcriptionInFlight = false;
    this.pendingFlush = false;
    this._audioDataLogged = false;
    this._azureFallbackAttempted = false;
    this.utteranceChunks = [];
    this.utteranceBytes = 0;
    this.preRollChunks = [];
    this.preRollBytes = 0;
    this.speaking = false;
    this.silenceBytes = 0;
    this.noiseFloor = null;
    this.utteranceQueue = [];
    this.frameRemainder = Buffer.alloc(0);
  }

  // Called on app shutdown so the warm speech-to-text server doesn't outlive us.
  dispose() {
    this.stopRecording();
    this._cleanup();
    this.whisperEngine.shutdownServer();
  }

  async recognizeFromFile(audioFilePath) {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioFilePath);
      const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);

      return await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            resolve(result.reason === sdk.ResultReason.RecognizedSpeech ? result.text : '');
            recognizer.close();
            audioConfig.close();
          },
          (error) => {
            reject(new Error(`File recognition error: ${error}`));
            recognizer.close();
            audioConfig.close();
          }
        );
      });
    }

    if (this.provider === 'whisper') {
      return this._transcribeWhisperFile(audioFilePath);
    }

    throw new Error('Speech service not initialized');
  }

  async testConnection() {
    if (this.provider === 'azure') {
      if (!this.speechConfig) {
        throw new Error('Speech service not initialized');
      }

      try {
        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new sdk.SpeechRecognizer(this.speechConfig, audioConfig);
        recognizer.close();
        audioConfig.close();
        return { success: true, message: 'Azure connection test successful' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    if (this.provider === 'whisper') {
      const engine = this.whisperEngine.describe();

      if (!AudioCapture.isAvailable()) {
        return { success: false, message: 'ffmpeg not found; local audio capture is unavailable' };
      }

      const audio = AudioCapture.describeSources();

      if (!engine.available) {
        return {
          success: false,
          message: 'No local speech-to-text engine found. Run ./setup.sh to install whisper.cpp.'
        };
      }

      const loopback = audio.loopback
        ? `far-end audio via ${audio.loopback}`
        : `microphone only — ${audio.loopbackHint}`;

      return {
        success: true,
        message: `Local speech-to-text ready (${engine.mode}, ${engine.modelFile || engine.model}); ${loopback}`
      };
    }

    return { success: false, message: 'Speech service not initialized' };
  }

  getStatus() {
    return {
      provider: this.provider,
      isRecording: this.isRecording,
      isInitialized: this.provider === 'azure' ? !!this.speechConfig : this.whisperEngine.isAvailable(),
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount: this.retryCount,
      effectiveSettings: {
        speechProvider: this.provider,
        azureKey: this._getSetting('azureKey') || '',
        azureRegion: this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION || '',
        whisperCommand: this._getSetting('whisperCommand') || process.env.WHISPER_COMMAND || '',
        whisperModelDir: this._getWhisperModelDir(),
        whisperModel: this._getWhisperModel(),
        whisperLanguage: this._getWhisperLanguage(),
        endpointSilenceMs: String(this._getEndpointSilenceMs()),
        audioSource: this._getAudioSource(),
        audioDevice: this._getAudioDevice()
      },
      engine: this.whisperEngine.describe(),
      audio: AudioCapture.describeSources(),
      config: {
        azure: config.get('speech.azure') || {},
        whisper: config.get('speech.whisper') || {},
        selectedProvider: this.provider
      }
    };
  }

  isAvailable() {
    if (this.provider === 'azure') {
      return !!this.speechConfig && !!this.available;
    }

    if (this.provider === 'whisper') {
      return this.whisperEngine.isAvailable() && !!this.available;
    }

    return false;
  }

  updateSettings(settings = {}) {
    const speechKeys = ['speechProvider', 'azureKey', 'azureRegion', 'whisperCommand', 'whisperModelDir', 'whisperModel', 'whisperLanguage', 'audioSource', 'audioDevice', 'endpointSilenceMs'];
    let changed = false;

    for (const key of speechKeys) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        this.runtimeSettings[key] = settings[key];
        changed = true;
      }
    }

    if (changed) {
      this.initializeClient();
    }

    return this.getStatus();
  }

  _getConfiguredProvider() {
    const provider = String(this._getSetting('speechProvider') || process.env.SPEECH_PROVIDER || '').trim().toLowerCase();

    if (provider === 'azure' || provider === 'whisper') {
      return provider;
    }

    const hasAzure = !!((this._getSetting('azureKey') || process.env.AZURE_SPEECH_KEY) &&
      (this._getSetting('azureRegion') || process.env.AZURE_SPEECH_REGION));

    if (hasAzure) {
      return 'azure';
    }

    return 'whisper';
  }

  _getWhisperModel() {
    return this._getSetting('whisperModel') || process.env.WHISPER_MODEL || config.get('speech.whisper.model') || 'base.en';
  }

  _getAudioSource() {
    return AudioCapture.normalizeSource(
      this._getSetting('audioSource') || process.env.SPEECH_AUDIO_SOURCE || config.get('speech.audio.source')
    );
  }

  _getAudioDevice() {
    return this._getSetting('audioDevice') || process.env.SPEECH_AUDIO_DEVICE || '';
  }

  _getWhisperThreads() {
    return this._numericSetting('whisperThreads', process.env.WHISPER_THREADS, config.get('speech.whisper.threads'), 0, 0);
  }

  _getWhisperTimeoutMs() {
    return this._numericSetting('whisperTimeoutMs', process.env.WHISPER_TIMEOUT_MS, config.get('speech.whisper.timeoutMs'), 30000, 5000);
  }

  // How much trailing silence ends an utterance. Lower means faster answers and
  // more sentence fragments.
  _getEndpointSilenceMs() {
    return this._numericSetting('endpointSilenceMs', process.env.SPEECH_ENDPOINT_SILENCE_MS, config.get('speech.vad.endpointSilenceMs'), 600, 200);
  }

  _getMinUtteranceMs() {
    return this._numericSetting('minUtteranceMs', process.env.SPEECH_MIN_UTTERANCE_MS, config.get('speech.vad.minUtteranceMs'), 400, 100);
  }

  _getMaxUtteranceMs() {
    return this._numericSetting('maxUtteranceMs', process.env.SPEECH_MAX_UTTERANCE_MS, config.get('speech.vad.maxUtteranceMs'), 12000, 2000);
  }

  _getPreRollMs() {
    return this._numericSetting('preRollMs', process.env.SPEECH_PREROLL_MS, config.get('speech.vad.preRollMs'), 300, 0);
  }

  _getSilenceThreshold() {
    const raw = this._getSetting('silenceThreshold') || process.env.SPEECH_SILENCE_THRESHOLD || config.get('speech.vad.silenceThreshold');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.012;
  }

  _numericSetting(key, envValue, configValue, fallback, minimum) {
    const raw = this._getSetting(key) || envValue || configValue || fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
  }

  _getWhisperModelDir() {
    return this._getSetting('whisperModelDir') || process.env.WHISPER_MODEL_DIR || '';
  }

  _getWhisperLanguage() {
    return this._getSetting('whisperLanguage') || process.env.WHISPER_LANGUAGE || config.get('speech.whisper.language') || 'en';
  }

  _getSetting(key) {
    const value = this.runtimeSettings[key];
    return value === '' ? null : value;
  }

  _startMicrophoneCapture() {
    if (!recorder || typeof recorder.record !== 'function') {
      this.emit('error', 'Local microphone capture dependency is missing. Run npm install to restore speech recording support.');
      return;
    }

    this._startMicrophoneCaptureWithFallback(['sox', 'rec', 'arecord']);
  }

  _startMicrophoneCaptureWithFallback(programs) {
    const queue = [...programs];

    const tryNextProgram = () => {
      const program = queue.shift();
      if (!program) {
        this.emit('error', 'Could not start microphone capture with any audio program');
        return;
      }

      try {
        this.recording = recorder.record({
          sampleRateHertz: 16000,
          channels: 1,
          threshold: 0,
          verbose: false,
          recordProgram: program,
          silence: '10.0s'
        });

        const stream = this.recording.stream();
        this.audioProgram = program;

        stream.on('error', (error) => {
          logger.error('Audio recording stream error', { error: error.message, program });
          if (this.recording) {
            try {
              this.recording.stop();
            } catch (stopError) {
              logger.error('Error stopping failed recording program', { error: stopError.message });
            }
            this.recording = null;
          }

          if (this.isRecording) {
            tryNextProgram();
          }
        });

        stream.on('data', (chunk) => {
          this._handleAudioChunk(chunk);
        });
      } catch (error) {
        logger.error('Failed to start microphone capture program', { program, error: error.message });
        tryNextProgram();
      }
    };

    tryNextProgram();
  }

  _handleAudioChunk(chunk) {
    if (!chunk || !chunk.length || !this.isRecording) {
      return;
    }

    if (this.provider === 'azure' && this.pushStream) {
      try {
        this.pushStream.write(chunk);
      } catch (error) {
        logger.error('Error writing audio data to Azure push stream', { error: error.message });
      }
      return;
    }

    if (this.provider !== 'whisper') {
      return;
    }

    this.lastAudioTime = Date.now();

    const buffered = this.frameRemainder && this.frameRemainder.length
      ? Buffer.concat([this.frameRemainder, chunk])
      : chunk;

    let offset = 0;
    while (offset + FRAME_BYTES <= buffered.length) {
      this._handleFrame(buffered.subarray(offset, offset + FRAME_BYTES));
      offset += FRAME_BYTES;
    }

    this.frameRemainder = Buffer.from(buffered.subarray(offset));
  }

  _handleFrame(chunk) {
    const level = rms(chunk);
    const isSpeech = level > this._speechThreshold(level);

    if (!this.speaking) {
      // Keep a short pre-roll so the first syllable survives endpointing.
      this.preRollChunks.push(chunk);
      this.preRollBytes += chunk.length;

      const preRollLimit = this._getPreRollMs() * BYTES_PER_MS;
      while (this.preRollBytes > preRollLimit && this.preRollChunks.length > 1) {
        this.preRollBytes -= this.preRollChunks.shift().length;
      }

      if (!isSpeech) return;

      this.speaking = true;
      this.silenceBytes = 0;
      this.utteranceChunks = this.preRollChunks;
      this.utteranceBytes = this.preRollBytes;
      this.preRollChunks = [];
      this.preRollBytes = 0;
      this.emit('status', 'Hearing speech');
      return;
    }

    this.utteranceChunks.push(chunk);
    this.utteranceBytes += chunk.length;
    this.silenceBytes = isSpeech ? 0 : this.silenceBytes + chunk.length;

    const endpointed = this.silenceBytes >= this._getEndpointSilenceMs() * BYTES_PER_MS;
    const tooLong = this.utteranceBytes >= this._getMaxUtteranceMs() * BYTES_PER_MS;

    if (endpointed || tooLong) {
      this._closeUtterance(tooLong ? 'max-length' : 'endpoint');
    }
  }

  // Adaptive gate: the floor tracks the quietest recent audio, so the same
  // config works with a silent room and with constant call-line hiss.
  _speechThreshold(level) {
    this.noiseFloor = this.noiseFloor === null ? level : Math.min(this.noiseFloor * 1.05 + 0.0002, level, 0.05);
    return Math.max(this._getSilenceThreshold(), this.noiseFloor * 3);
  }

  _closeUtterance(reason) {
    const chunks = this.utteranceChunks;
    const bytes = this.utteranceBytes;

    this.speaking = false;
    this.silenceBytes = 0;
    this.utteranceChunks = [];
    this.utteranceBytes = 0;

    if (bytes < this._getMinUtteranceMs() * BYTES_PER_MS) {
      return;
    }

    logger.info('[SPEECH] Utterance captured', { ms: Math.round(bytes / BYTES_PER_MS), reason });

    this.utteranceQueue.push(Buffer.concat(chunks, bytes));
    this._drainUtteranceQueue().catch((error) => {
      logger.error('Utterance transcription loop failed', { error: error.message });
    });
  }

  // Utterances are transcribed one at a time, in order, so a slow model can
  // never interleave two sentences.
  async _drainUtteranceQueue() {
    if (this.transcriptionInFlight) return;
    this.transcriptionInFlight = true;

    try {
      while (this.utteranceQueue.length) {
        const pcm = this.utteranceQueue.shift();
        const startedAt = Date.now();

        try {
          const transcript = await this.whisperEngine.transcribe(this._createWavBuffer(pcm));

          if (transcript) {
            logger.info('[SPEECH] Transcribed utterance', {
              latencyMs: Date.now() - startedAt,
              audioMs: Math.round(pcm.length / BYTES_PER_MS)
            });
            this.emit('transcription', transcript);
          }
        } catch (error) {
          logger.error('[SPEECH] Transcription failed', { error: error.message });
          this.emit('error', `Transcription failed: ${error.message}`);
        }
      }
    } finally {
      this.transcriptionInFlight = false;
    }
  }

  async _transcribeWhisperFile(audioFilePath) {
    if (!this.whisperEngine.isAvailable()) {
      throw new Error('Local speech-to-text engine not configured');
    }

    return this.whisperEngine.transcribe(fs.readFileSync(audioFilePath));
  }

  _createWavBuffer(rawPcmBuffer) {
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + rawPcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(rawPcmBuffer.length, 40);

    return Buffer.concat([header, rawPcmBuffer]);
  }
}

module.exports = new SpeechService();
