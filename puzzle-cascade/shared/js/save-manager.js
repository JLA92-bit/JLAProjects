/**
 * SaveManager - single abstraction over persistent state.
 * Everything reads/writes through here so swapping localStorage for a
 * real backend later only touches this file.
 */
(function (global) {
  const STORAGE_KEY = 'puzzleCascade.save.v1';

  const DIFFICULTIES = ['easy', 'medium', 'hard'];

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function defaultState() {
    return {
      version: 1,
      settings: {
        muteMusic: false,
        muteSfx: false,
        haptics: true,
        lowGraphics: false,
      },
      streak: {
        lastPlayedDate: null,
        current: 0,
        best: 0,
      },
      player: {
        name: null,
      },
      levels: {
        current: 1,
        history: {},
      },
      puzzles: {},
      favorites: [],
      lastPlayed: null,
    };
  }

  function defaultPuzzleEntry() {
    return {
      unlocked: false,
      tiers: {
        easy: { bestStars: 0, bestTimeMs: null, plays: 0 },
        medium: { bestStars: 0, bestTimeMs: null, plays: 0 },
        hard: { bestStars: 0, bestTimeMs: null, plays: 0 },
      },
    };
  }

  class SaveManager {
    constructor() {
      this._state = this._load();
    }

    _load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return defaultState();
        const base = defaultState();
        const merged = Object.assign(base, parsed);
        // Merge nested objects key-by-key so saves written by older builds
        // pick up any new default (e.g. a new setting) instead of losing it.
        ['settings', 'streak', 'player', 'levels'].forEach((k) => {
          const def = defaultState()[k];
          merged[k] = Object.assign(def, parsed[k] && typeof parsed[k] === 'object' ? parsed[k] : {});
        });
        if (!merged.levels.history || typeof merged.levels.history !== 'object') merged.levels.history = {};
        if (!merged.puzzles || typeof merged.puzzles !== 'object') merged.puzzles = {};
        if (!Array.isArray(merged.favorites)) merged.favorites = [];
        return merged;
      } catch (e) {
        console.warn('[SaveManager] failed to load save, starting fresh', e);
        return defaultState();
      }
    }

    _persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
      } catch (e) {
        console.warn('[SaveManager] failed to persist save', e);
      }
    }

    getState() {
      return this._state;
    }

    ensurePuzzle(id) {
      if (!this._state.puzzles[id]) {
        this._state.puzzles[id] = defaultPuzzleEntry();
      }
      return this._state.puzzles[id];
    }

    isUnlocked(id, order) {
      // First puzzle is always unlocked.
      if (order === 0) return true;
      const entry = this._state.puzzles[id];
      return !!(entry && entry.unlocked);
    }

    unlock(id) {
      const entry = this.ensurePuzzle(id);
      if (!entry.unlocked) {
        entry.unlocked = true;
        this._persist();
        return true;
      }
      return false;
    }

    recordResult(id, difficulty, stars, timeMs) {
      const entry = this.ensurePuzzle(id);
      const tier = entry.tiers[difficulty] || (entry.tiers[difficulty] = { bestStars: 0, bestTimeMs: null, plays: 0 });
      tier.plays += 1;
      const improvedStars = stars > tier.bestStars;
      if (improvedStars) tier.bestStars = stars;
      const improvedTime = tier.bestTimeMs === null || timeMs < tier.bestTimeMs;
      if (improvedTime) tier.bestTimeMs = timeMs;
      this._bumpStreak();
      this._persist();
      return { improvedStars, improvedTime };
    }

    _bumpStreak() {
      const s = this._state.streak;
      const today = todayStr();
      if (s.lastPlayedDate === today) return; // already counted today
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (s.lastPlayedDate === yesterday) {
        s.current += 1;
      } else {
        s.current = 1;
      }
      s.best = Math.max(s.best, s.current);
      s.lastPlayedDate = today;
    }

    getStreak() {
      return this._state.streak;
    }

    totalStars(maxPerTier, puzzleIds) {
      let total = 0;
      let max = puzzleIds.length * DIFFICULTIES.length * maxPerTier;
      puzzleIds.forEach((id) => {
        const entry = this._state.puzzles[id];
        if (!entry) return;
        DIFFICULTIES.forEach((d) => {
          total += entry.tiers[d] ? entry.tiers[d].bestStars : 0;
        });
      });
      return { total, max };
    }

    completionPercent(puzzleIds) {
      const { total, max } = this.totalStars(3, puzzleIds);
      if (max === 0) return 0;
      return Math.round((total / max) * 100);
    }

    setSetting(key, value) {
      this._state.settings[key] = value;
      this._persist();
    }

    getSetting(key) {
      const settings = this._state && this._state.settings;
      return settings ? settings[key] : undefined;
    }

    /* ---- Favorites (Free Play grid) ---- */

    getFavorites() {
      return Array.isArray(this._state.favorites) ? this._state.favorites.slice() : [];
    }

    isFavorite(id) {
      return Array.isArray(this._state.favorites) && this._state.favorites.includes(id);
    }

    // Flips the favorite flag for a puzzle and returns the new value.
    toggleFavorite(id) {
      if (!Array.isArray(this._state.favorites)) this._state.favorites = [];
      const list = this._state.favorites;
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
      else list.push(id);
      this._persist();
      return i < 0;
    }

    /* ---- Last played (hub "Continue" button) ---- */

    getLastPlayed() {
      const lp = this._state.lastPlayed;
      return lp && lp.id ? lp : null;
    }

    setLastPlayed(id, difficulty) {
      this._state.lastPlayed = { id, difficulty, at: Date.now() };
      this._persist();
    }

    getPlayerName() {
      return (this._state.player && this._state.player.name) || null;
    }

    setPlayerName(name) {
      const clean = String(name || '').trim().slice(0, 24);
      if (!this._state.player) this._state.player = { name: null };
      this._state.player.name = clean || null;
      this._persist();
      return this._state.player.name;
    }

    resetProgress() {
      // Wipes progress but keeps the player's device preferences (sound,
      // vibration, graphics) - those aren't "progress".
      const keepSettings = Object.assign({}, this._state.settings);
      this._state = defaultState();
      Object.assign(this._state.settings, keepSettings);
      this._persist();
    }

    getCurrentLevel() {
      return (this._state.levels && this._state.levels.current) || 1;
    }

    getLevelHistory(level) {
      return (this._state.levels.history && this._state.levels.history[level]) || null;
    }

    recordLevelResult(level, gameId, difficulty, stars, timeMs) {
      if (!this._state.levels) this._state.levels = { current: 1, history: {} };
      const existing = this._state.levels.history[level];
      const improved = !existing || stars > existing.stars;
      this._state.levels.history[level] = {
        gameId, difficulty,
        stars: Math.max(stars, existing ? existing.stars : 0),
        timeMs: existing && existing.timeMs !== null && existing.timeMs < timeMs ? existing.timeMs : timeMs,
      };
      let advanced = false;
      if (level >= this._state.levels.current) {
        this._state.levels.current = level + 1;
        advanced = true;
      }
      this._persist();
      return { improved, advanced };
    }
  }

  global.PC = global.PC || {};
  global.PC.SaveManager = new SaveManager();
  global.PC.DIFFICULTIES = DIFFICULTIES;
})(window);
