const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const logger = require('../core/logger').createServiceLogger('ACCOUNT');

const PROTOCOL = 'opencluely';
const STATE_FILENAME = 'account.json';
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Links the desktop app to an OpenCluely web account.
 *
 * The dashboard opens `opencluely://auth?token=…&api=…` with a single-use
 * token; that token is exchanged for a long-lived device token which is then
 * used to pull settings and report session metadata (never content).
 */
class AccountService extends EventEmitter {
  constructor() {
    super();

    this.deviceToken = null;
    this.apiBaseUrl = null;
    this.email = null;

    this.remoteSessionId = null;
    this.sessionStartedAt = 0;
    this.utteranceCount = 0;
    this.answerCount = 0;
    this.startPromise = null;
    this.pendingCompletion = null;
  }

  /**
   * Deep links are attacker-reachable, so the dashboard origin they carry is
   * only accepted over TLS (or on loopback for local development), and can be
   * pinned outright with OPENCLUELY_API_URL.
   */
  static normalizeApiBaseUrl(value) {
    let url;

    try {
      url = new URL(value);
    } catch (error) {
      throw new Error('Launch link has an invalid dashboard URL');
    }

    const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      throw new Error('Launch links must point at an https dashboard');
    }

    const pinned = (process.env.OPENCLUELY_API_URL || '').trim();
    if (pinned && new URL(pinned).origin !== url.origin) {
      throw new Error(`Launch link points at ${url.origin}, which is not the configured dashboard`);
    }

    return url.origin;
  }

  statePath() {
    return path.join(app.getPath('userData'), STATE_FILENAME);
  }

  load() {
    try {
      const file = this.statePath();
      if (!fs.existsSync(file)) return false;

      const state = JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
      this.deviceToken = state.deviceToken || null;
      this.apiBaseUrl = state.apiBaseUrl || null;
      this.email = state.email || null;

      return !!this.deviceToken;
    } catch (error) {
      logger.error('Failed to load account state', { error: error.message });
      return false;
    }
  }

  save() {
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(
        this.statePath(),
        JSON.stringify({
          deviceToken: this.deviceToken,
          apiBaseUrl: this.apiBaseUrl,
          email: this.email
        }, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      logger.error('Failed to persist account state', { error: error.message });
    }
  }

  unlink() {
    this.deviceToken = null;
    this.email = null;
    this.remoteSessionId = null;

    try {
      fs.rmSync(this.statePath(), { force: true });
    } catch (error) {
      logger.error('Failed to clear account state', { error: error.message });
    }

    this.emit('unlinked');
  }

  isLinked() {
    return !!(this.deviceToken && this.apiBaseUrl);
  }

  getStatus() {
    return {
      linked: this.isLinked(),
      email: this.email,
      apiBaseUrl: this.apiBaseUrl
    };
  }

  registerProtocol() {
    try {
      // In development Electron owns argv[0], so the executable and the script
      // path have to be passed explicitly for the handler to resolve.
      const registered = app.isPackaged
        ? app.setAsDefaultProtocolClient(PROTOCOL)
        : app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1] || '.')]);

      logger.info('Protocol handler registration', { protocol: PROTOCOL, registered });
      return registered;
    } catch (error) {
      logger.error('Failed to register protocol handler', { error: error.message });
      return false;
    }
  }

  static findDeepLink(argv = []) {
    return argv.find(argument => typeof argument === 'string' && argument.startsWith(`${PROTOCOL}://`)) || null;
  }

  /**
   * Exchange the single-use launch token from a deep link for a device token.
   * Resolves with the account settings so the caller can apply them.
   */
  async handleDeepLink(deepLink) {
    let url;

    try {
      url = new URL(deepLink);
    } catch (error) {
      throw new Error('Malformed launch link');
    }

    if (url.host !== 'auth' && url.pathname.replace(/\//g, '') !== 'auth') {
      throw new Error(`Unsupported launch link: ${url.host || url.pathname}`);
    }

    const token = url.searchParams.get('token');
    const requestedBaseUrl = url.searchParams.get('api') || this.apiBaseUrl;

    if (!token) throw new Error('Launch link is missing its token');
    if (!requestedBaseUrl) throw new Error('Launch link is missing the dashboard URL');

    const apiBaseUrl = AccountService.normalizeApiBaseUrl(requestedBaseUrl);

    const payload = await this.request(apiBaseUrl, '/api/device/exchange', {
      method: 'POST',
      body: { token, label: `${os.hostname()} (${process.platform})` }
    });

    this.deviceToken = payload.deviceToken;
    this.apiBaseUrl = apiBaseUrl;
    this.email = payload.email || this.email;
    this.save();

    logger.info('Desktop app linked to account', { apiBaseUrl: this.apiBaseUrl });
    this.emit('linked', this.getStatus());

    return {
      settings: payload.settings || {},
      documents: Array.isArray(payload.documents) ? payload.documents : []
    };
  }

  async fetchConfig() {
    if (!this.isLinked()) throw new Error('Desktop app is not linked to an account');

    const payload = await this.request(this.apiBaseUrl, '/api/device/config', { method: 'GET' });
    if (payload.email) {
      this.email = payload.email;
      this.save();
    }

    return {
      settings: payload.settings || {},
      documents: Array.isArray(payload.documents) ? payload.documents : []
    };
  }

  // ---------------------------------------------------------------------------
  // Session metadata (start time, duration, counts — never transcript content)
  // ---------------------------------------------------------------------------

  async startSession(model) {
    if (!this.isLinked() || this.remoteSessionId || this.startPromise) return null;

    this.sessionStartedAt = Date.now();
    this.utteranceCount = 0;
    this.answerCount = 0;

    this.startPromise = this.request(this.apiBaseUrl, '/api/device/sessions', {
      method: 'POST',
      body: { model: model || null }
    })
      .then(payload => {
        this.remoteSessionId = payload.sessionId || null;
        return this.remoteSessionId;
      })
      .catch(error => {
        logger.warn('Could not report session start', { error: error.message });
        return null;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  recordUtterance() {
    if (this.remoteSessionId || this.startPromise) this.utteranceCount++;
  }

  recordAnswer() {
    if (this.remoteSessionId || this.startPromise) this.answerCount++;
  }

  /**
   * Closes the remote session. A stop that arrives while the session is still
   * being created waits for the id, so a short recording cannot leak its
   * metadata into the next one.
   */
  async endSession() {
    if (this.startPromise) await this.startPromise;
    if (!this.remoteSessionId) return;

    this.pendingCompletion = {
      sessionId: this.remoteSessionId,
      durationSeconds: Math.round((Date.now() - this.sessionStartedAt) / 1000),
      utteranceCount: this.utteranceCount,
      answerCount: this.answerCount,
      ended: true
    };
    this.remoteSessionId = null;

    await this.flushPendingCompletion();
  }

  /**
   * Retries the completion so a transient dashboard failure does not leave the
   * session row stuck at zero duration.
   */
  async flushPendingCompletion(attempts = 3) {
    for (let attempt = 0; attempt < attempts && this.pendingCompletion; attempt++) {
      try {
        await this.request(this.apiBaseUrl, '/api/device/sessions', {
          method: 'PATCH',
          body: this.pendingCompletion
        });
        this.pendingCompletion = null;
        return true;
      } catch (error) {
        logger.warn('Could not report session end', { error: error.message, attempt: attempt + 1 });
        if (attempt < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }

    return !this.pendingCompletion;
  }

  hasUnreportedSession() {
    return !!(this.remoteSessionId || this.startPromise || this.pendingCompletion);
  }

  async request(baseUrl, route, { method = 'GET', body = null } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers = { accept: 'application/json' };
      if (body) headers['content-type'] = 'application/json';
      if (this.deviceToken && route !== '/api/device/exchange') {
        headers.authorization = `Bearer ${this.deviceToken}`;
      }

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${route}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && route === '/api/device/config') {
          this.unlink();
        }
        throw new Error(payload.error || `Dashboard responded with ${response.status}`);
      }

      return payload;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Dashboard did not respond in time');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = new AccountService();
module.exports.PROTOCOL = PROTOCOL;
module.exports.findDeepLink = AccountService.findDeepLink;
module.exports.normalizeApiBaseUrl = AccountService.normalizeApiBaseUrl;
