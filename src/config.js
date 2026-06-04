// Central configuration for the News-Tok video pipeline.
// Everything here is free / no-API-key. Edit feeds and voices to taste.

export const config = {
  // ----- News sources (free public RSS feeds, no API key) -----
  // Each feed is tagged with a category used for on-screen labels & filtering.
  feeds: [
    // Politics
    { url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', category: 'politics', source: 'BBC' },
    { url: 'https://rss.cnn.com/rss/cnn_allpolitics.rss', category: 'politics', source: 'CNN' },
    { url: 'https://feeds.npr.org/1014/rss.xml', category: 'politics', source: 'NPR' },
    // Celebrities / Entertainment
    { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', category: 'celebrity', source: 'BBC' },
    { url: 'https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml', category: 'celebrity', source: 'E! News' },
    { url: 'https://variety.com/feed/', category: 'celebrity', source: 'Variety' },
  ],

  // ----- Video output -----
  video: {
    width: 1080,
    height: 1920, // 9:16 vertical (TikTok / Reels / Shorts)
    fps: 30,
    // Seconds per story when narration timing is unavailable.
    fallbackSecondsPerStory: 7,
    // Padding added to the end of the audio so the last word isn't clipped.
    tailPaddingSec: 0.8,
  },

  // ----- Captions / text -----
  text: {
    fontFile: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    fontSize: 64,
    lineSpacing: 16,
    maxCharsPerLine: 22,
    color: 'white',
    boxColor: 'black@0.55',
    // Accent color per category (used for the category pill + progress bar).
    accent: {
      politics: '#2e7df6',
      celebrity: '#ff2d78',
      default: '#ffb703',
    },
  },

  // ----- Outro / call to action -----
  // Shown (and read) as the final card at the END of each finished video.
  // Edit this one line to change the sign-off.
  callToAction: 'Follow our TikTok page to get notified when we post the next episode!',

  // ----- Text to speech -----
  // Providers are tried in order until one succeeds. All are free.
  //  - "edge"   : Microsoft Edge neural voices via the `edge-tts` python pkg
  //               (free, no key, needs internet). Best quality.
  //  - "espeak" : espeak-ng, fully offline, robotic.
  //  - "silent" : no voice; video is timed to estimated read speed. Always works.
  tts: {
    providers: ['edge', 'espeak', 'silent'],
    edgeVoice: 'en-US-AriaNeural',
    edgeRate: '+8%',
    espeakVoice: 'en-us',
    // Words per minute used to estimate clip length when running silent.
    wordsPerMinute: 165,
  },

  // ----- Backgrounds / media -----
  // Each story gets the most RELATED visual available, in this order:
  //   1. the article's own published photo  (Ken Burns slow-zoom; no key)
  //   2. topic-matched stock video b-roll    (Pexels; needs a free API key)
  //   3. topic-matched stock photo           (Pexels; needs a free API key)
  //   4. the category gradient                (always available)
  // We never use random/unrelated clips — only the article image or footage
  // matched to keywords pulled from the headline.
  media: {
    // Openverse: free, keyless image search (openly-licensed photos). On by
    // default so topic photos work with NO signup/API key.
    useOpenverse: true,
    // Optional upgrade for stock VIDEO b-roll: a free Pexels key
    // (https://www.pexels.com/api/) in PEXELS_API_KEY. Leave empty to skip.
    pexelsApiKey: process.env.PEXELS_API_KEY || '',
    preferVideo: true,        // if a Pexels key is set, try video before photo
    kenBurns: true,           // slow zoom/pan on still images
    scrimOpacity: 0.45,       // dark overlay so captions stay readable (0..1)
    downloadTimeoutMs: 15000,
    maxStockSeconds: 10,      // trim/loop stock video to at most this long
  },

  // ----- Pipeline defaults -----
  pipeline: {
    storiesPerVideo: 5,
    category: 'mixed', // 'politics' | 'celebrity' | 'mixed'
    outputDir: 'output',
    // Cache fetched articles so repeat runs don't re-hit feeds.
    cacheFile: '.newstok-cache.json',
  },
};

export default config;
