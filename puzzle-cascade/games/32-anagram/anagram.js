/**
 * Game 32 - Word Scramble (Anagram). A themed word appears scrambled as
 * letter tiles; tap letters in the right order to spell it, filling the
 * answer slots above. Solve every word in the round to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const POOL = {
  3: ['CAT', 'DOG', 'OWL', 'BEE', 'ANT', 'COW', 'FOX', 'PIG'],
  4: ['BEAR', 'LION', 'WOLF', 'DEER', 'HAWK', 'SEAL', 'CRAB', 'FROG'],
  5: ['TIGER', 'ZEBRA', 'KOALA', 'PANDA', 'EAGLE', 'SHARK', 'HORSE', 'SNAKE'],
  6: ['RABBIT', 'MONKEY', 'DONKEY', 'TURTLE', 'PARROT', 'SPIDER', 'BEAVER'],
  7: ['DOLPHIN', 'PENGUIN', 'LEOPARD', 'GIRAFFE', 'HAMSTER', 'OCTOPUS', 'PEACOCK'],
  8: ['ELEPHANT', 'KANGAROO', 'FLAMINGO'],
};

const CONFIG = {
  easy: { lens: [3, 4], wordCount: 4, timeLimitMs: null },
  medium: { lens: [4, 5, 6], wordCount: 5, timeLimitMs: 150000 },
  hard: { lens: [6, 7, 8], wordCount: 6, timeLimitMs: 120000 },
};

function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function scrambleWord(word) {
  let letters = word.split('');
  let attempts = 0;
  do { letters = shuffle(letters); attempts++; } while (letters.join('') === word && attempts < 20);
  return letters;
}

function pickWords(cfg) {
  const candidates = [];
  cfg.lens.forEach((len) => { (POOL[len] || []).forEach((w) => candidates.push(w)); });
  return shuffle(candidates).slice(0, cfg.wordCount);
}

// Fit a (halfW x halfH) world rectangle inside the canvas host, measured at
// mount time, leaving room for DOM overlays (reserve, in px) and a small
// safety margin so nothing crops on narrow phones.
function fitView(host, halfW, halfH, { margin = 1.08, reserveTop = 0, reserveBottom = 0 } = {}) {
  const w = host.clientWidth || 320, h = host.clientHeight || 480;
  const aspect = Math.max(0.3, w / h);
  const f = Math.max(0.5, (h - reserveTop - reserveBottom) / h);
  const halfVis = Math.max(halfH / f, halfW / aspect) * margin;
  return { distance: halfVis / 0.42, lookAtY: -halfVis * (reserveBottom - reserveTop) / h };
}

// Long words split their loose letters over two rows so every letter tile
// stays big enough to tap comfortably.
function lettersPerRow(len) { return len <= 5 ? len : Math.ceil(len / 2); }

function mount(container, difficulty, api) {
  let game = null;
  const start = () => { game = play(container, difficulty, api, restart); };
  function restart() { if (game) game.unmount(); start(); }
  start();
  return {
    unmount: () => { if (game) game.unmount(); game = null; },
    hint: () => { if (game) game.hint(); },
  };
}

function play(container, difficulty, api, restart) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  let alive = true;
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
    timers.add(id);
  }
  const startTime = performance.now();
  const words = pickWords(cfg);
  let wordIdx = 0, mistakes = 0, finished = false;
  const maxLen = Math.max(...words.map((w) => w.length));

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="an-meta">
      <span>Word <span id="an-idx">1</span>/${words.length}</span>
      <span id="an-timer" ${cfg.timeLimitMs ? '' : 'hidden'}>Time: --</span>
      <span>Mistakes: <span id="an-mistakes">0</span></span>
    </div>
    <div class="pc-canvas3d" id="an-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap letters in order. Tap a placed letter to undo.</span></div>
    </div>
    <div class="an-clue" id="an-clue">&nbsp;</div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#an-canvas');
  const idxEl = wrap.querySelector('#an-idx');
  const mistakesEl = wrap.querySelector('#an-mistakes');
  const timerEl = wrap.querySelector('#an-timer');
  const clueEl = wrap.querySelector('#an-clue');

  const TILE = 1.0, GAP = 0.14;   // loose letter tiles
  const SLOT = 0.74, SLOT_GAP = 0.08; // answer slots (smaller: display + undo)
  const SLOT_Y = 1.05;
  const LETTER_TOP_Y = -0.35;
  const maxRows = Math.ceil(maxLen / lettersPerRow(maxLen));
  const halfContentW = Math.max(maxLen * (SLOT + SLOT_GAP), lettersPerRow(maxLen) * (TILE + GAP)) / 2 + 0.2;
  const contentTop = SLOT_Y + SLOT / 2;
  const contentBottom = LETTER_TOP_Y - (maxRows - 1) * (TILE + GAP) - TILE / 2;
  const halfContentH = Math.max(contentTop, -contentBottom) + 0.3;
  const view = fitView(canvasHost, halfContentW, halfContentH, { reserveBottom: 50 });
  const stage = createStage(canvasHost, { ...view, distance: Math.max(view.distance, 6) });

  const slotGroup = new THREE.Group();
  const letterGroup = new THREE.Group();
  stage.world.add(slotGroup);
  stage.world.add(letterGroup);

  let slotMeshes = [];
  let letterMeshes = [];
  let answer = []; // indices into scrambled letters, in fill order
  let scrambled = [];
  let currentWord = '';

  function clearGroup(group) {
    while (group.children.length) {
      const c = group.children.pop();
      c.traverse((n) => {
        if (n.geometry) n.geometry.dispose();
        if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); }
      });
      group.remove(c);
    }
  }

  function layoutRow(count, y, size, gap) {
    const w = count * (size + gap) - gap;
    const startX = -w / 2 + size / 2;
    return Array.from({ length: count }, (_, i) => ({ x: startX + i * (size + gap), y }));
  }
  function layoutLetters(count) {
    const per = lettersPerRow(count);
    const out = [];
    for (let r = 0; r * per < count; r++) {
      const n = Math.min(per, count - r * per);
      out.push(...layoutRow(n, LETTER_TOP_Y - r * (TILE + GAP), TILE, GAP));
    }
    return out;
  }

  function loadWord() {
    clearGroup(slotGroup); clearGroup(letterGroup);
    currentWord = words[wordIdx];
    scrambled = scrambleWord(currentWord);
    answer = [];
    clueEl.textContent = `${currentWord.length}-letter word`;

    const slotPos = layoutRow(currentWord.length, SLOT_Y, SLOT, SLOT_GAP);
    slotMeshes = slotPos.map((p) => {
      const mesh = makeTile({ w: SLOT, h: SLOT, depth: 0.16, radius: 0.12, color: 0x2b0f5c, emissive: 0x23d18b, emissiveIntensity: 0 });
      mesh.position.set(p.x, p.y, 0);
      slotGroup.add(mesh);
      popIn(mesh, { duration: 200 });
      return { mesh, filled: null };
    });

    const letterPos = layoutLetters(scrambled.length);
    letterMeshes = scrambled.map((ch, i) => {
      const mesh = makeTile({ w: TILE, h: TILE, depth: 0.24, radius: 0.16, color: PALETTE[i % PALETTE.length] });
      mesh.position.set(letterPos[i].x, letterPos[i].y, 0);
      applyLabel(mesh, ch, { size: 96, w: TILE * 0.7, h: TILE * 0.7 });
      mesh.userData = { i, used: false, homeX: letterPos[i].x, homeY: letterPos[i].y };
      letterGroup.add(mesh);
      popIn(mesh, { delay: i * 40 });
      return mesh;
    });
  }
  loadWord();

  function updateHud() {
    idxEl.textContent = Math.min(wordIdx + 1, words.length);
    mistakesEl.textContent = mistakes;
  }

  function tapLetter(i) {
    if (finished) return;
    const mesh = letterMeshes[i];
    if (mesh.userData.used) return;
    const slotIdx = answer.length;
    if (slotIdx >= currentWord.length) return;
    mesh.userData.used = true;
    answer.push(i);
    const slot = slotMeshes[slotIdx];
    slot.filled = i;
    const k = (SLOT * 0.96) / TILE;
    tween(mesh.position, { x: slot.mesh.position.x, y: slot.mesh.position.y, z: 0.12 }, 220, Easing.outCubic);
    tween(mesh.scale, { x: k, y: k, z: k }, 220, Easing.outCubic);
    api.sound.click();
    if (answer.length === currentWord.length) {
      checking = true;
      later(checkWord, 260);
    }
  }

  function resetAnswer() {
    answer.forEach((i) => {
      const mesh = letterMeshes[i];
      mesh.userData.used = false;
      tween(mesh.position, { x: mesh.userData.homeX, y: mesh.userData.homeY, z: 0 }, 220, Easing.outCubic);
      tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic);
    });
    answer = [];
    slotMeshes.forEach((s) => { s.filled = null; });
  }

  let checking = false;
  function checkWord() {
    checking = false;
    const spelled = answer.map((i) => scrambled[i]).join('');
    if (spelled === currentWord) {
      api.sound.win();
      slotMeshes.forEach((s, i) => {
        tween(s.mesh.material, { emissiveIntensity: 0.7 }, 160, Easing.outCubic, () => tween(s.mesh.material, { emissiveIntensity: 0 }, 300));
      });
      api.ui.burstFromElement(canvasHost);
      wordIdx++;
      updateHud();
      checking = true; // block taps until the next word is in
      if (wordIdx >= words.length) {
        later(winGame, 400);
      } else {
        later(() => { checking = false; loadWord(); }, 500);
      }
    } else {
      mistakes++;
      updateHud();
      api.sound.error();
      api.ui.shake(canvasHost);
      checking = true;
      later(() => { checking = false; resetAnswer(); }, 280);
    }
  }

  // undo every letter from slot `slotIdx` onward
  function undoFrom(slotIdx) {
    while (answer.length > slotIdx) {
      const i = answer.pop();
      const mesh = letterMeshes[i];
      mesh.userData.used = false;
      tween(mesh.position, { x: mesh.userData.homeX, y: mesh.userData.homeY, z: 0 }, 200, Easing.outCubic);
      tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic);
      slotMeshes[answer.length].filled = null;
    }
  }

  function onPointerDown(e) {
    if (finished || checking) return;
    const hit = stage.pick(e.clientX, e.clientY, [...letterMeshes, ...slotMeshes.map((sl) => sl.mesh)]);
    if (!hit) return;
    // the hit may be a letter's text label (a child mesh) - walk up
    let obj = hit.object;
    while (obj && !letterMeshes.includes(obj) && !slotMeshes.some((sl) => sl.mesh === obj)) obj = obj.parent;
    if (!obj) return;
    let slotIdx = slotMeshes.findIndex((sl) => sl.mesh === obj);
    if (slotIdx === -1) {
      const li = letterMeshes.indexOf(obj);
      if (!obj.userData.used) { tapLetter(li); return; }
      slotIdx = answer.indexOf(li);
    }
    if (slotIdx === -1 || slotMeshes[slotIdx].filled === null) return;
    undoFrom(slotIdx);
    api.sound.click();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  let timeUp = false;
  const unsubTick = cfg.timeLimitMs ? stage.onTick(() => {
    if (finished || timeUp) return;
    const remain = cfg.timeLimitMs - (performance.now() - startTime);
    if (remain <= 0) {
      timeUp = true;
      finished = true;
      timerEl.textContent = 'Time: 0:00';
      later(() => {
        api.lose("time's up! Try again.");
        showRetry("Time's up!");
      }, 200);
      return;
    }
    const secs = Math.ceil(remain / 1000);
    timerEl.textContent = `Time: ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }) : null;

  function showRetry(msg) {
    const over = document.createElement('div');
    over.className = 'an-over';
    over.innerHTML = `<div class="an-over-msg"></div><button class="pc-btn pc-btn--blue">Try again</button>`;
    over.querySelector('.an-over-msg').textContent = msg;
    over.querySelector('button').addEventListener('click', () => { api.sound.click(); restart(); });
    canvasHost.appendChild(over);
  }

  function winGame() {
    finished = true;
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    later(() => api.win(stars, { mistakes }), 200);
  }

  function hint() {
    if (finished || checking) return;
    // take back any wrong letters first, so the hint always helps
    const wrongAt = answer.findIndex((li, k) => scrambled[li] !== currentWord[k]);
    if (wrongAt !== -1) undoFrom(wrongAt);
    const slotIdx = answer.length;
    if (slotIdx >= currentWord.length) return;
    const neededChar = currentWord[slotIdx];
    const idx = letterMeshes.findIndex((m) => !m.userData.used && scrambled[m.userData.i] === neededChar);
    if (idx === -1) return;
    tapLetter(letterMeshes[idx].userData.i);
    api.ui.toast(`${api.playerName}, that's the next letter!`);
  }

  return {
    unmount: () => {
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      if (unsubTick) unsubTick();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('anagram', { mount });
