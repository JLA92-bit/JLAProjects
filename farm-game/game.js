// Tiny Farm — a minimal Stardew-style top-down farming game.
// Pure canvas + vanilla JS. Sprites are real assets sliced from the
// Sprout Lands - Sprites - Basic pack (by Cup Nooble) — see CREDITS.md.

(() => {
  const TILE = 32; // on-screen tile size (source art is 16x16, drawn at 2x)
  const SRC = 16; // source tile size in the sprite sheets
  const MAP_W = 18;
  const MAP_H = 18;
  const VIEW_W = 640;
  const VIEW_H = 480;

  const TILE_TYPES = {
    GRASS: "grass",
    DIRT: "dirt", // tilled soil
    WATER: "water",
    FENCE: "fence",
    PATH: "path",
    BUILDING: "building",
  };

  const GROW_STAGE_MS = 4000; // time per crop growth stage
  const MAX_STAGE = 3; // 0 seed, 1 sprout, 2 growing, 3 ripe

  const BUILDING = { x: 13, y: 2, w: 3, h: 3 }; // footprint, in tiles

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const toolNameEl = document.getElementById("tool-name");
  const cropCountEl = document.getElementById("crop-count");

  // ---------- Assets ----------
  const IMG_NAMES = [
    "grass1",
    "grass2",
    "dirt_tilled",
    "path",
    "water1",
    "water2",
    "fence_post",
    "fence_rail",
    "house",
    "crop_stage0",
    "crop_stage1",
    "crop_stage2",
    "crop_stage3",
    "player",
    "tool_hoe",
  ];
  const images = {};
  let imagesLoaded = 0;
  IMG_NAMES.forEach((name) => {
    const img = new Image();
    img.src = `assets/${name}.png`;
    img.onload = () => imagesLoaded++;
    images[name] = img;
  });

  // ---------- Map setup ----------
  // tile grid: { type, tilled, planted, stage, plantedAt }
  function makeMap() {
    const grid = [];
    for (let y = 0; y < MAP_H; y++) {
      const row = [];
      for (let x = 0; x < MAP_W; x++) {
        let type = TILE_TYPES.GRASS;
        const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
        if (edge) type = TILE_TYPES.FENCE;
        row.push({ type, tilled: false, planted: false, stage: 0, plantedAt: 0 });
      }
      grid.push(row);
    }

    // small pond, bottom-right
    for (let y = 12; y <= 14; y++) {
      for (let x = 13; x <= 15; x++) {
        grid[y][x].type = TILE_TYPES.WATER;
      }
    }

    // small barn/shed block, top-right
    for (let y = BUILDING.y; y < BUILDING.y + BUILDING.h; y++) {
      for (let x = BUILDING.x; x < BUILDING.x + BUILDING.w; x++) {
        grid[y][x].type = TILE_TYPES.BUILDING;
      }
    }

    // path from the farm entrance (bottom fence gap) up toward the middle
    for (let y = 8; y <= 16; y++) {
      grid[y][2].type = TILE_TYPES.PATH;
    }
    // gate gap in the bottom fence, above the path
    grid[MAP_H - 1][2].type = TILE_TYPES.PATH;

    return grid;
  }

  const map = makeMap();

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
    return map[ty][tx];
  }

  function isBlocking(tile) {
    if (!tile) return true;
    return (
      tile.type === TILE_TYPES.FENCE ||
      tile.type === TILE_TYPES.WATER ||
      tile.type === TILE_TYPES.BUILDING
    );
  }

  // ---------- Player ----------
  const player = {
    x: 3 * TILE + TILE / 2, // pixel position, center of tile
    y: 10 * TILE + TILE / 2,
    w: 20,
    h: 26,
    speed: 110, // px/sec
    dir: "down", // down, up, left, right
    moving: false,
    animTimer: 0,
    animFrame: 0,
  };

  // row order in player.png (Sprout Lands character sheet, 48px cells)
  const DIR_ROW = { down: 0, up: 1, right: 2, left: 3 };
  const PLAYER_CELL = 48;

  function facingTile() {
    let dx = 0,
      dy = 0;
    if (player.dir === "down") dy = 1;
    else if (player.dir === "up") dy = -1;
    else if (player.dir === "left") dx = -1;
    else if (player.dir === "right") dx = 1;
    const tx = Math.floor(player.x / TILE) + dx;
    const ty = Math.floor(player.y / TILE) + dy;
    return { tx, ty, tile: tileAt(tx, ty) };
  }

  // ---------- Input ----------
  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;

    if (e.key === "1") setTool("hoe");
    else if (e.key === "2") setTool("seed");
    else if (e.key === "3") setTool("harvest");
    else if (e.code === "Space") {
      e.preventDefault();
      useTool();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  let tool = "hoe";
  let cropsHarvested = 0;

  function setTool(t) {
    tool = t;
    toolNameEl.textContent = t === "hoe" ? "Hoe" : t === "seed" ? "Seed" : "Harvest";
  }

  function useTool() {
    const { tile } = facingTile();
    if (!tile) return;

    if (tool === "hoe") {
      if (tile.type === TILE_TYPES.GRASS && !tile.tilled) {
        tile.tilled = true;
        tile.type = TILE_TYPES.DIRT;
      }
    } else if (tool === "seed") {
      if (tile.type === TILE_TYPES.DIRT && tile.tilled && !tile.planted) {
        tile.planted = true;
        tile.stage = 0;
        tile.plantedAt = performance.now();
      }
    } else if (tool === "harvest") {
      if (tile.planted && tile.stage >= MAX_STAGE) {
        tile.planted = false;
        tile.stage = 0;
        tile.tilled = true; // soil stays tilled, ready to replant
        cropsHarvested++;
        cropCountEl.textContent = String(cropsHarvested);
      }
    }
  }

  canvas.addEventListener("click", () => useTool());

  // ---------- Update ----------
  let lastTime = performance.now();

  function update(dt, now) {
    // growth ticking
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = map[y][x];
        if (t.planted && t.stage < MAX_STAGE) {
          const elapsed = now - t.plantedAt;
          t.stage = Math.min(MAX_STAGE, Math.floor(elapsed / GROW_STAGE_MS));
        }
      }
    }

    // movement
    let dx = 0,
      dy = 0;
    if (keys["arrowup"] || keys["w"]) dy -= 1;
    if (keys["arrowdown"] || keys["s"]) dy += 1;
    if (keys["arrowleft"] || keys["a"]) dx -= 1;
    if (keys["arrowright"] || keys["d"]) dx += 1;

    player.moving = dx !== 0 || dy !== 0;

    if (dx !== 0 && dy !== 0) {
      // normalize diagonal
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    if (dx > 0) player.dir = "right";
    else if (dx < 0) player.dir = "left";
    else if (dy > 0) player.dir = "down";
    else if (dy < 0) player.dir = "up";

    const moveX = dx * player.speed * dt;
    const moveY = dy * player.speed * dt;

    tryMove(moveX, 0);
    tryMove(0, moveY);

    if (player.moving) {
      player.animTimer += dt;
      if (player.animTimer > 0.12) {
        player.animTimer = 0;
        player.animFrame = (player.animFrame + 1) % 4;
      }
    } else {
      player.animFrame = 0;
      player.animTimer = 0;
    }
  }

  function tryMove(mx, my) {
    if (mx === 0 && my === 0) return;
    const nx = player.x + mx;
    const ny = player.y + my;

    const halfW = player.w / 2 - 2;
    const halfH = player.h / 2 - 2;

    // check the corners of the player's bounding box at the new position
    const corners = [
      [nx - halfW, ny - halfH],
      [nx + halfW, ny - halfH],
      [nx - halfW, ny + halfH],
      [nx + halfW, ny + halfH],
    ];

    for (const [cx, cy] of corners) {
      const tx = Math.floor(cx / TILE);
      const ty = Math.floor(cy / TILE);
      if (isBlocking(tileAt(tx, ty))) return;
    }

    player.x = nx;
    player.y = ny;
  }

  // ---------- Rendering ----------
  const waterFrames = ["water1", "water2"];

  function drawTile(tile, sx, sy, tx, ty) {
    switch (tile.type) {
      case TILE_TYPES.GRASS: {
        const img = images[(tx + ty) % 2 === 0 ? "grass1" : "grass2"];
        ctx.drawImage(img, sx, sy, TILE, TILE);
        break;
      }
      case TILE_TYPES.DIRT: {
        const base = images[(tx + ty) % 2 === 0 ? "grass1" : "grass2"];
        ctx.drawImage(base, sx, sy, TILE, TILE);
        ctx.drawImage(images.dirt_tilled, sx, sy, TILE, TILE);
        break;
      }
      case TILE_TYPES.WATER: {
        const frame = Math.floor(performance.now() / 500) % waterFrames.length;
        ctx.drawImage(images[waterFrames[frame]], sx, sy, TILE, TILE);
        break;
      }
      case TILE_TYPES.PATH: {
        const grassBase = images[(tx + ty) % 2 === 0 ? "grass1" : "grass2"];
        ctx.drawImage(grassBase, sx, sy, TILE, TILE);
        ctx.drawImage(images.path, sx, sy, TILE, TILE);
        break;
      }
      case TILE_TYPES.FENCE: {
        const grassBase = images[(tx + ty) % 2 === 0 ? "grass1" : "grass2"];
        ctx.drawImage(grassBase, sx, sy, TILE, TILE);
        const horizontalEdge = ty === 0 || ty === MAP_H - 1;
        const fenceImg = images[horizontalEdge ? "fence_rail" : "fence_post"];
        ctx.drawImage(fenceImg, sx, sy, TILE, TILE);
        break;
      }
      case TILE_TYPES.BUILDING: {
        const grassBase = images[(tx + ty) % 2 === 0 ? "grass1" : "grass2"];
        ctx.drawImage(grassBase, sx, sy, TILE, TILE);
        break;
      }
    }

    if (tile.planted) {
      drawCrop(sx, sy, tile.stage);
    }
  }

  function drawCrop(sx, sy, stage) {
    const img = images[`crop_stage${stage}`];
    ctx.drawImage(img, sx, sy, TILE, TILE);
  }

  function drawBuilding(camX, camY) {
    const img = images.house;
    if (!img.complete || img.naturalWidth === 0) return;
    // house art is 32x64 (2x4 at 16px source); stretch to the footprint width
    // and keep aspect ratio, anchored so its base sits on the bottom tile row
    const destW = BUILDING.w * TILE;
    const destH = destW * (img.height / img.width);
    const destX = BUILDING.x * TILE - camX;
    const destY = (BUILDING.y + BUILDING.h) * TILE - camY - destH;
    ctx.drawImage(img, destX, destY, destW, destH);
  }

  function drawPlayer(sx, sy) {
    const img = images.player;
    if (!img.complete || img.naturalWidth === 0) return;
    const row = DIR_ROW[player.dir];
    const col = player.animFrame;
    // source cells are 48x48; keep the same 2x (TILE/SRC) scale used for tiles
    const drawSize = PLAYER_CELL * (TILE / SRC);

    ctx.drawImage(
      img,
      col * PLAYER_CELL,
      row * PLAYER_CELL,
      PLAYER_CELL,
      PLAYER_CELL,
      sx - drawSize / 2,
      sy - drawSize / 2,
      drawSize,
      drawSize
    );

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + player.h / 2 - 2, player.w / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    if (imagesLoaded < IMG_NAMES.length) {
      ctx.fillStyle = "#2e2a1f";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = "#f4ead1";
      ctx.font = "16px sans-serif";
      ctx.fillText("Loading...", VIEW_W / 2 - 30, VIEW_H / 2);
      return;
    }

    // camera centered on player, clamped to map bounds
    let camX = player.x - VIEW_W / 2;
    let camY = player.y - VIEW_H / 2;
    const mapPxW = MAP_W * TILE;
    const mapPxH = MAP_H * TILE;
    camX = Math.max(0, Math.min(camX, mapPxW - VIEW_W));
    camY = Math.max(0, Math.min(camY, mapPxH - VIEW_H));
    if (mapPxW < VIEW_W) camX = (mapPxW - VIEW_W) / 2;
    if (mapPxH < VIEW_H) camY = (mapPxH - VIEW_H) / 2;

    const startTx = Math.floor(camX / TILE);
    const startTy = Math.floor(camY / TILE);
    const endTx = Math.ceil((camX + VIEW_W) / TILE);
    const endTy = Math.ceil((camY + VIEW_H) / TILE);

    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        const tile = tileAt(tx, ty);
        if (!tile) continue;
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        drawTile(tile, sx, sy, tx, ty);
      }
    }

    drawBuilding(camX, camY);

    // highlight the tile the player is facing
    const { tx, ty } = facingTile();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE - camX + 1, ty * TILE - camY + 1, TILE - 2, TILE - 2);

    drawPlayer(player.x - camX, player.y - camY);
  }

  // ---------- Main loop ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt, now);
    draw();
    requestAnimationFrame(loop);
  }

  setTool("hoe");
  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(loop);
  });
})();
