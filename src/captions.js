// Caption helpers: word-wrap text into lines and distribute the audio
// duration across a script's beats so captions stay in sync with narration.
import config from './config.js';

// Greedy word wrap to a max line length. Returns a string with newlines,
// which FFmpeg's drawtext renders directly from a textfile.
export function wrap(text, maxChars = config.text.maxCharsPerLine) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + ' ' + word).length <= maxChars) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

// Split `totalDuration` across beats, weighted by word count, with a small
// minimum per beat. Returns beats annotated with { start, end, lines }.
export function timeline(beats, totalDuration) {
  if (!beats.length) return [];
  const counts = beats.map((b) => Math.max(1, b.text.split(/\s+/).filter(Boolean).length));
  const totalWords = counts.reduce((a, b) => a + b, 0);
  // Floor per beat, but never reserve more than the clip can hold — otherwise
  // a short clip with many beats would push the last beat's start past its end.
  const minPerBeat = Math.min(1.2, totalDuration / (beats.length + 1));
  const reserved = minPerBeat * beats.length;
  const flexible = Math.max(0, totalDuration - reserved);

  let cursor = 0;
  return beats.map((beat, i) => {
    const share = minPerBeat + (flexible * counts[i]) / totalWords;
    const start = cursor;
    const end = i === beats.length - 1 ? totalDuration : cursor + share;
    cursor = end;
    return { ...beat, start, end, lines: wrap(beat.text) };
  });
}

export default { wrap, timeline };
