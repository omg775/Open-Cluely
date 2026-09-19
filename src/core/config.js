// Load environment variables immediately from project root
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const DEFAULT_MODEL = 'claude-sonnet-4-5';

const defaults = {
  llm: {
    provider: 'anthropic',
    anthropic: {
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 4096),
      temperature: Number(process.env.ANTHROPIC_TEMPERATURE || 0.7),
      timeout: Number(process.env.ANTHROPIC_TIMEOUT || process.env.LLM_TIMEOUT || 60000),
      maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES || process.env.LLM_MAX_RETRIES || 2),
      streaming: process.env.ANTHROPIC_STREAMING !== 'false',
      // Minimum gap between two outgoing requests; extra requests are coalesced.
      minRequestIntervalMs: Number(process.env.LLM_MIN_REQUEST_INTERVAL_MS || 1200),
      // Quiet period before a transcript chunk is sent for reasoning.
      transcriptDebounceMs: Number(process.env.LLM_TRANSCRIPT_DEBOUNCE_MS || 900),
      maxHistoryTurns: Number(process.env.LLM_MAX_HISTORY_TURNS || 15)
    }
  },

  speech: {
    whisper: {
      model: process.env.WHISPER_MODEL || 'base',
      language: process.env.WHISPER_LANGUAGE || 'en',
      segmentMs: Number(process.env.WHISPER_SEGMENT_MS || 4000)
    },
    azure: {
      language: process.env.AZURE_SPEECH_LANGUAGE || 'en-US'
    }
  },

  app: {
    version: process.env.APP_VERSION || '0.0.0',
    isDevelopment: process.env.NODE_ENV !== 'production'
  },

  overlay: {
    hideFromDock: true,
    noAttachConsole: true,
    disguiseProcess: true
  }
};

// Resolve nested dot-paths against defaults
function get(pathKey, defaultValue) {
  if (!pathKey || typeof pathKey !== 'string') return defaultValue;
  const parts = pathKey.split('.');
  let cur = defaults;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return defaultValue;
    }
  }
  return cur === undefined ? defaultValue : cur;
}

// Return the raw environment API key for the given service.
// Accept any non-empty string; do not enforce prefix/regex rules.
function getApiKey(serviceName = 'ANTHROPIC') {
  const base = String(serviceName || 'ANTHROPIC').toUpperCase();

  const candidates = [
    `${base}_API_KEY`,
    `${base}_KEY`,
    `${base}_TOKEN`,
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY'
  ];

  for (const name of candidates) {
    const val = process.env[name];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }

  return null;
}

module.exports = {
  get,
  getApiKey,
  DEFAULT_MODEL
};
