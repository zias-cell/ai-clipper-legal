// Orchestrates the full pipeline: fetch -> script -> narrate -> render -> stitch.
import fs from 'node:fs/promises';
import path from 'node:path';
import config from './config.js';
import { fetchNews } from './fetchNews.js';
import { writeScript, estimateDuration } from './scriptWriter.js';
import { synthesize } from './tts.js';
import { makeClip, concatClips } from './videoMaker.js';
import { resolveBackground } from './media.js';

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// Run the pipeline. Options override config.pipeline.
// Pass opts.onProgress({step,total,message}) to receive live progress
// (the web dashboard uses this); it defaults to logging to the console.
export async function run(opts = {}) {
  const category = opts.category || config.pipeline.category;
  const count = opts.count || config.pipeline.storiesPerVideo;
  const outDir = opts.outputDir || config.pipeline.outputDir;
  const keepClips = opts.keepClips || false;
  const total = count;
  const emit = (message, step = null) => {
    if (opts.onProgress) opts.onProgress({ step, total, message });
    else console.log(message);
  };

  emit(`📰 Fetching ${category} news...`, 0);
  const stories = (await fetchNews({ category })).slice(0, count);
  if (stories.length === 0) {
    throw new Error('No stories fetched. Check network access to the RSS feeds in src/config.js.');
  }
  emit(`   Got ${stories.length} stories.`, 0);

  const workDir = path.join(outDir, `run-${stamp()}`);
  await fs.mkdir(workDir, { recursive: true });

  const clips = [];
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const script = writeScript(story, { isLast: i === stories.length - 1 });
    emit(`🎬 [${i + 1}/${stories.length}] ${story.title.slice(0, 60)}`, i);

    const audioOut = path.join(workDir, `audio-${i}-${slug(story.title)}.mp3`);
    const audio = await synthesize(script.narration, audioOut, estimateDuration(script));
    emit(`   🔊 voice: ${audio.provider} (${audio.durationSec.toFixed(1)}s)`, i);

    // Pick the most related background (article photo / topic b-roll / gradient).
    let background = { type: 'gradient' };
    try {
      background = await resolveBackground(story, workDir);
    } catch { /* keep gradient */ }
    const label = background.type === 'image' ? '🖼️ photo'
      : background.type === 'video' ? '🎞️ video' : '🎨 gradient';
    emit(`   ${label} background`, i);

    const clipOut = path.join(workDir, `clip-${i}-${slug(story.title)}.mp4`);
    try {
      await makeClip(script, audio, clipOut, background);
    } catch (err) {
      // A bad/undecodable media file shouldn't kill the run — fall back.
      emit(`   ⚠️ background failed (${err.message.slice(0, 40)}), using gradient`, i);
      await makeClip(script, audio, clipOut, { type: 'gradient' });
    }
    clips.push(clipOut);
    emit(`   ✅ rendered clip ${i + 1}`, i + 1);
  }

  const finalOut = path.join(outDir, `news-tok-${category}-${stamp()}.mp4`);
  emit(`🪡 Stitching ${clips.length} clips...`, total);
  await concatClips(clips, finalOut);

  if (!keepClips) {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  emit(`🎉 Done -> ${finalOut}`, total);
  return finalOut;
}

export default run;
