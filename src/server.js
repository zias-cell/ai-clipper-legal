// Local web dashboard for News-Tok.
//   npm run dashboard   ->   http://localhost:4321
//
// A tiny dependency-free HTTP server: serves the UI, lists headlines, kicks
// off render jobs, streams progress over SSE, and serves finished MP4s.
// All rendering happens locally via the same pipeline the CLI uses.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import config from './config.js';
import { fetchNews } from './fetchNews.js';
import { run } from './pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUTPUT_DIR = path.join(ROOT, config.pipeline.outputDir);
const PORT = process.env.PORT || 4321;

// In-memory job registry. Each job streams progress to connected SSE clients.
const jobs = new Map();

function newJob() {
  const id = crypto.randomUUID();
  const job = { id, events: [], clients: new Set(), done: false, error: null, videoFile: null };
  jobs.set(id, job);
  return job;
}

function writeSse(res, type, data) {
  try {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false; // client went away mid-write
  }
}

function pushEvent(job, type, data) {
  job.events.push({ type, data });
  for (const res of job.clients) {
    if (!writeSse(res, type, data)) job.clients.delete(res);
  }
}

// --- helpers -------------------------------------------------------------

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4',
};

async function serveStatic(res, filePath, downloadName) {
  try {
    const stat = await fsp.stat(filePath);
    const headers = {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': stat.size,
    };
    if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName}"`;
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

// --- request routing -----------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Home page.
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
  }

  // Preview headlines.
  if (req.method === 'GET' && pathname === '/api/headlines') {
    const category = url.searchParams.get('category') || config.pipeline.category;
    const count = Math.min(20, parseInt(url.searchParams.get('count') || '8', 10));
    try {
      const stories = (await fetchNews({ category })).slice(0, count);
      return send(res, 200, { stories });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  // Start a render job.
  if (req.method === 'POST' && pathname === '/api/generate') {
    const body = await readBody(req);
    const category = body.category || config.pipeline.category;
    const count = Math.min(10, Math.max(1, parseInt(body.count || config.pipeline.storiesPerVideo, 10)));
    const job = newJob();
    send(res, 202, { jobId: job.id });

    // Run asynchronously; progress streams to SSE clients.
    run({
      category,
      count,
      outputDir: OUTPUT_DIR,
      onProgress: ({ step, total, message }) => pushEvent(job, 'progress', { step, total, message }),
    })
      .then((finalOut) => {
        job.done = true;
        job.videoFile = path.basename(finalOut);
        pushEvent(job, 'done', { video: `/api/video/${job.id}`, file: job.videoFile });
      })
      .catch((err) => {
        job.error = err.message;
        pushEvent(job, 'error', { message: err.message });
      });
    return;
  }

  // SSE progress stream for a job.
  if (req.method === 'GET' && pathname.startsWith('/api/events/')) {
    const id = pathname.split('/').pop();
    const job = jobs.get(id);
    if (!job) return send(res, 404, { error: 'Unknown job' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    // A dropped SSE connection must never crash the server.
    res.on('error', () => job.clients.delete(res));
    req.on('close', () => job.clients.delete(res));
    // Replay any events that fired before the client connected.
    for (const e of job.events) writeSse(res, e.type, e.data);
    job.clients.add(res);
    return;
  }

  // Serve the finished video for a job (inline preview or download).
  if (req.method === 'GET' && pathname.startsWith('/api/video/')) {
    const id = pathname.split('/').pop();
    const job = jobs.get(id);
    if (!job || !job.videoFile) return send(res, 404, { error: 'No video yet' });
    const dl = url.searchParams.get('download') ? job.videoFile : null;
    return serveStatic(res, path.join(OUTPUT_DIR, job.videoFile), dl);
  }

  send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => send(res, 500, { error: err.message }));
});

// Last-resort safety net: a stray socket/stream error should be logged, not
// fatal — the dashboard is long-running and must survive client disconnects.
process.on('uncaughtException', (err) => console.error('uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('unhandled:', err && err.message));

server.listen(PORT, () => {
  console.log(`\n🎬  News-Tok dashboard running at  http://localhost:${PORT}\n`);
});
