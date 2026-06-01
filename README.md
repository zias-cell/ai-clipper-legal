# News-Tok 🎬📰

Automated **TikTok-style vertical video maker** for daily **politics** and
**celebrity** news. Point it at free RSS feeds and it fetches the latest
headlines, writes punchy scripts, narrates them, and renders ready-to-post
**1080×1920 (9:16) MP4** videos — all with **no paid API keys**.

> Built on Node.js + FFmpeg. The FFmpeg binary is bundled via `ffmpeg-static`,
> so there's nothing to install system-wide.

---

## Features

- 📡 **Free news sources** — pulls from public RSS feeds (BBC, CNN, NPR, E!,
  Variety…). No API key required. Filter by `politics`, `celebrity`, or `mixed`.
- ✍️ **Auto scripting** — turns each story into a short hook → headline →
  detail → outro script, sized for short-form video.
- 🔊 **Free voiceover** — pluggable TTS chain that tries, in order:
  1. **edge-tts** — Microsoft neural voices (free, no key, needs internet) — *best quality*
  2. **espeak-ng** — fully offline, robotic
  3. **silent** — generated silence timed to reading speed — *always works*
- 🎞️ **Polished captions** — styled, time-synced captions rendered with libass:
  brand header, category pill, centered headline cards, source credit, and an
  animated progress bar — over an animated gradient background (color-coded by
  category).
- 🧵 **Auto-stitching** — combines N stories into one finished video.

---

## Quick start

```bash
npm install
```

### Option A — Web dashboard (recommended)

```bash
npm run dashboard
# then open http://localhost:4321
```

A local control panel where you pick a category and story count, preview the
day's headlines, hit **Generate**, watch live render progress, and preview /
download the finished MP4 — all rendered locally on your machine.

> Set a custom port with `PORT=8080 npm run dashboard`.

### Option B — CLI

```bash
# Preview today's headlines (no video)
node bin/clipper.js list -c politics -n 10

# Make a mixed politics + celebrity video from the top 5 stories
node bin/clipper.js make -c mixed -n 5

# Politics only, keep the per-story clips & audio
node bin/clipper.js make -c politics -n 4 --keep-clips
```

Finished videos land in `output/news-tok-<category>-<timestamp>.mp4`.

---

## Commands

| Command  | What it does |
|----------|--------------|
| `make`   | Fetch news → script → narrate → render → stitch into one MP4 |
| `list`   | Print the headlines that would be used (no rendering) |
| `script` | Show the generated narration/captions for debugging |

### `make` options

| Flag | Default | Description |
|------|---------|-------------|
| `-c, --category <type>` | `mixed` | `politics` \| `celebrity` \| `mixed` |
| `-n, --count <number>`  | `5`     | Number of stories in the video |
| `-o, --output-dir <dir>`| `output`| Where to write the final MP4 |
| `--keep-clips`          | off     | Keep intermediate per-story clips & audio |

---

## Getting real voiceover (recommended)

The default "silent" mode produces a correctly-timed video with on-screen
captions but no spoken audio. For natural narration, install one of:

```bash
# Best quality — neural voices, free, no API key (needs internet)
pip install edge-tts

# OR fully offline (robotic)
sudo apt-get install espeak-ng
```

News-Tok auto-detects whichever is available. Configure the voice in
`src/config.js` (`tts.edgeVoice`, e.g. `en-US-AriaNeural`).

---

## Configuration

All tunables live in [`src/config.js`](src/config.js):

- **`feeds`** — add/remove RSS feeds and their `category` / `source` labels.
- **`video`** — resolution, fps, timing.
- **`text`** — fonts, sizes, colors, per-category accent colors.
- **`tts`** — provider order, voice, speaking rate.
- **`pipeline`** — default category, stories per video, output dir.

---

## How it works

```
fetchNews ──► scriptWriter ──► tts ──► videoMaker ──► concat ──► final.mp4
  (RSS)        (templates)   (voice)   (FFmpeg+      (FFmpeg)
                                        libass)
```

1. **`fetchNews.js`** parses the RSS feeds, cleans HTML, dedupes, sorts newest-first.
2. **`scriptWriter.js`** builds beats (hook/title/detail/outro) and narration.
3. **`tts.js`** synthesizes audio via the first available provider.
4. **`captions.js`** word-wraps text and distributes audio duration across beats.
5. **`videoMaker.js`** renders each clip (gradient + progress bar + ASS captions)
   and stitches them together.

The **web dashboard** (`src/server.js` + `public/index.html`) is a thin,
dependency-free HTTP layer over the same `pipeline.js`: it serves the UI, lists
headlines, starts render jobs, and streams progress to the browser over
Server-Sent Events.

---

## Requirements

- Node.js 18+ (developed on v22)
- FFmpeg — **bundled** automatically via `ffmpeg-static` (no manual install)
- Outbound internet access to the RSS feeds (and to edge-tts, if used)

---

## Notes

- This tool republishes publicly syndicated headlines. Always credit sources
  (it does, on-screen) and review each clip before posting — automated
  summaries of news, especially politics, can omit nuance.
- Legal pages for the related hosted service live in `index.html`,
  `terms.html`, and `privacy.html`.

## License

MIT
