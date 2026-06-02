// Resolves the most RELATED background for a news story and downloads it.
// Order: article's own photo -> topic-matched stock video -> topic-matched
// stock photo -> category gradient. Keywords for stock come from the
// headline (real subjects), never generic random terms.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import config from './config.js';

// Words we strip when turning a headline into a stock-search query.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'after',
  'before', 'over', 'into', 'amid', 'says', 'say', 'new', 'could', 'will',
  'this', 'that', 'his', 'her', 'their', 'its', 'has', 'have', 'than',
]);

// Build a short, meaningful stock-search query from a story.
export function keywords(story, max = 4) {
  const words = (story.title || '')
    .replace(/[^A-Za-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
  // Prefer capitalized terms (names, places, orgs) — they carry the subject.
  const proper = words.filter((w) => /^[A-Z]/.test(w));
  const picked = (proper.length ? proper : words).slice(0, max).join(' ');
  return picked || story.category || 'news';
}

// Download a URL to `destBase` + inferred extension. Follows redirects.
function download(url, destBase, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.get(url, {
      timeout: config.media.downloadTimeoutMs,
      headers: { 'User-Agent': 'news-tok/1.0', Accept: '*/*' },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        return resolve(download(next, destBase, depth + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const type = res.headers['content-type'] || '';
      const ext = type.includes('mp4') ? '.mp4'
        : type.includes('png') ? '.png'
        : type.includes('webp') ? '.webp'
        : type.includes('gif') ? '.gif'
        : type.includes('video') ? '.mp4'
        : '.jpg';
      const dest = destBase + ext;
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
      file.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('download timed out')));
    req.on('error', reject);
  });
}

// Query the Pexels API (JSON). Returns parsed body or throws.
function pexels(endpoint, query) {
  const url = `https://api.pexels.com/${endpoint}?query=${encodeURIComponent(query)}` +
    `&orientation=portrait&per_page=3`;
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Authorization: config.media.pexelsApiKey },
      timeout: config.media.downloadTimeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Pexels HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Pick the best portrait video file URL from a Pexels video result.
function bestVideoFile(video) {
  const files = (video.video_files || [])
    .filter((f) => f.width && f.height && f.height >= f.width) // portrait
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  const hd = files.find((f) => f.height >= 1280) || files[0];
  return hd && hd.link;
}

// Resolve + download a background for one story into `tmpDir`.
// Returns { type: 'image'|'video'|'gradient', path? }.
export async function resolveBackground(story, tmpDir) {
  const base = path.join(tmpDir, 'bg-' + Math.random().toString(36).slice(2, 8));

  // 1. The article's own photo — most related, no key needed.
  if (story.image) {
    try {
      const p = await download(story.image, base);
      return { type: 'image', path: p };
    } catch { /* fall through */ }
  }

  // 2 & 3. Topic-matched stock from Pexels (only if a key is configured).
  if (config.media.pexelsApiKey) {
    const query = keywords(story);
    if (config.media.preferVideo) {
      try {
        const r = await pexels('videos/search', query);
        const link = (r.videos || []).map(bestVideoFile).find(Boolean);
        if (link) return { type: 'video', path: await download(link, base) };
      } catch { /* fall through */ }
    }
    try {
      const r = await pexels('v1/search', query);
      const src = r.photos && r.photos[0] && (r.photos[0].src.portrait || r.photos[0].src.large2x);
      if (src) return { type: 'image', path: await download(src, base) };
    } catch { /* fall through */ }
  }

  // 4. Fallback: category gradient (handled by the renderer).
  return { type: 'gradient' };
}

export default resolveBackground;
