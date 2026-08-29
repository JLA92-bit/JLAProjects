extends Node2D

# ---------- Constants ----------
const TILE := 64
const COLS := 10
const ROWS := 7
const DAY_LENGTH := 25.0
const PLAYER_SPEED := 220.0
const FARM_ORIGIN := Vector2(40, 110)

const CROPS := {
	"wheat": {"name": "Wheat", "seed_cost": 5, "grow_days": 3, "base_price": 10, "seasons": ["Spring", "Summer", "Fall", "Winter"]},
	"corn": {"name": "Corn", "seed_cost": 10, "grow_days": 4, "base_price": 22, "seasons": ["Spring", "Summer"]},
	"tomato": {"name": "Tomato", "seed_cost": 20, "grow_days": 5, "base_price": 45, "seasons": ["Summer", "Fall"]},
}
const CROP_KEYS := ["wheat", "corn", "tomato"]

# ---------- Seasons & weather ----------
const SEASONS := ["Spring", "Summer", "Fall", "Winter"]
const SEASON_LENGTH := 7 # days per season
const WEATHER := {
	"sunny": {"name": "Sunny", "emoji": "☀"},
	"rainy": {"name": "Rainy", "emoji": "🌧"},
	"storm": {"name": "Storm", "emoji": "⛈"},
	"drought": {"name": "Drought", "emoji": "🔥"},
}
const WEATHER_WEIGHTS := {"sunny": 55, "rainy": 25, "storm": 10, "drought": 10}
const REGION_DECAY := 6.0 # health lost per day for an unmaintained owned region

# ---------- Terrain modifiers for farming an owned region ----------
# Each owned region can be farmed directly (its own tile grid), and its
# terrain creates a real siting decision instead of being flavor text only.
const TERRAIN_FLAVOR := {
	"grass": "reliable soil - no bonuses or penalties",
	"farmland": "reliable soil - no bonuses or penalties",
	"beach": "sandy soil dries out twice as fast without rain",
	"cliff": "rocky ground resists blight spreading",
	"water": "naturally irrigated - never needs manual watering",
}

# ---------- Equipment upgrades (durable money sinks, Act 2+) ----------
const BASE_STORAGE_CAP := 15
const UPGRADE_KEYS := ["watering_can_2", "storage_silo_1", "storage_silo_2"]
const UPGRADES := {
	"watering_can_2": {"name": "Reinforced Watering Can", "cost": 200, "desc": "Waters a 3x3 area around you instead of a single tile."},
	"storage_silo_1": {"name": "Storage Silo", "cost": 150, "desc": "+20 storage capacity per crop."},
	"storage_silo_2": {"name": "Storage Silo II", "cost": 400, "desc": "+20 more storage capacity per crop (requires Storage Silo)."},
}

const TOOLS := {
	"hoe": {"name": "Hoe", "emoji": "🔨"},
	"water": {"name": "Watering Can", "emoji": "💧"},
	"seed": {"name": "Seed Bag", "emoji": "🌱"},
	"cure": {"name": "Cure Spray", "emoji": "🧪"},
}
const TOOL_KEYS := ["hoe", "water", "seed", "cure"]
const WILT_DAYS := 3
const CURE_COST := 15

const TERRAINS := ["grass", "farmland", "beach", "cliff", "water"]
const CONTINENTS := [
	{"name": "Verdant Plains", "regions": ["Ashville Fields", "Green Hollow", "Prairie Union", "Millbrook", "Oakmere"]},
	{"name": "Sunspire Coast", "regions": ["Sunset Basin", "Shellhaven", "Tideward Cove", "Palmrest", "Coral Landing"]},
	{"name": "Ironcrest Highlands", "regions": ["Ironcrest Farms", "North Ridge", "Stonefall", "Greywatch", "Craggen Hold"]},
	{"name": "Blueriver Delta", "regions": ["Riverside Union", "Mossy Bend", "Willowmere", "Deepwater Flats", "Marsh Landing"]},
]

const TERRAIN_TEX_PATH := {
	"grass": "res://assets/ninja/grass.png",
	"farmland": "res://assets/ninja/soil.png",
	"beach": "res://assets/ninja/sand.png",
	"cliff": "res://assets/cutefantasy/tiles/Cliff_Tile.png",
	"water": "res://assets/ninja/water.png",
}

const SAVE_PATH := "user://farmworld_save_v2.json"

# ---------- Acts (story stages that gate content) ----------
const ACTS := [
	{
		"title": "Act 1: First Harvest",
		"intro": "Welcome to the farm. Till soil with the Hoe, plant Wheat with the Seed Bag, keep it watered, and sell your harvest to build starting capital.",
		"tools": ["hoe", "water", "seed"],
		"crops": ["wheat"],
		"continents": [],
		"blight": false,
		"goal_text": "Reach $150 in cash.",
	},
	{
		"title": "Act 2: The Outbreak Begins",
		"intro": "A mysterious blight has appeared on the farm! The Cure Spray is now in your toolkit. The world map has opened - stake your first claim in Verdant Plains.",
		"tools": ["hoe", "water", "seed", "cure"],
		"crops": ["wheat", "corn"],
		"continents": ["Verdant Plains"],
		"blight": true,
		"goal_text": "Own all 5 regions of Verdant Plains.",
	},
	{
		"title": "Act 3: Expanding Empire",
		"intro": "Your empire is spreading. Tomatoes fetch a fine price, and three more continents are open for the taking.",
		"tools": ["hoe", "water", "seed", "cure"],
		"crops": ["wheat", "corn", "tomato"],
		"continents": ["Verdant Plains", "Sunspire Coast", "Ironcrest Highlands", "Blueriver Delta"],
		"blight": true,
		"goal_text": "Own at least 10 of the world's 20 regions.",
	},
	{
		"title": "Act 4: World Domination",
		"intro": "Every continent is in play. Finish what you started.",
		"tools": ["hoe", "water", "seed", "cure"],
		"crops": ["wheat", "corn", "tomato"],
		"continents": ["Verdant Plains", "Sunspire Coast", "Ironcrest Highlands", "Blueriver Delta"],
		"blight": true,
		"goal_text": "Own all 20 regions - total world domination.",
	},
]

# ---------- Game state ----------
var cash := 100
var day := 1
var day_progress := 0.0
var seeds := {"wheat": 6, "corn": 2, "tomato": 0}
var produce := {"wheat": 0, "corn": 0, "tomato": 0}
var prices := {"wheat": 10, "corn": 22, "tomato": 45}
var selected_crop := "wheat"
var selected_tool := "hoe"
var current_act := 0 # index into ACTS
var victory_shown := false
var owned_upgrades := {} # upgrade key -> bool
var season_idx := 0
var season_day := 0
var current_weather := "sunny"
var forecast_weather := "sunny"
var tiles := [] # reference to plots[active_plot_id] - the grid currently on screen
var plots := {} # plot_id ("home" or an owned region's name) -> ROWSxCOLS tile grid
var active_plot_id := "home"
var regions := []
var log_text := "Welcome! Hoe tills grass, Seed Bag plants, Watering Can grows crops. Harvest by hand when ready."

var player_pos := Vector2(TILE * 2, TILE * 2)
var player_facing := "down"

# ---------- Node refs ----------
var textures := {}
var tile_base_sprites := []
var tile_overlay_sprites := []
var player_sprite: Sprite2D

var hud_cash: Label
var hud_day: Label
var hud_dom: Label
var hud_act: Label
var hud_season: Label
var hud_farm: Label
var tool_label: Label
var log_label: Label
var tool_row: HBoxContainer
var tool_buttons := {}
var act_banner: Panel
var act_banner_title: Label
var act_banner_body: Label
var map_button: Button
var move_up_held := false
var move_down_held := false
var move_left_held := false
var move_right_held := false

var inventory_panel: Panel
var seed_rows_container: VBoxContainer
var market_rows_container: VBoxContainer
var upgrade_rows_container: VBoxContainer
var blight_label: Label

var map_panel: Panel
var map_summary_label: Label
var map_scroll_content: VBoxContainer

# ---------- Lifecycle ----------
func _ready():
	randomize()
	_load_textures()
	_init_fresh_state()
	_load_game()
	_build_farm_grid()
	_redraw_all_tiles()
	_build_scenery()
	_build_player()
	_build_ui()
	_refresh_all()
	if current_act == 0:
		_show_act_banner(0)

func _load_textures():
	textures["plants"] = load("res://assets/sprout/objects/Basic_Plants.png")
	textures["player"] = load("res://assets/sprout/characters/Basic_Character_Spritesheet.png")
	textures["tree"] = load("res://assets/ninja/tree.png")
	textures["house"] = load("res://assets/ninja/house.png")
	textures["fence"] = load("res://assets/ninja/fence_strip.png")
	textures["cow"] = load("res://assets/sprout/characters/Free_Cow_Sprites.png")
	textures["chicken"] = load("res://assets/sprout/characters/Free_Chicken_Sprites.png")
	textures["pig"] = load("res://assets/cutefantasy/animals/Pig.png")
	textures["sheep"] = load("res://assets/cutefantasy/animals/Sheep.png")
	for key in TERRAIN_TEX_PATH:
		textures[key] = load(TERRAIN_TEX_PATH[key])

func _init_fresh_state():
	plots = {"home": _make_empty_grid()}
	active_plot_id = "home"
	tiles = plots["home"]
	owned_upgrades = {}
	regions.clear()
	for continent in CONTINENTS:
		var i := 0
		for rname in continent["regions"]:
			regions.append({
				"name": rname,
				"continent": continent["name"],
				"terrain": TERRAINS[i % TERRAINS.size()],
				"health": 100.0,
				"owned": false,
				"maintained_today": false,
			})
			i += 1
	season_idx = 0
	season_day = 0
	current_weather = "sunny"
	forecast_weather = _roll_weather()

# ---------- Plots (home farm + farmable owned regions) ----------
func _make_empty_grid() -> Array:
	var grid := []
	for r in range(ROWS):
		var row := []
		for c in range(COLS):
			row.append({"type": "grass"})
		grid.append(row)
	return grid

func _terrain_for_plot(plot_id: String) -> String:
	if plot_id == "home":
		return "grass"
	for reg in regions:
		if reg["name"] == plot_id:
			return reg["terrain"]
	return "grass"

func _plot_display_name(plot_id: String) -> String:
	return "Home Farm" if plot_id == "home" else plot_id

func _switch_active_plot(plot_id: String) -> void:
	if plot_id == active_plot_id or not plots.has(plot_id):
		return
	active_plot_id = plot_id
	tiles = plots[plot_id]
	_redraw_all_tiles()
	var terrain = _terrain_for_plot(plot_id)
	_log("Now farming: %s (%s)." % [_plot_display_name(plot_id), TERRAIN_FLAVOR.get(terrain, "")])
	_refresh_all()

# ---------- Farm grid rendering ----------
func _make_pixel_sprite(tex: Texture2D) -> Sprite2D:
	var s := Sprite2D.new()
	s.texture = tex
	s.centered = false
	s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	return s

func _build_farm_grid():
	for r in range(ROWS):
		var base_row := []
		var overlay_row := []
		for c in range(COLS):
			var base := _make_pixel_sprite(textures["grass"])
			base.position = FARM_ORIGIN + Vector2(c * TILE, r * TILE)
			base.scale = Vector2(float(TILE) / base.texture.get_width(), float(TILE) / base.texture.get_height())
			add_child(base)
			base_row.append(base)

			var overlay := _make_pixel_sprite(textures["plants"])
			overlay.region_enabled = true
			overlay.region_rect = Rect2(0, 0, 24, 24)
			overlay.position = FARM_ORIGIN + Vector2(c * TILE, r * TILE) + Vector2(TILE, TILE) * 0.15
			overlay.scale = Vector2(TILE * 0.7 / 24.0, TILE * 0.7 / 24.0)
			overlay.visible = false
			add_child(overlay)
			overlay_row.append(overlay)
		tile_base_sprites.append(base_row)
		tile_overlay_sprites.append(overlay_row)

func _build_scenery():
	# Ninja-tileset decorations are natively drawn on a 16px grid, so they always
	# scale uniformly by TILE/16 regardless of how many tiles they span.
	var ninja_scale = float(TILE) / 16.0
	var ninja_deco = [
		{"tex": "tree", "tx": 0, "ty": 0},
		{"tex": "tree", "tx": 9, "ty": 0},
		{"tex": "house", "tx": 3, "ty": 0},
		{"tex": "fence", "tx": 0, "ty": 6},
	]
	for d in ninja_deco:
		var s := _make_pixel_sprite(textures[d["tex"]])
		s.scale = Vector2(ninja_scale, ninja_scale)
		s.position = FARM_ORIGIN + Vector2(d["tx"] * TILE, d["ty"] * TILE)
		add_child(s)

	var animal_deco = [
		{"tex": "pig", "tx": 4, "ty": 0, "frame_w": 16, "frame_h": 16},
		{"tex": "sheep", "tx": 6, "ty": 0, "frame_w": 16, "frame_h": 16},
		{"tex": "chicken", "tx": 1, "ty": 6, "frame_w": 16, "frame_h": 16},
		{"tex": "cow", "tx": 8, "ty": 6, "frame_w": 19, "frame_h": 16},
	]
	for d in animal_deco:
		var s := _make_pixel_sprite(textures[d["tex"]])
		s.region_enabled = true
		s.region_rect = Rect2(0, 0, d["frame_w"], d["frame_h"])
		s.scale = Vector2(TILE * 0.7 / d["frame_w"], TILE * 0.6 / d["frame_h"])
		s.position = FARM_ORIGIN + Vector2(d["tx"] * TILE, d["ty"] * TILE) + Vector2(TILE, TILE) * 0.2
		add_child(s)

func _build_player():
	player_sprite = _make_pixel_sprite(textures["player"])
	player_sprite.region_enabled = true
	player_sprite.region_rect = Rect2(0, 0, 48, 48)
	player_sprite.scale = Vector2(float(TILE) / 48.0, float(TILE) / 48.0)
	player_sprite.z_index = 10
	add_child(player_sprite)

# ---------- Input ----------
func _process(delta: float) -> void:
	_handle_movement(delta)
	day_progress += delta
	if day_progress >= DAY_LENGTH:
		day_progress = 0.0
		_day_tick()
	_update_player_visual()

func _handle_movement(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP) or move_up_held:
		dir.y -= 1
		player_facing = "up"
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN) or move_down_held:
		dir.y += 1
		player_facing = "down"
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT) or move_left_held:
		dir.x -= 1
		player_facing = "left"
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT) or move_right_held:
		dir.x += 1
		player_facing = "right"
	if dir.length() > 0:
		dir = dir.normalized()
		player_pos += dir * PLAYER_SPEED * delta
		player_pos.x = clamp(player_pos.x, 0, (COLS - 1) * TILE)
		player_pos.y = clamp(player_pos.y, 0, (ROWS - 1) * TILE)

func _update_player_visual() -> void:
	player_sprite.position = FARM_ORIGIN + player_pos
	var row: int = {"down": 0, "up": 1, "left": 2, "right": 3}[player_facing]
	player_sprite.region_rect = Rect2(0, row * 48, 48, 48)

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_E: _do_action()
			KEY_M: _toggle_map()
			KEY_1: _select_tool("hoe")
			KEY_2: _select_tool("water")
			KEY_3: _select_tool("seed")
			KEY_4: _select_tool("cure")

func _facing_tile() -> Vector2i:
	var tx := int(round(player_pos.x / TILE))
	var ty := int(round(player_pos.y / TILE))
	match player_facing:
		"up": ty -= 1
		"down": ty += 1
		"left": tx -= 1
		"right": tx += 1
	return Vector2i(tx, ty)

# ---------- Tools & actions ----------
func _select_tool(key: String) -> void:
	if not _tool_unlocked(key):
		_log("The %s isn't unlocked yet." % TOOLS[key]["name"])
		return
	selected_tool = key
	_refresh_tool_ui()

func _select_crop(key: String) -> void:
	selected_crop = key
	_refresh_inventory_panel()

func _log(msg: String) -> void:
	log_text = msg
	if log_label:
		log_label.text = msg

func _do_action() -> void:
	var f := _facing_tile()
	if f.x < 0 or f.y < 0 or f.x >= COLS or f.y >= ROWS:
		return
	var tile: Dictionary = tiles[f.y][f.x]

	if tile["type"] == "planted" and tile.get("stage", 0) >= 4:
		if tile.get("infected", false):
			_log("That crop is blighted - harvest yields nothing. Cure it or till it under.")
			tile["type"] = "grass"
		else:
			var well_tended = tile.get("times_watered", 0) >= CROPS[tile["crop"]]["grow_days"]
			var amount = 2 if well_tended else 1
			var cap = _storage_cap()
			if produce[tile["crop"]] + amount > cap:
				_log("Storage is full for %s (%d/%d) - sell some or upgrade your silo." % [CROPS[tile["crop"]]["name"], produce[tile["crop"]], cap])
				return
			produce[tile["crop"]] += amount
			_log("Harvested %dx %s%s." % [amount, CROPS[tile["crop"]]["name"], " (well-tended bonus!)" if well_tended else ""])
			tile["type"] = "soil"
		_update_tile_visual(f.y, f.x)
		_refresh_inventory_panel()
		return

	match selected_tool:
		"hoe":
			if tile["type"] == "grass":
				tile["type"] = "soil"
				_log("Tilled soil with the hoe.")
			else:
				_log("The hoe only works on grass.")
		"seed":
			if tile["type"] != "soil":
				_log("Seeds need tilled soil - till it with the hoe first.")
				return
			if not CROPS[selected_crop]["seasons"].has(_season_name()):
				_log("%s can't be planted in %s." % [CROPS[selected_crop]["name"], _season_name()])
				return
			if seeds[selected_crop] <= 0:
				_log("No %s seeds left! Buy more." % CROPS[selected_crop]["name"])
				return
			seeds[selected_crop] -= 1
			tile["type"] = "planted"
			tile["crop"] = selected_crop
			tile["stage"] = 0
			tile["watered"] = false
			tile["times_watered"] = 0
			tile["infected"] = false
			tile["infected_days"] = 0
			tile["dry_days"] = 0
			_log("Planted %s." % CROPS[selected_crop]["name"])
		"water":
			if not owned_upgrades.get("watering_can_2", false):
				if tile["type"] != "planted":
					_log("Nothing planted here to water.")
					return
				if tile.get("watered", false):
					_log("Already watered today. It's growing...")
					return
				tile["watered"] = true
				tile["times_watered"] = tile.get("times_watered", 0) + 1
				_log("Watered the crop.")
			else:
				var watered_count := 0
				for dy in range(-1, 2):
					for dx in range(-1, 2):
						var ny = f.y + dy
						var nx = f.x + dx
						if ny < 0 or ny >= ROWS or nx < 0 or nx >= COLS:
							continue
						var nt: Dictionary = tiles[ny][nx]
						if nt["type"] == "planted" and not nt.get("watered", false):
							nt["watered"] = true
							nt["times_watered"] = nt.get("times_watered", 0) + 1
							watered_count += 1
							_update_tile_visual(ny, nx)
				if watered_count > 0:
					_log("Watered %d crop(s) with the reinforced can." % watered_count)
				else:
					_log("Nothing nearby needs watering.")
		"cure":
			if tile["type"] == "planted" and tile.get("infected", false):
				if cash < CURE_COST:
					_log("Need $%d to cure this blight." % CURE_COST)
					return
				cash -= CURE_COST
				tile["infected"] = false
				tile["infected_days"] = 0
				_log("Cured the blight for $%d." % CURE_COST)
			else:
				_log("Nothing to cure here.")
				return
	_update_tile_visual(f.y, f.x)
	_refresh_all()

# ---------- Tile visuals ----------
func _update_tile_visual(r: int, c: int) -> void:
	var tile: Dictionary = tiles[r][c]
	var base: Sprite2D = tile_base_sprites[r][c]
	var overlay: Sprite2D = tile_overlay_sprites[r][c]
	if tile["type"] == "grass":
		base.texture = textures["grass"]
		overlay.visible = false
	else:
		base.texture = textures["farmland"]
		if tile["type"] == "planted":
			overlay.visible = true
			if tile.get("infected", false):
				overlay.modulate = Color(1, 0.35, 0.35)
				overlay.region_rect = Rect2(72, 0, 24, 24)
			else:
				overlay.modulate = Color(1, 1, 1)
				var stage = tile.get("stage", 0)
				var frame = 0
				if stage <= 0: frame = 0
				elif stage <= 2: frame = 1
				elif stage == 3: frame = 2
				else: frame = 3
				overlay.region_rect = Rect2(frame * 24, 0, 24, 24)
		else:
			overlay.visible = false
	base.scale = Vector2(float(TILE) / base.texture.get_width(), float(TILE) / base.texture.get_height())

func _redraw_all_tiles() -> void:
	for r in range(ROWS):
		for c in range(COLS):
			_update_tile_visual(r, c)

# ---------- Day tick ----------
# Advances one plot's tile grid by a day: growth, watering/weather, wilt,
# and blight infection/spread. Runs for every plot the player owns (not
# just the one on screen) so farms left untended elsewhere keep changing.
func _advance_tiles(t_grid: Array, terrain: String) -> Dictionary:
	var infected_tiles := []
	var wilted := 0
	var storm_damaged := 0
	var auto_watered := current_weather == "rainy" or current_weather == "storm" or terrain == "water"
	var dry_step := 2 if terrain == "beach" else 1
	var blight_mult := 0.5 if terrain == "cliff" else 1.0

	for r in range(ROWS):
		for c in range(COLS):
			var t: Dictionary = t_grid[r][c]
			if t["type"] != "planted":
				continue
			if auto_watered:
				t["watered"] = true

			if current_weather == "drought" and terrain != "water":
				# Scarce water: even a watered crop keeps drying out, forcing an
				# early-harvest-or-lose-it decision instead of a free pass.
				t["dry_days"] = t.get("dry_days", 0) + dry_step
				if t["dry_days"] >= WILT_DAYS:
					t["type"] = "grass"
					wilted += 1
					t["watered"] = false
					continue
				if t.get("watered", false) and t.get("stage", 0) < 4 and randf() < 0.5:
					t["stage"] = t.get("stage", 0) + 1
			elif t.get("watered", false):
				t["dry_days"] = 0
				if t.get("stage", 0) < 4:
					t["stage"] = t.get("stage", 0) + 1
			else:
				t["dry_days"] = t.get("dry_days", 0) + dry_step
				if t["dry_days"] >= WILT_DAYS:
					t["type"] = "grass"
					wilted += 1
					t["watered"] = false
					continue
				if t.get("stage", 0) < 4 and randf() < 0.5:
					t["stage"] = t.get("stage", 0) + 1
			t["watered"] = false

			if current_weather == "storm" and t.get("stage", 0) < 4 and randf() < 0.2:
				t["stage"] = max(0, t.get("stage", 0) - 1)
				storm_damaged += 1

			if t.get("infected", false):
				t["infected_days"] = t.get("infected_days", 0) + 1
				infected_tiles.append(Vector2i(c, r))
				if t["infected_days"] >= 4:
					t["type"] = "grass"
			elif _act()["blight"]:
				var chance = (0.02 + infected_tiles.size() * 0.01) * blight_mult
				if randf() < chance:
					t["infected"] = true
					t["infected_days"] = 0

	for pos in infected_tiles:
		var neighbors = [Vector2i(pos.x - 1, pos.y), Vector2i(pos.x + 1, pos.y), Vector2i(pos.x, pos.y - 1), Vector2i(pos.x, pos.y + 1)]
		for n in neighbors:
			if n.x < 0 or n.y < 0 or n.x >= COLS or n.y >= ROWS:
				continue
			var nt: Dictionary = t_grid[n.y][n.x]
			if nt["type"] == "planted" and not nt.get("infected", false) and randf() < 0.3 * blight_mult:
				nt["infected"] = true
				nt["infected_days"] = 0

	return {"wilted": wilted, "storm_damaged": storm_damaged, "infected_count": infected_tiles.size()}

func _day_tick() -> void:
	day += 1
	_advance_calendar()
	var wilted := 0
	var storm_damaged := 0
	var total_infected := 0

	for plot_id in plots.keys():
		var result := _advance_tiles(plots[plot_id], _terrain_for_plot(plot_id))
		total_infected += result["infected_count"]
		if plot_id == active_plot_id:
			wilted = result["wilted"]
			storm_damaged = result["storm_damaged"]

	if wilted > 0:
		var reason = "the drought" if current_weather == "drought" else "neglect"
		_log("%d crop(s) wilted from %s - remember to water with the Watering Can." % [wilted, reason])
	elif storm_damaged > 0:
		_log("The storm damaged %d crop(s), setting their growth back." % storm_damaged)

	for key in CROP_KEYS:
		var base = CROPS[key]["base_price"]
		var drift = (randf() - 0.5) * base * 0.3
		var np = clamp(prices[key] + drift, base * 0.4, base * 1.8)
		prices[key] = int(round(np))

	var pressure = total_infected
	var owned_regions = regions.filter(func(r2): return r2["owned"])
	var unowned_regions = regions.filter(func(r2): return not r2["owned"])

	if pressure > 0 and unowned_regions.size() > 0 and randf() < 0.15 + pressure * 0.05:
		var target = unowned_regions[randi() % unowned_regions.size()]
		target["health"] = max(10.0, target["health"] - (10.0 + randf() * 15.0))
		_log("Blight rumors have weakened %s!" % target["name"])

	if pressure >= 3 and owned_regions.size() > 0 and randf() < 0.2:
		var target = owned_regions[randi() % owned_regions.size()]
		target["health"] = max(5.0, target["health"] - 15.0)
		_log("Outbreak spread back and hurt your region: %s!" % target["name"])

	for reg in regions:
		if not reg["owned"]:
			if reg["health"] < 100.0:
				reg["health"] = min(100.0, reg["health"] + 2.0)
			continue
		if reg.get("maintained_today", false):
			reg["health"] = min(100.0, reg["health"] + 5.0)
		else:
			reg["health"] = max(0.0, reg["health"] - REGION_DECAY)
		reg["maintained_today"] = false
		if reg["health"] <= 0.0:
			reg["owned"] = false
			plots.erase(reg["name"])
			if active_plot_id == reg["name"]:
				active_plot_id = "home"
				tiles = plots["home"]
			_log("%s fell into ruin from neglect and was lost!" % reg["name"])
		else:
			cash += int(round(reg["health"] * 0.5))

	_redraw_all_tiles()
	_check_act_progress()
	_refresh_all()
	_save_game()

func _region_price(reg: Dictionary) -> int:
	return int(round((reg["health"] / 100.0) * 300 + 100))

# ---------- Equipment upgrades ----------
func _storage_cap() -> int:
	var cap := BASE_STORAGE_CAP
	if owned_upgrades.get("storage_silo_1", false):
		cap += 20
	if owned_upgrades.get("storage_silo_2", false):
		cap += 20
	return cap

func _upgrade_locked_reason(key: String) -> String:
	if key == "storage_silo_2" and not owned_upgrades.get("storage_silo_1", false):
		return "requires Storage Silo first"
	return ""

func _maintenance_cost(reg: Dictionary) -> int:
	return max(5, int(round(_region_price(reg) * 0.15)))

func _maintain_region(reg: Dictionary) -> void:
	if reg.get("maintained_today", false):
		return
	var cost := _maintenance_cost(reg)
	if cash < cost:
		_log("Need $%d to maintain %s." % [cost, reg["name"]])
		return
	cash -= cost
	reg["maintained_today"] = true
	_log("Maintained %s for $%d." % [reg["name"], cost])
	_refresh_all()

# ---------- Seasons & weather ----------
func _season_name() -> String:
	return SEASONS[season_idx]

func _roll_weather() -> String:
	var total := 0
	for key in WEATHER_WEIGHTS:
		total += WEATHER_WEIGHTS[key]
	var roll := randi() % total
	var acc := 0
	for key in WEATHER_WEIGHTS:
		acc += WEATHER_WEIGHTS[key]
		if roll < acc:
			return key
	return "sunny"

func _advance_calendar() -> void:
	season_day += 1
	if season_day >= SEASON_LENGTH:
		season_day = 0
		season_idx = (season_idx + 1) % SEASONS.size()
		_log("The season has changed to %s." % _season_name())
	current_weather = forecast_weather
	forecast_weather = _roll_weather()

# ---------- Acts ----------
func _act() -> Dictionary:
	return ACTS[current_act]

func _tool_unlocked(key: String) -> bool:
	return _act()["tools"].has(key)

func _crop_unlocked(key: String) -> bool:
	return _act()["crops"].has(key)

func _continent_unlocked(name: String) -> bool:
	return _act()["continents"].has(name)

func _owned_count() -> int:
	return regions.filter(func(r): return r["owned"]).size()

func _check_act_progress() -> void:
	if current_act >= ACTS.size() - 1:
		if not victory_shown and _owned_count() >= regions.size():
			victory_shown = true
			_show_victory_banner()
		return
	var advanced = false
	match current_act:
		0:
			if cash >= 150:
				advanced = true
		1:
			var verdant_owned = regions.filter(func(r): return r["continent"] == "Verdant Plains" and r["owned"]).size()
			if verdant_owned >= 5:
				advanced = true
		2:
			if _owned_count() >= 10:
				advanced = true
	if advanced:
		current_act += 1
		if selected_tool != "" and not _tool_unlocked(selected_tool):
			selected_tool = _act()["tools"][0]
		if not _crop_unlocked(selected_crop):
			selected_crop = _act()["crops"][0]
		_show_act_banner(current_act)
		_refresh_all()

func _show_act_banner(idx: int) -> void:
	var act = ACTS[idx]
	act_banner_title.text = act["title"]
	act_banner_body.text = "%s\n\nGoal: %s" % [act["intro"], act["goal_text"]]
	act_banner.visible = true

func _show_victory_banner() -> void:
	act_banner_title.text = "🌍 World Domination Achieved!"
	act_banner_body.text = "You own every region on the map. Your farm empire covers the whole world. Keep playing in sandbox mode, or start a new save to do it again."
	act_banner.visible = true

# ---------- UI construction ----------
func _add_label(parent: Node, text: String, pos: Vector2, size := Vector2.ZERO, font_size := 20, color := Color(0.93, 0.95, 0.91)) -> Label:
	var l := Label.new()
	l.text = text
	l.position = pos
	if size != Vector2.ZERO:
		l.size = size
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	parent.add_child(l)
	return l

func _add_button(parent: Node, text: String, pos: Vector2, size: Vector2, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.position = pos
	b.size = size
	b.pressed.connect(cb)
	parent.add_child(b)
	return b

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	# Top HUD
	hud_cash = _add_label(layer, "$100", Vector2(16, 12), Vector2(140, 30), 24, Color(1, 0.85, 0.3))
	hud_day = _add_label(layer, "Day 1", Vector2(160, 12), Vector2(110, 30), 22)
	hud_dom = _add_label(layer, "0% owned", Vector2(280, 12), Vector2(160, 30), 18, Color(0.6, 0.85, 1))
	hud_act = _add_label(layer, "Act 1", Vector2(450, 12), Vector2(260, 30), 18, Color(0.85, 0.7, 1))
	hud_season = _add_label(layer, "", Vector2(16, 44), Vector2(680, 26), 16, Color(0.75, 0.85, 1))
	hud_farm = _add_label(layer, "", Vector2(16, 70), Vector2(680, 24), 15, Color(0.7, 0.95, 0.75))

	tool_label = _add_label(layer, "Tool: Hoe", Vector2(FARM_ORIGIN.x, FARM_ORIGIN.y + ROWS * TILE + 6), Vector2(640, 26), 20, Color(0.7, 0.9, 0.5))
	log_label = _add_label(layer, log_text, Vector2(FARM_ORIGIN.x, FARM_ORIGIN.y + ROWS * TILE + 34), Vector2(640, 44), 16, Color(1, 0.8, 0.4))
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD

	var tool_row_y = FARM_ORIGIN.y + ROWS * TILE + 86
	tool_row = HBoxContainer.new()
	tool_row.position = Vector2(FARM_ORIGIN.x, tool_row_y)
	tool_row.add_theme_constant_override("separation", 8)
	layer.add_child(tool_row)

	var action_y = tool_row_y + 70
	_add_button(layer, "Use Tool", Vector2(FARM_ORIGIN.x, action_y), Vector2(200, 64), func(): _do_action())
	_add_button(layer, "Inventory", Vector2(FARM_ORIGIN.x + 210, action_y), Vector2(200, 64), _open_inventory)
	map_button = _add_button(layer, "World Map", Vector2(FARM_ORIGIN.x + 420, action_y), Vector2(220, 64), func(): _toggle_map())

	# On-screen D-pad
	var dpad_y = action_y + 90
	var dpad_x = FARM_ORIGIN.x + 40
	_add_touch_button(layer, "^", Vector2(dpad_x + 70, dpad_y), Vector2(64, 64), func(p): move_up_held = p)
	_add_touch_button(layer, "v", Vector2(dpad_x + 70, dpad_y + 136), Vector2(64, 64), func(p): move_down_held = p)
	_add_touch_button(layer, "<", Vector2(dpad_x, dpad_y + 68), Vector2(64, 64), func(p): move_left_held = p)
	_add_touch_button(layer, ">", Vector2(dpad_x + 140, dpad_y + 68), Vector2(64, 64), func(p): move_right_held = p)

	_build_inventory_panel(layer)
	_build_map_panel(layer)
	_build_act_banner(layer)

func _build_act_banner(layer: CanvasLayer) -> void:
	act_banner = Panel.new()
	act_banner.position = Vector2(40, 300)
	act_banner.size = Vector2(640, 500)
	act_banner.visible = false
	layer.add_child(act_banner)

	act_banner_title = _add_label(act_banner, "", Vector2(24, 24), Vector2(590, 40), 26, Color(1, 0.85, 0.3))
	act_banner_body = _add_label(act_banner, "", Vector2(24, 80), Vector2(590, 340), 18)
	act_banner_body.autowrap_mode = TextServer.AUTOWRAP_WORD
	_add_button(act_banner, "Continue", Vector2(24, 430), Vector2(200, 56), func(): act_banner.visible = false)

func _add_touch_button(parent: Node, text: String, pos: Vector2, size: Vector2, on_change: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.position = pos
	b.size = size
	b.button_down.connect(func(): on_change.call(true))
	b.button_up.connect(func(): on_change.call(false))
	parent.add_child(b)
	return b

func _build_inventory_panel(layer: CanvasLayer) -> void:
	inventory_panel = Panel.new()
	inventory_panel.position = Vector2(20, 40)
	inventory_panel.size = Vector2(680, 1180)
	inventory_panel.visible = false
	layer.add_child(inventory_panel)

	_add_button(inventory_panel, "Close", Vector2(600, 10), Vector2(60, 40), func(): inventory_panel.visible = false)
	_add_label(inventory_panel, "Seed Bag", Vector2(20, 10), Vector2(400, 30), 24)

	seed_rows_container = VBoxContainer.new()
	seed_rows_container.position = Vector2(20, 60)
	seed_rows_container.size = Vector2(640, 160)
	inventory_panel.add_child(seed_rows_container)

	_add_label(inventory_panel, "Market", Vector2(20, 240), Vector2(400, 30), 24)
	market_rows_container = VBoxContainer.new()
	market_rows_container.position = Vector2(20, 280)
	market_rows_container.size = Vector2(640, 220)
	inventory_panel.add_child(market_rows_container)

	_add_label(inventory_panel, "Outbreak Status", Vector2(20, 520), Vector2(400, 30), 24)
	blight_label = _add_label(inventory_panel, "No active blight.", Vector2(20, 560), Vector2(640, 60), 18)

	_add_label(inventory_panel, "Upgrades", Vector2(20, 630), Vector2(400, 30), 24)
	upgrade_rows_container = VBoxContainer.new()
	upgrade_rows_container.position = Vector2(20, 670)
	upgrade_rows_container.size = Vector2(640, 300)
	inventory_panel.add_child(upgrade_rows_container)

	_add_button(inventory_panel, "Save Game", Vector2(20, 1000), Vector2(300, 56), _on_save_button_pressed)
	_add_button(inventory_panel, "Reset Game", Vector2(340, 1000), Vector2(300, 56), func(): _reset_game())

func _build_map_panel(layer: CanvasLayer) -> void:
	map_panel = Panel.new()
	map_panel.position = Vector2(20, 40)
	map_panel.size = Vector2(680, 1180)
	map_panel.visible = false
	layer.add_child(map_panel)

	_add_button(map_panel, "Close", Vector2(600, 10), Vector2(60, 40), func(): map_panel.visible = false)
	_add_label(map_panel, "World Map - Farm Empire Expansion", Vector2(20, 10), Vector2(560, 30), 20)
	map_summary_label = _add_label(map_panel, "", Vector2(20, 46), Vector2(640, 30), 16, Color(0.7, 0.8, 0.7))

	var scroll := ScrollContainer.new()
	scroll.position = Vector2(20, 84)
	scroll.size = Vector2(640, 1080)
	map_panel.add_child(scroll)

	map_scroll_content = VBoxContainer.new()
	map_scroll_content.custom_minimum_size = Vector2(620, 0)
	scroll.add_child(map_scroll_content)

func _open_inventory() -> void:
	inventory_panel.visible = true
	_refresh_inventory_panel()

func _on_save_button_pressed() -> void:
	_save_game()
	_log("Game saved.")

func _toggle_map() -> void:
	if _act()["continents"].is_empty():
		_log("The world map isn't open yet - keep building up your farm.")
		return
	map_panel.visible = not map_panel.visible
	if map_panel.visible:
		_refresh_map_panel()

# ---------- UI refresh ----------
func _refresh_all() -> void:
	var owned_count = _owned_count()
	hud_cash.text = "$%d" % cash
	hud_day.text = "Day %d" % day
	hud_dom.text = "%d%% owned" % int(round(100.0 * owned_count / regions.size()))
	hud_act.text = ACTS[current_act]["title"]
	hud_season.text = "%s (day %d/%d) - %s %s  |  Tomorrow: %s %s" % [
		_season_name(), season_day + 1, SEASON_LENGTH,
		WEATHER[current_weather]["emoji"], WEATHER[current_weather]["name"],
		WEATHER[forecast_weather]["emoji"], WEATHER[forecast_weather]["name"],
	]
	var terrain = _terrain_for_plot(active_plot_id)
	hud_farm.text = "Farming: %s%s" % [_plot_display_name(active_plot_id), "" if active_plot_id == "home" else " (%s)" % terrain]
	map_button.visible = _act()["continents"].size() > 0
	_refresh_tool_ui()
	_refresh_inventory_panel()
	if map_panel and map_panel.visible:
		_refresh_map_panel()

func _refresh_tool_ui() -> void:
	tool_label.text = "Tool: %s %s" % [TOOLS[selected_tool]["emoji"], TOOLS[selected_tool]["name"]]
	for child in tool_row.get_children():
		child.queue_free()
	tool_buttons.clear()
	for key in TOOL_KEYS:
		if not _tool_unlocked(key):
			continue
		var t = TOOLS[key]
		var btn := Button.new()
		btn.text = "%s %s" % [t["emoji"], t["name"]]
		btn.custom_minimum_size = Vector2(160, 56)
		btn.pressed.connect(func(): _select_tool(key))
		btn.modulate = Color(1, 1, 0.6) if key == selected_tool else Color(1, 1, 1)
		tool_row.add_child(btn)
		tool_buttons[key] = btn

func _refresh_inventory_panel() -> void:
	for child in seed_rows_container.get_children():
		child.queue_free()
	for key in CROP_KEYS:
		if not _crop_unlocked(key):
			continue
		var crop = CROPS[key]
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s (seeds: %d)%s" % [crop["name"], seeds[key], "  [selected]" if key == selected_crop else ""]
		label.custom_minimum_size = Vector2(340, 0)
		row.add_child(label)
		var select_btn := Button.new()
		select_btn.text = "Select"
		select_btn.pressed.connect(func(): _select_crop(key))
		row.add_child(select_btn)
		var buy_btn := Button.new()
		buy_btn.text = "Buy $%d" % crop["seed_cost"]
		buy_btn.pressed.connect(func():
			if cash >= crop["seed_cost"]:
				cash -= crop["seed_cost"]
				seeds[key] += 1
				_refresh_all()
		)
		row.add_child(buy_btn)
		seed_rows_container.add_child(row)

	for child in market_rows_container.get_children():
		child.queue_free()
	var storage_cap = _storage_cap()
	for key in CROP_KEYS:
		if not _crop_unlocked(key):
			continue
		var crop = CROPS[key]
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s  seeds:%d  produce:%d/%d  $%d" % [crop["name"], seeds[key], produce[key], storage_cap, prices[key]]
		label.custom_minimum_size = Vector2(420, 0)
		row.add_child(label)
		var sell_btn := Button.new()
		sell_btn.text = "Sell all"
		sell_btn.disabled = produce[key] == 0
		sell_btn.pressed.connect(func():
			var amount = produce[key]
			var earnings = amount * prices[key]
			cash += earnings
			produce[key] = 0
			_log("Sold %d %s for $%d." % [amount, crop["name"], earnings])
			_check_act_progress()
			_refresh_all()
		)
		row.add_child(sell_btn)
		market_rows_container.add_child(row)

	var infected_count := 0
	var infected_here := 0
	for plot_id in plots.keys():
		var grid: Array = plots[plot_id]
		for r in range(ROWS):
			for c in range(COLS):
				if grid[r][c].get("infected", false):
					infected_count += 1
					if plot_id == active_plot_id:
						infected_here += 1
	if infected_count > 0:
		blight_label.text = "%d tile(s) infected with blight across your farms (%d on this plot). Use the Cure Spray or contain the spread." % [infected_count, infected_here]
		blight_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4))
	else:
		blight_label.text = "No active blight. Your farms are healthy."
		blight_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.7))

	for child in upgrade_rows_container.get_children():
		child.queue_free()
	if current_act < 1:
		var locked_label := Label.new()
		locked_label.text = "Upgrades unlock in Act 2."
		locked_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
		upgrade_rows_container.add_child(locked_label)
	else:
		for key in UPGRADE_KEYS:
			var up = UPGRADES[key]
			var owned = owned_upgrades.get(key, false)
			var locked_reason = _upgrade_locked_reason(key)
			var row := HBoxContainer.new()
			var label := Label.new()
			var suffix = "  [owned]" if owned else ("  (%s)" % locked_reason if locked_reason != "" else "")
			label.text = "%s - %s%s" % [up["name"], up["desc"], suffix]
			label.custom_minimum_size = Vector2(460, 0)
			label.autowrap_mode = TextServer.AUTOWRAP_WORD
			row.add_child(label)
			if not owned:
				var buy_btn := Button.new()
				buy_btn.text = "Buy $%d" % up["cost"]
				buy_btn.disabled = cash < up["cost"] or locked_reason != ""
				buy_btn.pressed.connect(func():
					if cash >= up["cost"] and _upgrade_locked_reason(key) == "":
						cash -= up["cost"]
						owned_upgrades[key] = true
						_log("Purchased %s!" % up["name"])
						_refresh_all()
				)
				row.add_child(buy_btn)
			upgrade_rows_container.add_child(row)

func _refresh_map_panel() -> void:
	var owned_count = regions.filter(func(r): return r["owned"]).size()
	map_summary_label.text = "%d / %d regions under your control across %d continents." % [owned_count, regions.size(), CONTINENTS.size()]

	for child in map_scroll_content.get_children():
		child.queue_free()

	if active_plot_id != "home":
		var home_btn := Button.new()
		home_btn.text = "🏠 Return to Home Farm"
		home_btn.pressed.connect(func():
			_switch_active_plot("home")
			map_panel.visible = false
		)
		map_scroll_content.add_child(home_btn)

	for continent in CONTINENTS:
		var owned_here = regions.filter(func(r): return r["continent"] == continent["name"] and r["owned"]).size()
		var locked = not _continent_unlocked(continent["name"])
		var heading = "%s (%d/%d)" % [continent["name"], owned_here, continent["regions"].size()]
		if locked:
			heading = "🔒 %s - unlock in a later Act" % continent["name"]
		_add_label_child(map_scroll_content, heading, 20, Color(0.6, 0.6, 0.6) if locked else Color(1, 0.85, 0.3))
		if locked:
			continue

		for reg in regions:
			if reg["continent"] != continent["name"]:
				continue
			var card := PanelContainer.new()
			var vb := VBoxContainer.new()
			card.add_child(vb)
			var title = Label.new()
			title.text = "%s%s" % [reg["name"], "  (owned)" if reg["owned"] else ""]
			title.add_theme_font_size_override("font_size", 18)
			vb.add_child(title)
			var health_label = Label.new()
			health_label.text = "Health: %d%%  (terrain: %s - %s)" % [int(round(reg["health"])), reg["terrain"], TERRAIN_FLAVOR.get(reg["terrain"], "")]
			health_label.autowrap_mode = TextServer.AUTOWRAP_WORD
			vb.add_child(health_label)
			if not reg["owned"]:
				var price = _region_price(reg)
				var buy_btn := Button.new()
				buy_btn.text = "Buy for $%d" % price
				buy_btn.disabled = cash < price
				buy_btn.pressed.connect(func():
					if cash >= price:
						cash -= price
						reg["owned"] = true
						plots[reg["name"]] = _make_empty_grid()
						_log("You acquired %s! You can farm it directly, or leave it earning passive upkeep income." % reg["name"])
						_check_act_progress()
						_refresh_all()
				)
				vb.add_child(buy_btn)
			else:
				var income_label = Label.new()
				income_label.text = "Income: $%d/day (from health)." % int(round(reg["health"] * 0.5))
				vb.add_child(income_label)
				var maintained = reg.get("maintained_today", false)
				var maint_cost = _maintenance_cost(reg)
				var maint_btn := Button.new()
				maint_btn.text = "Maintained today" if maintained else "Maintain ($%d)" % maint_cost
				maint_btn.disabled = maintained or cash < maint_cost
				maint_btn.pressed.connect(func():
					_maintain_region(reg)
					_refresh_map_panel()
				)
				vb.add_child(maint_btn)
				var warn_label = Label.new()
				warn_label.text = "Unmaintained regions lose %d health/day and can be lost!" % int(REGION_DECAY)
				warn_label.add_theme_font_size_override("font_size", 14)
				warn_label.add_theme_color_override("font_color", Color(0.9, 0.6, 0.4))
				vb.add_child(warn_label)
				var farm_btn := Button.new()
				if active_plot_id == reg["name"]:
					farm_btn.text = "🌾 Currently farming here"
					farm_btn.disabled = true
				else:
					farm_btn.text = "Farm this region"
					farm_btn.pressed.connect(func():
						_switch_active_plot(reg["name"])
						map_panel.visible = false
					)
				vb.add_child(farm_btn)
			map_scroll_content.add_child(card)

func _add_label_child(parent: Node, text: String, font_size: int, color: Color) -> void:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	parent.add_child(l)

# ---------- Save / Load ----------
func _save_game() -> void:
	var data := {
		"cash": cash, "day": day, "seeds": seeds, "produce": produce, "prices": prices,
		"selected_crop": selected_crop, "selected_tool": selected_tool,
		"current_act": current_act, "victory_shown": victory_shown,
		"season_idx": season_idx, "season_day": season_day,
		"current_weather": current_weather, "forecast_weather": forecast_weather,
		"plots": plots, "active_plot_id": active_plot_id, "regions": regions,
		"owned_upgrades": owned_upgrades,
		"player_x": player_pos.x, "player_y": player_pos.y,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))
		f.close()

func _load_game() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if not f:
		return
	var text := f.get_as_text()
	f.close()
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	cash = parsed.get("cash", cash)
	day = parsed.get("day", day)
	seeds = parsed.get("seeds", seeds)
	produce = parsed.get("produce", produce)
	prices = parsed.get("prices", prices)
	selected_crop = parsed.get("selected_crop", selected_crop)
	selected_tool = parsed.get("selected_tool", selected_tool)
	current_act = clampi(int(parsed.get("current_act", current_act)), 0, ACTS.size() - 1)
	victory_shown = parsed.get("victory_shown", victory_shown)
	season_idx = clampi(int(parsed.get("season_idx", season_idx)), 0, SEASONS.size() - 1)
	season_day = clampi(int(parsed.get("season_day", season_day)), 0, SEASON_LENGTH - 1)
	current_weather = parsed.get("current_weather", current_weather)
	if not WEATHER.has(current_weather):
		current_weather = "sunny"
	forecast_weather = parsed.get("forecast_weather", forecast_weather)
	if not WEATHER.has(forecast_weather):
		forecast_weather = "sunny"
	owned_upgrades = parsed.get("owned_upgrades", owned_upgrades)
	if parsed.has("regions"):
		regions = parsed["regions"]

	if parsed.has("plots"):
		plots = parsed["plots"]
	elif parsed.has("tiles"):
		# Pre-multi-plot save: the single grid it had becomes the home plot.
		plots = {"home": parsed["tiles"]}
	if not plots.has("home"):
		plots["home"] = _make_empty_grid()
	for reg in regions:
		if reg.get("owned", false) and not plots.has(reg["name"]):
			plots[reg["name"]] = _make_empty_grid()

	active_plot_id = parsed.get("active_plot_id", "home")
	if not plots.has(active_plot_id):
		active_plot_id = "home"
	tiles = plots[active_plot_id]

	player_pos = Vector2(parsed.get("player_x", player_pos.x), parsed.get("player_y", player_pos.y))

func _reset_game() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(SAVE_PATH)
	cash = 100
	day = 1
	day_progress = 0.0
	seeds = {"wheat": 6, "corn": 2, "tomato": 0}
	produce = {"wheat": 0, "corn": 0, "tomato": 0}
	prices = {"wheat": 10, "corn": 22, "tomato": 45}
	selected_crop = "wheat"
	selected_tool = "hoe"
	current_act = 0
	victory_shown = false
	player_pos = Vector2(TILE * 2, TILE * 2)
	tiles.clear()
	regions.clear()
	_init_fresh_state()
	_redraw_all_tiles()
	_refresh_all()
	inventory_panel.visible = false
	map_panel.visible = false
	_log("Game reset.")
	_show_act_banner(0)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_PAUSED:
		_save_game()
