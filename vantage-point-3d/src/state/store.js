const SAVE_KEY = 'vantage-point-3d:save:v1';
const NAME_KEY = 'vantage-point-3d:detective-name:v1';

const DEFAULT_STATE = {
  caseId: null,
  foundClueIds: [], // level 1 only, in this prototype
  accusation: null,
  outcome: null,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch (err) {
    return null;
  }
}

export function createFreshState(caseId) {
  return { ...structuredClone(DEFAULT_STATE), caseId };
}

export function saveState(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[vantage-point-3d] failed to save', err);
  }
}

export function clearState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    /* ignore */
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
    /* ignore */
  }
}
