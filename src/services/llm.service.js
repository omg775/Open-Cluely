const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class LLMService {
  constructor() {
    this.client = null;
    this.model = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.apiKey = null; // in-memory override for configured API key

    this.initializeClient();
  }

  initializeClient() {
    // Prefer any runtime-configured key (set via updateApiKey), otherwise fall back to env-derived key
    const apiKey = this.apiKey || config.getApiKey('GEMINI');

    // Accept any non-empty string to natively support the AQ. format keys
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' || apiKey === 'your-api-key-here') {
      logger.warn('Gemini API key not configured', {
        keyExists: !!apiKey,
        isPlaceholder: apiKey === 'your-api-key-here'
      });
      return;
    }

    try {
      this.client = new GoogleGenerativeAI(apiKey.trim());

      // Use the correct model name for v1 API
      const modelName = config.get('llm.gemini.model');
      this.model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: this.getGenerationConfig()
      });
      this.isInitialized = true;

      logger.info('Gemini AI client initialized successfully', {
        model: modelName
      });
    } catch (error) {
      logger.error('Failed to initialize Gemini client', {
        error: error.message
      });
    }
  }

  // Allow runtime update of the Gemini API key (called from main IPC handler)
  updateApiKey(apiKey) {
    try {
      this.apiKey = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null;

      // Mirror into process.env for convenience so other code reading env sees it
      if (this.apiKey) {
        process.env.GEMINI_API_KEY = this.apiKey;
      } else {
        delete process.env.GEMINI_API_KEY;
      }

      // Reset and reinitialize client with new key
      this.isInitialized = false;
      this.client = null;
      this.model = null;
      this.initializeClient();

      return { success: !!this.isInitialized };
    } catch (error) {
      logger.error('Failed to update Gemini API key', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // Return quick status for UI (used by get-gemini-status IPC)
  getStats() {
    const hasApiKey = !!(this.apiKey || config.getApiKey('GEMINI'));
    return {
      hasApiKey,
      model: config.get('llm.gemini.model') || 'gemini-pro',
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount
    };
  }

  // Lightweight connection test: network preflight + small API call using alternative HTTP method
  async testConnection() {
    const apiKey = this.apiKey || config.getApiKey('GEMINI');
    if (!apiKey) return { success: false, error: 'No Gemini API key configured' };

    try {
      // Basic network reachability check
      await this.testNetworkConnection({ host: 'generativelanguage.googleapis.com', port: 443, name: 'Gemini API Endpoint' });

      // Send a tiny test request via the HTTPS fallback path (simpler to introspect)
      const testReq = {
        contents: [
          { role: 'user', parts: [{ text: 'Ping' }] }
        ]
      };
      this.applyGenerationDefaults(testReq);

      const resp = await this.executeAlternativeRequest(testReq);
      if (typeof resp === 'string' && resp.trim().length > 0) {
        return { success: true, responseSnippet: resp.substring(0, 200) };
      }

      return { success: false, error: 'Empty response from API' };
    } catch (error) {
      logger.error('Gemini connection test failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  getGenerationConfig(overrides = {}) {
    const defaults = config.get('llm.gemini.generation') || {};
    const fallback = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 4096
    };

    const merged = { ...fallback, ...defaults, ...overrides };
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  applyGenerationDefaults(request, overrides = {}) {
    request.generationConfig = this.getGenerationConfig({ ...(request.generationConfig || {}), ...overrides });
    return request;
  }

  extractTextFromCandidates(response) {
    const candidates = Array.isArray(response?.candidates)
      ? response.candidates
      : Array.isArray(response)
        ? response
        : [];

    if (!candidates.length) {
      throw new Error('No candidates in Gemini response');
    }

    const candidateWithText = candidates.find(candidate => {
      const parts = candidate?.content?.parts;
      return Array.isArray(parts) && parts.some(part => typeof part.text === 'string' && part.text.trim().length > 0);
    });

    if (!candidateWithText) {
      const finishReasons = candidates.map(c => c.finishReason || 'unknown').join(', ');
      throw new Error(`No text parts in candidates. Finish reasons: ${finishReasons}`);
    }

    const textParts = candidateWithText.content.parts
      .filter(part => typeof part.text === 'string' && part.text.trim().length > 0)
      .map(part => part.text.trim());

    if (!textParts.length) {
      throw new Error(`Candidate parts missing text after filtering: ${JSON.stringify(candidateWithText)}`);
    }

    const text = textParts.join('\n');

    return {
      text,
      candidate: candidateWithText,
      finishReason: candidateWithText.finishReason || null
    };
  }

  /**
   * Process an image directly with Gemini using the active skill prompt.
   * The image buffer is sent as inlineData alongside a concise instruction.
   * For image-based queries, we include the skill prompt (e.g., DSA) as systemInstruction.
   */
  async processImageWithSkill(imageBuffer, mimeType, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided to processImageWithSkill');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      const { promptLoader } = require('../../prompt-loader');
      const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
      const base64 = imageBuffer.toString('base64');

      const request = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: this.formatImageInstruction(activeSkill, programmingLanguage) },
              { inlineData: { data: base64, mimeType } }
            ]
          }
        ]
      };

      this.applyGenerationDefaults(request);

      if (skillPrompt && skillPrompt.trim().length > 0) {
        request.systemInstruction = { parts: [{ text: skillPrompt }] };
      }

      const preferAlternative = !!config.get('llm.gemini.enableFallbackMethod');
      let responseText;
      try {
        if (preferAlternative) {
          responseText = await this.executeAlternativeRequest(request);
        } else {
          responseText = await this.executeRequest(request);
        }
      } catch (error) {
        const secondaryFn = preferAlternative ? this.executeRequest.bind(this) : this.executeAlternativeRequest.bind(this);
        try { responseText = await secondaryFn(request); } catch (secondaryError) { throw secondaryError; }
      }

      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(responseText, programmingLanguage) : responseText;

      logger.logPerformance('LLM image processing', startTime, { activeSkill, imageSize: imageBuffer.length, responseLength: finalResponse.length, programmingLanguage: programmingLanguage || 'not specified', requestId: this.requestCount });

      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false, isImageAnalysis: true, mimeType } };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM image processing failed', { error: error.message, activeSkill, requestId: this.requestCount });
      if (config.get('llm.gemini.fallbackEnabled')) return this.generateFallbackResponse('[image]', activeSkill);
      throw error;
    }
  }

  formatImageInstruction(activeSkill, programmingLanguage) {
    const langNote = programmingLanguage ? ` Use only ${programmingLanguage.toUpperCase()} for any code.` : '';
    return `Analyze this image for a ${activeSkill.toUpperCase()} question. Extract the problem concisely and provide the best possible solution with explanation and final code.${langNote}`;
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    const startTime = Date.now(); this.requestCount++;
    try {
      const geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const preferAlternative = !!config.get('llm.gemini.enableFallbackMethod');
      let response;
      try {
        response = preferAlternative ? await this.executeAlternativeRequest(geminiRequest) : await this.executeRequest(geminiRequest);
      } catch (error) {
        const secondaryFn = preferAlternative ? this.executeRequest.bind(this) : this.executeAlternativeRequest.bind(this);
        response = await secondaryFn(geminiRequest);
      }
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(response, programmingLanguage) : response;
      logger.logPerformance('LLM text processing', startTime, { activeSkill, textLength: text.length, responseLength: finalResponse.length, programmingLanguage: programmingLanguage || 'not specified', requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false } };
    } catch (error) {
      this.errorCount++; logger.error('LLM processing failed', { error: error.message, activeSkill, requestId: this.requestCount });
      if (config.get('llm.gemini.fallbackEnabled')) return this.generateFallbackResponse(text, activeSkill);
      throw error;
    }
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    const startTime = Date.now(); this.requestCount++;
    try {
      const geminiRequest = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const preferAlternative = !!config.get('llm.gemini.enableFallbackMethod');
      let response;
      try { response = preferAlternative ? await this.executeAlternativeRequest(geminiRequest) : await this.executeRequest(geminiRequest); } catch (error) { const secondaryFn = preferAlternative ? this.executeRequest.bind(this) : this.executeAlternativeRequest.bind(this); response = await secondaryFn(geminiRequest); }
      const finalResponse = programmingLanguage ? this.enforceProgrammingLanguage(response, programmingLanguage) : response;
      logger.logPerformance('LLM transcription processing', startTime, { activeSkill, textLength: text.length, responseLength: finalResponse.length, programmingLanguage: programmingLanguage || 'not specified', requestId: this.requestCount });
      return { response: finalResponse, metadata: { skill: activeSkill, programmingLanguage, processingTime: Date.now() - startTime, requestId: this.requestCount, usedFallback: false, isTranscriptionResponse: true } };
    } catch (error) {
      this.errorCount++; logger.error('LLM transcription processing failed', { error: error.message, activeSkill, requestId: this.requestCount });
      if (config.get('llm.gemini.fallbackEnabled')) return this.generateIntelligentFallbackResponse(text, activeSkill);
      throw error;
    }
  }

  enforceProgrammingLanguage(text, programmingLanguage) {
    try {
      if (!text || !programmingLanguage) return text;
      const norm = String(programmingLanguage).toLowerCase();
      const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' };
      const fenceTag = fenceTagMap[norm] || norm || 'text';
      const replacedBackticks = text.replace(/```([^\n]*)\n/g, (match, info) => { const current = (info || '').trim(); if (current.split(/\s+/)[0].toLowerCase() === fenceTag) return match; return '```' + fenceTag + '\n'; });
      const normalizedTildes = replacedBackticks.replace(/~~~([^\n]*)\n/g, () => '```' + fenceTag + '\n');
      return normalizedTildes;
    } catch (_) { return text; }
  }

  buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    const sessionManager = require('../managers/session.manager');
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(15);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }
    const requestComponents = promptLoader.getRequestComponents(activeSkill, text, sessionMemory, programmingLanguage);
    const request = { contents: [] };
    this.applyGenerationDefaults(request);
    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) request.systemInstruction = { parts: [{ text: requestComponents.skillPrompt }] };
    request.contents.push({ role: 'user', parts: [{ text: this.formatUserMessage(text, activeSkill) }] });
    return request;
  }

  buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = { contents: [] };
    this.applyGenerationDefaults(request);
    if (skillContext.skillPrompt) request.systemInstruction = { parts: [{ text: skillContext.skillPrompt }] };
    const conversationContents = conversationHistory.filter(event => event.role !== 'system' && event.content && typeof event.content === 'string' && event.content.trim().length > 0).map(event => { const content = event.content.trim(); return { role: event.role === 'model' ? 'model' : 'user', parts: [{ text: content }] }; });
    request.contents.push(...conversationContents);
    const formattedMessage = this.formatUserMessage(text, activeSkill);
    if (!formattedMessage || formattedMessage.trim().length === 0) throw new Error('Failed to format user message or message is empty');
    request.contents.push({ role: 'user', parts: [{ text: formattedMessage }] });
    return request;
  }

  buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) throw new Error('Empty or invalid transcription text provided to buildIntelligentTranscriptionRequest');
    const sessionManager = require('../managers/session.manager');
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(10);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildIntelligentTranscriptionRequestWithHistory(cleanText, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }
    const request = { contents: [] };
    this.applyGenerationDefaults(request);
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    if (!intelligentPrompt) throw new Error('Failed to generate intelligent transcription prompt');
    request.systemInstruction = { parts: [{ text: intelligentPrompt }] };
    request.contents.push({ role: 'user', parts: [{ text: cleanText }] });
    return request;
  }

  buildIntelligentTranscriptionRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = { contents: [] };
    this.applyGenerationDefaults(request);
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    request.systemInstruction = { parts: [{ text: intelligentPrompt }] };
    const conversationContents = conversationHistory.filter(event => event.role !== 'system' && event.content && typeof event.content === 'string' && event.content.trim().length > 0).slice(-8).map(event => { const content = event.content.trim(); if (!content) { logger.warn('Empty content found in conversation history', { event }); return null; } return { role: event.role === 'model' ? 'model' : 'user', parts: [{ text: content }] }; }).filter(content => content !== null);
    request.contents.push(...conversationContents);
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) throw new Error('Empty or invalid transcription text provided');
    request.contents.push({ role: 'user', parts: [{ text: cleanText }] });
    if (request.contents.length === 0) throw new Error('No valid content to send to Gemini API');
    return request;
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    let prompt = `# Intelligent Transcription Response System\n\nAssume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to intelligently respond to question/message with appropriate brevity.\nAssume you are in an interview and you need to perform best in ${activeSkill.toUpperCase()} mode.\nAlways respond to the point, do not repeat the question or unnecessary information which is not related to ${activeSkill}.`;
    if (programmingLanguage) { const lang = String(programmingLanguage).toLowerCase(); const languageMap = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', js: 'JavaScript' }; const fenceTagMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', js: 'javascript' }; const languageTitle = languageMap[lang] || (lang.charAt(0).toUpperCase() + lang.slice(1)); const fenceTag = fenceTagMap[lang] || lang || 'text'; prompt += `\n\nCODING CONTEXT: Respond ONLY in ${languageTitle}. All code blocks must use triple backticks with language tag \`\`\`${fenceTag}\`\`\`. Do not include other languages unless explicitly asked.`; }
    prompt += `\n\n## Response Rules:\n\n- Give STRAIGHT, CONCISE, and DIRECT answers.\n- You MUST answer ALL questions asked by the user, including general knowledge questions, general conversation, or off-topic queries.\n- Avoid being verbose. Do NOT give long, detailed explanations unless explicitly asked.\n- Get straight to the point in 1-3 sentences maximum for general questions.\n- For coding questions, provide the code immediately and keep the explanation extremely brief.\n- Do NOT reject any topic or question.\n\n## Response Format:\n- Keep responses short and straight to the point.\n- Be encouraging but brief.\n\nIf the user's input is a coding or DSA problem statement and contains no code, produce a complete, runnable solution in the selected programming language without asking for more details. Always include the final implementation in a properly tagged code block.\n\nRemember: Provide detailed and helpful responses for ALL questions, general or skill-related.`;
    return prompt;
  }

  formatUserMessage(text, activeSkill) { return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`; }

  async executeRequest(geminiRequest) {
    const maxRetries = config.get('llm.gemini.maxRetries');
    const timeout = config.get('llm.gemini.timeout');
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.performPreflightCheck();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeout));
        const requestPromise = this.model.generateContent(geminiRequest);
        const result = await Promise.race([requestPromise, timeoutPromise]);
        if (!result.response) throw new Error('Empty response from Gemini API');
        const { text, finishReason } = this.extractTextFromCandidates(result.response);
        return text;
      } catch (error) {
        const errorInfo = this.analyzeError(error);
        if (attempt === maxRetries) { const finalError = new Error(`Gemini API failed after ${maxRetries} attempts: ${error.message}`); finalError.errorAnalysis = errorInfo; finalError.originalError = error; throw finalError; }
        const baseDelay = errorInfo.isNetworkError ? 2500 : 1500; const delay = baseDelay * attempt + Math.random() * 1000; await this.delay(delay);
      }
    }
  }

  async performPreflightCheck() {
    try { await this.testNetworkConnection({ host: 'generativelanguage.googleapis.com', port: 443, name: 'Gemini API Endpoint' }); } catch (error) { logger.warn('Preflight check failed', { error: error.message }); }
  }

  // Try to obtain an access token from a service account JSON file if configured.
  // Expects process.env.GEMINI_SERVICE_ACCOUNT to be a path to the JSON key file.
  async getServiceAccountAccessToken() {
    try {
      const saPath = process.env.GEMINI_SERVICE_ACCOUNT || null;
      if (!saPath) return null;

      const fs = require('fs');
      if (!fs.existsSync(saPath)) {
        logger.warn('GEMINI_SERVICE_ACCOUNT file not found, skipping service-account auth', { path: saPath });
        return null;
      }

      // Cache client instance to avoid reloading the JSON every call
      if (!this._saClient || this._saClientKeyPath !== saPath) {
        const { GoogleAuth } = require('google-auth-library');
        const auth = new GoogleAuth({ keyFilename: saPath, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        this._saClient = await auth.getClient();
        this._saClientKeyPath = saPath;
      }

      const tokenResponse = await this._saClient.getAccessToken();
      const token = tokenResponse?.token || tokenResponse || null;
      if (!token) {
        logger.warn('Service account did not return an access token');
        return null;
      }

      return token;
    } catch (error) {
      logger.error('Failed to obtain service-account access token', { error: error.message });
      return null;
    }
  }

  getUserAgent() { try { if (typeof navigator !== 'undefined' && navigator.userAgent) return navigator.userAgent; return `Node.js/${process.version} (${process.platform}; ${process.arch})`; } catch { return 'Unknown'; } }

  analyzeError(error) {
    const errorMessage = String((error && error.message) || '').toLowerCase();
    if (errorMessage.includes('fetch failed') || errorMessage.includes('network error') || errorMessage.includes('enotfound') || errorMessage.includes('econnrefused') || errorMessage.includes('timeout')) return { type: 'NETWORK_ERROR', isNetworkError: true, suggestedAction: 'Check internet connection and firewall settings' };
    if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid api key') || errorMessage.includes('forbidden')) return { type: 'AUTH_ERROR', isNetworkError: false, suggestedAction: 'Verify Gemini API key configuration' };
    if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) return { type: 'RATE_LIMIT_ERROR', isNetworkError: false, suggestedAction: 'Wait before retrying or check API quota' };
    if (errorMessage.includes('request timeout') || errorMessage.includes('etimedout')) return { type: 'TIMEOUT_ERROR', isNetworkError: true, suggestedAction: 'Check network latency or increase timeout' };
    return { type: 'UNKNOWN_ERROR', isNetworkError: false, suggestedAction: 'Check logs for more details' };
  }

  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async testNetworkConnection(target) {
    return new Promise((resolve, reject) => {
      const net = require('net'); const socket = new net.Socket(); socket.setTimeout(2500);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); reject(new Error(`Connection timeout to ${target.name}`)); });
      socket.on('error', (err) => { socket.destroy(); reject(err); });
      socket.connect(target.port, target.host);
    });
  }

  // Fallback mechanisms if primary connection drops entirely
  async executeAlternativeRequest(geminiRequest) {
    const https = require('https');
    // Prefer a runtime-updated API key when available (set via updateApiKey)
    const apiKey = this.apiKey || config.getApiKey('GEMINI');
    const modelName = config.get('llm.gemini.model') || 'gemini-pro';

    return new Promise(async (resolve, reject) => {
      try {
        const payload = JSON.stringify(geminiRequest);

        // If a service account is configured, prefer a Bearer token Authorization header
        const saToken = await this.getServiceAccountAccessToken();

        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': this.getUserAgent()
        };

        let path = `/v1beta/models/${modelName}:generateContent`;

        if (saToken) {
          headers['Authorization'] = `Bearer ${saToken}`;
        } else if (apiKey) {
          // Use API key as query param if no service account token
          path += `?key=${apiKey}`;
        } else {
          return reject(new Error('No API key or service-account credentials available for alternative request'));
        }

        const options = {
          hostname: 'generativelanguage.googleapis.com',
          port: 443,
          path,
          method: 'POST',
          headers,
          timeout: config.get('llm.gemini.timeout') || 10000
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode !== 200) {
                return reject(new Error(`HTTPS fallback error code ${res.statusCode}: ${parsed.error?.message || data}`));
              }
              const extract = this.extractTextFromCandidates(parsed);
              resolve(extract.text);
            } catch (e) {
              reject(new Error(`Failed parsing alternative endpoint payload: ${e.message}`));
            }
          });
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => { req.destroy(); reject(new Error('Alternative method connection timeout')); });

        req.write(payload);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  generateFallbackResponse(text, skill) { return Promise.resolve({ response: "System is operating under high bandwidth conditions. Please retry your inquiry shortly.", metadata: { skill, usedFallback: true } }); }

  generateIntelligentFallbackResponse(text, skill) { return Promise.resolve({ response: "I am encountered a temporary network delay processing your vocal audio sequence. Please ask again.", metadata: { skill, usedFallback: true, isTranscriptionResponse: true } }); }
}

module.exports = new LLMService();