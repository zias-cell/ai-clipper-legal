#!/usr/bin/env node
// News-Tok CLI — make TikTok-style vertical videos from daily news.
import { Command } from 'commander';
import config from '../src/config.js';
import { fetchNews } from '../src/fetchNews.js';
import { writeScript } from '../src/scriptWriter.js';
import { run } from '../src/pipeline.js';

const program = new Command();

program
  .name('newstok')
  .description('Make TikTok-style vertical videos from daily politics & celebrity news.')
  .version('1.0.0');

program
  .command('make')
  .description('Fetch news and render a finished vertical video.')
  .option('-c, --category <type>', 'politics | celebrity | mixed', config.pipeline.category)
  .option('-n, --count <number>', 'number of stories in the video', (v) => parseInt(v, 10), config.pipeline.storiesPerVideo)
  .option('-o, --output-dir <dir>', 'output directory', config.pipeline.outputDir)
  .option('--keep-clips', 'keep intermediate per-story clips & audio', false)
  .action(async (opts) => {
    try {
      await run(opts);
      process.exit(0); // exit promptly; HTTP keep-alive sockets can linger
    } catch (err) {
      console.error(`\n❌ ${err.message}\n`);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('Preview the headlines that would be used (no video).')
  .option('-c, --category <type>', 'politics | celebrity | mixed', config.pipeline.category)
  .option('-n, --count <number>', 'how many to show', (v) => parseInt(v, 10), 10)
  .action(async (opts) => {
    const stories = (await fetchNews({ category: opts.category })).slice(0, opts.count);
    if (!stories.length) {
      console.log('No stories found. Check feed network access in src/config.js.');
      return;
    }
    stories.forEach((s, i) => {
      console.log(`\n${i + 1}. [${s.category}/${s.source}] ${s.title}`);
      if (s.summary) console.log(`   ${s.summary.slice(0, 120)}...`);
    });
    console.log('');
    process.exit(0);
  });

program
  .command('script')
  .description('Show the generated script for current top headlines (debug).')
  .option('-c, --category <type>', 'politics | celebrity | mixed', config.pipeline.category)
  .option('-n, --count <number>', 'how many', (v) => parseInt(v, 10), 3)
  .action(async (opts) => {
    const stories = (await fetchNews({ category: opts.category })).slice(0, opts.count);
    stories.forEach((s) => {
      const script = writeScript(s);
      console.log(`\n=== ${s.title} ===`);
      script.beats.forEach((b) => console.log(`  [${b.type}] ${b.text}`));
      console.log(`  (~${script.wordCount} words)`);
    });
    console.log('');
    process.exit(0);
  });

program.parseAsync(process.argv);
