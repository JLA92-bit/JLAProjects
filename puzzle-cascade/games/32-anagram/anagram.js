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

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
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
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap letters in order to spell the word</span></div>
    </div>
    <div class="an-clue" id="an-clue"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#an-canvas');
  const idxEl = wrap.querySelector('#an-idx');
  const mistakesEl = wrap.querySelector('#an-mistakes');
  const timerEl = wrap.querySelector('#an-timer');
  const clueEl = wrap.querySelector('#an-clue');

  const TILE = 0.86, GAP = 0.14;
  const totalWidthUnits = maxLen * (TILE + GAP);
  // Two stacked rows (answer slots + scrambled letters) centered on y=0:
  // each row is TILE tall, offset +/-0.95, so the content's vertical
  // half-extent is 0.95 + TILE/2. Fit both width and height so the board
  // fills the canvas without being cropped on a narrow phone viewport.
  const aspectMin = 0.46;
  const halfContentW = totalWidthUnits / 2 + 0.5;
  const halfContentH = 0.95 + TILE / 2 + 0.3;
  const distance = Math.max(halfContentW / (0.42 * aspectMin), halfContentH / 0.42) * 1.1;
  const stage = createStage(canvasHost, { distance: Math.max(distance, 6) });

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
      c.geometry && c.geometry.dispose();
      c.material && c.material.dispose();
      group.remove(c);
    }
  }

  function layoutRow(count, y) {
    const w = count * (TILE + GAP) - GAP;
    const startX = -w / 2 + TILE / 2;
    return Array.from({ length: count }, (_, i) => ({ x: startX + i * (TILE + GAP), y }));
  }

  function loadWord() {
    clearGroup(slotGroup); clearGroup(letterGroup);
    currentWord = words[wordIdx];
    scrambled = scrambleWord(currentWord);
    answer = [];
    clueEl.textContent = `${currentWord.length}-letter word`;

    const slotPos = layoutRow(currentWord.length, 0.95);
    slotMeshes = slotPos.map((p) => {
      const mesh = makeTile({ w: TILE, h: TILE, depth: 0.2, radius: 0.14, color: 0x2b0f5c, emissive: 0x2b0f5c, emissiveIntensity: 0 });
      mesh.position.set(p.x, p.y, 0);
      slotGroup.add(mesh);
      popIn(mesh, { duration: 200 });
      return { mesh, filled: null };
    });

    const letterPos = layoutRow(scrambled.length, -0.95);
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
    tween(mesh.position, { x: slot.mesh.position.x, y: slot.mesh.position.y, z: 0.05 }, 220, Easing.outCubic);
    tween(mesh.scale, { x: 0.82, y: 0.82, z: 0.82 }, 220, Easing.outCubic);
    api.sound.click();
    if (answer.length === currentWord.length) {
      setTimeout(checkWord, 260);
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

  function checkWord() {
    const spelled = answer.map((i) => scrambled[i]).join('');
    if (spelled === currentWord) {
      api.sound.win();
      slotMeshes.forEach((s, i) => {
        tween(s.mesh.material, { emissiveIntensity: 0.7 }, 160, Easing.outCubic, () => tween(s.mesh.material, { emissiveIntensity: 0 }, 300));
      });
      api.ui.burstFromElement(canvasHost);
      wordIdx++;
      updateHud();
      if (wordIdx >= words.length) {
        setTimeout(winGame, 400);
      } else {
        setTimeout(loadWord, 500);
      }
    } else {
      mistakes++;
      updateHud();
      api.sound.error();
      api.ui.shake(canvasHost);
      setTimeout(resetAnswer, 280);
    }
  }

  function onPointerDown(e) {
    const hit = stage.pick(e.clientX, e.clientY, letterMeshes);
    if (!hit) return;
    const idx = hit.object.userData.i;
    tapLetter(idx);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // also let tapping a filled slot pop its letter back out (undo last only, simplest: undo most recent)
  function onSlotTap(e) {
    const hit = stage.pick(e.clientX, e.clientY, slotMeshes.map((s) => s.mesh));
    if (!hit) return;
    // undo everything back to (and including) this slot
    const slotIdx = slotMeshes.findIndex((s) => s.mesh === hit.object);
    if (slotIdx === -1 || slotMeshes[slotIdx].filled === null) return;
    while (answer.length > slotIdx) {
      const i = answer.pop();
      const mesh = letterMeshes[i];
      mesh.userData.used = false;
      tween(mesh.position, { x: mesh.userData.homeX, y: mesh.userData.homeY, z: 0 }, 200, Easing.outCubic);
      tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic);
      slotMeshes[answer.length].filled = null;
    }
    api.sound.click();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onSlotTap);

  let timeUp = false;
  const unsubTick = cfg.timeLimitMs ? stage.onTick(() => {
    if (finished || timeUp) return;
    const remain = cfg.timeLimitMs - api.elapsedMs();
    if (remain <= 0) {
      timeUp = true;
      finished = true;
      timerEl.textContent = 'Time: 0:00';
      setTimeout(() => api.lose("time's up! Try again."), 200);
      return;
    }
    const secs = Math.ceil(remain / 1000);
    timerEl.textContent = `Time: ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }) : null;

  function winGame() {
    finished = true;
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    setTimeout(() => api.win(stars, { mistakes }), 200);
  }

  function hint() {
    if (finished) return;
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
      finished = true;
      if (unsubTick) unsubTick();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.renderer.domElement.removeEventListener('pointerdown', onSlotTap);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('anagram', { mount });
