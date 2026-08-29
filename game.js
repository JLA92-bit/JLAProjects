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

  const TOOLS = {
    hoe:   { name: "Hoe",          emoji: "🔨", key: "1" },
    water: { name: "Watering Can", emoji: "💧", key: "2" },
    seed:  { name: "Seed Bag",     emoji: "🌱", key: "3" },
    cure:  { name: "Cure Spray",   emoji: "🧪", key: "4" },
  };
  const TOOL_KEYS = Object.keys(TOOLS);
  const WILT_DAYS = 3; // consecutive unwatered days before a planted crop dies
  const CURE_COST = 15;

  // World map scale: continents made up of several regions, each with a terrain
  // flavor used both for its card art and (loosely) its name pool.
  const TERRAINS = ["grass", "farmland", "beach", "cliff", "water"];
  const CONTINENTS = [
    { name: "Verdant Plains", regions: ["Ashville Fields", "Green Hollow", "Prairie Union", "Millbrook", "Oakmere"] },
    { name: "Sunspire Coast", regions: ["Sunset Basin", "Shellhaven", "Tideward Cove", "Palmrest", "Coral Landing"] },
    { name: "Ironcrest Highlands", regions: ["Ironcrest Farms", "North Ridge", "Stonefall", "Greywatch", "Craggen Hold"] },
    { name: "Blueriver Delta", regions: ["Riverside Union", "Mossy Bend", "Willowmere", "Deepwater Flats", "Marsh Landing"] },
  ];

  // Tile states: 'grass' | 'soil' | 'planted'
  // planted tile: { crop, stage(0-4), watered, infected, infectedDays }

  const SAVE_KEY = "farmWorldSave_v3";

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
    const regions = [];
    CONTINENTS.forEach((continent) => {
      continent.regions.forEach((name, i) => {
        regions.push({
          name,
          continent: continent.name,
          terrain: TERRAINS[i % TERRAINS.length],
          health: 100,
          owned: false,
        });
      });
    });
    return {
      cash: 100,
      day: 1,
      dayProgress: 0,
      player: { x: TILE * 2, y: TILE * 2, facing: "down" },
      seeds: { wheat: 6, corn: 2, tomato: 0 },
      produce: { wheat: 0, corn: 0, tomato: 0 },
      prices: { wheat: 10, corn: 22, tomato: 45 },
      selectedCrop: "wheat",
      selectedTool: "hoe",
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
  ctx.imageSmoothingEnabled = false;

  // ---------- Sprite assets ----------
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }
  const SPRITES = {
    grass: loadImage("assets/cutefantasy/tiles/Grass_Middle.png"),
    farmland: loadImage("assets/cutefantasy/tiles/FarmLand_Tile.png"),
    player: loadImage("assets/sprout/characters/Basic_Character_Spritesheet.png"),
    plants: loadImage("assets/sprout/objects/Basic_Plants.png"),
    oakTree: loadImage("assets/cutefantasy/decoration/Oak_Tree.png"),
    cow: loadImage("assets/sprout/characters/Free_Cow_Sprites.png"),
    chicken: loadImage("assets/sprout/characters/Free_Chicken_Sprites.png"),
    pig: loadImage("assets/cutefantasy/animals/Pig.png"),
    sheep: loadImage("assets/cutefantasy/animals/Sheep.png"),
  };
  // Fixed decorative scenery: a couple of trees and grazing animals dotted
  // around the farm border (non-interactive, purely visual).
  const SCENERY = [
    { img: "oakTree", tx: 0, ty: 0, w: 1, h: 1.3 },
    { img: "oakTree", tx: 9, ty: 0, w: 1, h: 1.3 },
    { img: "cow", tx: 8, ty: 6, frame: 0, frames: 5, fw: 19, fh: 16 },
    { img: "chicken", tx: 1, ty: 6, frame: 0, frames: 5, fw: 16, fh: 16 },
    { img: "pig", tx: 4, ty: 0, frame: 0, frames: 4, fw: 16, fh: 16 },
    { img: "sheep", tx: 6, ty: 0, frame: 0, frames: 4, fw: 16, fh: 16 },
  ];

  const keys = new Set();
  const heldDirs = new Set(); // for touch dpad

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)) {
      keys.add(k);
      e.preventDefault();
    }
    if (k === "e") doAction();
    if (k === "m") toggleMap();
    const toolByKey = TOOL_KEYS.find((t) => TOOLS[t].key === k);
    if (toolByKey) selectTool(toolByKey);
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
  document.getElementById("btn-cycle-tool").addEventListener("click", () => {
    const idx = TOOL_KEYS.indexOf(state.selectedTool);
    selectTool(TOOL_KEYS[(idx + 1) % TOOL_KEYS.length]);
  });
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

  function selectTool(key) {
    state.selectedTool = key;
    document.getElementById("current-tool-name").textContent = TOOLS[key].name;
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

    // Harvesting a ready crop needs no tool - always available.
    if (tile.type === "planted" && tile.stage >= 4) {
      if (tile.infected) {
        logMsg("That crop is blighted — harvest yields nothing. Cure it or till it under.");
        tile.type = "grass";
        delete tile.crop;
      } else {
        const wellTended = (tile.timesWatered || 0) >= CROPS[tile.crop].growDays;
        const yieldAmount = wellTended ? 2 : 1;
        state.produce[tile.crop] += yieldAmount;
        logMsg(`Harvested ${yieldAmount}x ${CROPS[tile.crop].name}${wellTended ? " (well-tended bonus!)" : ""}.`);
        tile.type = "soil";
        delete tile.crop;
      }
      renderSidebar();
      return;
    }

    const tool = state.selectedTool;
    if (tool === "hoe") {
      if (tile.type === "grass") {
        tile.type = "soil";
        logMsg("Tilled soil with the hoe.");
      } else {
        logMsg("The hoe only works on grass.");
      }
    } else if (tool === "seed") {
      if (tile.type !== "soil") {
        logMsg("Seeds need tilled soil — till it with the hoe first.");
        return;
      }
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
      tile.timesWatered = 0;
      tile.infected = false;
      tile.infectedDays = 0;
      tile.dryDays = 0;
      logMsg(`Planted ${CROPS[cropKey].name}.`);
    } else if (tool === "water") {
      if (tile.type !== "planted") {
        logMsg("Nothing planted here to water.");
        return;
      }
      if (tile.watered) {
        logMsg("Already watered today. It's growing...");
        return;
      }
      tile.watered = true;
      tile.timesWatered = (tile.timesWatered || 0) + 1;
      logMsg("Watered the crop.");
    } else if (tool === "cure") {
      if (tile.type === "planted" && tile.infected) {
        if (state.cash < CURE_COST) {
          logMsg(`Need $${CURE_COST} to cure this blight.`);
          return;
        }
        state.cash -= CURE_COST;
        tile.infected = false;
        tile.infectedDays = 0;
        logMsg(`Cured the blight for $${CURE_COST}.`);
      } else {
        logMsg("Nothing to cure here.");
        return;
      }
    }
    renderSidebar();
  }

  // ---------- Day tick: growth, market, blight, world ----------
  function dayTick() {
    state.day++;

    // Crop growth + blight spread
    let infectedTiles = [];
    let wiltedCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = state.tiles[r][c];
        if (t.type !== "planted") continue;

        if (t.watered) {
          t.dryDays = 0;
          if (t.stage < 4) t.stage++;
        } else {
          t.dryDays = (t.dryDays || 0) + 1;
          if (t.dryDays >= WILT_DAYS) {
            t.type = "grass";
            delete t.crop;
            wiltedCount++;
            continue;
          }
          if (t.stage < 4 && Math.random() < 0.5) t.stage++;
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

    if (wiltedCount > 0) {
      logMsg(`${wiltedCount} crop(s) wilted from neglect — remember to water with the Watering Can.`);
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

  const TERRAIN_TILE_IMG = {
    grass: "assets/cutefantasy/tiles/Grass_Middle.png",
    farmland: "assets/cutefantasy/tiles/FarmLand_Tile.png",
    beach: "assets/cutefantasy/tiles/Beach_Tile.png",
    cliff: "assets/cutefantasy/tiles/Cliff_Tile.png",
    water: "assets/cutefantasy/tiles/Water_Tile.png",
  };

  function renderRegions() {
    const container = document.getElementById("regions-grid");
    container.innerHTML = "";
    const ownedCount = state.regions.filter(r => r.owned).length;
    const summary = document.createElement("p");
    summary.className = "hint";
    summary.textContent = `${ownedCount} / ${state.regions.length} regions under your control across ${CONTINENTS.length} continents.`;
    container.appendChild(summary);

    CONTINENTS.forEach((continent) => {
      const section = document.createElement("div");
      section.className = "continent-section";
      const heading = document.createElement("h3");
      heading.className = "continent-heading";
      const ownedHere = state.regions.filter(r => r.continent === continent.name && r.owned).length;
      heading.textContent = `${continent.name} (${ownedHere}/${continent.regions.length})`;
      section.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "regions-subgrid";
      state.regions.filter(r => r.continent === continent.name).forEach((reg) => {
        const card = document.createElement("div");
        card.className = "region-card" + (reg.owned ? " owned" : "");
        card.style.backgroundImage = `url("${TERRAIN_TILE_IMG[reg.terrain]}")`;
        const price = regionPrice(reg);
        card.innerHTML = `
          <div class="region-card-inner">
            <h4>${reg.name}${reg.owned ? " 👑" : ""}</h4>
            <div>Health: ${Math.round(reg.health)}%</div>
            <div class="health-bar"><div class="health-fill" style="width:${reg.health}%"></div></div>
            ${reg.owned ? "<div>Generating income daily.</div>" :
              `<button data-region="${reg.name}" ${state.cash < price ? "disabled" : ""}>Buy for $${price}</button>`}
          </div>
        `;
        grid.appendChild(card);
      });
      section.appendChild(grid);
      container.appendChild(section);
    });

    container.querySelectorAll("button[data-region]").forEach((btn) => {
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

    const toolList = document.getElementById("tool-list");
    toolList.innerHTML = "";
    TOOL_KEYS.forEach((key) => {
      const tool = TOOLS[key];
      const btn = document.createElement("button");
      btn.className = "tool-btn" + (state.selectedTool === key ? " selected" : "");
      btn.innerHTML = `${tool.emoji} ${tool.name} <span class="key">[${tool.key}]</span>`;
      btn.addEventListener("click", () => selectTool(key));
      toolList.appendChild(btn);
    });

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
  // Basic_Plants.png is a 96x24 strip: 4 growth-stage icons, 24x24 each.
  const PLANT_FRAME = 24;
  function plantFrameForStage(stage) {
    if (stage <= 0) return 0;
    if (stage <= 2) return 1;
    if (stage === 3) return 2;
    return 3;
  }
  // Basic_Character_Spritesheet.png is a 192x192 sheet, 4x4 grid of 48x48 frames.
  const PLAYER_FRAME = 48;

  function drawTileBase(tile, x, y) {
    if (tile.type === "grass") {
      ctx.drawImage(SPRITES.grass, 0, 0, 16, 16, x, y, TILE, TILE);
    } else {
      // tilled soil, planted, or freshly-harvested soil all use the farmland texture
      ctx.drawImage(SPRITES.farmland, 0, 0, 48, 48, x, y, TILE, TILE);
    }
  }

  function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = state.tiles[r][c];
        const x = c * TILE, y = r * TILE;
        drawTileBase(tile, x, y);
        if (tile.type === "planted") {
          const frame = tile.infected ? -1 : plantFrameForStage(tile.stage);
          if (frame >= 0) {
            ctx.drawImage(
              SPRITES.plants,
              frame * PLANT_FRAME, 0, PLANT_FRAME, PLANT_FRAME,
              x + TILE * 0.15, y + TILE * 0.15, TILE * 0.7, TILE * 0.7
            );
          } else {
            ctx.font = `${Math.round(TILE * 0.5)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("☠️", x + TILE / 2, y + TILE / 2);
          }
        }
      }
    }

    // decorative scenery (trees, grazing animals) — purely visual
    SCENERY.forEach((s) => {
      const img = SPRITES[s.img];
      const x = s.tx * TILE, y = s.ty * TILE;
      if (s.frames) {
        ctx.drawImage(img, (s.frame || 0) * s.fw, 0, s.fw, s.fh, x + TILE * 0.15, y + TILE * 0.2, TILE * 0.7, TILE * 0.6);
      } else {
        ctx.drawImage(img, x, y - TILE * (s.h - 1), TILE * s.w, TILE * s.h);
      }
    });

    // player
    const p = state.player;
    const dirRow = { down: 0, up: 1, left: 2, right: 3 }[p.facing] || 0;
    ctx.drawImage(
      SPRITES.player,
      0, dirRow * PLAYER_FRAME, PLAYER_FRAME, PLAYER_FRAME,
      p.x, p.y, TILE, TILE
    );
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
  document.getElementById("current-tool-name").textContent = TOOLS[state.selectedTool].name;
  renderSidebar();
  renderRegions();
  logMsg(state.log);
  requestAnimationFrame(loop);

  // Autosave every 10s and on unload
  setInterval(save, 10000);
  window.addEventListener("beforeunload", save);
})();
