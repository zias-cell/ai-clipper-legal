// Orchestrates the full pipeline: fetch -> script -> narrate -> render -> stitch.
import fs from 'node:fs/promises';
import path from 'node:path';
import config from './config.js';
import { fetchNews } from './fetchNews.js';
import { writeScript, estimateDuration } from './scriptWriter.js';
import { synthesize } from './tts.js';
import { makeClip, concatClips } from './videoMaker.js';

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// Run the pipeline. Options override config.pipeline.
export async function run(opts = {}) {
  const category = opts.category || config.pipeline.category;
  const count = opts.count || config.pipeline.storiesPerVideo;
  const outDir = opts.outputDir || config.pipeline.outputDir;
  const keepClips = opts.keepClips || false;

  console.log(`\n📰 Fetching ${category} news...`);
  const stories = (await fetchNews({ category })).slice(0, count);
  if (stories.length === 0) {
    throw new Error('No stories fetched. Check network access to the RSS feeds in src/config.js.');
  }
  console.log(`   Got ${stories.length} stories.\n`);

  const workDir = path.join(outDir, `run-${stamp()}`);
  await fs.mkdir(workDir, { recursive: true });

  const clips = [];
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const script = writeScript(story);
    console.log(`🎬 [${i + 1}/${stories.length}] ${story.title.slice(0, 60)}`);

    const audioOut = path.join(workDir, `audio-${i}-${slug(story.title)}.mp3`);
    const audio = await synthesize(script.narration, audioOut, estimateDuration(script));
    console.log(`   🔊 voice: ${audio.provider} (${audio.durationSec.toFixed(1)}s)`);

    const clipOut = path.join(workDir, `clip-${i}-${slug(story.title)}.mp4`);
    await makeClip(script, audio, clipOut);
    clips.push(clipOut);
    console.log(`   ✅ rendered`);
  }

  const finalOut = path.join(outDir, `news-tok-${category}-${stamp()}.mp4`);
  console.log(`\n🪡 Stitching ${clips.length} clips...`);
  await concatClips(clips, finalOut);

  if (!keepClips) {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  console.log(`\n🎉 Done -> ${finalOut}\n`);
  return finalOut;
}

export default run;
