# 🎬 OTT Latest Series — India

A Chrome extension that shows the latest TV series across Indian OTT platforms in one place.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-blue)

## Platforms Covered

| Platform | |
|---|---|
| 🔴 Netflix | ✅ |
| 🔵 Amazon Prime Video | ✅ |
| 🔵 Disney+ Hotstar | ✅ |
| 🔴 JioCinema | ✅ |
| 🔵 SonyLIV | ✅ |
| 🟣 Zee5 | ✅ |

## Features

- Browse latest TV series across all 6 major Indian OTT platforms
- Filter by platform using the tab bar
- Hover over a card to see the show description
- Click a card to open the show directly on the streaming platform
- Results cached for 1 hour — fast reopens
- Background refresh every hour with badge count for new shows

## Setup

### 1. Get a free RapidAPI key

1. Go to [RapidAPI — Streaming Availability API](https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability)
2. Sign in with Google (free, no credit card)
3. Subscribe to the **Basic (free)** plan — 100 requests/day
4. Copy the `X-RapidAPI-Key` value shown in the request headers section

### 2. Install the extension

1. Clone or download this repository
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `ott-extension` folder
5. Click the extension icon in the toolbar
6. Paste your RapidAPI key → click **Save & Load Shows**

## Project Structure

```
ott-extension/
├── manifest.json      # Chrome Extension Manifest V3 config
├── popup.html         # Extension popup UI
├── popup.css          # Dark theme styling
├── popup.js           # UI logic, caching, rendering
├── background.js      # Service worker — API fetch, cache refresh
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## How It Works

- The popup sends a message to the **background service worker** to fetch data
- The service worker calls the [Streaming Availability API](https://www.movieofthenight.com/about/api) for each platform
- Results are cached in `chrome.storage.local` for 1 hour
- The background service worker refreshes the cache every hour via `chrome.alarms`

## API

Uses the [Streaming Availability API](https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability) by Movie of the Night via RapidAPI.

- Free plan: 100 requests/day
- Covers Netflix, Prime Video, Hotstar, JioCinema, SonyLIV, Zee5 for India (`country=in`)

## License

MIT
