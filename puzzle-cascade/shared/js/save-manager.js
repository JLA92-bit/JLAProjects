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
        return Object.assign(defaultState(), parsed);
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
      return this._state.settings[key];
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
      this._state = defaultState();
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
