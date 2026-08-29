// Tiny Farm — a minimal Stardew-style top-down farming game.
// Pure canvas + vanilla JS, no images: all sprites are drawn procedurally
// (see README/CREDITS for why — no network access to fetch real asset packs
// in the environment this was built in).

(() => {
  const TILE = 32;
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

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const toolNameEl = document.getElementById("tool-name");
  const cropCountEl = document.getElementById("crop-count");

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
    for (let y = 2; y <= 4; y++) {
      for (let x = 13; x <= 15; x++) {
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
      if (player.animTimer > 0.15) {
        player.animTimer = 0;
        player.animFrame = (player.animFrame + 1) % 2;
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
  const COLORS = {
    grass: "#3f7a3a",
    grassAlt: "#457f40",
    dirt: "#6b4a30",
    dirtWet: "#5a3d27",
    water: "#3a7bbf",
    fence: "#8a6446",
    path: "#a68b5c",
    building: "#7a5c46",
    buildingRoof: "#4a3324",
  };

  function drawTile(tile, sx, sy, tx, ty) {
    switch (tile.type) {
      case TILE_TYPES.GRASS:
        ctx.fillStyle = (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
        ctx.fillRect(sx, sy, TILE, TILE);
        break;
      case TILE_TYPES.DIRT:
        ctx.fillStyle = tile.planted ? COLORS.dirtWet : COLORS.dirt;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        for (let i = 4; i < TILE; i += 8) {
          ctx.beginPath();
          ctx.moveTo(sx + 2, sy + i);
          ctx.lineTo(sx + TILE - 2, sy + i);
          ctx.stroke();
        }
        break;
      case TILE_TYPES.WATER:
        ctx.fillStyle = COLORS.water;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.moveTo(sx + 4, sy + TILE / 2);
        ctx.lineTo(sx + TILE - 4, sy + TILE / 2);
        ctx.stroke();
        break;
      case TILE_TYPES.PATH:
        ctx.fillStyle = COLORS.path;
        ctx.fillRect(sx, sy, TILE, TILE);
        break;
      case TILE_TYPES.FENCE:
        ctx.fillStyle = COLORS.grass;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = COLORS.fence;
        ctx.fillRect(sx + TILE / 2 - 3, sy, 6, TILE);
        ctx.fillRect(sx, sy + 6, TILE, 5);
        break;
      case TILE_TYPES.BUILDING:
        ctx.fillStyle = COLORS.building;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = COLORS.buildingRoof;
        ctx.fillRect(sx, sy, TILE, TILE / 3);
        break;
    }

    if (tile.planted) {
      drawCrop(sx, sy, tile.stage);
    }
  }

  function drawCrop(sx, sy, stage) {
    const cx = sx + TILE / 2;
    const cy = sy + TILE / 2;
    if (stage === 0) {
      ctx.fillStyle = "#8fd45c";
      ctx.fillRect(cx - 2, cy + 4, 4, 6);
    } else if (stage === 1) {
      ctx.fillStyle = "#6bbf3a";
      ctx.fillRect(cx - 3, cy - 2, 6, 12);
      ctx.fillStyle = "#8fd45c";
      ctx.fillRect(cx - 6, cy - 4, 5, 5);
      ctx.fillRect(cx + 1, cy - 4, 5, 5);
    } else if (stage === 2) {
      ctx.fillStyle = "#4f9e2c";
      ctx.fillRect(cx - 4, cy - 8, 8, 18);
      ctx.fillStyle = "#8fd45c";
      ctx.fillRect(cx - 9, cy - 6, 6, 6);
      ctx.fillRect(cx + 3, cy - 6, 6, 6);
    } else {
      // ripe
      ctx.fillStyle = "#4f9e2c";
      ctx.fillRect(cx - 4, cy - 8, 8, 18);
      ctx.fillStyle = "#8fd45c";
      ctx.fillRect(cx - 9, cy - 6, 6, 6);
      ctx.fillRect(cx + 3, cy - 6, 6, 6);
      ctx.fillStyle = "#e2432a";
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 3, 4, 0, Math.PI * 2);
      ctx.arc(cx + 3, cy - 6, 4, 0, Math.PI * 2);
      ctx.arc(cx, cy + 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(sx, sy) {
    const bob = player.moving && player.animFrame === 1 ? 2 : 0;
    const x = sx - player.w / 2;
    const y = sy - player.h / 2 - bob;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + player.h / 2 - 2, player.w / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.fillStyle = "#5a3d27";
    ctx.fillRect(x + 3, y + player.h - 8, 5, 8);
    ctx.fillRect(x + player.w - 8, y + player.h - 8, 5, 8);

    // body
    ctx.fillStyle = "#3f6fae";
    ctx.fillRect(x + 2, y + 8, player.w - 4, player.h - 14);

    // head
    ctx.fillStyle = "#e8b48a";
    ctx.fillRect(x + 4, y, player.w - 8, 10);

    // hair
    ctx.fillStyle = "#7a4a26";
    ctx.fillRect(x + 4, y - 2, player.w - 8, 4);

    // direction indicator (simple face/eyes cue)
    ctx.fillStyle = "#2b2b2b";
    if (player.dir === "down") {
      ctx.fillRect(x + 6, y + 5, 2, 2);
      ctx.fillRect(x + player.w - 8, y + 5, 2, 2);
    } else if (player.dir === "up") {
      // no face visible
    } else if (player.dir === "left") {
      ctx.fillRect(x + 5, y + 5, 2, 2);
    } else if (player.dir === "right") {
      ctx.fillRect(x + player.w - 7, y + 5, 2, 2);
    }

    // tool hint (small swing when used feels like extra scope; keep static)
    ctx.fillStyle = "#c9c9c9";
    if (player.dir === "right") ctx.fillRect(x + player.w - 2, y + 12, 6, 3);
    else if (player.dir === "left") ctx.fillRect(x - 4, y + 12, 6, 3);
  }

  function draw() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

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
