import {
  loadState,
  saveState,
  createFreshState,
  clearState,
  loadDetectiveName,
  saveDetectiveName,
} from './state/store.js';
import { mountScene3D } from './components/scene3d.js';
import { renderCaseFile } from './components/casefile.js';
import { renderAccusation } from './components/accusation.js';

const app = document.getElementById('app');

let caseData = null;
let clueData = null; // level 1 only, in this prototype
let level = null;
let state = null;
let detectiveName = '';
let activeScene = null;

init();

async function init() {
  caseData = await fetchJson('data/case.json');
  clueData = await fetchJson('data/level-1-clues.json');
  level = caseData.levels[0];

  const saved = loadState();
  state = saved && saved.caseId === caseData.id ? saved : createFreshState(caseData.id);
  detectiveName = loadDetectiveName();

  if (!detectiveName) {
    renderWelcome();
  } else {
    renderIntro();
  }
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function clone(templateId) {
  const tpl = document.getElementById(templateId);
  return tpl.content.firstElementChild.cloneNode(true);
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

function foundClueIds() {
  return new Set(state.foundClueIds);
}

function foundEvidenceIds() {
  const ids = new Set();
  const found = foundClueIds();
  clueData.clues.forEach((c) => {
    if (c.type === 'real' && c.evidenceId && found.has(c.id)) ids.add(c.evidenceId);
  });
  return ids;
}

// ---------- Screens ----------

function renderWelcome() {
  const screen = mount(clone('tpl-welcome'));
  const input = screen.querySelector('[data-role="name-input"]');
  const confirm = () => {
    detectiveName = input.value.trim() || 'Detective';
    saveDetectiveName(detectiveName);
    renderIntro();
  };
  screen.querySelector('[data-action="confirm-name"]').addEventListener('click', confirm);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
  });
  setTimeout(() => input.focus(), 50);
}

function renderIntro() {
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

  screen.querySelector('[data-action="start-case"]').addEventListener('click', renderLevelIntro);
}

function renderLevelIntro() {
  const screen = mount(clone('tpl-level-intro'));
  screen.querySelector('[data-bind="day"]').textContent = level.day;
  screen.querySelector('[data-bind="title"]').textContent = level.title;
  screen.querySelector('[data-bind="location"]').textContent = level.location;
  screen.querySelector('[data-bind="intro"]').textContent = level.intro;
  screen.querySelector('[data-action="enter-scene"]').addEventListener('click', renderScene3D);
}

function renderScene3D() {
  const screen = mount(clone('tpl-scene3d'));
  const canvas = screen.querySelector('[data-role="canvas"]');
  const dayEl = screen.querySelector('[data-bind="day"]');
  const pipsEl = screen.querySelector('[data-bind="cluePips"]');
  const toastEl = screen.querySelector('[data-role="toast"]');
  const toastTitleEl = screen.querySelector('[data-bind="toastTitle"]');
  const toastFlavorEl = screen.querySelector('[data-bind="toastFlavor"]');
  const continueBtn = screen.querySelector('[data-action="finish-level"]');

  dayEl.textContent = `${level.day} · ${level.title}`;

  const realClues = clueData.clues.filter((c) => c.type === 'real');
  let toastTimer = null;

  function updatePips() {
    const found = foundClueIds();
    pipsEl.innerHTML = '';
    realClues.forEach((c) => {
      const pip = document.createElement('span');
      pip.className = 'clue-pip' + (found.has(c.id) ? ' found' : '');
      pipsEl.appendChild(pip);
    });
    if (found.size >= level.requiredClues) continueBtn.hidden = false;
  }

  activeScene = mountScene3D(canvas, level, clueData, {
    foundClueIds: foundClueIds(),
    onClueFound: (clue) => {
      const set = foundClueIds();
      if (set.has(clue.id)) return;
      set.add(clue.id);
      state.foundClueIds = [...set];
      saveState(state);
      updatePips();

      clearTimeout(toastTimer);
      toastTitleEl.textContent = clue.title;
      toastFlavorEl.textContent = clue.flavor;
      toastEl.hidden = false;
      toastTimer = setTimeout(() => (toastEl.hidden = true), 2600);
    },
  });

  updatePips();

  screen.querySelector('[data-action="reset-view"]').addEventListener('click', () => activeScene.resetView());
  screen.querySelector('[data-action="open-casefile"]').addEventListener('click', () => renderCaseFileScreen(renderScene3D));
  continueBtn.addEventListener('click', renderAccusationScreen);
}

function renderCaseFileScreen(onClose) {
  const screen = mount(clone('tpl-casefile'));
  screen.querySelector('[data-bind="detectiveLine"]').textContent = `Det. ${detectiveName} — ${caseData.title}`;
  renderCaseFile(screen, { level, clueData, foundClueIds: foundClueIds() });
  screen.querySelector('[data-action="close-casefile"]').addEventListener('click', onClose);
}

function renderAccusationScreen() {
  const screen = mount(clone('tpl-accusation'));
  renderAccusation(screen, {
    caseData,
    foundEvidenceIds: foundEvidenceIds(),
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
    ? `Nice work, Detective ${detectiveName}.`
    : `Only Level 1 is modeled in this prototype, Detective ${detectiveName} — the evidence that would have closed this case lives in Levels 2-5, not yet built in 3D.`;
  screen.querySelector('[data-action="restart-case"]').addEventListener('click', () => {
    clearState();
    state = createFreshState(caseData.id);
    renderIntro();
  });
}
