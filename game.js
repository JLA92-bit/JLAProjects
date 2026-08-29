(() => {
  "use strict";

  // ---------- Constants ----------
  const TILE = 56;
  const COLS = 10;
  const ROWS = 7;
  const DAY_LENGTH_MS = 25000; // real seconds per in-game day
  const PLAYER_SPEED = 130; // px/sec

  const CROPS = {
    wheat:  { name: "Wheat",  emoji: "🌾", seedCost: 5,  growDays: 3, basePrice: 10 },
    corn:   { name: "Corn",   emoji: "🌽", seedCost: 10, growDays: 4, basePrice: 22 },
    tomato: { name: "Tomato", emoji: "🍅", seedCost: 20, growDays: 5, basePrice: 45 },
  };
  const CROP_KEYS = Object.keys(CROPS);

  const REGION_NAMES = [
    "Ashville Fields", "Green Hollow", "Ironcrest Farms",
    "Prairie Union", "Sunset Basin", "North Ridge",
  ];

  // Tile states: 'grass' | 'soil' | 'planted'
  // planted tile: { crop, stage(0-4), watered, infected, infectedDays }

  const SAVE_KEY = "farmWorldSave_v1";

  // ---------- State ----------
  function freshState() {
    const tiles = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        row.push({ type: "grass" });
      }
      tiles.push(row);
    }
    const regions = REGION_NAMES.map((name, i) => ({
      name, health: 100, owned: i === -1, // none owned at start
    }));
    return {
      cash: 100,
      day: 1,
      dayProgress: 0,
      player: { x: TILE * 2, y: TILE * 2, facing: "down" },
      seeds: { wheat: 6, corn: 2, tomato: 0 },
      produce: { wheat: 0, corn: 0, tomato: 0 },
      prices: { wheat: 10, corn: 22, tomato: 45 },
      selectedCrop: "wheat",
      tiles,
      regions,
      outbreakPressure: 0,
      log: "Welcome! Till grass with E, then plant, water, and harvest.",
    };
  }

  let state = load() || freshState();

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    logMsg("Game saved.");
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function logMsg(msg) {
    state.log = msg;
    document.getElementById("log").textContent = msg;
  }

  // ---------- Canvas / Input ----------
  const canvas = document.getElementById("farmCanvas");
  const ctx = canvas.getContext("2d");

  const keys = new Set();
  const heldDirs = new Set(); // for touch dpad

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
    if (k === "e") doAction();
    if (k === "c") doCure();
    if (k === "m") toggleMap();
    if (k === "1") selectCrop("wheat");
    if (k === "2") selectCrop("corn");
    if (k === "3") selectCrop("tomato");
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });

  function setupDpadButton(id, dir) {
    const el = document.getElementById(id);
    const start = (e) => { e.preventDefault(); heldDirs.add(dir); };
    const end = (e) => { e.preventDefault(); heldDirs.delete(dir); };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchend", end, { passive: false });
    el.addEventListener("touchcancel", end, { passive: false });
    el.addEventListener("mousedown", start);
    el.addEventListener("mouseup", end);
    el.addEventListener("mouseleave", end);
  }
  setupDpadButton("dpad-up", "up");
  setupDpadButton("dpad-down", "down");
  setupDpadButton("dpad-left", "left");
  setupDpadButton("dpad-right", "right");

  document.getElementById("btn-action").addEventListener("click", doAction);
  document.getElementById("btn-cure").addEventListener("click", doCure);
  document.getElementById("btn-map-mobile").addEventListener("click", toggleMap);
  document.getElementById("btn-map").addEventListener("click", toggleMap);
  document.getElementById("btn-close-map").addEventListener("click", toggleMap);
  document.getElementById("btn-save").addEventListener("click", save);
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("Reset all progress?")) {
      localStorage.removeItem(SAVE_KEY);
      state = freshState();
      renderSidebar();
    }
  });

  function selectCrop(key) {
    state.selectedCrop = key;
    renderSidebar();
  }

  // ---------- Movement helpers ----------
  function isMovingDir(dir) {
    if (dir === "up") return keys.has("w") || keys.has("arrowup") || heldDirs.has("up");
    if (dir === "down") return keys.has("s") || keys.has("arrowdown") || heldDirs.has("down");
    if (dir === "left") return keys.has("a") || keys.has("arrowleft") || heldDirs.has("left");
    if (dir === "right") return keys.has("d") || keys.has("arrowright") || heldDirs.has("right");
    return false;
  }

  function facingTile() {
    const p = state.player;
    let tx = Math.floor(p.x / TILE);
    let ty = Math.floor(p.y / TILE);
    if (p.facing === "up") ty -= 1;
    if (p.facing === "down") ty += 1;
    if (p.facing === "left") tx -= 1;
    if (p.facing === "right") tx += 1;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
    return { tx, ty };
  }

  function doAction() {
    const f = facingTile();
    if (!f) return;
    const tile = state.tiles[f.ty][f.tx];
    if (tile.type === "grass") {
      tile.type = "soil";
      logMsg("Tilled soil.");
    } else if (tile.type === "soil") {
      const cropKey = state.selectedCrop;
      if (state.seeds[cropKey] <= 0) {
        logMsg(`No ${CROPS[cropKey].name} seeds left! Buy more.`);
        return;
      }
      state.seeds[cropKey]--;
      tile.type = "planted";
      tile.crop = cropKey;
      tile.stage = 0;
      tile.watered = false;
      tile.infected = false;
      tile.infectedDays = 0;
      logMsg(`Planted ${CROPS[cropKey].name}.`);
    } else if (tile.type === "planted") {
      if (tile.stage >= 4) {
        if (tile.infected) {
          logMsg("That crop is blighted — harvest yields nothing. Cure it or till it under.");
          tile.type = "grass";
          delete tile.crop;
          return;
        }
        state.produce[tile.crop]++;
        logMsg(`Harvested ${CROPS[tile.crop].name}!`);
        tile.type = "soil";
        delete tile.crop;
      } else if (!tile.watered) {
        tile.watered = true;
        logMsg("Watered crop.");
      } else {
        logMsg("Already watered today. It's growing...");
      }
    }
    renderSidebar();
  }

  function doCure() {
    const f = facingTile();
    if (!f) return;
    const tile = state.tiles[f.ty][f.tx];
    if (tile.type === "planted" && tile.infected) {
      const cost = 15;
      if (state.cash < cost) {
        logMsg(`Need $${cost} to cure this blight.`);
        return;
      }
      state.cash -= cost;
      tile.infected = false;
      tile.infectedDays = 0;
      logMsg("Cured the blight for $15.");
      renderSidebar();
    } else {
      logMsg("Nothing to cure here.");
    }
  }

  // ---------- Day tick: growth, market, blight, world ----------
  function dayTick() {
    state.day++;

    // Crop growth + blight spread
    let infectedTiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = state.tiles[r][c];
        if (t.type !== "planted") continue;
        if (t.stage < 4) {
          if (t.watered) t.stage++;
          else if (Math.random() < 0.5) t.stage++;
        }
        t.watered = false;

        if (t.infected) {
          t.infectedDays = (t.infectedDays || 0) + 1;
          infectedTiles.push({ r, c });
          if (t.infectedDays >= 4) {
            // crop dies, tile becomes wasted grass
            t.type = "grass";
            delete t.crop;
          }
        } else {
          // baseline infection chance, rises with existing infections (epidemic-ish)
          const chance = 0.02 + infectedTiles.length * 0.01;
          if (Math.random() < chance) {
            t.infected = true;
            t.infectedDays = 0;
          }
        }
      }
    }

    // Spread infection to adjacent planted tiles
    infectedTiles.forEach(({ r, c }) => {
      const neighbors = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
      neighbors.forEach(([nr, nc]) => {
        if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) return;
        const nt = state.tiles[nr][nc];
        if (nt.type === "planted" && !nt.infected && Math.random() < 0.3) {
          nt.infected = true;
          nt.infectedDays = 0;
        }
      });
    });

    // Market price random walk
    CROP_KEYS.forEach((k) => {
      const base = CROPS[k].basePrice;
      const drift = (Math.random() - 0.5) * base * 0.3;
      let np = state.prices[k] + drift;
      np = Math.max(base * 0.4, Math.min(base * 1.8, np));
      state.prices[k] = Math.round(np);
    });

    // World map effects
    state.outbreakPressure = infectedTiles.length;
    const ownedRegions = state.regions.filter(r => r.owned);
    const unownedRegions = state.regions.filter(r => !r.owned);

    // Outbreak pressure can weaken a random unowned rival region (cheaper to buy)
    if (state.outbreakPressure > 0 && unownedRegions.length > 0 && Math.random() < 0.15 + state.outbreakPressure * 0.05) {
      const target = unownedRegions[Math.floor(Math.random() * unownedRegions.length)];
      target.health = Math.max(10, target.health - (10 + Math.random() * 15));
      logMsg(`Blight rumors have weakened ${target.name}!`);
    }

    // High pressure risks blowback on your own owned regions
    if (state.outbreakPressure >= 3 && ownedRegions.length > 0 && Math.random() < 0.2) {
      const target = ownedRegions[Math.floor(Math.random() * ownedRegions.length)];
      target.health = Math.max(5, target.health - 15);
      logMsg(`Outbreak spread back and hurt your region: ${target.name}!`);
    }

    // Regions slowly regenerate health, owned regions give passive income
    state.regions.forEach((reg) => {
      if (reg.health < 100) reg.health = Math.min(100, reg.health + 2);
      if (reg.owned) {
        state.cash += Math.round(reg.health * 0.5);
      }
    });

    renderSidebar();
    renderRegions();
  }

  function regionPrice(reg) {
    return Math.round((reg.health / 100) * 300 + 100);
  }

  function toggleMap() {
    const modal = document.getElementById("map-modal");
    modal.classList.toggle("hidden");
    if (!modal.classList.contains("hidden")) renderRegions();
  }

  function renderRegions() {
    const grid = document.getElementById("regions-grid");
    grid.innerHTML = "";
    state.regions.forEach((reg) => {
      const card = document.createElement("div");
      card.className = "region-card" + (reg.owned ? " owned" : "");
      const price = regionPrice(reg);
      card.innerHTML = `
        <h3>${reg.name}${reg.owned ? " 👑" : ""}</h3>
        <div>Health: ${Math.round(reg.health)}%</div>
        <div class="health-bar"><div class="health-fill" style="width:${reg.health}%"></div></div>
        ${reg.owned ? "<div>Generating income daily.</div>" :
          `<button data-region="${reg.name}" ${state.cash < price ? "disabled" : ""}>Buy for $${price}</button>`}
      `;
      grid.appendChild(card);
    });
    grid.querySelectorAll("button[data-region]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reg = state.regions.find(r => r.name === btn.dataset.region);
        const price = regionPrice(reg);
        if (state.cash >= price) {
          state.cash -= price;
          reg.owned = true;
          logMsg(`You acquired ${reg.name}!`);
          renderSidebar();
          renderRegions();
        }
      });
    });
  }

  // ---------- Sidebar rendering ----------
  function renderSidebar() {
    document.getElementById("stat-cash").textContent = `💰 $${state.cash}`;
    document.getElementById("stat-day").textContent = `☀️ Day ${state.day}`;
    const ownedCount = state.regions.filter(r => r.owned).length;
    const pct = Math.round((ownedCount / state.regions.length) * 100);
    document.getElementById("stat-domination").textContent = `🌍 ${pct}% owned`;

    const seedList = document.getElementById("seed-list");
    seedList.innerHTML = "";
    CROP_KEYS.forEach((key) => {
      const crop = CROPS[key];
      const row = document.createElement("div");
      row.className = "seed-row" + (state.selectedCrop === key ? " selected" : "");
      row.innerHTML = `
        <span>${crop.emoji} ${crop.name} (seeds: ${state.seeds[key]})</span>
        <button data-buy="${key}">Buy seed $${crop.seedCost}</button>
      `;
      row.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") return;
        selectCrop(key);
      });
      seedList.appendChild(row);
    });
    seedList.querySelectorAll("button[data-buy]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.dataset.buy;
        const cost = CROPS[key].seedCost;
        if (state.cash >= cost) {
          state.cash -= cost;
          state.seeds[key]++;
          renderSidebar();
        }
      });
    });

    const body = document.getElementById("market-body");
    body.innerHTML = "";
    CROP_KEYS.forEach((key) => {
      const crop = CROPS[key];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${crop.emoji} ${crop.name}</td>
        <td>${state.seeds[key]}</td>
        <td>${state.produce[key]}</td>
        <td>$${state.prices[key]}</td>
        <td><button data-sell="${key}" ${state.produce[key] === 0 ? "disabled" : ""}>Sell all</button></td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll("button[data-sell]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.sell;
        const amount = state.produce[key];
        const earnings = amount * state.prices[key];
        state.cash += earnings;
        state.produce[key] = 0;
        logMsg(`Sold ${amount} ${CROPS[key].name} for $${earnings}.`);
        renderSidebar();
      });
    });

    let infectedCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.tiles[r][c].infected) infectedCount++;
      }
    }
    const blightInfo = document.getElementById("blight-info");
    if (infectedCount > 0) {
      blightInfo.textContent = `⚠️ ${infectedCount} tile(s) infected with blight! Cure (C) or contain the spread.`;
      blightInfo.classList.add("active");
    } else {
      blightInfo.textContent = "No active blight. Your farm is healthy.";
      blightInfo.classList.remove("active");
    }
  }

  // ---------- Draw loop ----------
  function tileColor(tile) {
    if (tile.type === "grass") return "#4a7a4f";
    if (tile.type === "soil") return "#6b4a34";
    if (tile.type === "planted") {
      if (tile.infected) return "#8a3a3a";
      const shades = ["#7a5a3a", "#8fae4f", "#a9c95a", "#c8e06a", "#e0c94a"];
      return shades[tile.stage] || "#7a5a3a";
    }
    return "#4a7a4f";
  }

  function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = state.tiles[r][c];
        ctx.fillStyle = tileColor(tile);
        ctx.fillRect(c * TILE, r * TILE, TILE - 2, TILE - 2);
        if (tile.type === "planted") {
          ctx.font = "24px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const emoji = tile.stage >= 4 ? CROPS[tile.crop].emoji : "🌱";
          ctx.fillText(tile.infected ? "☠️" : emoji, c * TILE + TILE / 2, r * TILE + TILE / 2);
        }
      }
    }
    // player
    const p = state.player;
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const arrow = { up: "🔺", down: "🔻", left: "◀️", right: "▶️" }[p.facing];
    ctx.fillText("🧑‍🌾", p.x + TILE / 2, p.y + TILE / 2);
    ctx.font = "14px sans-serif";
    ctx.fillText(arrow, p.x + TILE / 2, p.y - 4);
  }

  // ---------- Main loop ----------
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(50, now - lastTime); // ms, clamp for tab-switch stalls
    lastTime = now;
    update(dt);
    drawScene();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const p = state.player;
    let dx = 0, dy = 0;
    if (isMovingDir("up")) { dy -= 1; p.facing = "up"; }
    if (isMovingDir("down")) { dy += 1; p.facing = "down"; }
    if (isMovingDir("left")) { dx -= 1; p.facing = "left"; }
    if (isMovingDir("right")) { dx += 1; p.facing = "right"; }
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speed = PLAYER_SPEED * (dt / 1000);
      let nx = p.x + (dx / len) * speed;
      let ny = p.y + (dy / len) * speed;
      nx = Math.max(0, Math.min(COLS * TILE - TILE, nx));
      ny = Math.max(0, Math.min(ROWS * TILE - TILE, ny));
      p.x = nx;
      p.y = ny;
    }

    state.dayProgress += dt;
    if (state.dayProgress >= DAY_LENGTH_MS) {
      state.dayProgress = 0;
      dayTick();
    }
  }

  // ---------- Init ----------
  renderSidebar();
  renderRegions();
  logMsg(state.log);
  requestAnimationFrame(loop);

  // Autosave every 10s and on unload
  setInterval(save, 10000);
  window.addEventListener("beforeunload", save);
})();
