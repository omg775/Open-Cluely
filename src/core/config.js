// Load environment variables immediately from project root
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const defaults = {
  llm: {
    gemini: {
      model: process.env.GEMINI_MODEL || process.env.GEMINI_MODEL_NAME || 'gemini-pro',
      timeout: Number(process.env.GEMINI_TIMEOUT || process.env.LLM_TIMEOUT || 10000),
      maxRetries: Number(process.env.GEMINI_MAX_RETRIES || process.env.LLM_MAX_RETRIES || 3),
      enableFallbackMethod: (process.env.GEMINI_ENABLE_FALLBACK === 'true') || false,
      fallbackEnabled: (process.env.GEMINI_FALLBACK_ENABLED === 'true') || false,
      generation: undefined
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

  stealth: {
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
function getApiKey(serviceName) {
  if (!serviceName || typeof serviceName !== 'string') return null;
  const base = String(serviceName).toUpperCase();

  // Common environment variable name patterns to try
  const candidates = [
    `${base}_API_KEY`,
    `${base}_KEY`,
    `${base}_TOKEN`,
    `${base}_APIKEY`,
    `${base}_SECRET`,
    base,
    // generic fallbacks that might be present in environments
    'GEMINI_API_KEY',
    'API_KEY',
    'OPENAI_API_KEY'
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
  getApiKey
};
