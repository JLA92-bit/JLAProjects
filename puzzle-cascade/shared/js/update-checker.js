/**
 * PC.UpdateChecker - on launch, fetches version.json from the live
 * GitHub Pages deployment and compares it against the last version this
 * device has seen. If it's newer, the change notes are appended to a
 * small persisted "update log" (separate localStorage key from the save
 * file, so a reset-progress never touches it) and surfaced as a toast +
 * a "What's New" entry in Settings.
 *
 * This works identically whether the page is opened directly in a
 * browser (where the service worker already keeps assets fresh) or
 * wrapped in a Capacitor WebView for the Android app - a native app
 * bundle can't silently patch its own compiled code, but it CAN check
 * the canonical source of truth over the network and tell the player
 * what changed and that a newer build exists.
 */
(function (global) {
  const LIVE_VERSION_URL = 'https://jla92-bit.github.io/JLAProjects/puzzle-cascade/version.json';
  const LOCAL_VERSION_URL = 'version.json'; // same-origin copy, used when already on the live site
  const LOG_KEY = 'puzzleCascade.updateLog.v1';
  const SEEN_KEY = 'puzzleCascade.lastSeenVersion.v1';
  const FETCH_TIMEOUT_MS = 6000;

  function getLog() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveLog(entries) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, 30))); } catch (e) {}
  }

  function getLastSeenVersion() {
    try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; }
  }

  function setLastSeenVersion(v) {
    try { localStorage.setItem(SEEN_KEY, v); } catch (e) {}
  }

  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { cache: 'no-store', signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  function compareVersions(a, b) {
    // Simple semver-ish compare: "1.2.3" -> [1,2,3]. Non-numeric parts sort last.
    const pa = String(a).split('.').map((n) => parseInt(n, 10));
    const pb = String(b).split('.').map((n) => parseInt(n, 10));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }

  async function check() {
    // Prefer the same-origin copy (fast, works with the SW cache-busting
    // flow already in place) when we're actually on the deployed site;
    // fall back to the known live URL (needed inside a Capacitor WebView,
    // where the origin is a local `file://`/`capacitor://` scheme).
    const isRemoteOrigin = /^https?:$/.test(location.protocol) && location.hostname !== 'localhost';
    const urlsToTry = isRemoteOrigin ? [LOCAL_VERSION_URL, LIVE_VERSION_URL] : [LIVE_VERSION_URL];

    let remote = null;
    for (const url of urlsToTry) {
      try {
        const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
        if (res.ok) { remote = await res.json(); break; }
      } catch (e) { /* offline, blocked, or CORS - try the next URL, or give up quietly */ }
    }
    if (!remote || !remote.version) return null;

    const lastSeen = getLastSeenVersion();
    const isFirstRun = lastSeen === null;
    const isNewer = isFirstRun || compareVersions(remote.version, lastSeen) > 0;

    if (isNewer && !isFirstRun) {
      const newEntries = (remote.changelog || []).filter(
        (entry) => compareVersions(entry.version, lastSeen) > 0
      );
      if (newEntries.length) {
        const log = getLog();
        newEntries.forEach((entry) => {
          console.log(`[Josh Makes Puzzles] Update to v${entry.version} (${entry.date}):`, entry.notes);
          log.unshift({ version: entry.version, date: entry.date, notes: entry.notes, seenAt: new Date().toISOString() });
        });
        saveLog(log);
      }
    }

    setLastSeenVersion(remote.version);
    return { remote, isNewer: isNewer && !isFirstRun, isFirstRun };
  }

  global.PC = global.PC || {};
  global.PC.UpdateChecker = { check, getLog };
})(window);
