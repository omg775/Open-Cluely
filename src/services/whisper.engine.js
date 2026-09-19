const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const logger = require('../core/logger').createServiceLogger('SPEECH');

const SERVER_HOST = '127.0.0.1';
const SERVER_STARTUP_TIMEOUT_MS = 30000;

// whisper-server buffers stdout when piped, so its "listening" banner can
// arrive minutes late; probe the socket instead.
const portAccepting = (port) => new Promise((resolve) => {
  const socket = net.connect({ host: SERVER_HOST, port });
  const done = (value) => {
    socket.destroy();
    resolve(value);
  };

  socket.setTimeout(500);
  socket.on('connect', () => done(true));
  socket.on('timeout', () => done(false));
  socket.on('error', () => done(false));
});

const fileExists = (candidate) => {
  try {
    return !!candidate && fs.statSync(candidate).isFile();
  } catch (error) {
    return false;
  }
};

const probe = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 8000 });
  return {
    ok: !result.error && typeof result.status === 'number',
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
};

const parseCommand = (raw) => {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return { command: parts[0], baseArgs: parts.slice(1) };
};

const modelSearchDirs = (modelDir) => {
  const dirs = [];
  if (modelDir) dirs.push(modelDir);
  dirs.push(path.join(os.homedir(), '.cache', 'whisper.cpp'));
  dirs.push(path.join(os.homedir(), '.local', 'share', 'whisper.cpp'));
  dirs.push(path.join(os.homedir(), 'whisper.cpp', 'models'));
  dirs.push('/usr/local/share/whisper.cpp/models');
  dirs.push('/usr/share/whisper.cpp/models');
  return dirs;
};

// whisper.cpp wants a ggml-*.bin path; the Python CLI wants a bare model name.
const resolveModelFile = (model, modelDir) => {
  if (fileExists(model)) return model;

  const names = [`ggml-${model}.bin`, `${model}.bin`, model];
  for (const dir of modelSearchDirs(modelDir)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fileExists(candidate)) return candidate;
    }
  }

  return null;
};

const resolveWhisperCppBinary = (configured) => {
  const candidates = [];
  if (configured) candidates.push(parseCommand(configured));

  const homeBuild = path.join(os.homedir(), 'whisper.cpp', 'build', 'bin');
  ['whisper-cli', 'whisper-server'].forEach((name) => {
    candidates.push({ command: name, baseArgs: [] });
    candidates.push({ command: path.join(homeBuild, name), baseArgs: [] });
  });

  for (const candidate of candidates) {
    if (!candidate || !candidate.command) continue;
    const { ok, output } = probe(candidate.command, [...candidate.baseArgs, '--help']);
    if (ok && /whisper/i.test(output)) {
      const isServer = /server/.test(path.basename(candidate.command));
      return { ...candidate, kind: isServer ? 'server' : 'cli' };
    }
  }

  return null;
};

// The warm server can't do one-shot files, so keep a CLI around for fallback.
const cliBinaryFor = (binary) => {
  if (!binary) return null;
  if (binary.kind === 'cli') return binary;

  const sibling = path.join(path.dirname(binary.command), 'whisper-cli');
  if (fileExists(sibling)) return { command: sibling, baseArgs: [], kind: 'cli' };

  const { ok, output } = probe('whisper-cli', ['--help']);
  if (ok && /whisper/i.test(output)) return { command: 'whisper-cli', baseArgs: [], kind: 'cli' };

  return null;
};

const serverBinaryFor = (cliBinary) => {
  if (!cliBinary) return null;
  if (cliBinary.kind === 'server') return cliBinary;

  const sibling = path.join(path.dirname(cliBinary.command), 'whisper-server');
  if (fileExists(sibling)) return { command: sibling, baseArgs: [], kind: 'server' };

  const { ok, output } = probe('whisper-server', ['--help']);
  if (ok && /whisper/i.test(output)) return { command: 'whisper-server', baseArgs: [], kind: 'server' };

  return null;
};

const resolvePythonWhisper = () => {
  const candidates = [
    { command: 'whisper', baseArgs: [] },
    { command: 'whisper.exe', baseArgs: [] },
    { command: 'py', baseArgs: ['-3', '-m', 'whisper'] },
    { command: 'python3', baseArgs: ['-m', 'whisper'] },
    { command: 'python', baseArgs: ['-m', 'whisper'] }
  ];

  for (const candidate of candidates) {
    const { ok, output } = probe(candidate.command, [...candidate.baseArgs, '--help']);
    if (ok && !output.includes('No module named whisper') && /--model/.test(output)) {
      return { ...candidate, kind: 'python' };
    }
  }

  return null;
};

const postWav = (port, wavBuffer, language, timeoutMs) => new Promise((resolve, reject) => {
  const boundary = `----opencluely${Date.now().toString(16)}`;
  const field = (name, value) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="utterance.wav"\r\n` +
      'Content-Type: audio/wav\r\n\r\n'
    ),
    wavBuffer,
    Buffer.from('\r\n'),
    field('temperature', '0.0'),
    field('response_format', 'text'),
    field('language', language),
    Buffer.from(`--${boundary}--\r\n`)
  ]);

  const request = http.request(
    {
      host: SERVER_HOST,
      port,
      path: '/inference',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      },
      timeout: timeoutMs
    },
    (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`whisper-server returned ${response.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        resolve(text);
      });
    }
  );

  request.on('timeout', () => request.destroy(new Error('whisper-server request timed out')));
  request.on('error', reject);
  request.end(body);
});

/**
 * Local, free speech-to-text. Preference order:
 *   1. whisper.cpp `whisper-server`, spawned once and kept warm — the model
 *      stays in memory, so an utterance costs inference time only.
 *   2. whisper.cpp `whisper-cli`, which reloads the model per utterance.
 *   3. The Python `whisper` CLI, which is slowest but needs no build step.
 */
class WhisperEngine {
  constructor() {
    this.mode = null;
    this.binary = null;
    this.serverBinary = null;
    this.serverProcess = null;
    this.serverPort = null;
    this.serverReady = null;
    this.settings = { model: 'base.en', modelDir: '', language: 'en', threads: 0, timeoutMs: 30000 };
  }

  configure(settings = {}) {
    const next = { ...this.settings, ...settings };
    const restartNeeded =
      next.model !== this.settings.model ||
      next.modelDir !== this.settings.modelDir ||
      next.language !== this.settings.language ||
      next.threads !== this.settings.threads;

    this.settings = next;
    if (restartNeeded) this.shutdownServer();

    return this.detect();
  }

  detect() {
    const cpp = resolveWhisperCppBinary(this.settings.command);

    if (cpp) {
      const modelFile = resolveModelFile(this.settings.model, this.settings.modelDir);

      if (modelFile) {
        this.binary = cliBinaryFor(cpp);
        this.modelFile = modelFile;
        this.serverBinary = serverBinaryFor(cpp);
        this.mode = this.serverBinary ? 'server' : 'cli';

        if (!this.binary && !this.serverBinary) {
          this.mode = null;
        }

        return this.describe();
      }

      logger.warn('whisper.cpp found but no model file matched', { model: this.settings.model });
    }

    const python = resolvePythonWhisper();
    if (python) {
      this.binary = python;
      this.modelFile = null;
      this.serverBinary = null;
      this.mode = 'python';
      return this.describe();
    }

    this.mode = null;
    this.binary = null;
    this.modelFile = null;
    this.serverBinary = null;
    return this.describe();
  }

  describe() {
    return {
      available: !!this.mode,
      mode: this.mode,
      command: this.binary
        ? [this.binary.command, ...this.binary.baseArgs].join(' ')
        : (this.serverBinary ? this.serverBinary.command : null),
      modelFile: this.modelFile || null,
      model: this.settings.model,
      warm: this.mode === 'server' && !!this.serverProcess
    };
  }

  isAvailable() {
    return !!this.mode;
  }

  async transcribe(wavBuffer) {
    if (!this.mode) throw new Error('No local speech-to-text engine available');

    if (this.mode === 'server') {
      try {
        const port = await this.ensureServer();
        const text = await postWav(port, wavBuffer, this.settings.language, this.settings.timeoutMs);
        return this.cleanup(text);
      } catch (error) {
        if (!this.binary) throw error;

        logger.warn('whisper-server transcription failed, using one-shot CLI', { error: error.message });
        this.shutdownServer();
        this.mode = 'cli';
      }
    }

    return this.transcribeWithCli(wavBuffer);
  }

  async ensureServer() {
    if (this.serverProcess && this.serverPort) return this.serverPort;
    if (this.serverReady) return this.serverReady;

    this.serverReady = this.startServer().finally(() => { this.serverReady = null; });
    return this.serverReady;
  }

  async startServer() {
    const port = 30000 + Math.floor(Math.random() * 20000);
    const args = [
      ...this.serverBinary.baseArgs,
      '-m', this.modelFile,
      '--host', SERVER_HOST,
      '--port', String(port),
      '-l', this.settings.language,
      '--no-timestamps',
      '--convert'
    ];

    if (this.settings.threads > 0) args.push('-t', String(this.settings.threads));

    const child = spawn(this.serverBinary.command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';

    const record = (chunk) => { log = `${log}${chunk.toString()}`.slice(-4000); };
    child.stdout.on('data', record);
    child.stderr.on('data', record);

    child.on('exit', (code) => {
      if (this.serverProcess === child) {
        this.serverProcess = null;
        this.serverPort = null;
        logger.warn('whisper-server exited', { code });
      }
    });

    const started = Date.now();
    while (Date.now() - started < SERVER_STARTUP_TIMEOUT_MS) {
      if (child.exitCode !== null) {
        throw new Error(log.trim() || `whisper-server exited with code ${child.exitCode}`);
      }

      if (await portAccepting(port)) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (child.exitCode !== null || !(await portAccepting(port))) {
      try {
        child.kill('SIGTERM');
      } catch (killError) {
        logger.warn('Failed to stop unresponsive whisper-server', { error: killError.message });
      }

      throw new Error(log.trim().slice(-300) || 'whisper-server failed to start');
    }

    this.serverProcess = child;
    this.serverPort = port;
    logger.info('whisper-server ready', { model: this.modelFile, port });
    return port;
  }

  shutdownServer() {
    if (!this.serverProcess) return;

    const child = this.serverProcess;
    this.serverProcess = null;
    this.serverPort = null;

    try {
      child.kill('SIGTERM');
    } catch (error) {
      logger.warn('Failed to stop whisper-server cleanly', { error: error.message });
    }
  }

  async transcribeWithCli(wavBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencluely-stt-'));
    const wavPath = path.join(tempDir, 'utterance.wav');

    try {
      fs.writeFileSync(wavPath, wavBuffer);
      return this.mode === 'python'
        ? await this.runPythonWhisper(wavPath, tempDir)
        : await this.runWhisperCpp(wavPath);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn('Failed to remove transcription temp dir', { error: error.message });
      }
    }
  }

  async runWhisperCpp(wavPath) {
    const args = [
      ...this.binary.baseArgs,
      '-m', this.modelFile,
      '-f', wavPath,
      '-l', this.settings.language,
      '--no-timestamps',
      '--no-prints'
    ];

    if (this.settings.threads > 0) args.push('-t', String(this.settings.threads));

    const { stdout } = await this.run(this.binary.command, args);
    return this.cleanup(stdout);
  }

  async runPythonWhisper(wavPath, tempDir) {
    const outputDir = path.join(tempDir, 'out');
    fs.mkdirSync(outputDir, { recursive: true });

    const args = [
      ...this.binary.baseArgs,
      wavPath,
      '--model', this.settings.model.replace(/\.bin$/, ''),
      '--language', this.settings.language,
      '--task', 'transcribe',
      '--output_format', 'txt',
      '--output_dir', outputDir,
      '--verbose', 'False',
      '--fp16', 'False'
    ];

    if (this.settings.modelDir) args.push('--model_dir', this.settings.modelDir);

    await this.run(this.binary.command, args);

    const transcriptPath = path.join(outputDir, `${path.parse(wavPath).name}.txt`);
    if (!fs.existsSync(transcriptPath)) return '';

    return this.cleanup(fs.readFileSync(transcriptPath, 'utf8'));
  }

  run(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Transcription timed out'));
      }, this.settings.timeoutMs);

      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}`));
      });
    });
  }

  // Whisper emits bracketed markers such as [BLANK_AUDIO] or (upbeat music)
  // for non-speech; those must not reach the model as if someone spoke.
  cleanup(rawText) {
    const text = String(rawText || '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return '';
    if (!/[a-z0-9]/i.test(text)) return '';

    return text;
  }
}

module.exports = WhisperEngine;
