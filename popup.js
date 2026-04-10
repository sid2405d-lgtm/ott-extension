'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_KEY = 'ott_cache';
const CACHE_TTL = 60 * 60 * 1000;

const CATALOGS = [
  { id: 'netflix',            name: 'Netflix',   color: '#E50914', short: 'NFLX'  },
  { id: 'prime.subscription', name: 'Prime',     color: '#00A8E1', short: 'PRIME' },
  { id: 'hotstar',            name: 'Hotstar',   color: '#1565C0', short: 'HOT'   },
  { id: 'jiocinema',          name: 'JioCinema', color: '#c0392b', short: 'JIO'   },
  { id: 'sonyliv',            name: 'SonyLIV',   color: '#003399', short: 'SONY'  },
  { id: 'zee5',               name: 'Zee5',      color: '#7B2D8B', short: 'ZEE5'  },
];

const CATALOG_MAP = Object.fromEntries(CATALOGS.map(c => [c.id, c]));

const TAB_TO_CATALOG = {
  netflix:   'netflix',
  prime:     'prime.subscription',
  hotstar:   'hotstar',
  jiocinema: 'jiocinema',
  sonyliv:   'sonyliv',
  zee5:      'zee5',
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const setupScreen      = $('setup-screen');
const appScreen        = $('app-screen');
const settingsOverlay  = $('settings-overlay');

const apiKeyInput      = $('api-key-input');
const saveKeyBtn       = $('save-key-btn');
const rapidapiLink     = $('rapidapi-link');

const settingsBtn      = $('settings-btn');
const closeSettings    = $('close-settings');
const settingsApiInput = $('settings-api-input');
const updateKeyBtn     = $('update-key-btn');
const settingsMsg      = $('settings-msg');

const refreshBtn   = $('refresh-btn');
const platformTabs = $('platform-tabs');
const statusBar    = $('status-bar');
const statusText   = $('status-text');
const loadingGrid  = $('loading-grid');
const contentGrid  = $('content-grid');
const emptyState   = $('empty-state');
const errorState   = $('error-state');
const errorMsg     = $('error-msg');
const retryBtn     = $('retry-btn');
const changeKeyBtn = $('change-key-btn');
const lastUpdated  = $('last-updated');

// ─── State ────────────────────────────────────────────────────────────────────

let apiKey = '';
let activeCatalog = 'all';
let allShows = [];

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  rapidapiLink.addEventListener('click', e => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability' });
  });

  const stored = await chrome.storage.sync.get('rapidapi_key');
  apiKey = stored.rapidapi_key || '';

  if (!apiKey) {
    show(setupScreen);
  } else {
    show(appScreen);
    loadShows();
  }
})();

// ─── Setup ────────────────────────────────────────────────────────────────────

saveKeyBtn.addEventListener('click', async () => {
  const val = apiKeyInput.value.trim();
  if (!val) {
    apiKeyInput.style.borderColor = '#ff6b6b';
    return;
  }
  apiKeyInput.style.borderColor = '';
  apiKey = val;
  await chrome.storage.sync.set({ rapidapi_key: val });
  hide(setupScreen);
  show(appScreen);
  loadShows();
});

apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveKeyBtn.click(); });

// ─── Settings overlay ─────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => {
  settingsApiInput.value = apiKey;
  settingsMsg.classList.add('hidden');
  show(settingsOverlay);
});
closeSettings.addEventListener('click', () => hide(settingsOverlay));
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) hide(settingsOverlay);
});

updateKeyBtn.addEventListener('click', async () => {
  const val = settingsApiInput.value.trim();
  if (!val) return;
  apiKey = val;
  await chrome.storage.sync.set({ rapidapi_key: val });
  await chrome.storage.local.remove(CACHE_KEY);
  settingsMsg.textContent = 'Key saved! Reloading…';
  settingsMsg.style.color = '#4caf6e';
  settingsMsg.classList.remove('hidden');
  setTimeout(() => { hide(settingsOverlay); loadShows(true); }, 700);
});

// ─── Platform tabs ────────────────────────────────────────────────────────────

platformTabs.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const raw = tab.dataset.catalog;
  activeCatalog = raw === 'all' ? 'all' : (TAB_TO_CATALOG[raw] || raw);
  renderGrid();
});

refreshBtn.addEventListener('click',   () => loadShows(true));
retryBtn.addEventListener('click',     () => loadShows(true));
changeKeyBtn.addEventListener('click', () => {
  settingsApiInput.value = apiKey;
  settingsMsg.classList.add('hidden');
  show(settingsOverlay);
});

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadShows(forceRefresh = false) {
  setLoadingState();

  if (!forceRefresh) {
    const cached = await getCached();
    if (cached) {
      allShows = cached.shows;
      setLastUpdated(cached.timestamp);
      renderGrid();
      return;
    }
  }

  try {
    // ── Key change: ask the BACKGROUND SERVICE WORKER to make the fetch ──
    // Popup pages in MV3 cannot reliably make cross-origin fetch calls.
    // Sending a message to the background worker is the correct pattern.
    const response = await sendToBackground({ type: 'FETCH_SHOWS', apiKey });

    if (!response.ok) {
      throw new Error(response.error || 'Unknown error from background worker.');
    }

    allShows = response.shows.map(({ show, catalogIds }) => ({
      show,
      catalogIds: new Set(catalogIds),
    }));

    const timestamp = Date.now();
    const serializable = allShows.map(({ show, catalogIds }) => ({
      show,
      catalogIds: [...catalogIds],
    }));
    await chrome.storage.local.set({ [CACHE_KEY]: { shows: serializable, timestamp } });
    setLastUpdated(timestamp);
    renderGrid();

  } catch (err) {
    console.error('[OTT Popup]', err);
    setErrorState(err.message || 'Something went wrong. Please retry.');
  }
}

// Send a message to the background service worker and await its response.
function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function getCached() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cached = result[CACHE_KEY];
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) return null;
  cached.shows = cached.shows.map(({ show, catalogIds }) => ({
    show,
    catalogIds: new Set(catalogIds),
  }));
  return cached;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderGrid() {
  const filtered = activeCatalog === 'all'
    ? allShows
    : allShows.filter(({ catalogIds }) => catalogIds.has(activeCatalog));

  hide(loadingGrid);
  hide(errorState);

  if (filtered.length === 0) {
    contentGrid.innerHTML = '';
    hide(contentGrid);
    show(emptyState);
    return;
  }

  hide(emptyState);
  contentGrid.innerHTML = filtered.map(({ show, catalogIds }) =>
    buildCard(show, catalogIds)
  ).join('');

  contentGrid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const url = card.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  });

  show(contentGrid);
  updateStatusBar(filtered.length);
}

function buildCard(show, catalogIds) {
  const title    = show.title || show.originalTitle || 'Untitled';
  const rating   = show.rating != null ? (show.rating / 10).toFixed(1) : '—';
  const year     = show.firstAirYear || '';
  const overview = show.overview || 'No description available.';

  const streamOpts = show.streamingOptions?.in || [];
  const preferred  = streamOpts.find(o => catalogIds.has(o?.service?.id)) || streamOpts[0];
  const linkUrl    = preferred?.link
    || `https://www.google.com/search?q=${encodeURIComponent(title + ' watch online India')}`;

  const posterSrc  = show.imageSet?.verticalPoster?.w240
    || show.imageSet?.verticalPoster?.w360
    || '';

  const posterHTML = posterSrc
    ? `<img class="card-poster" src="${escapeHtml(posterSrc)}" alt="${escapeHtml(title)}" loading="lazy" />`
    : `<div class="card-poster-placeholder">🎬</div>`;

  const badgesHTML = [...catalogIds].map(cid => {
    const c = CATALOG_MAP[cid];
    return c ? `<span class="badge" style="background:${c.color}">${c.short}</span>` : '';
  }).join('');

  return `
    <div class="card" data-url="${escapeHtml(linkUrl)}">
      ${posterHTML}
      <div class="card-overlay">
        <div class="card-overlay-title">${escapeHtml(title)}</div>
        <div class="card-overview">${escapeHtml(overview)}</div>
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-badges">${badgesHTML}</div>
        <div class="card-meta">
          <span class="card-rating">&#9733; ${rating}</span>
          <span class="card-date">${year}</span>
        </div>
      </div>
    </div>
  `;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function setLoadingState() {
  hide(contentGrid);
  hide(emptyState);
  hide(errorState);
  hide(statusBar);
  show(loadingGrid);
}

function setErrorState(msg) {
  hide(loadingGrid);
  hide(contentGrid);
  hide(emptyState);
  errorMsg.textContent = msg;
  show(errorState);
}

function updateStatusBar(count) {
  const label = activeCatalog === 'all'
    ? 'All platforms'
    : (CATALOG_MAP[activeCatalog]?.name || activeCatalog);
  statusText.textContent = `${count} series — ${label}`;
  show(statusBar);
}

function setLastUpdated(ts) {
  const d = new Date(ts);
  lastUpdated.textContent = `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
