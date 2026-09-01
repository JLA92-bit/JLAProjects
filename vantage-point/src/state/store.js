const SAVE_KEY = 'vantage-point:save:v1';
const NAME_KEY = 'vantage-point:detective-name:v1';

const DEFAULT_STATE = {
  caseId: null,
  currentLevelIndex: 0,
  hintsRemaining: 3,
  foundClueIds: {}, // levelId -> [clueId, ...]
  levelComplete: {}, // levelId -> true
  accusation: null, // { suspectId, motiveId, evidenceId }
  outcome: null, // 'solved' | 'cold' | null
  startedAt: null,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch (err) {
    console.warn('[vantage-point] failed to load save', err);
    return null;
  }
}

export function createFreshState(caseId) {
  return {
    ...structuredClone(DEFAULT_STATE),
    caseId,
    startedAt: Date.now(),
  };
}

export function saveState(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[vantage-point] failed to save', err);
  }
}

export function clearState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn('[vantage-point] failed to clear save', err);
  }
}

export function loadDetectiveName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch (err) {
    return '';
  }
}

export function saveDetectiveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (err) {
    console.warn('[vantage-point] failed to save detective name', err);
  }
}
