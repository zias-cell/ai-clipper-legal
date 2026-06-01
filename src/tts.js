// Text-to-speech with a pluggable, free provider chain.
// Tries each provider in config.tts.providers until one produces audio.
//
//   edge   -> Microsoft Edge neural voices (`edge-tts` python pkg). Best
//             quality, free, no API key, needs internet.
//   espeak -> espeak-ng, fully offline, robotic but always-on if installed.
//   silent -> generated silence sized to estimated read time. Never fails.
//
// Each provider returns { audioPath, durationSec }.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import config from './config.js';

const exec = promisify(execFile);
const ffprobePath = ffprobeStatic.path;

async function commandExists(cmd) {
  try {
    await exec(cmd, ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Probe an audio file's duration in seconds.
export async function probeDuration(file) {
  const { stdout } = await exec(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

// --- edge-tts (neural, online, free) ---
async function tryEdge(text, outPath) {
  if (!(await commandExists('edge-tts'))) return null;
  const mp3 = outPath.replace(/\.\w+$/, '.mp3');
  await exec('edge-tts', [
    '--voice', config.tts.edgeVoice,
    '--rate', config.tts.edgeRate,
    '--text', text,
    '--write-media', mp3,
  ], { timeout: 60000 });
  return mp3;
}

// --- espeak-ng (offline, robotic) ---
async function tryEspeak(text, outPath) {
  const bin = (await commandExists('espeak-ng')) ? 'espeak-ng'
    : (await commandExists('espeak')) ? 'espeak' : null;
  if (!bin) return null;
  const wav = outPath.replace(/\.\w+$/, '.wav');
  await exec(bin, ['-v', config.tts.espeakVoice, '-s', '165', '-w', wav, text], {
    timeout: 60000,
  });
  return wav;
}

// --- silent fallback (always works) ---
async function trySilent(text, outPath, estDurationSec) {
  const wav = outPath.replace(/\.\w+$/, '.wav');
  const dur = Math.max(3, estDurationSec || 5).toFixed(2);
  await exec(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
    '-t', dur,
    wav,
  ], { timeout: 30000 });
  return wav;
}

// Synthesize narration for one script. `estDurationSec` is used only by
// the silent fallback. Returns { audioPath, durationSec, provider }.
export async function synthesize(text, outPath, estDurationSec) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  for (const provider of config.tts.providers) {
    try {
      let audioPath = null;
      if (provider === 'edge') audioPath = await tryEdge(text, outPath);
      else if (provider === 'espeak') audioPath = await tryEspeak(text, outPath);
      else if (provider === 'silent') audioPath = await trySilent(text, outPath, estDurationSec);

      if (audioPath) {
        const durationSec = await probeDuration(audioPath);
        return { audioPath, durationSec, provider };
      }
    } catch (err) {
      console.warn(`  ! TTS provider "${provider}" failed: ${err.message}`);
    }
  }
  throw new Error('All TTS providers failed (even silent fallback).');
}

export default synthesize;
