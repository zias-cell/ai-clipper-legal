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
