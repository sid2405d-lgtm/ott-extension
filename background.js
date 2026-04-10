'use strict';

const API_HOST  = 'streaming-availability.p.rapidapi.com';
const API_BASE  = `https://${API_HOST}`;
const CACHE_KEY = 'ott_cache';
const ALARM_NAME = 'ott_refresh';

const CATALOGS = ['netflix', 'prime.subscription', 'hotstar', 'jiocinema', 'sonyliv', 'zee5'];

// ─── Alarm setup ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60, delayInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) refreshCache();
});

// ─── Message handler (popup → background fetch) ───────────────────────────────
//
// The popup CANNOT make direct fetch() calls in MV3 (blocked by default CSP).
// Instead, it sends a message here; the background service worker fetches and
// returns the data. Service workers are not subject to the same CSP restrictions.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_SHOWS') {
    fetchAllShows(message.apiKey)
      .then(shows => sendResponse({ ok: true, shows }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});

// ─── Core fetch logic ─────────────────────────────────────────────────────────

async function fetchAllShows(apiKey) {
  const fetches = CATALOGS.map(cid =>
    fetchCatalog(apiKey, cid)
      .then(shows => shows.map(s => ({ show: s, catalogIds: [cid] })))
      .catch(err  => { console.warn(`[OTT] ${cid} failed:`, err.message); return []; })
  );

  const results  = await Promise.all(fetches);
  const merged   = new Map();
  let   anyShows = false;

  for (const list of results) {
    for (const { show, catalogIds } of list) {
      anyShows = true;
      if (merged.has(show.id)) {
        catalogIds.forEach(id => {
          if (!merged.get(show.id).catalogIds.includes(id))
            merged.get(show.id).catalogIds.push(id);
        });
      } else {
        merged.set(show.id, { show, catalogIds: [...catalogIds] });
      }
    }
  }

  if (!anyShows) {
    // Try to get a clearer error by running one catalog with error propagation
    await fetchCatalog(apiKey, 'netflix');
    throw new Error('No shows returned from any platform.');
  }

  return Array.from(merged.values()).sort(
    (a, b) => (b.show.firstAirYear || 0) - (a.show.firstAirYear || 0)
  );
}

async function fetchCatalog(apiKey, catalogId) {
  const url = new URL(`${API_BASE}/shows/search/filters`);
  url.searchParams.set('country',          'in');
  url.searchParams.set('show_type',        'series');
  url.searchParams.set('catalogs',         catalogId);
  url.searchParams.set('order_by',         'release_date');
  url.searchParams.set('order_direction',  'desc');
  url.searchParams.set('output_language',  'en');

  const res = await fetch(url.toString(), {
    method:  'GET',
    headers: {
      'X-RapidAPI-Key':  apiKey,
      'X-RapidAPI-Host': API_HOST,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Invalid RapidAPI key. Please update it in Settings (⚙).');
  }
  if (res.status === 429) {
    throw new Error('Daily limit reached (100 req/day on free plan). Try again tomorrow.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body.slice(0, 120)}`);
  }

  const json = await res.json();
  return json.shows || [];
}

// ─── Background cache refresh ─────────────────────────────────────────────────

async function refreshCache() {
  const stored = await chrome.storage.sync.get('rapidapi_key');
  const apiKey = stored.rapidapi_key;
  if (!apiKey) return;

  try {
    const shows = await fetchAllShows(apiKey);
    await chrome.storage.local.set({ [CACHE_KEY]: { shows, timestamp: Date.now() } });

    const thisYear   = new Date().getFullYear();
    const newCount   = shows.filter(({ show }) => show.firstAirYear === thisYear).length;
    chrome.action.setBadgeText({ text: newCount > 0 ? String(newCount) : '' });
    if (newCount > 0) chrome.action.setBadgeBackgroundColor({ color: '#7c6af5' });
  } catch (err) {
    console.error('[OTT Background] refresh failed:', err.message);
  }
}
