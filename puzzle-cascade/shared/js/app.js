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
      goal: 'Slide tiles into the empty gap until the numbers run in order, left to right, top to bottom.',
      controls: 'Tap a tile next to the empty gap to slide it.',
    },
    {
      id: 'memory', name: 'Memory Match', icon: '🃏', color: '#ff9f43',
      blurb: 'Flip cards, find every pair.',
      goal: 'Flip two cards at a time and find every matching pair, using as few attempts as you can.',
      controls: 'Tap a card to flip it face up.',
    },
    {
      id: 'match3', name: 'Color Match-3', icon: '💎', color: '#ffd93d',
      blurb: 'Swap gems, clear lines of 3+.',
      goal: 'Swap two neighboring gems to line up 3 or more of the same color, and reach the target score before your moves run out.',
      controls: 'Tap a gem, then tap a neighbor to swap them.',
    },
    {
      id: 'maze', name: 'Maze Runner', icon: '🏃', color: '#23d18b',
      blurb: 'Race to the exit before time runs out.',
      goal: 'Guide your character through the maze to the flag before the clock runs out.',
      controls: 'Arrow keys, WASD, or the on-screen pad.',
    },
    {
      id: 'sokoban', name: 'Block Push', icon: '📦', color: '#17c3b2',
      blurb: 'Push every crate onto its target.',
      goal: 'Push every crate onto a glowing target. You can only push, never pull, so plan your route before you commit.',
      controls: 'Arrow keys, WASD, or the on-screen pad.',
    },
    {
      id: 'wordsearch', name: 'Word Search', icon: '🔤', color: '#3f8efc',
      blurb: 'Find every hidden word in the grid.',
      goal: 'Find every word from the list hidden in the letter grid - across, down, diagonal, even backwards.',
      controls: 'Drag across the letters that spell a word.',
    },
    {
      id: 'merge2048', name: 'Number Merge', icon: '🔢', color: '#a259ff',
      blurb: 'Merge tiles to reach the target number.',
      goal: 'Slide every tile at once - two tiles with the same number merge into one, doubled. Reach the target number to win.',
      controls: 'Swipe, or use the arrow keys.',
    },
    {
      id: 'jigsaw', name: 'Jigsaw', icon: '🧩', color: '#ff5c5c',
      blurb: 'Drag pieces to rebuild the picture.',
      goal: 'Drag every scattered piece into its outlined slot on the board to rebuild the full picture.',
      controls: 'Drag a piece with your finger or mouse.',
    },
    {
      id: 'simon', name: 'Pattern Memory', icon: '🎵', color: '#ff4d8d',
      blurb: 'Repeat the ever-growing sequence.',
      goal: 'Watch the pads light up in sequence, then repeat the pattern back. Every round adds one more step - and speeds up.',
      controls: 'Tap the pads in the order they lit up.',
    },
    {
      id: 'lightsout', name: 'Logic Grid', icon: '💡', color: '#ffd93d',
      blurb: 'The final boss: clear every light.',
      goal: 'Turn every light off. Pressing a light also flips its neighbors, so think ahead - this is the final boss puzzle.',
      controls: 'Tap a light to flip it and its orthogonal neighbors.',
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
  let currentGameUnmount = null;
  let currentGameHint = null;
  let hintCooldown = false;
  let timerInterval = null;
  let timerStart = 0;

  function byId(id) { return document.getElementById(id); }

  function init() {
    els = {
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
    els.hub.hidden = true;
    els.gameView.hidden = false;
    els.difficultyBar.hidden = true;
    els.difficultyBar.innerHTML = '';
    els.hintBtn.hidden = true;
    els.gameTitle.textContent = `Level ${level}`;
    els.gameTimer.textContent = '0:00';
    els.gameStage.innerHTML = '';
    stopTimer();
    spinSlotWheel(level, (puzzle, index) => {
      const difficulty = difficultyForLevel(level);
      els.gameTitle.textContent = `Level ${level} · ${puzzle.name}`;
      els.gameStage.style.setProperty('--tile-color', puzzle.color);
      showIntro(puzzle, difficulty, () => beginRound(puzzle, Games.get(puzzle.id), difficulty, index, { levelMode: true, level }), { levelMode: true, level });
    });
  }

  function spinSlotWheel(level, onLanded) {
    const chosenIndex = Math.floor(Math.random() * PUZZLES.length);
    const chosen = PUZZLES[chosenIndex];

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
    const LOOPS = 5;

    const sequence = [];
    for (let i = 0; i < LOOPS; i++) sequence.push(...PUZZLES);
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
      <p class="pc-intro-line pc-intro-goal">${puzzle.goal}</p>
      <p class="pc-intro-line pc-intro-controls"><strong>How to play:</strong> ${puzzle.controls}</p>
      <p class="pc-intro-line pc-intro-tip">💡 Stuck? Tap the Hint button any time.</p>
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
