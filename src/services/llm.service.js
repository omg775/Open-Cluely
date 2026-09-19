const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

const LANGUAGE_TITLES = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' };
const FENCE_TAGS = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

class LLMService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.apiKey = null; // in-memory override for configured API key
    this.lastRequestStartedAt = 0;
    this.activeStream = null;
    this.activeController = null;
    this.latestRequestId = 0;

    this.initializeClient();
  }

  initializeClient() {
    const apiKey = this.apiKey || config.getApiKey('ANTHROPIC');

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' || apiKey === 'your-api-key-here') {
      logger.warn('Anthropic API key not configured');
      this.client = null;
      this.isInitialized = false;
      return;
    }

    try {
      this.client = new Anthropic({
        apiKey: apiKey.trim(),
        timeout: config.get('llm.anthropic.timeout'),
        maxRetries: config.get('llm.anthropic.maxRetries')
      });
      this.isInitialized = true;

      logger.info('Anthropic client initialized', { model: this.getModel() });
    } catch (error) {
      logger.error('Failed to initialize Anthropic client', { error: error.message });
      this.client = null;
      this.isInitialized = false;
    }
  }

  getModel() {
    return config.get('llm.anthropic.model') || config.DEFAULT_MODEL;
  }

  updateApiKey(apiKey) {
    try {
      this.apiKey = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null;

      if (this.apiKey) {
        process.env.ANTHROPIC_API_KEY = this.apiKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }

      this.initializeClient();
      return { success: !!this.isInitialized };
    } catch (error) {
      logger.error('Failed to update Anthropic API key', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  getStats() {
    return {
      hasApiKey: !!(this.apiKey || config.getApiKey('ANTHROPIC')),
      provider: 'anthropic',
      model: this.getModel(),
      streaming: !!config.get('llm.anthropic.streaming'),
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount
    };
  }

  async testConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'No Anthropic API key configured' };
    }

    try {
      const message = await this.client.messages.create({
        model: this.getModel(),
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }]
      });

      const text = this.extractText(message);
      if (text.trim().length > 0) {
        return { success: true, model: this.getModel(), responseSnippet: text.slice(0, 200) };
      }
      return { success: false, error: 'Empty response from Claude' };
    } catch (error) {
      const analysis = this.analyzeError(error);
      logger.error('Anthropic connection test failed', { error: error.message, type: analysis.type });
      return { success: false, error: analysis.userMessage };
    }
  }

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  /**
   * Analyze a screenshot with the active skill prompt.
   * The image is sent as a Claude image content block (base64 source).
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null, options = {}) {
    this.assertReady();

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const mediaType = SUPPORTED_IMAGE_TYPES.includes(mimeType) ? mimeType : 'image/png';
    const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';

    const request = {
      system: skillPrompt.trim() || undefined,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') }
            },
            { type: 'text', text: this.formatImageInstruction(activeSkill, programmingLanguage) }
          ]
        }
      ]
    };

    return this.send(request, {
      ...options,
      activeSkill,
      programmingLanguage,
      metadata: { isImageAnalysis: true, mimeType: mediaType, imageSize: imageBuffer.length }
    });
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null, options = {}) {
    this.assertReady();

    const request = this.buildRequest(text, activeSkill, sessionMemory, programmingLanguage);
    return this.send(request, { ...options, activeSkill, programmingLanguage, metadata: {} });
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null, options = {}) {
    this.assertReady();

    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) throw new Error('Empty transcription text provided');

    const request = this.buildTranscriptionRequest(cleanText, activeSkill, programmingLanguage);
    return this.send(request, {
      ...options,
      activeSkill,
      programmingLanguage,
      metadata: { isTranscriptionResponse: true }
    });
  }

  assertReady() {
    if (!this.isInitialized) {
      const error = new Error('Claude is not configured. Add ANTHROPIC_API_KEY to your .env or set the key in Settings.');
      error.errorAnalysis = { type: 'CONFIG_ERROR', userMessage: error.message };
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Request building
  // ---------------------------------------------------------------------------

  buildRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    const sessionManager = require('../managers/session.manager');
    const formatted = this.formatUserMessage(text, activeSkill);

    let system;
    let history = [];

    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      system = skillContext?.skillPrompt || undefined;
      history = sessionManager.getConversationHistory(config.get('llm.anthropic.maxHistoryTurns'));
    } else {
      const components = promptLoader.getRequestComponents(activeSkill, text, sessionMemory, programmingLanguage);
      if (components.shouldUseModelMemory) system = components.skillPrompt;
    }

    return {
      system: system && system.trim() ? system : undefined,
      messages: this.normalizeMessages([...this.toClaudeMessages(history), { role: 'user', content: formatted }])
    };
  }

  buildTranscriptionRequest(text, activeSkill, programmingLanguage) {
    const sessionManager = require('../managers/session.manager');
    const history = sessionManager && typeof sessionManager.getConversationHistory === 'function'
      ? sessionManager.getConversationHistory(10).slice(-8)
      : [];

    return {
      system: this.getLiveContextPrompt(activeSkill, programmingLanguage),
      messages: this.normalizeMessages([...this.toClaudeMessages(history), { role: 'user', content: text }])
    };
  }

  /**
   * Map internal history events onto Claude message turns.
   * The internal 'model' role becomes 'assistant'; system events are dropped
   * because Claude takes system instructions as a top-level parameter.
   */
  toClaudeMessages(history = []) {
    return history
      .filter(event => event && event.role !== 'system' && typeof event.content === 'string' && event.content.trim())
      .map(event => ({
        role: event.role === 'model' || event.role === 'assistant' ? 'assistant' : 'user',
        content: event.content.trim()
      }));
  }

  /**
   * Claude requires the conversation to start with a user turn and to alternate
   * roles, so leading assistant turns are dropped and consecutive same-role
   * turns are merged.
   */
  normalizeMessages(messages) {
    const result = [];

    for (const message of messages) {
      if (!message || !message.content) continue;
      if (result.length === 0 && message.role !== 'user') continue;

      const previous = result[result.length - 1];
      if (previous && previous.role === message.role) {
        if (typeof previous.content === 'string' && typeof message.content === 'string') {
          previous.content = `${previous.content}\n\n${message.content}`;
          continue;
        }
        previous.content = [].concat(previous.content, message.content);
        continue;
      }

      result.push({ ...message });
    }

    if (result.length === 0) throw new Error('No valid content to send to Claude');
    return result;
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Analyze this screen capture in ${String(activeSkill).toUpperCase()} mode. State the question or task concisely, then give the most useful answer with a brief explanation and any code needed.${langNote}`;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${String(activeSkill).toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  getLiveContextPrompt(activeSkill, programmingLanguage) {
    const skill = String(activeSkill).toUpperCase();
    let prompt = `# Live Context Assistant

You are assisting someone during a live call, meeting, or research session. You receive a running transcript of what is being said and respond with the most useful answer for the current ${skill} context.

## Response Rules
- Answer directly and concisely; do not restate the question.
- 1-3 sentences for general questions.
- For coding questions, lead with the code and keep any explanation minimal.
- Answer every question asked, including general knowledge and off-topic ones.
- If the input is a problem statement with no code, produce a complete, runnable solution without asking for more details.`;

    if (programmingLanguage) {
      const lang = String(programmingLanguage).toLowerCase();
      const title = LANGUAGE_TITLES[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      const fence = FENCE_TAGS[lang] || lang || 'text';
      prompt += `\n\n## Coding Context\nRespond only in ${title}. Every code block must be fenced with \`\`\`${fence}.`;
    }

    return prompt;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /**
   * Send a request to /v1/messages, streaming when a delta handler is supplied.
   * Resolves with { response, metadata }.
   */
  async send(request, { activeSkill, programmingLanguage, metadata = {}, onDelta = null, signal = null } = {}) {
    // A newer request always supersedes whatever is still in flight, streaming
    // or not, so a slow earlier answer cannot land on top of a newer one.
    this.abortActiveRequest();

    const startTime = Date.now();
    this.requestCount++;
    const requestId = this.requestCount;
    this.latestRequestId = requestId;

    const controller = new AbortController();
    this.activeController = controller;
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    await this.respectRateLimit();

    const payload = {
      model: this.getModel(),
      max_tokens: config.get('llm.anthropic.maxTokens'),
      temperature: config.get('llm.anthropic.temperature'),
      messages: request.messages
    };
    if (request.system) payload.system = request.system;

    const shouldStream = !!onDelta && !!config.get('llm.anthropic.streaming');

    try {
      const text = shouldStream
        ? await this.executeStreaming(payload, onDelta, controller.signal)
        : await this.executeOnce(payload, controller.signal);

      if (this.latestRequestId !== requestId) {
        const superseded = new Error('Request cancelled.');
        superseded.name = 'AbortError';
        throw superseded;
      }

      const response = programmingLanguage ? this.enforceProgrammingLanguage(text, programmingLanguage) : text;
      if (!response || !response.trim()) throw new Error('Claude returned an empty response');

      logger.logPerformance('Claude request', startTime, {
        activeSkill,
        model: payload.model,
        streamed: shouldStream,
        responseLength: response.length,
        requestId
      });

      return {
        response,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          model: payload.model,
          streamed: shouldStream,
          processingTime: Date.now() - startTime,
          requestId,
          usedFallback: false,
          ...metadata
        }
      };
    } catch (error) {
      this.errorCount++;
      const analysis = this.analyzeError(error);
      logger.error('Claude request failed', { error: error.message, type: analysis.type, activeSkill, requestId });

      const wrapped = new Error(analysis.userMessage);
      wrapped.aborted = analysis.type === 'ABORTED';
      wrapped.errorAnalysis = analysis;
      wrapped.originalError = error;
      throw wrapped;
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }

  async executeOnce(payload, signal) {
    const message = await this.client.messages.create(payload, signal ? { signal } : undefined);
    return this.extractText(message);
  }

  /**
   * Stream a response. The SDK surfaces Claude's content_block_delta events as
   * 'text' events; each chunk is forwarded to onDelta as it arrives.
   */
  async executeStreaming(payload, onDelta, signal) {
    const stream = this.client.messages.stream(payload, signal ? { signal } : undefined);
    this.activeStream = stream;

    let accumulated = '';

    // Without a listener the SDK surfaces stream failures as unhandled
    // rejections; finalMessage() below still rejects with the same error.
    stream.on('error', (error) => {
      logger.debug('Claude stream error event', { error: error?.message });
    });

    stream.on('text', (delta) => {
      accumulated += delta;
      try {
        onDelta(delta, accumulated);
      } catch (error) {
        logger.warn('Stream delta handler failed', { error: error.message });
      }
    });

    try {
      const message = await stream.finalMessage();
      return this.extractText(message) || accumulated;
    } finally {
      if (this.activeStream === stream) this.activeStream = null;
    }
  }

  abortActiveRequest() {
    if (this.activeStream) {
      try {
        this.activeStream.abort();
        logger.debug('Aborted in-flight Claude stream');
      } catch (error) {
        logger.warn('Failed to abort active stream', { error: error.message });
      }
      this.activeStream = null;
    }

    if (this.activeController) {
      try {
        this.activeController.abort();
      } catch (error) {
        logger.warn('Failed to abort active request', { error: error.message });
      }
      this.activeController = null;
    }
  }

  /**
   * Keep a floor between outgoing requests so bursty transcript chunks cannot
   * fire back-to-back API calls.
   */
  async respectRateLimit() {
    const minInterval = config.get('llm.anthropic.minRequestIntervalMs') || 0;
    const elapsed = Date.now() - this.lastRequestStartedAt;
    if (minInterval > 0 && elapsed < minInterval) {
      await this.delay(minInterval - elapsed);
    }
    this.lastRequestStartedAt = Date.now();
  }

  extractText(message) {
    const blocks = Array.isArray(message?.content) ? message.content : [];
    return blocks
      .filter(block => block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join('\n')
      .trim();
  }

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTag = FENCE_TAGS[norm] || norm || 'text';
      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => {
        const current = (info || '').trim();
        if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match;
        return '```' + fenceTag + '\n';
      });
      return replacedBackticks.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');
    } catch (_) {
      return text;
    }
  }

  /**
   * Classify a failure into a type plus a short message suitable for the overlay.
   */
  analyzeError(error) {
    const status = error?.status || error?.response?.status || null;
    const message = String(error?.message || '').toLowerCase();

    if (error?.name === 'AbortError' || message.includes('aborted')) {
      return { type: 'ABORTED', status, retryable: false, userMessage: 'Request cancelled.' };
    }
    if (status === 401 || status === 403 || message.includes('authentication') || message.includes('invalid x-api-key')) {
      return { type: 'AUTH_ERROR', status, retryable: false, userMessage: 'Claude rejected the API key. Check ANTHROPIC_API_KEY.' };
    }
    if (status === 400 && message.includes('model')) {
      return { type: 'MODEL_ERROR', status, retryable: false, userMessage: `Model "${this.getModel()}" is not available for this key.` };
    }
    if (status === 429) {
      return { type: 'RATE_LIMIT_ERROR', status, retryable: true, userMessage: 'Rate limited by Claude. Retrying shortly.' };
    }
    if (status === 529 || message.includes('overloaded')) {
      return { type: 'OVERLOADED', status, retryable: true, userMessage: 'Claude is overloaded. Try again in a moment.' };
    }
    if (status && status >= 500) {
      return { type: 'SERVER_ERROR', status, retryable: true, userMessage: 'Claude had a server error. Try again.' };
    }
    if (message.includes('timeout') || message.includes('etimedout')) {
      return { type: 'TIMEOUT_ERROR', status, retryable: true, userMessage: 'Claude timed out. Try again.' };
    }
    if (message.includes('fetch failed') || message.includes('enotfound') || message.includes('econnrefused') || message.includes('network')) {
      return { type: 'NETWORK_ERROR', status, retryable: true, userMessage: 'No connection to Claude. Check your network.' };
    }

    return { type: 'UNKNOWN_ERROR', status, retryable: false, userMessage: error?.message || 'Claude request failed.' };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new LLMService();
