const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const os = require('os');
const logger = require('../core/logger').createServiceLogger('SPEECH');

const SAMPLE_RATE = 16000;
const CHANNELS = 1;

// A capture source is what ffmpeg is pointed at. "microphone" is what the user
// says, "system" is what everyone else in the call says (the output device's
// loopback), and "both" mixes the two into one stream.
const SOURCES = ['microphone', 'system', 'both'];

const resolveFfmpeg = () => {
  const configured = process.env.FFMPEG_PATH;
  const candidates = configured ? [configured, 'ffmpeg'] : ['ffmpeg'];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-version'], { encoding: 'utf8', timeout: 5000 });
    if (!probe.error && probe.status === 0) return candidate;
  }

  return null;
};

const pactl = (args) => {
  const probe = spawnSync('pactl', args, { encoding: 'utf8', timeout: 5000 });
  if (probe.error || probe.status !== 0) return '';
  return (probe.stdout || '').trim();
};

// PulseAudio/PipeWire expose every output device as a ".monitor" source, which
// is how we hear the far end without a virtual cable.
const defaultLinuxMonitor = () => {
  const sink = pactl(['get-default-sink']);
  if (sink && !sink.includes('\n')) return `${sink}.monitor`;

  const sources = pactl(['list', 'short', 'sources']);
  const monitor = sources.split('\n').map((line) => line.split('\t')[1]).find((name) => name && name.endsWith('.monitor'));
  return monitor || null;
};

const darwinDevices = () => {
  const probe = spawnSync('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
    encoding: 'utf8',
    timeout: 8000
  });
  const output = `${probe.stdout || ''}${probe.stderr || ''}`;
  const audio = output.split('AVFoundation audio devices:')[1] || '';

  return audio
    .split('\n')
    .map((line) => line.match(/\[(\d+)\]\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => ({ index: match[1], name: match[2] }));
};

// macOS has no system-audio capture without a loopback driver, so we look for
// the common free ones (BlackHole, Soundflower) before giving up.
const darwinLoopbackIndex = () => {
  const match = darwinDevices().find(({ name }) => /blackhole|soundflower|loopback/i.test(name));
  return match ? match.index : null;
};

const windowsDshowLoopback = () => {
  const probe = spawnSync('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], {
    encoding: 'utf8',
    timeout: 8000
  });
  const output = `${probe.stdout || ''}${probe.stderr || ''}`;
  const names = [...output.matchAll(/"([^"]+)"\s*\(audio\)/g)].map((match) => match[1]);

  return names.find((name) => /stereo mix|what u hear|cable output|voicemeeter/i.test(name)) || null;
};

const PLATFORM_MIC = {
  linux: { format: 'pulse', device: 'default' },
  darwin: { format: 'avfoundation', device: ':default' },
  win32: { format: 'dshow', device: 'audio=default' }
};

const LOOPBACK_HINT = {
  linux: 'No PulseAudio/PipeWire monitor source found. Set SPEECH_AUDIO_DEVICE to a capture device.',
  darwin: 'No macOS loopback device found. Install BlackHole (free) or set SPEECH_AUDIO_DEVICE.',
  win32: 'No Windows loopback device found. Enable "Stereo Mix" or install VB-Cable, or set SPEECH_AUDIO_DEVICE.'
};

const platformLoopback = (platform) => {
  if (platform === 'linux') {
    const monitor = defaultLinuxMonitor();
    return monitor ? { format: 'pulse', device: monitor } : null;
  }

  if (platform === 'darwin') {
    const index = darwinLoopbackIndex();
    return index ? { format: 'avfoundation', device: `:${index}` } : null;
  }

  if (platform === 'win32') {
    const name = windowsDshowLoopback();
    return name ? { format: 'dshow', device: `audio=${name}` } : null;
  }

  return null;
};

// Each input is a complete ffmpeg source: the format flag plus the device string.
const resolveInputs = (source, deviceOverride) => {
  if (deviceOverride) {
    // "pulse:name", "dshow:audio=X", "avfoundation::2", or a plain file path.
    const separator = deviceOverride.indexOf(':');
    if (separator > 0) {
      const format = deviceOverride.slice(0, separator);
      const device = deviceOverride.slice(separator + 1);
      if (/^[a-z0-9_]+$/i.test(format)) return { inputs: [{ format, device }], source };
    }

    return { inputs: [{ format: null, device: deviceOverride }], source };
  }

  const platform = os.platform();
  const mic = PLATFORM_MIC[platform];

  if (!mic) {
    throw new Error(`Unsupported platform for audio capture: ${platform}`);
  }

  if (source === 'microphone') {
    return { inputs: [mic], source };
  }

  const loopback = platformLoopback(platform);

  if (!loopback) {
    if (source === 'system') {
      throw new Error(LOOPBACK_HINT[platform]);
    }

    // "both" degrades to the microphone rather than refusing to listen at all.
    return { inputs: [mic], source: 'microphone', warning: LOOPBACK_HINT[platform] };
  }

  return source === 'system'
    ? { inputs: [loopback], source }
    : { inputs: [mic, loopback], source };
};

const buildArgs = (inputs) => {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];

  inputs.forEach(({ format, device }) => {
    // A file input (no capture format) would otherwise be read as fast as the
    // disk allows; pace it so downstream endpointing behaves like a live call.
    if (!format) args.push('-re');
    if (format) args.push('-f', format);
    args.push('-i', device);
  });

  if (inputs.length > 1) {
    args.push('-filter_complex', `amix=inputs=${inputs.length}:duration=longest:normalize=0`);
  }

  args.push(
    '-ar', String(SAMPLE_RATE),
    '-ac', String(CHANNELS),
    '-f', 's16le',
    '-flush_packets', '1',
    'pipe:1'
  );

  return args;
};

/**
 * Streams 16 kHz mono PCM from the microphone, the system output loopback, or
 * both, and emits it as `data` buffers. ffmpeg is the only requirement, so the
 * whole capture path stays free and local.
 */
class AudioCapture extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.descriptor = null;
    this.stopping = false;
  }

  // Surfaced in settings so the user can tell whether the far end is audible.
  static describeSources() {
    const platform = os.platform();
    const loopback = platformLoopback(platform);

    return {
      ffmpeg: AudioCapture.isAvailable(),
      platform,
      microphone: !!PLATFORM_MIC[platform],
      loopback: loopback ? `${loopback.format}:${loopback.device}` : null,
      loopbackHint: loopback ? null : LOOPBACK_HINT[platform] || null
    };
  }

  static get sampleRate() {
    return SAMPLE_RATE;
  }

  static normalizeSource(value) {
    const source = String(value || '').trim().toLowerCase();
    return SOURCES.includes(source) ? source : 'microphone';
  }

  static isAvailable() {
    return !!resolveFfmpeg();
  }

  isRunning() {
    return !!this.process;
  }

  start({ source = 'microphone', device = '' } = {}) {
    if (this.process) return this.descriptor;

    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) {
      throw new Error('ffmpeg not found. Install ffmpeg or set FFMPEG_PATH to capture audio.');
    }

    const resolved = resolveInputs(AudioCapture.normalizeSource(source), String(device || '').trim());
    const args = buildArgs(resolved.inputs);

    this.stopping = false;
    this.process = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.descriptor = {
      source: resolved.source,
      requestedSource: AudioCapture.normalizeSource(source),
      warning: resolved.warning || null,
      inputs: resolved.inputs.map(({ format, device: name }) => (format ? `${format}:${name}` : name))
    };

    if (resolved.warning) {
      logger.warn('Falling back to microphone-only capture', { reason: resolved.warning });
    }

    let stderr = '';
    this.process.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });

    this.process.stdout.on('data', (chunk) => this.emit('data', chunk));

    this.process.on('error', (error) => {
      this.process = null;
      this.emit('error', error);
    });

    this.process.on('close', (code) => {
      const stoppedByUs = this.stopping;
      this.process = null;

      if (!stoppedByUs && code !== 0) {
        this.emit('error', new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      }

      this.emit('close', code);
    });

    logger.info('Audio capture started', this.descriptor);
    return this.descriptor;
  }

  stop() {
    if (!this.process) return;

    const child = this.process;
    this.stopping = true;
    this.process = null;

    try {
      child.kill('SIGTERM');
    } catch (error) {
      logger.warn('Failed to stop audio capture cleanly', { error: error.message });
    }
  }
}

module.exports = AudioCapture;
module.exports.SOURCES = SOURCES;
