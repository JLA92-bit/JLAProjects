/**
 * Game 1 - Sliding Tile Puzzle. The warm-up: teaches tap-to-move and the
 * shared star/timer HUD. 3x3 / 4x4 / 5x5 tiers.
 */
(function () {
  const SIZE_BY_DIFFICULTY = { easy: 3, medium: 4, hard: 5 };
  const MOVE_STAR_THRESHOLDS = {
    3: [40, 70],   // <=40 moves: 3 stars, <=70: 2 stars, else 1
    4: [90, 150],
    5: [160, 260],
  };

  function starsForMoves(size, moves) {
    const [three, two] = MOVE_STAR_THRESHOLDS[size];
    if (moves <= three) return 3;
    if (moves <= two) return 2;
    return 1;
  }

  function buildSolved(size) {
    const arr = [];
    for (let i = 1; i < size * size; i++) arr.push(i);
    arr.push(0); // 0 = blank
    return arr;
  }

  function isSolvable(arr, size) {
    const flat = arr.filter((n) => n !== 0);
    let inversions = 0;
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        if (flat[i] > flat[j]) inversions++;
      }
    }
    if (size % 2 === 1) return inversions % 2 === 0;
    const blankRow = Math.floor(arr.indexOf(0) / size);
    const rowFromBottom = size - blankRow;
    return (inversions + rowFromBottom) % 2 === 0;
  }

  function shuffledBoard(size) {
    // Shuffle by making random valid moves from the solved state - guarantees solvability.
    let arr = buildSolved(size);
    let blank = arr.indexOf(0);
    const moveCount = size * size * 30;
    let lastBlank = -1;
    for (let i = 0; i < moveCount; i++) {
      const neighbors = neighborIndices(blank, size).filter((n) => n !== lastBlank);
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      [arr[blank], arr[next]] = [arr[next], arr[blank]];
      lastBlank = blank;
      blank = next;
    }
    return arr;
  }

  function neighborIndices(i, size) {
    const row = Math.floor(i / size), col = i % size;
    const out = [];
    if (row > 0) out.push(i - size);
    if (row < size - 1) out.push(i + size);
    if (col > 0) out.push(i - 1);
    if (col < size - 1) out.push(i + 1);
    return out;
  }

  function mount(container, difficulty, api) {
    const size = SIZE_BY_DIFFICULTY[difficulty];
    let board = shuffledBoard(size);
    let moves = 0;
    let solved = false;

    const wrap = document.createElement('div');
    wrap.className = 'pc-stage-inner';
    wrap.innerHTML = `
      <div class="sl-meta"><span>Moves: <span id="sl-moves">0</span></span></div>
      <div class="sl-board" id="sl-board"></div>
      <div class="pc-stage-hint">Tap a tile next to the gap to slide it.</div>
    `;
    container.appendChild(wrap);

    const boardEl = wrap.querySelector('#sl-board');
    const movesEl = wrap.querySelector('#sl-moves');
    boardEl.style.gridTemplateColumns = `repeat(${size}, minmax(44px, 76px))`;
    boardEl.style.gridTemplateRows = `repeat(${size}, minmax(44px, 76px))`;

    function render() {
      boardEl.innerHTML = '';
      board.forEach((val, idx) => {
        const cell = document.createElement('div');
        cell.className = 'sl-tile' + (val === 0 ? ' sl-tile--empty' : '');
        cell.textContent = val === 0 ? '' : val;
        cell.style.setProperty('--tile-color', val === 0 ? 'transparent' : pickColor(val));
        if (val !== 0) {
          cell.addEventListener('click', () => tryMove(idx));
        }
        boardEl.appendChild(cell);
      });
    }

    function pickColor(val) {
      const colors = ['#ff4d8d', '#ff9f43', '#ffd93d', '#23d18b', '#17c3b2', '#3f8efc', '#a259ff'];
      return colors[val % colors.length];
    }

    function tryMove(idx) {
      if (solved) return;
      const blank = board.indexOf(0);
      if (neighborIndices(blank, size).includes(idx)) {
        [board[blank], board[idx]] = [board[idx], board[blank]];
        moves++;
        movesEl.textContent = moves;
        api.sound.move();
        render();
        checkWin();
      } else {
        api.sound.error();
        api.ui.shake(boardEl);
      }
    }

    function checkWin() {
      const target = buildSolved(size);
      if (board.every((v, i) => v === target[i])) {
        solved = true;
        const stars = starsForMoves(size, moves);
        api.ui.burstFromElement(boardEl);
        setTimeout(() => api.win(stars, { moves }), 200);
      }
    }

    if (!isSolvable(board, size)) board = shuffledBoard(size); // safety net, extremely rare
    render();

    return () => { wrap.remove(); };
  }

  PC.Games.register('sliding', { mount });
})();
