import {
  loadState,
  saveState,
  createFreshState,
  clearState,
  loadDetectiveName,
  saveDetectiveName,
} from './state/store.js';
import { mountScene } from './components/scene.js';
import { renderCaseFile } from './components/casefile.js';
import { renderAccusation } from './components/accusation.js';

const app = document.getElementById('app');

let caseData = null;
let cluesByLevel = {};
let state = null;
let activeScene = null; // { destroy, autoRevealRemaining, getFoundRealCount }
let detectiveName = '';

init();

async function init() {
  caseData = await fetchJson('data/case.json');
  cluesByLevel = {};
  await Promise.all(
    caseData.levels.map(async (level) => {
      cluesByLevel[level.id] = await fetchJson(`data/level-${level.id}-clues.json`);
    })
  );

  const saved = loadState();
  if (saved && saved.caseId === caseData.id && !saved.outcome) {
    state = saved;
  } else {
    state = createFreshState(caseData.id);
  }

  detectiveName = loadDetectiveName();
  const hasProgress = !!(saved && saved.caseId === caseData.id && !saved.outcome && saved.currentLevelIndex > 0);

  if (!detectiveName) {
    renderWelcome(hasProgress);
  } else {
    renderIntro(hasProgress);
  }
}

function renderWelcome(hasProgress) {
  const screen = mount(clone('tpl-welcome'));
  const input = screen.querySelector('[data-role="name-input"]');
  const confirm = () => {
    const value = input.value.trim();
    detectiveName = value || 'Detective';
    saveDetectiveName(detectiveName);
    renderIntro(hasProgress);
  };
  screen.querySelector('[data-action="confirm-name"]').addEventListener('click', confirm);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
  });
  setTimeout(() => input.focus(), 50);
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function clone(templateId) {
  const tpl = document.getElementById(templateId);
  const node = tpl.content.firstElementChild.cloneNode(true);
  return node;
}

function mount(node) {
  if (activeScene) {
    activeScene.destroy();
    activeScene = null;
  }
  app.innerHTML = '';
  app.appendChild(node);
  return node;
}

function foundIdsForLevel(levelId) {
  return new Set(state.foundClueIds[levelId] || []);
}

function allFoundEvidenceIds() {
  const ids = new Set();
  caseData.levels.forEach((level) => {
    const clueData = cluesByLevel[level.id];
    const found = foundIdsForLevel(level.id);
    clueData.clues.forEach((c) => {
      if (c.type === 'real' && c.evidenceId && found.has(c.id)) ids.add(c.evidenceId);
    });
  });
  return ids;
}

// ---------- Screens ----------

function renderIntro(hasProgress) {
  const screen = mount(clone('tpl-intro'));
  screen.querySelector('[data-bind="detectiveGreeting"]').textContent = `Welcome, Detective ${detectiveName}`;
  screen.querySelector('[data-bind="title"]').textContent = caseData.title;
  screen.querySelector('[data-bind="tagline"]').textContent = caseData.tagline;
  screen.querySelector('[data-bind="briefing"]').textContent = caseData.briefing;

  const strip = screen.querySelector('[data-bind="suspectStrip"]');
  caseData.suspects.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'suspect-card';
    card.innerHTML = `<span class="s-name">${s.name}</span><span class="s-role">${s.role}</span>`;
    strip.appendChild(card);
  });

  const startBtn = screen.querySelector('[data-action="start-case"]');
  const continueBtn = screen.querySelector('[data-action="continue-case"]');

  if (hasProgress) {
    startBtn.hidden = true;
    continueBtn.hidden = false;
    continueBtn.addEventListener('click', () => goToLevel(state.currentLevelIndex));
  } else {
    startBtn.addEventListener('click', () => {
      state = createFreshState(caseData.id);
      saveState(state);
      goToLevel(0);
    });
  }

  screen.querySelector('[data-action="change-name"]').addEventListener('click', () => {
    renderWelcome(hasProgress);
  });
}

function goToLevel(index) {
  if (index >= caseData.levels.length) {
    renderAccusationScreen();
    return;
  }
  state.currentLevelIndex = index;
  saveState(state);
  renderLevelIntro(caseData.levels[index]);
}

function renderLevelIntro(level) {
  const screen = mount(clone('tpl-level-intro'));
  screen.querySelector('[data-bind="day"]').textContent = level.day;
  screen.querySelector('[data-bind="title"]').textContent = level.title;
  screen.querySelector('[data-bind="location"]').textContent = level.location;
  screen.querySelector('[data-bind="intro"]').textContent = level.intro;
  screen.querySelector('[data-action="enter-scene"]').addEventListener('click', () => renderSceneScreen(level));
}

function renderSceneScreen(level) {
  const screen = mount(clone('tpl-scene'));
  const clueData = cluesByLevel[level.id];
  const found = foundIdsForLevel(level.id);

  activeScene = mountScene(screen, level, clueData, {
    foundClueIds: found,
    hintsRemaining: state.hintsRemaining,
    onClueFound: (clue) => {
      const list = new Set(state.foundClueIds[level.id] || []);
      list.add(clue.id);
      state.foundClueIds[level.id] = [...list];
      saveState(state);
    },
    onHintUsed: () => {
      state.hintsRemaining = Math.max(0, state.hintsRemaining - 1);
      saveState(state);
    },
    onOpenCaseFile: () => renderCaseFileScreen(() => renderSceneScreen(level)),
    onFinishLevel: () => {
      activeScene.autoRevealRemaining();
      state.levelComplete[level.id] = true;
      saveState(state);
      goToLevel(state.currentLevelIndex + 1);
    },
  });
}

function renderCaseFileScreen(onClose) {
  const screen = mount(clone('tpl-casefile'));
  screen.querySelector('[data-bind="detectiveLine"]').textContent = `Det. ${detectiveName} — ${caseData.title}`;
  const foundByLevel = {};
  caseData.levels.forEach((l) => (foundByLevel[l.id] = foundIdsForLevel(l.id)));
  renderCaseFile(screen, { levels: caseData.levels, cluesByLevel, foundClueIdsByLevel: foundByLevel });
  screen.querySelector('[data-action="close-casefile"]').addEventListener('click', onClose);
}

function renderAccusationScreen() {
  const screen = mount(clone('tpl-accusation'));
  renderAccusation(screen, {
    caseData,
    foundEvidenceIds: allFoundEvidenceIds(),
    onSubmit: (accusation) => {
      state.accusation = accusation;
      const sol = caseData.solution;
      const solved =
        accusation.suspectId === sol.suspectId &&
        accusation.motiveId === sol.motiveId &&
        accusation.evidenceId === sol.evidenceId;
      state.outcome = solved ? 'solved' : 'cold';
      saveState(state);
      renderEnding(solved);
    },
  });
}

function renderEnding(solved) {
  const screen = mount(clone('tpl-ending'));
  screen.classList.add(solved ? 'solved' : 'cold');
  screen.querySelector('[data-bind="stamp"]').textContent = solved ? 'CASE CLOSED' : 'CASE COLD';
  screen.querySelector('[data-bind="headline"]').textContent = solved
    ? 'You called it. The Hargrove case is closed.'
    : 'The trail goes cold. Here is what you missed.';
  screen.querySelector('[data-bind="explanation"]').textContent = caseData.solution.explanation;
  screen.querySelector('[data-bind="signoff"]').textContent = solved
    ? `Nice work, Detective ${detectiveName}. The department's keeping your desk.`
    : `Every detective loses one, Detective ${detectiveName}. Yours is this one.`;
  screen.querySelector('[data-action="restart-case"]').addEventListener('click', () => {
    clearState();
    state = createFreshState(caseData.id);
    renderIntro(false);
  });
}
