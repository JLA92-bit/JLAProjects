/**
 * Game 33 - Word Guess (Wordle-style). Guess the secret word letter by
 * letter using the on-screen keyboard; each guess lights up green
 * (right letter, right spot), yellow (right letter, wrong spot) or gray
 * (not in the word). Limited guesses per round.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const POOL = {
  4: ['CAKE', 'MOON', 'STAR', 'LEAF', 'FISH', 'BIRD', 'GOLD', 'RAIN', 'SNOW', 'WIND', 'ROCK', 'SAND', 'GAME', 'BLUE', 'GATE'],
  5: ['PIZZA', 'BEACH', 'CHESS', 'CLOUD', 'MUSIC', 'HAPPY', 'TIGER', 'PLANT', 'BRAVE', 'LIGHT', 'MAGIC', 'SWEET', 'SMILE', 'RIVER', 'CANDY'],
  6: ['PLANET', 'PUZZLE', 'GARDEN', 'PENCIL', 'ISLAND', 'YELLOW', 'ORANGE', 'FLOWER', 'BASKET', 'WINTER', 'SUMMER', 'CASTLE', 'DRAGON'],
};

const CONFIG = {
  easy: { len: 4, guesses: 7 },
  medium: { len: 5, guesses: 6 },
  hard: { len: 6, guesses: 5 },
};

const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
];

const COLOR = { empty: 0x2b0f5c, filled: 0x3f2a7c, green: 0x23d18b, yellow: 0xffd93d, gray: 0x4a3d6b };

function evaluateGuess(guess, secret) {
  const len = secret.length;
  const result = new Array(len).fill('gray');
  const secretArr = secret.split('');
  const used = new Array(len).fill(false);
  for (let i = 0; i < len; i++) {
    if (guess[i] === secretArr[i]) { result[i] = 'green'; used[i] = true; }
  }
  for (let i = 0; i < len; i++) {
    if (result[i] === 'green') continue;
    const idx = secretArr.findIndex((ch, j) => !used[j] && ch === guess[i]);
    if (idx !== -1) { result[i] = 'yellow'; used[idx] = true; }
  }
  return result;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const pool = POOL[cfg.len];
  const secret = pool[Math.floor(Math.random() * pool.length)];
  let row = 0, col = 0, finished = false;
  const guesses = Array.from({ length: cfg.guesses }, () => Array(cfg.len).fill(''));
  const keyState = {}; // letter -> 'green'|'yellow'|'gray'

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="wg-meta">Guess <span id="wg-row">1</span>/${cfg.guesses} &middot; ${cfg.len} letters</div>
    <div class="pc-canvas3d" id="wg-canvas"></div>
    <div class="wg-keyboard" id="wg-keyboard"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#wg-canvas');
  const rowEl = wrap.querySelector('#wg-row');
  const kbEl = wrap.querySelector('#wg-keyboard');

  const TILE = 0.86, GAP = 0.12;
  const totalW = cfg.len * (TILE + GAP) - GAP;
  const totalH = cfg.guesses * (TILE + GAP) - GAP;
  const halfW = totalW / 2 + 0.6, halfH = totalH / 2 + 0.6;
  const distance = Math.max(halfH / 0.42, halfW / (0.42 * 0.5));
  const stage = createStage(canvasHost, { distance });

  const grid = [];
  const startY = (totalH - TILE) / 2;
  const startX = -(totalW - TILE) / 2;
  for (let r = 0; r < cfg.guesses; r++) {
    const rowArr = [];
    for (let c = 0; c < cfg.len; c++) {
      const mesh = makeTile({ w: TILE, h: TILE, depth: 0.2, radius: 0.14, color: COLOR.empty });
      mesh.position.set(startX + c * (TILE + GAP), startY - r * (TILE + GAP), 0);
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * cfg.len + c) * 8 });
      rowArr.push({ mesh, label: null });
    }
    grid.push(rowArr);
  }

  function setLetter(r, c, ch) {
    const cell = grid[r][c];
    if (cell.label) { cell.mesh.remove(cell.label); cell.label.geometry.dispose(); cell.label.material.map.dispose(); cell.label.material.dispose(); cell.label = null; }
    if (ch) {
      cell.label = applyLabel(cell.mesh, ch, { size: 96, w: TILE * 0.7, h: TILE * 0.7 });
      cell.mesh.material.color.set(COLOR.filled);
      tween(cell.mesh.scale, { x: 1.06, y: 1.06, z: 1.06 }, 100, Easing.outCubic, () => tween(cell.mesh.scale, { x: 1, y: 1, z: 1 }, 120, Easing.outCubic));
    } else {
      cell.mesh.material.color.set(COLOR.empty);
    }
  }

  function colorForResult(res) { return res === 'green' ? COLOR.green : res === 'yellow' ? COLOR.yellow : COLOR.gray; }

  function buildKeyboard() {
    kbEl.innerHTML = '';
    KEY_ROWS.forEach((keys) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'wg-krow';
      keys.forEach((k) => {
        const btn = document.createElement('button');
        btn.className = 'wg-key' + (k === 'ENTER' || k === 'BACK' ? ' wg-key--wide' : '');
        btn.textContent = k === 'BACK' ? '⌫' : k === 'ENTER' ? 'ENTER' : k;
        btn.dataset.key = k;
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); pressKey(k); });
        rowDiv.appendChild(btn);
      });
      kbEl.appendChild(rowDiv);
    });
  }
  buildKeyboard();

  function refreshKeyboardColors() {
    kbEl.querySelectorAll('.wg-key').forEach((btn) => {
      const k = btn.dataset.key;
      const st = keyState[k];
      btn.classList.remove('is-green', 'is-yellow', 'is-gray');
      if (st) btn.classList.add(`is-${st}`);
    });
  }

  function pressKey(k) {
    if (finished) return;
    if (k === 'BACK') {
      if (col > 0) { col--; guesses[row][col] = ''; setLetter(row, col, ''); }
      return;
    }
    if (k === 'ENTER') { submitRow(); return; }
    if (col >= cfg.len) return;
    guesses[row][col] = k;
    setLetter(row, col, k);
    api.sound.click();
    col++;
  }

  function submitRow() {
    if (col < cfg.len) { api.ui.shake(canvasHost); api.sound.error(); return; }
    const guess = guesses[row].join('');
    const results = evaluateGuess(guess, secret);
    results.forEach((res, c) => {
      const cell = grid[row][c];
      setTimeout(() => {
        tween(cell.mesh.material, { emissiveIntensity: 0.6 }, 120, Easing.outCubic, () => tween(cell.mesh.material, { emissiveIntensity: 0 }, 250));
        cell.mesh.material.color.set(colorForResult(res));
        const ch = guess[c];
        const rank = { gray: 0, yellow: 1, green: 2 };
        if (!keyState[ch] || rank[res] > rank[keyState[ch]]) keyState[ch] = res;
      }, c * 100);
    });
    setTimeout(() => {
      refreshKeyboardColors();
      if (guess === secret) {
        api.ui.burstFromElement(canvasHost);
        api.sound.win();
        finished = true;
        const stars = row <= 1 ? 3 : row <= Math.ceil(cfg.guesses / 2) ? 2 : 1;
        setTimeout(() => api.win(stars, { guesses: row + 1 }), 350);
      } else {
        row++;
        col = 0;
        rowEl.textContent = Math.min(row + 1, cfg.guesses);
        if (row >= cfg.guesses) {
          finished = true;
          setTimeout(() => api.lose(`out of guesses! The word was ${secret}.`), 350);
        }
      }
    }, cfg.len * 100 + 150);
  }

  function onKeydown(e) {
    if (finished) return;
    const k = e.key.toUpperCase();
    if (k === 'ENTER') pressKey('ENTER');
    else if (k === 'BACKSPACE') pressKey('BACK');
    else if (/^[A-Z]$/.test(k)) pressKey(k);
  }
  window.addEventListener('keydown', onKeydown);

  function hint() {
    if (finished) return;
    // reveal one correct letter not yet placed in the current row's inputs
    for (let c = 0; c < cfg.len; c++) {
      if (guesses[row][c] !== secret[c]) {
        guesses[row][c] = secret[c];
        setLetter(row, c, secret[c]);
        col = Math.max(col, c + 1);
        api.ui.toast(`${api.playerName}, letter ${c + 1} revealed!`);
        return;
      }
    }
    api.ui.toast(`${api.playerName}, this row already matches - hit enter!`);
  }

  return {
    unmount: () => {
      finished = true;
      window.removeEventListener('keydown', onKeydown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('wordguess', { mount });
