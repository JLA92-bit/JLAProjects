/**
 * PC.App - the hub shell: level path + slot wheel, the free-play puzzle
 * grid, navigation, timer, settings, player-name personalization,
 * animated intro slides, and the glue that connects a mounted game
 * module to SaveManager.
 *
 * Each game module registers itself with:
 *   PC.Games.register(id, {
 *     mount(container, difficulty, api) -> returns either an unmount
 *       function, or { unmount(), hint() } if the game supports hints.
 *   });
 * `api` gives the game: { win(stars, extra), lose(msg), sound, ui,
 * difficulty, playerName, elapsedMs() }
 */
(function (global) {
  const PUZZLES = [
    {
      id: 'sliding', name: 'Sliding Tiles', icon: '🧩', color: '#ff4d8d',
      blurb: 'Slide tiles back into order.',
      goal: "Put the numbered tiles in order - 1, 2, 3... - reading left to right, top to bottom. There's one empty gap you slide tiles into.",
      controls: 'Tap any tile that sits right next to the empty gap. That tile slides into the gap, opening a new gap where it used to be.',
      example: "If the gap is below the '5' tile, tap '5' - it slides down into the gap. Keep doing this, one tile at a time, until every number is in order.",
    },
    {
      id: 'memory', name: 'Memory Match', icon: '🃏', color: '#ff9f43',
      blurb: 'Flip cards, find every pair.',
      goal: 'Every card has a hidden matching twin somewhere on the board. Find all the pairs.',
      controls: "Tap any card to flip it face-up. Then tap a second card. If they match, both stay face-up for good. If they don't, they flip back over - so remember where they were!",
      example: "You flip a card and see 🍎. Remember that spot. A few turns later you flip another card and it's also 🍎 - tap it right after and you've found the pair.",
    },
    {
      id: 'match3', name: 'Color Match-3', icon: '💎', color: '#ffd93d',
      blurb: 'Swap gems, clear lines of 3+.',
      goal: 'Line up 3 or more gems of the same color in a row or column to clear them and score points, before you run out of moves.',
      controls: 'Tap one gem, then tap a gem directly next to it (up, down, left, or right) to swap their places. The swap only happens if it lines up 3 or more matching gems.',
      example: 'Two red gems sit side by side with a yellow gem next to them. Tap the yellow gem, then tap the red gem beside it to swap - if that completes a row of 3 reds, they clear!',
    },
    {
      id: 'maze', name: 'Maze Runner', icon: '🏃', color: '#23d18b',
      blurb: 'Race to the exit before time runs out.',
      goal: 'Guide your character through the maze from the start to the flag 🏁 before the clock hits zero.',
      controls: 'Use the arrow keys, WASD, or tap the on-screen arrow pad to move one step at a time. Yellow walls block your path - you have to go around them.',
      example: "If a wall blocks you from moving right, try moving up or down first, then right again once you're past the wall - like finding a detour.",
    },
    {
      id: 'sokoban', name: 'Block Push', icon: '📦', color: '#17c3b2',
      blurb: 'Push every crate onto its target.',
      goal: 'Push every crate 📦 onto a glowing target circle. Once all crates are on targets, you win.',
      controls: "Walk into a crate to push it one space further in that same direction. You can only push crates, never pull them - so think ahead about which side you need to be on before you start pushing.",
      example: "If a crate needs to move left, you must first walk around to stand on its right side, then move left - that pushes the crate one step left, onto or toward the target.",
    },
    {
      id: 'wordsearch', name: 'Word Search', icon: '🔤', color: '#3f8efc',
      blurb: 'Find every hidden word in the grid.',
      goal: 'Find every word from the list hidden inside the letter grid.',
      controls: 'Press and drag in a straight line across the letters that spell a word. Words can run left-to-right, right-to-left, up, down, or diagonally.',
      example: "If 'CAT' is hidden going downward, find the 'C', press down on it, then drag straight down through the 'A' and 'T' below it, then let go - the word highlights and is found.",
    },
    {
      id: 'merge2048', name: 'Number Merge', icon: '🔢', color: '#a259ff',
      blurb: 'Merge tiles to reach the target number.',
      goal: "Combine matching numbers to build up to the target number shown at the top of the screen.",
      controls: 'Swipe (or press an arrow key) to slide every tile at once in that direction. When two tiles with the same number bump into each other, they merge into one tile worth double.',
      example: "Swipe right. If a '2' tile slides into another '2' tile, they combine into a single '4' tile. Two '4' tiles later combine into an '8', and so on.",
    },
    {
      id: 'jigsaw', name: 'Jigsaw', icon: '🧩', color: '#ff5c5c',
      blurb: 'Drag pieces to rebuild the picture.',
      goal: 'Rebuild the full picture by moving every scattered piece to its correct spot on the board.',
      controls: 'Press and drag a piece from the scattered pile toward the board. When you drop it near the right outlined square, it snaps into place automatically.',
      example: "A piece shows the corner of a yellow sun. Look at the picture pieces already placed to guess roughly where the sun goes, then drag your piece there and let go - it'll snap in if you're close enough.",
    },
    {
      id: 'simon', name: 'Pattern Memory', icon: '🎵', color: '#ff4d8d',
      blurb: 'Repeat the ever-growing sequence.',
      goal: 'Watch which colored pads light up in order, then tap them back in that exact same order. Every round the sequence gets one step longer - and faster.',
      controls: "Wait and watch first - don't tap anything while the pads are flashing. Once they stop, tap the pads yourself in the same order you just saw.",
      example: 'The game flashes green, then blue, then green again. Once it stops, you tap: green, blue, green - in that exact order - to complete the round.',
    },
    {
      id: 'lightsout', name: 'Logic Grid', icon: '💡', color: '#ffd93d',
      blurb: 'The final boss: clear every light.',
      goal: "Turn off every single light on the grid. This is the final boss puzzle - it takes some planning.",
      controls: "Tap any light to toggle it on/off - but that same tap ALSO toggles the lights directly above, below, left, and right of it. One tap changes up to 5 lights at once.",
      example: "Tapping a lit light in the middle of the grid turns it off, but also flips its 4 neighbors - so a tap can turn OTHER lights on too. Use the Hint button if you get stuck figuring out where to tap next.",
    },
    {
      id: 'tictactoe', name: 'Tic-Tac-Toe', icon: '❌', color: '#ff4d8d',
      blurb: 'Outsmart the computer, three in a row wins.',
      goal: 'Get three of your marks (X) in a row - across, down, or diagonally - before the computer (O) does.',
      controls: 'Tap any empty square to place your X there. Then wait a moment while the computer places an O. Keep taking turns until someone gets three in a row, or the board fills up.',
      example: "If you already have X's in the top-left and top-middle squares, tap the top-right square to complete the row and win.",
    },
    {
      id: 'whackmole', name: 'Whack-a-Mole', icon: '🐹', color: '#ff9f43',
      blurb: 'Tap moles fast before time runs out.',
      goal: 'Tap enough moles to reach the target score before the timer hits zero. Watch out for red bomb moles - tapping one costs you points!',
      controls: 'Moles pop up out of random holes for a split second. Tap a brown mole as soon as you see it to score a point. Do not tap the red ones.',
      example: "A brown mole pops up in the bottom-left hole - tap it right away before it ducks back down. A red mole pops up next - leave that one alone!",
    },
    {
      id: 'connect4', name: 'Connect Four', icon: '🔴', color: '#ffd93d',
      blurb: 'Drop discs, connect four before the computer.',
      goal: 'Be the first to get four of your discs in a row - across, down, or diagonally - by dropping them into the grid.',
      controls: 'Tap anywhere in a column to drop your disc there. It falls to the lowest open spot in that column. Then the computer drops one of its own.',
      example: "You already have three pink discs stacked diagonally. Tap the column that would drop a fourth pink disc into the next spot on that diagonal to win.",
    },
    {
      id: 'minesweeper', name: 'Minesweeper', icon: '💣', color: '#23d18b',
      blurb: 'Clear every safe square without hitting a mine.',
      goal: 'Reveal every square that is NOT a hidden mine. Numbers tell you how many mines are touching that square.',
      controls: "Tap a square to reveal it. If it's a number, that many mines touch it - use that to figure out which nearby squares are safe. Turn on Flag Mode to mark squares you're sure are mines instead of revealing them.",
      example: "You reveal a square showing '1', and one neighboring square is already flagged as a mine - that means every OTHER neighboring square is safe to tap.",
    },
    {
      id: 'hanoi', name: 'Tower of Hanoi', icon: '🗼', color: '#17c3b2',
      blurb: 'Move the whole stack to the last peg.',
      goal: 'Move every disk from the left peg to the right peg, rebuilding the same stack there - biggest disk on the bottom.',
      controls: 'Tap a peg to pick up its top disk, then tap another peg to drop it there. You can never place a bigger disk on top of a smaller one.',
      example: "To move the smallest disk from the left peg to the right peg, tap the left peg (it lifts the top disk), then tap the right peg to drop it there.",
    },
    {
      id: 'pegsolitaire', name: 'Peg Solitaire', icon: '🎯', color: '#3f8efc',
      blurb: 'Jump pegs away until only one remains.',
      goal: 'Jump pegs over each other to remove them from the board. Try to end with as few pegs left as possible - one is a perfect game!',
      controls: 'Tap a peg to select it, then tap an empty hole exactly two spaces away in a straight line, with another peg sitting in between. That middle peg gets removed.',
      example: "A peg sits two spaces to the left of an empty hole, with another peg in between them. Tap your peg, then tap the empty hole - it jumps over and removes the middle peg.",
    },
    {
      id: 'snake', name: 'Snake', icon: '🐍', color: '#a259ff',
      blurb: 'Eat food, grow long, don’t crash.',
      goal: 'Guide the snake to eat the glowing food and grow to the target length - without hitting the walls or your own tail.',
      controls: 'Swipe on the board, use the arrow keys/WASD, or tap the on-screen pad to steer. The snake keeps moving on its own - you just choose which way it turns.',
      example: "Food appears just above your snake's head. Swipe up (or tap the up arrow) to turn that direction and eat it - the snake grows one segment longer.",
    },
    {
      id: 'breakout', name: 'Brick Breaker', icon: '🧱', color: '#ff5c5c',
      blurb: 'Bounce the ball to clear every brick.',
      goal: 'Break every brick at the top of the screen by bouncing the ball into them with your paddle, without letting the ball fall past you.',
      controls: 'Drag left/right on the board to slide your paddle under the ball, or use the arrow keys / on-screen buttons. Tap the board to launch the ball.',
      example: "The ball is falling toward the right side of the screen - drag your paddle right to get under it before it passes, so it bounces back up into the bricks.",
    },
    {
      id: 'colorflood', name: 'Color Flood', icon: '🌊', color: '#ff9f43',
      blurb: 'Flood the whole board in one color.',
      goal: 'Turn the entire board into a single color, spreading out from the top-left corner, before you run out of moves.',
      controls: 'Tap a color swatch below the board. Every square connected to the top-left corner that matches the current color (or the color you just picked) becomes that new color too.',
      example: "The top-left corner is currently blue, and a patch of green squares touches it. Tap green - that patch joins the blue region, and now the whole connected area is green, ready to grow further.",
    },
    {
      id: 'sudoku', name: 'Mini Sudoku', icon: '🔷', color: '#23d18b',
      blurb: 'Fill the grid so no number repeats.',
      goal: 'Fill in every empty square so each row, column, and bold box contains every number exactly once, with no repeats.',
      controls: 'Tap an empty square to select it, then tap a number below the board to fill it in. Tap ✕ to clear a square you filled in.',
      example: "A row already has 1, 2, and 3 filled in, and it's a 4x4 board - the one empty square in that row must be a 4, since every number appears exactly once per row.",
    },
  ];

  const LEVEL_COUNT = 30; // levels 1-10 easy, 11-20 medium, 21-30 hard, then repeats at hard forever

  const Games = { _registry: {}, register(id, def) { this._registry[id] = def; }, get(id) { return this._registry[id]; } };
  global.PC.Games = Games; // exposed immediately: game scripts register() synchronously at load time, before DOMContentLoaded

  const save = global.PC.SaveManager;
  const sound = global.PC.SoundManager;
  const UI = global.PC.UI;

  const WIN_PHRASES = ['Nice work', 'Great job', 'Awesome', 'You crushed it', 'Well played', 'Fantastic', 'Brilliant'];
  const WELCOME_PHRASES = ['Welcome back', 'Good to see you', 'Hey there', 'Ready to play'];

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function playerName() { return save.getPlayerName() || 'Puzzler'; }
  function difficultyForLevel(level) {
    const bucket = (level - 1) % LEVEL_COUNT;
    if (bucket < 10) return 'easy';
    if (bucket < 20) return 'medium';
    return 'hard';
  }

  let els = {};
  let lastSpunPuzzleId = null;
  let currentGameUnmount = null;
  let currentGameHint = null;
  let hintCooldown = false;
  let timerInterval = null;
  let timerStart = 0;

  function byId(id) { return document.getElementById(id); }

  function init() {
    els = {
      header: byId('pc-header'),
      hub: byId('pc-hub'),
      gameView: byId('pc-game-view'),
      grid: byId('pc-puzzle-grid'),
      progressFill: byId('pc-progress-fill'),
      progressLabel: byId('pc-progress-label'),
      streakLabel: byId('pc-streak-label'),
      greeting: byId('pc-greeting'),
      settingsBtn: byId('pc-settings-btn'),
      backBtn: byId('pc-back-btn'),
      hintBtn: byId('pc-hint-btn'),
      gameTitle: byId('pc-game-title'),
      gameTimer: byId('pc-game-timer'),
      gameStage: byId('pc-game-stage'),
      difficultyBar: byId('pc-difficulty-bar'),
      tabPath: byId('pc-tab-path'),
      tabFree: byId('pc-tab-free'),
      panelPath: byId('pc-panel-path'),
      panelFree: byId('pc-panel-free'),
      levelPath: byId('pc-level-path'),
    };

    document.addEventListener('pointerdown', () => sound.resume(), { once: true });

    els.settingsBtn.addEventListener('click', openSettings);
    els.backBtn.addEventListener('click', exitToHub);
    els.hintBtn.addEventListener('click', useHint);
    els.tabPath.addEventListener('click', () => { sound.click(); switchTab('path'); });
    els.tabFree.addEventListener('click', () => { sound.click(); switchTab('free'); });

    renderHub();
    sound.syncMusicWithSetting();

    if (!save.getPlayerName()) {
      setTimeout(promptForName, 400);
    }

    global.PC.App = { PUZZLES, Games, launch: launchPuzzle };
  }

  function switchTab(tab) {
    const isPath = tab === 'path';
    els.tabPath.classList.toggle('is-active', isPath);
    els.tabFree.classList.toggle('is-active', !isPath);
    els.panelPath.hidden = !isPath;
    els.panelFree.hidden = isPath;
  }

  function renderGreeting() {
    const name = save.getPlayerName();
    els.greeting.textContent = name ? `${pick(WELCOME_PHRASES)}, ${name}! \u{1F44B}` : '';
    els.greeting.hidden = !name;
  }

  function promptForName(isEdit) {
    const modalRef = UI.modal({
      title: isEdit ? 'Change your name' : "What's your name?",
      bodyHtml: `
        <p style="margin:0 0 12px;color:rgba(36,20,54,0.75);">${isEdit ? "We'll use it to cheer you on and personalize your hints." : "We'll use it to cheer you on, give you personalized hints, and celebrate your wins!"}</p>
        <input type="text" id="pc-name-input" maxlength="24" placeholder="Type your name..."
          value="${(save.getPlayerName() || '').replace(/"/g, '&quot;')}"
          style="width:100%;padding:12px 14px;border-radius:12px;border:2px solid var(--pc-purple);font-size:1.05rem;font-family:var(--pc-font-body);font-weight:700;text-align:center;box-sizing:border-box;">
      `,
      buttons: [
        { label: isEdit ? 'Save' : "Let's Play! \u{1F3AE}", className: 'pc-btn--green', close: false, onClick: submit },
      ],
    });
    const input = modalRef.el.querySelector('#pc-name-input');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    function submit() {
      const name = save.setPlayerName(input.value || 'Puzzler');
      renderGreeting();
      UI.toast(`Hi, ${name || 'Puzzler'}! \u{1F44B}`);
      modalRef.close();
    }
  }

  function renderHub() {
    const { total, max } = save.totalStars(3, PUZZLES.map((p) => p.id));
    const pct = save.completionPercent(PUZZLES.map((p) => p.id));
    els.progressFill.style.width = pct + '%';
    els.progressLabel.textContent = `${pct}% complete  •  ${total}/${max} ★`;

    renderGreeting();

    const streak = save.getStreak();
    els.streakLabel.textContent = streak.current > 0
      ? `🔥 ${streak.current} day streak (best ${streak.best})`
      : `Play today to start a streak!`;

    renderLevelPath();

    els.grid.innerHTML = '';
    PUZZLES.forEach((puzzle, index) => {
      const unlocked = save.isUnlocked(puzzle.id, index);
      const entry = save.ensurePuzzle(puzzle.id);
      if (index === 0) entry.unlocked = true;

      const bestStars = Math.max(entry.tiers.easy.bestStars, entry.tiers.medium.bestStars, entry.tiers.hard.bestStars);

      const tile = document.createElement('button');
      tile.className = 'pc-tile pc-panel' + (unlocked ? '' : ' pc-tile--locked');
      tile.style.setProperty('--tile-color', puzzle.color);
      tile.innerHTML = `
        <div class="pc-tile-num">${index + 1}</div>
        <div class="pc-tile-icon">${unlocked ? puzzle.icon : '🔒'}</div>
        <div class="pc-tile-name">${puzzle.name}</div>
        <div class="pc-tile-blurb">${unlocked ? puzzle.blurb : 'Complete the previous puzzle to unlock'}</div>
        ${unlocked ? `<div class="pc-tile-stars">${UI.starsMarkup(bestStars)}</div>` : ''}
      `;
      if (unlocked) {
        tile.addEventListener('click', () => {
          sound.click();
          launchPuzzle(puzzle, index);
        });
      } else {
        tile.disabled = true;
      }
      els.grid.appendChild(tile);
    });
  }

  /* -------------------- Level Path -------------------- */

  function renderLevelPath() {
    const current = save.getCurrentLevel();
    const displayCount = Math.max(LEVEL_COUNT, current + 4);
    const container = els.levelPath;
    container.innerHTML = '';
    for (let lvl = 1; lvl <= displayCount; lvl++) {
      const hist = save.getLevelHistory(lvl);
      const row = document.createElement('div');
      row.className = 'pc-level-row ' + (lvl % 2 === 0 ? 'is-right' : 'is-left');
      const node = document.createElement('button');
      let cls = 'pc-level-node';
      let inner;
      if (lvl < current) {
        cls += ' pc-level-node--done';
        const stars = hist ? hist.stars : 0;
        inner = `<span class="pc-level-num">${lvl}</span><span class="pc-level-stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'is-lit' : ''}">★</span>`).join('')}</span>`;
      } else if (lvl === current) {
        cls += ' pc-level-node--current';
        inner = `<span class="pc-level-num">${lvl}</span><span class="pc-level-play">Play</span>`;
      } else {
        cls += ' pc-level-node--locked';
        inner = `<span>🔒</span>`;
      }
      node.className = cls;
      node.innerHTML = inner;
      if (lvl === current) {
        node.addEventListener('click', () => { sound.click(); launchLevel(lvl); });
      } else {
        node.disabled = true;
      }
      row.appendChild(node);
      container.appendChild(row);
    }
    requestAnimationFrame(() => {
      const currentEl = container.querySelector('.pc-level-node--current');
      if (currentEl) currentEl.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }

  function launchLevel(level) {
    els.header.hidden = true;
    els.hub.hidden = true;
    els.gameView.hidden = false;
    els.difficultyBar.hidden = true;
    els.difficultyBar.innerHTML = '';
    els.hintBtn.hidden = true;
    els.gameTitle.textContent = `Level ${level}`;
    els.gameTimer.textContent = '0:00';
    els.gameStage.innerHTML = '';
    stopTimer();

    const onPicked = (puzzle, index) => {
      const difficulty = difficultyForLevel(level);
      els.gameTitle.textContent = `Level ${level} · ${puzzle.name}`;
      els.gameStage.style.setProperty('--tile-color', puzzle.color);
      showIntro(puzzle, difficulty, () => beginRound(puzzle, Games.get(puzzle.id), difficulty, index, { levelMode: true, level }), { levelMode: true, level });
    };

    const pool = unlockedPuzzles();
    if (pool.length <= 1) {
      // Nothing to actually spin for yet - skip the wheel theatrics and go
      // straight to the one puzzle that's unlocked so far.
      lastSpunPuzzleId = pool[0].p.id;
      onPicked(pool[0].p, pool[0].i);
    } else {
      spinSlotWheel(level, onPicked);
    }
  }

  function unlockedPuzzles() {
    // One progression model, not two: the wheel only ever offers puzzles
    // already unlocked via the normal clear-a-puzzle-to-unlock-the-next
    // flow, same as the Free Play grid. Otherwise the wheel could hand
    // someone a puzzle that still shows locked on the Free Play tab,
    // which reads as a bug ("where did this extra one come from?").
    return PUZZLES.map((p, i) => ({ p, i })).filter(({ p, i }) => save.isUnlocked(p.id, i));
  }

  function spinSlotWheel(level, onLanded) {
    const pool = unlockedPuzzles();
    // Never land on the same game twice in a row - drop last time's pick
    // from the candidates when there's something else to offer instead.
    const candidates = pool.length > 1 ? pool.filter(({ p }) => p.id !== lastSpunPuzzleId) : pool;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const chosen = pick.p;
    const chosenIndex = pick.i;
    lastSpunPuzzleId = chosen.id;

    const wrap = document.createElement('div');
    wrap.className = 'pc-slotwheel';
    wrap.innerHTML = `
      <div class="pc-slotwheel-title">Level ${level} - spinning for your game...</div>
      <div class="pc-slotwheel-window">
        <div class="pc-slotwheel-pointer">🔻</div>
        <div class="pc-slotwheel-reel" id="pc-reel"></div>
      </div>
      <div class="pc-slotwheel-result" id="pc-slotwheel-result">&nbsp;</div>
    `;
    els.gameStage.appendChild(wrap);
    const reel = wrap.querySelector('#pc-reel');
    const resultEl = wrap.querySelector('#pc-slotwheel-result');
    const CELL = 96;
    const LOOPS = pool.length <= 2 ? 12 : 5; // keep the spin feeling substantial even with few unlocked games

    const reelPool = pool.map(({ p }) => p);
    const sequence = [];
    for (let i = 0; i < LOOPS; i++) sequence.push(...reelPool);
    sequence.push(chosen);
    sequence.forEach((p) => {
      const cell = document.createElement('div');
      cell.className = 'pc-slotwheel-cell';
      cell.innerHTML = `<span>${p.icon}</span><span class="pc-slotwheel-label">${p.name}</span>`;
      reel.appendChild(cell);
    });

    const finalIndex = sequence.length - 1;
    const targetX = -(finalIndex * CELL + CELL / 2);
    const duration = 2400;
    const start = performance.now();
    let lastTick = -1;
    function ease(t) { return 1 - Math.pow(1 - t, 4); }
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const x = targetX * ease(t);
      reel.style.transform = `translateX(${x}px)`;
      const passed = Math.floor(-x / CELL);
      if (passed !== lastTick) { lastTick = passed; sound.move(); }
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        sound.win();
        resultEl.textContent = `🎉 ${chosen.name}!`;
        UI.burstFromElement(resultEl, { count: 20 });
        setTimeout(() => onLanded(chosen, chosenIndex), 700);
      }
    }
    requestAnimationFrame(frame);
  }

  /* -------------------- Free play -------------------- */

  function launchPuzzle(puzzle, index) {
    const def = Games.get(puzzle.id);
    if (!def) {
      UI.toast(`${puzzle.name} is coming soon!`);
      return;
    }
    els.header.hidden = true;
    els.hub.hidden = true;
    els.gameView.hidden = false;
    els.difficultyBar.hidden = false;
    els.gameTitle.textContent = puzzle.name;
    els.gameStage.innerHTML = '';
    els.gameStage.style.setProperty('--tile-color', puzzle.color);
    els.hintBtn.hidden = true;

    renderDifficultyBar(puzzle, def, index);
  }

  function renderDifficultyBar(puzzle, def, index) {
    const entry = save.ensurePuzzle(puzzle.id);
    els.difficultyBar.innerHTML = '';
    PC.DIFFICULTIES.forEach((diff) => {
      const tier = entry.tiers[diff];
      const btn = document.createElement('button');
      btn.className = 'pc-diff-btn';
      btn.innerHTML = `<span class="pc-diff-label">${diff}</span>${UI.starsMarkup(tier.bestStars)}`;
      btn.addEventListener('click', () => {
        sound.click();
        startGame(puzzle, def, diff, index);
      });
      els.difficultyBar.appendChild(btn);
    });
  }

  function startGame(puzzle, def, difficulty, index) {
    showIntro(puzzle, difficulty, () => beginRound(puzzle, def, difficulty, index));
  }

  /* -------------------- Shared: intro, round lifecycle, hints -------------------- */

  function showIntro(puzzle, difficulty, onStart, meta) {
    els.gameStage.innerHTML = '';
    els.hintBtn.hidden = true;
    stopTimer();

    const levelBadge = meta && meta.levelMode ? `<div class="pc-intro-line" style="font-weight:800;color:var(--pc-orange);">Level ${meta.level} · ${difficulty} difficulty</div>` : '';

    const card = document.createElement('div');
    card.className = 'pc-intro';
    card.innerHTML = `
      <div class="pc-intro-icon">${puzzle.icon}</div>
      <div class="pc-intro-name">${puzzle.name}</div>
      ${levelBadge}
      <div class="pc-intro-block pc-intro-block--goal">
        <div class="pc-intro-block-label">🎯 Goal</div>
        <p class="pc-intro-line">${puzzle.goal}</p>
      </div>
      <div class="pc-intro-block pc-intro-block--controls">
        <div class="pc-intro-block-label">👆 How to play</div>
        <p class="pc-intro-line">${puzzle.controls}</p>
      </div>
      ${puzzle.example ? `
      <div class="pc-intro-block pc-intro-block--example">
        <div class="pc-intro-block-label">✅ For example</div>
        <p class="pc-intro-line">${puzzle.example}</p>
      </div>` : ''}
      <p class="pc-intro-line pc-intro-tip">💡 Stuck mid-game? Tap the Hint button any time.</p>
      <button class="pc-btn pc-btn--green pc-intro-start">Let's Go, ${playerName()}! 🚀</button>
    `;
    els.gameStage.appendChild(card);
    card.querySelectorAll('.pc-intro-icon, .pc-intro-name, .pc-intro-line, .pc-intro-start').forEach((el, i) => {
      el.style.animationDelay = `${i * 90}ms`;
    });
    card.querySelector('.pc-intro-start').addEventListener('click', () => {
      sound.click();
      card.classList.add('pc-intro--leaving');
      setTimeout(onStart, 220);
    });
  }

  function beginRound(puzzle, def, difficulty, index, meta) {
    meta = meta || {};
    els.difficultyBar.querySelectorAll('.pc-diff-btn').forEach((b) => b.classList.remove('is-active'));
    els.gameStage.innerHTML = '';
    stopTimer();
    startTimer();

    const name = playerName();
    const api = {
      difficulty,
      sound,
      ui: UI,
      playerName: name,
      elapsedMs: () => Date.now() - timerStart,
      win: (stars, extra) => onGameWin(puzzle, index, difficulty, stars, extra, meta),
      lose: (msg) => { sound.error(); UI.shake(els.gameStage); if (msg) UI.toast(`${name}, ${lowerFirst(msg)}`, { color: '#d6216b' }); },
    };

    if (currentGameUnmount) { try { currentGameUnmount(); } catch (e) {} currentGameUnmount = null; }
    currentGameHint = null;
    els.hintBtn.hidden = true;

    const result = def.mount(els.gameStage, difficulty, api);
    if (typeof result === 'function') {
      currentGameUnmount = result;
    } else if (result && typeof result === 'object') {
      currentGameUnmount = result.unmount || null;
      currentGameHint = result.hint || null;
    }
    els.hintBtn.hidden = !currentGameHint;
  }

  function useHint() {
    if (!currentGameHint || hintCooldown) return;
    sound.click();
    currentGameHint();
    hintCooldown = true;
    els.hintBtn.classList.add('is-cooling');
    setTimeout(() => { hintCooldown = false; els.hintBtn.classList.remove('is-cooling'); }, 1500);
  }

  function startTimer() {
    timerStart = Date.now();
    els.gameTimer.textContent = '0:00';
    timerInterval = setInterval(() => {
      els.gameTimer.textContent = UI.formatTime(Date.now() - timerStart);
    }, 250);
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function onGameWin(puzzle, index, difficulty, stars, extra, meta) {
    meta = meta || {};
    stopTimer();
    const timeMs = Date.now() - timerStart;
    const { improvedStars, improvedTime } = save.recordResult(puzzle.id, difficulty, stars, timeMs);
    sound.win();
    UI.burst(window.innerWidth / 2, window.innerHeight / 2, { count: 60 });

    const nextPuzzle = PUZZLES[index + 1];
    let unlockedNext = false;
    if (nextPuzzle) unlockedNext = save.unlock(nextPuzzle.id);

    let levelResult = null;
    if (meta.levelMode) levelResult = save.recordLevelResult(meta.level, puzzle.id, difficulty, stars, timeMs);

    const name = playerName();
    const bodyHtml = `
      <div style="margin:10px 0 4px">${UI.starsMarkup(stars, 3, true)}</div>
      ${meta.levelMode ? `<p style="margin:4px 0;font-weight:800;color:var(--pc-orange);">Level ${meta.level} cleared!</p>` : ''}
      <p style="margin:6px 0;font-weight:800;color:var(--pc-purple)">Time: ${UI.formatTime(timeMs)} ${improvedTime ? '(new best!)' : ''}</p>
      ${improvedStars ? '<p style="color:var(--pc-green);font-weight:800;">New star record!</p>' : ''}
      ${unlockedNext ? `<p style="margin-top:10px;font-weight:800;">🎉 Unlocked: ${nextPuzzle.name}!</p>` : ''}
    `;

    setTimeout(() => {
      if (unlockedNext) sound.unlock();
      const buttons = meta.levelMode
        ? [
            { label: '▶ Next Level', className: 'pc-btn--blue', onClick: () => launchLevel(meta.level + 1) },
            { label: '🗺️ Level Path', className: 'pc-btn--green', onClick: exitToHub },
          ]
        : [
            { label: '🔁 Play Again', className: 'pc-btn--blue', onClick: () => beginRound(puzzle, Games.get(puzzle.id), difficulty, index) },
            { label: '🏠 Back to Hub', className: 'pc-btn--green', onClick: exitToHub },
          ];
      UI.modal({ title: `${pick(WIN_PHRASES)}, ${name}!`, bodyHtml, buttons });
    }, 350);
  }

  function exitToHub() {
    sound.click();
    stopTimer();
    if (currentGameUnmount) { try { currentGameUnmount(); } catch (e) {} currentGameUnmount = null; }
    currentGameHint = null;
    els.gameStage.innerHTML = '';
    els.gameView.hidden = true;
    els.hub.hidden = false;
    els.header.hidden = false;
    renderHub();
  }

  function openSettings() {
    sound.click();
    const musicOn = !save.getSetting('muteMusic');
    const sfxOn = !save.getSetting('muteSfx');
    const modalRef = UI.modal({
      title: 'Settings',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:14px;align-items:stretch;text-align:left;">
          <label style="display:flex;justify-content:space-between;align-items:center;font-weight:700;">
            🎶 Music
            <input type="checkbox" id="pc-set-music" ${musicOn ? 'checked' : ''} style="width:22px;height:22px;">
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;font-weight:700;">
            🔊 Sound Effects
            <input type="checkbox" id="pc-set-sfx" ${sfxOn ? 'checked' : ''} style="width:22px;height:22px;">
          </label>
          <button class="pc-btn pc-btn--ghost" id="pc-set-name-btn" style="color:var(--pc-ink);box-shadow:inset 0 0 0 2px rgba(36,20,54,0.25);">✏️ Change name (${playerName()})</button>
        </div>
      `,
      buttons: [
        { label: '⚠️ Reset Progress', className: 'pc-btn--ghost', close: false, onClick: confirmReset },
        { label: 'Done', className: 'pc-btn--green' },
      ],
    });
    modalRef.el.querySelector('#pc-set-music').addEventListener('change', (e) => {
      save.setSetting('muteMusic', !e.target.checked);
      sound.syncMusicWithSetting();
    });
    modalRef.el.querySelector('#pc-set-sfx').addEventListener('change', (e) => {
      save.setSetting('muteSfx', !e.target.checked);
    });
    modalRef.el.querySelector('#pc-set-name-btn').addEventListener('click', () => {
      modalRef.close();
      promptForName(true);
    });
  }

  function confirmReset() {
    UI.modal({
      title: 'Reset everything?',
      bodyHtml: '<p>This clears all stars, times, unlocked puzzles, level progress, and your name. This can\'t be undone.</p>',
      buttons: [
        { label: 'Cancel', className: 'pc-btn--ghost' },
        { label: 'Reset', className: 'pc-btn--blue', onClick: () => { save.resetProgress(); renderHub(); UI.toast('Progress reset'); } },
      ],
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
