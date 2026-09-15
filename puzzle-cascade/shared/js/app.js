/**
 * PC.App - the hub shell: puzzle grid, navigation, timer, settings,
 * and the glue that connects a mounted game module to SaveManager.
 *
 * Each game module registers itself with:
 *   PC.Games.register(id, {
 *     mount(container, difficulty, api) -> returns an optional unmount fn
 *   });
 * `api` gives the game: { win(stars, extraStats), exit(), sound, ui, difficulty }
 */
(function (global) {
  const PUZZLES = [
    { id: 'sliding', name: 'Sliding Tiles', icon: '🧩', color: '#ff4d8d', blurb: 'Slide tiles back into order.' },
    { id: 'memory', name: 'Memory Match', icon: '🃏', color: '#ff9f43', blurb: 'Flip cards, find every pair.' },
    { id: 'match3', name: 'Color Match-3', icon: '💎', color: '#ffd93d', blurb: 'Swap gems, clear lines of 3+.' },
    { id: 'maze', name: 'Maze Runner', icon: '🏃', color: '#23d18b', blurb: 'Race to the exit before time runs out.' },
    { id: 'sokoban', name: 'Block Push', icon: '📦', color: '#17c3b2', blurb: 'Push every crate onto its target.' },
    { id: 'wordsearch', name: 'Word Search', icon: '🔤', color: '#3f8efc', blurb: 'Find every hidden word in the grid.' },
    { id: 'merge2048', name: 'Number Merge', icon: '🔢', color: '#a259ff', blurb: 'Merge tiles to reach the target number.' },
    { id: 'jigsaw', name: 'Jigsaw', icon: '🧩', color: '#ff5c5c', blurb: 'Drag pieces to rebuild the picture.' },
    { id: 'simon', name: 'Pattern Memory', icon: '🎵', color: '#ff4d8d', blurb: 'Repeat the ever-growing sequence.' },
    { id: 'lightsout', name: 'Logic Grid', icon: '💡', color: '#ffd93d', blurb: 'The final boss: clear every light.' },
  ];

  const Games = { _registry: {}, register(id, def) { this._registry[id] = def; }, get(id) { return this._registry[id]; } };
  global.PC.Games = Games; // exposed immediately: game scripts register() synchronously at load time, before DOMContentLoaded

  const save = global.PC.SaveManager;
  const sound = global.PC.SoundManager;
  const UI = global.PC.UI;

  let els = {};
  let currentGameUnmount = null;
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
      settingsBtn: byId('pc-settings-btn'),
      backBtn: byId('pc-back-btn'),
      gameTitle: byId('pc-game-title'),
      gameTimer: byId('pc-game-timer'),
      gameStage: byId('pc-game-stage'),
      difficultyBar: byId('pc-difficulty-bar'),
      musicToggle: byId('pc-music-toggle'),
    };

    document.addEventListener('pointerdown', () => sound.resume(), { once: true });

    els.settingsBtn.addEventListener('click', openSettings);
    els.backBtn.addEventListener('click', exitToHub);

    renderHub();
    sound.syncMusicWithSetting();

    global.PC.App = { PUZZLES, Games, launch: launchPuzzle };
  }

  function renderHub() {
    const { total, max } = save.totalStars(3, PUZZLES.map((p) => p.id));
    const pct = save.completionPercent(PUZZLES.map((p) => p.id));
    els.progressFill.style.width = pct + '%';
    els.progressLabel.textContent = `${pct}% complete  •  ${total}/${max} ★`;

    const streak = save.getStreak();
    els.streakLabel.textContent = streak.current > 0
      ? `🔥 ${streak.current} day streak (best ${streak.best})`
      : `Play today to start a streak!`;

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

  function launchPuzzle(puzzle, index) {
    const def = Games.get(puzzle.id);
    if (!def) {
      UI.toast(`${puzzle.name} is coming soon!`);
      return;
    }
    els.hub.hidden = true;
    els.gameView.hidden = false;
    els.gameTitle.textContent = puzzle.name;
    els.gameStage.innerHTML = '';
    els.gameStage.style.setProperty('--tile-color', puzzle.color);

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
    els.difficultyBar.querySelectorAll('.pc-diff-btn').forEach((b) => b.classList.remove('is-active'));
    els.gameStage.innerHTML = '';
    stopTimer();
    startTimer();

    const api = {
      difficulty,
      sound,
      ui: UI,
      elapsedMs: () => Date.now() - timerStart,
      win: (stars, extra) => onGameWin(puzzle, index, difficulty, stars, extra),
      lose: (msg) => { sound.error(); UI.shake(els.gameStage); if (msg) UI.toast(msg, { color: '#d6216b' }); },
    };

    if (currentGameUnmount) { try { currentGameUnmount(); } catch (e) {} currentGameUnmount = null; }
    currentGameUnmount = def.mount(els.gameStage, difficulty, api) || null;
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

  function onGameWin(puzzle, index, difficulty, stars, extra) {
    stopTimer();
    const timeMs = Date.now() - timerStart;
    const { improvedStars, improvedTime } = save.recordResult(puzzle.id, difficulty, stars, timeMs);
    sound.win();
    UI.burst(window.innerWidth / 2, window.innerHeight / 2, { count: 60 });

    const nextPuzzle = PUZZLES[index + 1];
    let unlockedNext = false;
    if (nextPuzzle) unlockedNext = save.unlock(nextPuzzle.id);

    const bodyHtml = `
      <div style="margin:10px 0 4px">${UI.starsMarkup(stars, 3, true)}</div>
      <p style="margin:6px 0;font-weight:800;color:var(--pc-purple)">Time: ${UI.formatTime(timeMs)} ${improvedTime ? '(new best!)' : ''}</p>
      ${improvedStars ? '<p style="color:var(--pc-green);font-weight:800;">New star record!</p>' : ''}
      ${unlockedNext ? `<p style="margin-top:10px;font-weight:800;">🎉 Unlocked: ${nextPuzzle.name}!</p>` : ''}
    `;

    setTimeout(() => {
      if (unlockedNext) sound.unlock();
      UI.modal({
        title: 'Puzzle Complete!',
        bodyHtml,
        buttons: [
          { label: '🔁 Play Again', className: 'pc-btn--blue', onClick: () => startGame(puzzle, Games.get(puzzle.id), difficulty, index) },
          { label: '🏠 Back to Hub', className: 'pc-btn--green', onClick: exitToHub },
        ],
      });
    }, 350);
  }

  function exitToHub() {
    sound.click();
    stopTimer();
    if (currentGameUnmount) { try { currentGameUnmount(); } catch (e) {} currentGameUnmount = null; }
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
  }

  function confirmReset() {
    UI.modal({
      title: 'Reset everything?',
      bodyHtml: '<p>This clears all stars, times, and unlocked puzzles. This can\'t be undone.</p>',
      buttons: [
        { label: 'Cancel', className: 'pc-btn--ghost' },
        { label: 'Reset', className: 'pc-btn--blue', onClick: () => { save.resetProgress(); renderHub(); UI.toast('Progress reset'); } },
      ],
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
