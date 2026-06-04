// Composes a single vertical (9:16) news clip with FFmpeg:
//   animated gradient background  +  drawbox progress bar  +  an ASS
//   subtitle overlay (libass) carrying the brand header, category pill,
//   timed captions and source credit.
//
// We use libass (the `subtitles` filter) rather than `drawtext` because the
// bundled static FFmpeg ships libass but not libfreetype/drawtext, and ASS
// gives us proper styling, boxes and timing for free.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import config from './config.js';
import { timeline } from './captions.js';

const exec = promisify(execFile);
const { width, height, fps } = config.video;

// Two-stop gradient colors per category (FFmpeg 0xRRGGBB).
const GRADIENTS = {
  politics: ['0x0a1a3f', '0x2e7df6'],
  celebrity: ['0x2a0a2a', '0xff2d78'],
  default: ['0x141414', '0xffb703'],
};

// --- ASS helpers ---------------------------------------------------------

// "#RRGGBB" -> ASS "&H00BBGGRR" (ASS is BGR, alpha 00 = opaque).
function assColor(hex, alpha = '00') {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

// Seconds -> ASS timestamp H:MM:SS.cc
function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(ss)}.${pad(cs)}`;
}

// Neutralize ASS control chars; newlines -> hard break "\N".
function assText(text) {
  return String(text)
    .replace(/[{}]/g, '')
    .replace(/\\/g, '/')
    .replace(/\r?\n/g, '\\N');
}

// Build the ASS subtitle document for one clip.
function buildAss(beats, duration, category, source, attribution) {
  const t = config.text;
  const accent = t.accent[category] || t.accent.default;
  const white = '&H00FFFFFF';
  const black = '&H00000000';
  const box = '&H66000000'; // ~60% opaque black caption box

  const styles = [
    // Name, Fontname, Fontsize, Primary, Secondary, Outline, Back, Bold, Italic,
    // Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline,
    // Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
    `Style: Brand,DejaVu Sans,46,${white},${white},${assColor(accent)},${black},1,0,0,0,100,100,1,0,3,16,0,8,0,0,60,1`,
    `Style: Pill,DejaVu Sans,34,${black},${black},${white},${black},1,0,0,0,100,100,2,0,3,14,0,8,0,0,150,1`,
    `Style: Caption,DejaVu Sans,${t.fontSize},${white},${white},${box},${black},1,0,0,0,100,100,0,0,3,24,0,5,90,90,0,1`,
    `Style: Credit,DejaVu Sans,30,${white},${white},${black},${black},0,0,0,0,100,100,0,0,1,2,1,2,0,0,150,1`,
    // Tiny photo attribution, bottom-left.
    `Style: Attrib,DejaVu Sans,20,&H00CCCCCC,&H00CCCCCC,${black},${black},0,0,0,0,100,100,0,0,1,2,1,1,30,30,40,1`,
  ];

  const events = [];
  const full = assTime(0);
  const end = assTime(duration);
  // Persistent header, pill and credit for the whole clip.
  events.push(`Dialogue: 0,${full},${end},Brand,,0,0,0,,NEWS TOK`);
  events.push(`Dialogue: 0,${full},${end},Pill,,0,0,0,,${assText(category.toUpperCase())}`);
  events.push(`Dialogue: 0,${full},${end},Credit,,0,0,0,,${assText('Source: ' + source)}`);
  if (attribution) {
    events.push(`Dialogue: 0,${full},${end},Attrib,,0,0,0,,${assText(attribution)}`);
  }
  // Timed captions.
  for (const beat of beats) {
    events.push(
      `Dialogue: 1,${assTime(beat.start)},${assTime(beat.end)},Caption,,0,0,0,,${assText(beat.lines)}`,
    );
  }

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

// Escape a filesystem path for use as a value inside a filter argument.
function escPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

// --- Renderer ------------------------------------------------------------

// Build the FFmpeg input args + the background filter chain ending in [bg],
// depending on whether the background is the article image, stock video, or
// the category gradient. Audio is always input 0.
function backgroundStage(background, script, dur, frames) {
  const [g1, g2] = GRADIENTS[script.category] || GRADIENTS.default;
  // Oversize for stills so the Ken Burns zoom has room to move.
  const bigW = Math.round(width * 1.5);
  const bigH = Math.round(height * 1.5);

  if (background && background.type === 'image') {
    const motion = config.media.kenBurns
      ? `,zoompan=z='min(zoom+0.0006,1.25)':d=${frames}:` +
        `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`
      : `,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    const pre = config.media.kenBurns
      ? `scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH}`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    return {
      inputs: ['-loop', '1', '-i', background.path],
      chain: `[1:v]${pre}${config.media.kenBurns ? motion : ''}[bg]`,
    };
  }

  if (background && background.type === 'video') {
    return {
      inputs: ['-stream_loop', '-1', '-i', background.path],
      chain: `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},fps=${fps},setpts=PTS-STARTPTS[bg]`,
    };
  }

  // Gradient fallback.
  return {
    inputs: [],
    chain: `gradients=s=${width}x${height}:c0=${g1}:c1=${g2}:x0=0:y0=0:x1=${width}:y1=${height}:` +
      `duration=${dur}:speed=0.015[bg]`,
  };
}

// Render one clip. `script` comes from scriptWriter, `audio` from tts,
// `background` from media.resolveBackground (defaults to the gradient).
export async function makeClip(script, audio, outPath, background = { type: 'gradient' }) {
  const duration = audio.durationSec || 6;
  const beats = timeline(script.beats, duration);
  const frames = Math.max(1, Math.round(duration * fps));

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'newstok-'));
  const assPath = path.join(tmpDir, 'subs.ass');
  await fs.writeFile(assPath, buildAss(beats, duration, script.category, script.source, background.attribution), 'utf8');

  const accent = (config.text.accent[script.category] || config.text.accent.default).replace('#', '0x');
  const barW = width - 120;
  const dur = duration.toFixed(2);
  const scrim = config.media.scrimOpacity;

  const bg = backgroundStage(background, script, dur, frames);
  const filter = [
    bg.chain,
    // Normalize, then darken so white captions stay readable over any photo.
    `[bg]format=yuv420p,setsar=1[bgf]`,
    `[bgf]drawbox=x=0:y=0:w=iw:h=ih:color=black@${scrim}:t=fill[scr]`,
    `[scr]drawbox=x=60:y=ih-90:w=${barW}:h=14:color=white@0.25:t=fill[pbg]`,
    `[pbg]drawbox=x=60:y=ih-90:w='${barW}*t/${dur}':h=14:color=${accent}@0.95:t=fill[bar]`,
    `[bar]subtitles=filename='${escPath(assPath)}':fontsdir=/usr/share/fonts[vout]`,
  ].join(';');

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const args = [
    '-y',
    '-i', audio.audioPath,
    ...bg.inputs,
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a',
    '-r', String(fps),
    '-t', dur,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    outPath,
  ];

  try {
    await exec(ffmpegPath, args, { timeout: 180000, maxBuffer: 1024 * 1024 * 32 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
  return outPath;
}

// Concatenate per-story clips into one final video via the concat filter.
export async function concatClips(clipPaths, outPath) {
  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outPath);
    return outPath;
  }
  const inputs = [];
  clipPaths.forEach((p) => inputs.push('-i', p));
  const n = clipPaths.length;
  const streams = clipPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
  const filter = `${streams}concat=n=${n}:v=1:a=1[v][a]`;

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await exec(ffmpegPath, [
    '-y', ...inputs,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '192k',
    outPath,
  ], { timeout: 300000, maxBuffer: 1024 * 1024 * 64 });
  return outPath;
}

export default makeClip;
