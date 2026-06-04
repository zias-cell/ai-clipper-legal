// Turns raw news stories into short, punchy, TikTok-style scripts.
// Template-based — no AI API key required. The output is structured into
// "beats" (hook / detail / outro) so the video maker can show captions
// in sync with narration.

import config from './config.js';

const HOOKS = {
  politics: [
    'Breaking in politics:',
    "Here's what's happening in Washington:",
    'You need to hear this:',
    'Big political news today:',
  ],
  celebrity: [
    'Celebrity news alert:',
    'The internet is talking about this:',
    'You will not believe this:',
    "Here's the latest in entertainment:",
  ],
  default: ['Today\'s top story:', 'Quick news update:'],
};

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

// Cheap deterministic hash so the same story always gets the same hook/outro.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

// Trim a summary down to ~2 sentences so clips stay short and snappy.
function tighten(summary, maxSentences = 2) {
  if (!summary) return '';
  const sentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
  return sentences.slice(0, maxSentences).join(' ').trim();
}

// Build the spoken/written script for a single story.
// `isLast` controls whether the call-to-action outro is appended — it should
// only appear on the final story of a video (the end of the episode).
export function writeScript(story, { isLast = true } = {}) {
  const seed = hash(story.title);
  const hookPool = HOOKS[story.category] || HOOKS.default;
  const hook = pick(hookPool, seed);
  const detail = tighten(story.summary) || story.title;
  const outro = isLast ? config.callToAction : null;

  // Beats are shown as on-screen captions and read aloud in order.
  const beats = [
    { type: 'hook', text: hook },
    { type: 'title', text: story.title },
  ];
  if (detail && detail !== story.title) {
    beats.push({ type: 'detail', text: detail });
  }
  if (outro) {
    beats.push({ type: 'outro', text: outro });
  }

  const narration = beats.map((b) => b.text).join(' ');

  return {
    ...story,
    hook,
    outro,
    beats,
    narration,
    wordCount: narration.split(/\s+/).filter(Boolean).length,
  };
}

// Estimate spoken duration (seconds) from word count, used for silent mode.
export function estimateDuration(script) {
  const wpm = config.tts.wordsPerMinute;
  return Math.max(3, (script.wordCount / wpm) * 60 + config.video.tailPaddingSec);
}

export default writeScript;
