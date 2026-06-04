// Fetches and normalizes news stories from the free RSS feeds in config.js.
import Parser from 'rss-parser';
import config from './config.js';

const FEED_TIMEOUT_MS = 15000;

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: { 'User-Agent': 'news-tok/1.0 (+https://example.com)' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['content:encoded', 'contentEncoded'],
    ],
  },
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

// Common named HTML entities seen in news RSS.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', hellip: '…', '#39': "'",
};

// Decode numeric (&#39; / &#x27;) and common named HTML entities.
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? ' ');
}

function safeCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return ' ';
  }
}

// Strip HTML tags, decode entities, and collapse whitespace from RSS summaries.
function clean(text = '') {
  return decodeEntities(
    text
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull the story's own published image out of the various RSS shapes:
// <enclosure>, <media:content>, <media:thumbnail>, or the first <img> in
// the article body. This is the image most related to the story.
function extractImage(item) {
  const isImg = (url = '', type = '') =>
    /^https?:\/\//i.test(url) && (/^image\//i.test(type) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url));

  if (item.enclosure && isImg(item.enclosure.url, item.enclosure.type)) return item.enclosure.url;

  for (const m of item.mediaContent || []) {
    const a = m && m.$;
    if (a && isImg(a.url, a.type || a.medium)) return a.url;
  }
  for (const m of item.mediaThumbnail || []) {
    if (m && m.$ && isImg(m.$.url)) return m.$.url;
  }
  const body = item.contentEncoded || item.content || '';
  const match = body.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match && isImg(match[1])) return match[1];
  return null;
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
    image: extractImage(item),
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
