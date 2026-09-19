// Exercises the local audio path end to end without a microphone: ffmpeg
// capture -> energy VAD -> whisper.cpp -> `transcription` events. The capture
// device is overridden to a WAV file, which ffmpeg replays at realtime speed.
//
//   npm run test-audio -- path/to/speech.wav
require('dotenv').config();

const SAMPLE = process.argv[2];

if (!SAMPLE) {
  console.error('Usage: npm run test-audio -- <wav-file> [expected text]');
  process.exit(1);
}

const EXPECTED = (process.argv[3] || '').toLowerCase();

process.env.SPEECH_PROVIDER = 'whisper';
process.env.SPEECH_AUDIO_SOURCE = 'system';
process.env.SPEECH_AUDIO_DEVICE = SAMPLE;

const speechService = require('../src/services/speech.service');

const transcripts = [];

speechService.on('transcription', (text) => {
  transcripts.push(text);
  console.log('transcription:', text);
});
speechService.on('status', (status) => console.log('status:', status));
speechService.on('error', (error) => console.error('error:', error));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const status = speechService.getStatus();
  console.log('Engine:', JSON.stringify(status.engine));

  if (!speechService.isAvailable()) {
    console.error('Local speech-to-text is not available; run ./setup.sh first');
    process.exit(1);
  }

  speechService.startRecording();

  // Capture runs in realtime, so wait for the clip plus transcription slack.
  const idleLimitMs = 8000;
  let lastCount = 0;
  let idleSince = Date.now();

  while (Date.now() - idleSince < idleLimitMs) {
    await wait(250);
    if (transcripts.length !== lastCount) {
      lastCount = transcripts.length;
      idleSince = Date.now();
    }
  }

  speechService.stopRecording();

  while (speechService.transcriptionInFlight || speechService.utteranceQueue.length) {
    await wait(100);
  }

  speechService.dispose();

  const joined = transcripts.join(' ').toLowerCase();
  const ok = transcripts.length > 0 && (!EXPECTED || joined.includes(EXPECTED));

  console.log(`${transcripts.length} utterance(s) transcribed`);
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
