const logger = require('../core/logger').createServiceLogger('LLM-HOSTED');

const REQUEST_TIMEOUT_MS = 90000;

/**
 * Sends a Claude request through the OpenCluely dashboard instead of calling
 * Anthropic directly, so a linked desktop app never needs an API key: the
 * device token authenticates it and the server holds ANTHROPIC_API_KEY.
 *
 * The route answers with a plain-text stream, which is forwarded chunk by
 * chunk so the overlay still renders tokens as they arrive.
 */
async function sendHostedRequest(account, payload, { onDelta = null, signal = null } = {}) {
  if (!account || !account.isLinked()) {
    throw new Error('Desktop app is not linked to an OpenCluely account');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${account.apiBaseUrl.replace(/\/$/, '')}/api/assistant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${account.deviceToken}`
      },
      body: JSON.stringify({
        system: payload.system,
        messages: payload.messages,
        maxTokens: payload.max_tokens
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const error = new Error(details.error || `Dashboard responded with ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const decoder = new TextDecoder();
    let accumulated = '';

    for await (const chunk of response.body) {
      const text = decoder.decode(chunk, { stream: true });
      if (!text) continue;

      accumulated += text;
      if (onDelta) {
        try {
          onDelta(text, accumulated);
        } catch (error) {
          logger.warn('Stream delta handler failed', { error: error.message });
        }
      }
    }
    accumulated += decoder.decode();

    return accumulated.trim();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendHostedRequest };
