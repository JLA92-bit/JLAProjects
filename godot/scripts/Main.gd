extends Node2D

# ---------- Constants ----------
const TILE := 64
const COLS := 10
const ROWS := 7
const DAY_LENGTH := 25.0
const PLAYER_SPEED := 220.0
const FARM_ORIGIN := Vector2(40, 110)

const CROPS := {
	"wheat": {"name": "Wheat", "seed_cost": 5, "grow_days": 3, "base_price": 10},
	"corn": {"name": "Corn", "seed_cost": 10, "grow_days": 4, "base_price": 22},
	"tomato": {"name": "Tomato", "seed_cost": 20, "grow_days": 5, "base_price": 45},
}
const CROP_KEYS := ["wheat", "corn", "tomato"]

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
var tiles := []
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
	tiles.clear()
	for r in range(ROWS):
		var row := []
		for c in range(COLS):
			row.append({"type": "grass"})
		tiles.append(row)
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
			})
			i += 1

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
			if tile["type"] != "planted":
				_log("Nothing planted here to water.")
				return
			if tile.get("watered", false):
				_log("Already watered today. It's growing...")
				return
			tile["watered"] = true
			tile["times_watered"] = tile.get("times_watered", 0) + 1
			_log("Watered the crop.")
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
func _day_tick() -> void:
	day += 1
	var infected_tiles := []
	var wilted := 0

	for r in range(ROWS):
		for c in range(COLS):
			var t: Dictionary = tiles[r][c]
			if t["type"] != "planted":
				continue
			if t.get("watered", false):
				t["dry_days"] = 0
				if t.get("stage", 0) < 4:
					t["stage"] = t.get("stage", 0) + 1
			else:
				t["dry_days"] = t.get("dry_days", 0) + 1
				if t["dry_days"] >= WILT_DAYS:
					t["type"] = "grass"
					wilted += 1
					continue
				if t.get("stage", 0) < 4 and randf() < 0.5:
					t["stage"] = t.get("stage", 0) + 1
			t["watered"] = false

			if t.get("infected", false):
				t["infected_days"] = t.get("infected_days", 0) + 1
				infected_tiles.append(Vector2i(c, r))
				if t["infected_days"] >= 4:
					t["type"] = "grass"
			elif _act()["blight"]:
				var chance = 0.02 + infected_tiles.size() * 0.01
				if randf() < chance:
					t["infected"] = true
					t["infected_days"] = 0

	for pos in infected_tiles:
		var neighbors = [Vector2i(pos.x - 1, pos.y), Vector2i(pos.x + 1, pos.y), Vector2i(pos.x, pos.y - 1), Vector2i(pos.x, pos.y + 1)]
		for n in neighbors:
			if n.x < 0 or n.y < 0 or n.x >= COLS or n.y >= ROWS:
				continue
			var nt: Dictionary = tiles[n.y][n.x]
			if nt["type"] == "planted" and not nt.get("infected", false) and randf() < 0.3:
				nt["infected"] = true
				nt["infected_days"] = 0

	if wilted > 0:
		_log("%d crop(s) wilted from neglect - remember to water with the Watering Can." % wilted)

	for key in CROP_KEYS:
		var base = CROPS[key]["base_price"]
		var drift = (randf() - 0.5) * base * 0.3
		var np = clamp(prices[key] + drift, base * 0.4, base * 1.8)
		prices[key] = int(round(np))

	var pressure = infected_tiles.size()
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
		if reg["health"] < 100.0:
			reg["health"] = min(100.0, reg["health"] + 2.0)
		if reg["owned"]:
			cash += int(round(reg["health"] * 0.5))

	_redraw_all_tiles()
	_check_act_progress()
	_refresh_all()
	_save_game()

func _region_price(reg: Dictionary) -> int:
	return int(round((reg["health"] / 100.0) * 300 + 100))

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

	_add_button(inventory_panel, "Save Game", Vector2(20, 640), Vector2(300, 56), _on_save_button_pressed)
	_add_button(inventory_panel, "Reset Game", Vector2(340, 640), Vector2(300, 56), func(): _reset_game())

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
	for key in CROP_KEYS:
		if not _crop_unlocked(key):
			continue
		var crop = CROPS[key]
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s  seeds:%d  produce:%d  $%d" % [crop["name"], seeds[key], produce[key], prices[key]]
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
	for r in range(ROWS):
		for c in range(COLS):
			if tiles[r][c].get("infected", false):
				infected_count += 1
	if infected_count > 0:
		blight_label.text = "%d tile(s) infected with blight! Use the Cure Spray or contain the spread." % infected_count
		blight_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4))
	else:
		blight_label.text = "No active blight. Your farm is healthy."
		blight_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.7))

func _refresh_map_panel() -> void:
	var owned_count = regions.filter(func(r): return r["owned"]).size()
	map_summary_label.text = "%d / %d regions under your control across %d continents." % [owned_count, regions.size(), CONTINENTS.size()]

	for child in map_scroll_content.get_children():
		child.queue_free()

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
			health_label.text = "Health: %d%%  (terrain: %s)" % [int(round(reg["health"])), reg["terrain"]]
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
						_log("You acquired %s!" % reg["name"])
						_check_act_progress()
						_refresh_all()
				)
				vb.add_child(buy_btn)
			else:
				var income_label = Label.new()
				income_label.text = "Generating income daily."
				vb.add_child(income_label)
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
		"tiles": tiles, "regions": regions,
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
	if parsed.has("tiles"):
		tiles = parsed["tiles"]
	if parsed.has("regions"):
		regions = parsed["regions"]
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
