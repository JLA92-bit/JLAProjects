/**
 * Game 3 - Color Match-3. Swap adjacent gems to make lines of 3+,
 * reach the target score before your moves run out.
 */
(function () {
  const CONFIG = {
    easy: { size: 6, types: 5, moves: 18, target: 500 },
    medium: { size: 7, types: 6, moves: 20, target: 850 },
    hard: { size: 8, types: 6, moves: 22, target: 1250 },
  };
  const GEM_COLORS = ['#ff4d8d', '#ff9f43', '#ffd93d', '#23d18b', '#3f8efc', '#a259ff'];
  const GEM_ICONS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];

  function idx(r, c, size) { return r * size + c; }

  function randomGem(types) { return Math.floor(Math.random() * types); }

  function makeBoard(size, types) {
    const board = new Array(size * size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let g;
        do {
          g = randomGem(types);
        } while (
          (c >= 2 && board[idx(r, c - 1, size)] === g && board[idx(r, c - 2, size)] === g) ||
          (r >= 2 && board[idx(r - 1, c, size)] === g && board[idx(r - 2, c, size)] === g)
        );
        board[idx(r, c, size)] = g;
      }
    }
    return board;
  }

  function findMatches(board, size) {
    const matched = new Set();
    for (let r = 0; r < size; r++) {
      let run = [idx(r, 0, size)];
      for (let c = 1; c <= size; c++) {
        const cur = c < size ? board[idx(r, c, size)] : null;
        const prev = board[run[run.length - 1]];
        if (c < size && cur === prev) {
          run.push(idx(r, c, size));
        } else {
          if (run.length >= 3) run.forEach((i) => matched.add(i));
          run = [idx(r, c, size)];
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let run = [idx(0, c, size)];
      for (let r = 1; r <= size; r++) {
        const cur = r < size ? board[idx(r, c, size)] : null;
        const prev = board[run[run.length - 1]];
        if (r < size && cur === prev) {
          run.push(idx(r, c, size));
        } else {
          if (run.length >= 3) run.forEach((i) => matched.add(i));
          run = [idx(r, c, size)];
        }
      }
    }
    return matched;
  }

  function collapse(board, size, types) {
    for (let c = 0; c < size; c++) {
      let write = size - 1;
      for (let r = size - 1; r >= 0; r--) {
        const v = board[idx(r, c, size)];
        if (v !== null) {
          board[idx(write, c, size)] = v;
          if (write !== r) board[idx(r, c, size)] = null;
          write--;
        }
      }
      for (let r = write; r >= 0; r--) board[idx(r, c, size)] = randomGem(types);
    }
  }

  function isAdjacent(a, b, size) {
    const ar = Math.floor(a / size), ac = a % size, br = Math.floor(b / size), bc = b % size;
    return (Math.abs(ar - br) === 1 && ac === bc) || (Math.abs(ac - bc) === 1 && ar === br);
  }

  function hasAnyMove(board, size) {
    for (let i = 0; i < board.length; i++) {
      const r = Math.floor(i / size), c = i % size;
      [[0, 1], [1, 0]].forEach(() => {});
      const neighbors = [];
      if (c < size - 1) neighbors.push(i + 1);
      if (r < size - 1) neighbors.push(i + size);
      for (const n of neighbors) {
        const copy = board.slice();
        [copy[i], copy[n]] = [copy[n], copy[i]];
        if (findMatches(copy, size).size > 0) return true;
      }
    }
    return false;
  }

  function starsForScore(score, target) {
    if (score >= target * 1.3) return 3;
    if (score >= target) return 2;
    return 1;
  }

  function mount(container, difficulty, api) {
    const cfg = CONFIG[difficulty];
    const size = cfg.size;
    let board = makeBoard(size, cfg.types);
    let movesLeft = cfg.moves;
    let score = 0;
    let selected = null;
    let busy = false;

    const wrap = document.createElement('div');
    wrap.className = 'pc-stage-inner';
    wrap.innerHTML = `
      <div class="m3-meta">
        <span>Score: <span id="m3-score">0</span> / ${cfg.target}</span>
        <span>Moves: <span id="m3-moves">${movesLeft}</span></span>
      </div>
      <div class="m3-board" id="m3-board"></div>
      <div class="pc-stage-hint">Swap adjacent gems to line up 3 or more.</div>
    `;
    container.appendChild(wrap);
    const boardEl = wrap.querySelector('#m3-board');
    const scoreEl = wrap.querySelector('#m3-score');
    const movesEl = wrap.querySelector('#m3-moves');
    boardEl.style.gridTemplateColumns = `repeat(${size}, minmax(30px, 52px))`;

    function render() {
      boardEl.innerHTML = '';
      board.forEach((g, i) => {
        const el = document.createElement('div');
        el.className = 'm3-gem' + (selected === i ? ' is-selected' : '');
        el.style.background = GEM_COLORS[g];
        el.textContent = '';
        el.addEventListener('click', () => onClick(i));
        boardEl.appendChild(el);
      });
    }

    function onClick(i) {
      if (busy) return;
      api.sound.click();
      if (selected === null) {
        selected = i;
        render();
        return;
      }
      if (selected === i) { selected = null; render(); return; }
      if (!isAdjacent(selected, i, size)) {
        selected = i;
        render();
        return;
      }
      attemptSwap(selected, i);
      selected = null;
    }

    function attemptSwap(a, b) {
      const copy = board.slice();
      [copy[a], copy[b]] = [copy[b], copy[a]];
      const matches = findMatches(copy, size);
      if (matches.size === 0) {
        api.sound.error();
        api.ui.shake(boardEl);
        render();
        return;
      }
      board = copy;
      movesLeft--;
      movesEl.textContent = movesLeft;
      busy = true;
      render();
      resolveCascades(1);
    }

    function resolveCascades(multiplier) {
      const matches = findMatches(board, size);
      if (matches.size === 0) {
        busy = false;
        checkEnd();
        return;
      }
      matches.forEach((i) => { board[i] = null; });
      score += matches.size * 10 * multiplier;
      scoreEl.textContent = score;
      api.sound.match();
      const cells = boardEl.children;
      matches.forEach((i) => cells[i] && cells[i].classList.add('is-clearing'));
      if (matches.size >= 4) api.ui.burstFromElement(boardEl, { count: 14 });
      setTimeout(() => {
        collapse(board, size, cfg.types);
        render();
        setTimeout(() => resolveCascades(multiplier + 1), 180);
      }, 220);
    }

    function checkEnd() {
      if (score >= cfg.target) {
        const stars = starsForScore(score, cfg.target);
        setTimeout(() => api.win(stars, { score, movesLeft }), 200);
        return;
      }
      if (movesLeft <= 0) {
        api.ui.toast('Out of moves - try again!', { color: '#d6216b' });
        api.ui.shake(boardEl);
        return;
      }
      if (!hasAnyMove(board, size)) {
        board = makeBoard(size, cfg.types);
        render();
        api.ui.toast('Reshuffled - no moves left!');
      }
    }

    render();
    return () => { wrap.remove(); };
  }

  PC.Games.register('match3', { mount });
})();
