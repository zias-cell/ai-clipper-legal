// Fetches and normalizes news stories from the free RSS feeds in config.js.
import Parser from 'rss-parser';
import config from './config.js';

const FEED_TIMEOUT_MS = 15000;

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: { 'User-Agent': 'news-tok/1.0 (+https://example.com)' },
});

// Hard timeout wrapper: rss-parser's own `timeout` doesn't always abort a
// stalled/hung connection, so we race it against our own timer.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Strip HTML tags and collapse whitespace from RSS summaries.
function clean(text = '') {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(item, feed) {
  const title = clean(item.title);
  const summary = clean(item.contentSnippet || item.content || item.summary || '');
  return {
    title,
    summary,
    link: item.link || '',
    source: feed.source,
    category: feed.category,
    published: item.isoDate || item.pubDate || null,
  };
}

// Fetch one feed, swallowing network errors so a single dead feed
// doesn't sink the whole batch.
async function fetchFeed(feed) {
  try {
    const parsed = await withTimeout(parser.parseURL(feed.url), FEED_TIMEOUT_MS, feed.source);
    return (parsed.items || []).map((item) => normalize(item, feed));
  } catch (err) {
    console.warn(`  ! Skipping ${feed.source} (${feed.category}): ${err.message}`);
    return [];
  }
}

// Fetch all configured feeds, optionally filtered by category.
// Returns deduped stories sorted newest-first.
export async function fetchNews({ category = 'mixed' } = {}) {
  const feeds = config.feeds.filter(
    (f) => category === 'mixed' || f.category === category,
  );

  const batches = await Promise.all(feeds.map(fetchFeed));
  const all = batches.flat();

  // Dedupe by normalized title.
  const seen = new Set();
  const unique = [];
  for (const story of all) {
    const key = story.title.toLowerCase();
    if (!story.title || seen.has(key)) continue;
    seen.add(key);
    unique.push(story);
  }

  unique.sort((a, b) => {
    const ta = a.published ? Date.parse(a.published) : 0;
    const tb = b.published ? Date.parse(b.published) : 0;
    return tb - ta;
  });

  return unique;
}

export default fetchNews;
