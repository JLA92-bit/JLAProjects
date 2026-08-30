extends Node2D

# Editor-only: set this in the Inspector (0-3) and run this scene to jump
# straight to that Act's title card + Kacie dialogue, with tools/crops/map
# unlocked to match, skipping the naming screen and normal progression -
# lets each Act be previewed and tested in isolation without playing
# through every Act before it. Leave at -1 for normal play.
@export_range(-1, 3, 1) var debug_start_act: int = -1

# ---------- Constants ----------
const TILE := 40
const COLS := 16
const ROWS := 11
const DAY_LENGTH := 25.0
const PLAYER_SPEED := 220.0
const FARM_ORIGIN := Vector2(40, 110)

# ---------- 3D farm view ----------
# The farm is rendered as a real 3D scene (Kenney "Nature Kit" models, CC0)
# inside a SubViewport embedded at the same screen position/size the old 2D
# sprite grid used to occupy - every other UI position/size constant above
# stays meaningful unchanged. Nature Kit's ground/fence pieces are modeled
# at exactly 1 unit = 1 tile, centered on origin with their base at y=0, so
# WORLD_TILE=1.0 needs no rescaling (confirmed by reading each glTF's own
# accessor bounding box, not by eyeballing it in an editor).
const WORLD_TILE := 1.0
const PLAYER_SCALE := 0.1 # basicCharacter.gltf is modeled ~17 units tall
const PLAYER_Y_OFFSET := 0.1 # compensates its feet sitting slightly below y=0

# ---------- In-app update check (Android only) ----------
# Compares the commit this build was stamped with (godot/build_version.json,
# written by CI at export time) against the latest GitHub release's commit
# marker. A match means no update; a mismatch surfaces a banner whose button
# opens the APK download URL, letting Android's own download+install flow
# take over with one tap - no uninstall needed since CI signs every build
# with the same committed keystore.
const UPDATE_CHECK_URL := "https://api.github.com/repos/JLA92-bit/JLAProjects/releases/tags/android-latest"

# "thirsty" crops dry out one day faster than normal every day (not just
# during a heatwave), giving each crop a distinct watering-frequency
# requirement - a simple boolean tag rather than a numeric water-need stat.
# "blight_resistant" halves both the chance a healthy plant of that crop
# catches the outbreak and the chance it passes it to a resistant neighbor -
# the spec's "disease/pest vulnerability" attribute, same simple-tag pattern.
const CROPS := {
	"wheat": {"name": "Wheat", "seed_cost": 5, "grow_days": 3, "base_price": 10, "seasons": ["Spring", "Summer", "Fall", "Winter"], "frost_hardy": true, "heat_sensitive": false, "thirsty": false, "blight_resistant": true},
	"corn": {"name": "Corn", "seed_cost": 10, "grow_days": 4, "base_price": 22, "seasons": ["Spring", "Summer"], "frost_hardy": false, "heat_sensitive": false, "thirsty": true, "blight_resistant": false},
	"tomato": {"name": "Tomato", "seed_cost": 20, "grow_days": 5, "base_price": 45, "seasons": ["Summer", "Fall"], "frost_hardy": false, "heat_sensitive": true, "thirsty": false, "blight_resistant": false},
	"pumpkin": {"name": "Pumpkin", "seed_cost": 35, "grow_days": 6, "base_price": 70, "seasons": ["Fall"], "frost_hardy": false, "heat_sensitive": false, "thirsty": false, "blight_resistant": false},
}
const CROP_KEYS := ["wheat", "corn", "tomato", "pumpkin"]

# ---------- Seasons & weather ----------
const SEASONS := ["Spring", "Summer", "Fall", "Winter"]
const SEASON_LENGTH := 7 # days per season
const WEATHER := {
	"sunny": {"name": "Sunny", "emoji": "☀"},
	"rainy": {"name": "Rainy", "emoji": "🌧"},
	"storm": {"name": "Storm", "emoji": "⛈"},
	"drought": {"name": "Drought", "emoji": "🔥"},
	"frost": {"name": "Frost", "emoji": "🥶"},
	"heatwave": {"name": "Heatwave", "emoji": "🌡"},
}
# Base weights before season-gating (frost only rolls in Fall/Winter, heatwave
# only in Spring/Summer - see _roll_weather()). Non-hardy/non-heat-sensitive
# crops mostly ignore these; they exist as a targeted threat, not a blanket one.
const WEATHER_WEIGHTS := {"sunny": 40, "rainy": 20, "storm": 8, "drought": 8, "frost": 12, "heatwave": 12}
const REGION_DECAY := 6.0 # health lost per day for an unmaintained owned region

# ---------- Market events ----------
# A random demand spike temporarily boosts one crop's sell price, unlocked
# alongside the market itself (Act 2+). Creates a "sell now before it ends
# or hold for regular price" decision on top of the existing price drift.
const EVENT_CHANCE := 0.08
const EVENT_MIN_MULT := 1.4
const EVENT_MAX_MULT := 1.8
const EVENT_MIN_DAYS := 2
const EVENT_MAX_DAYS := 3

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
const UPGRADE_KEYS := ["watering_can_2", "storage_silo_1", "storage_silo_2", "sprinkler_system", "scarecrow", "greenhouse", "regional_council"]
const UPGRADES := {
	"watering_can_2": {"name": "Reinforced Watering Can", "cost": 200, "desc": "Waters a 3x3 area around you instead of a single tile."},
	"storage_silo_1": {"name": "Storage Silo", "cost": 150, "desc": "+20 storage capacity per crop."},
	"storage_silo_2": {"name": "Storage Silo II", "cost": 400, "desc": "+20 more storage capacity per crop."},
	"sprinkler_system": {"name": "Sprinkler System", "cost": 600, "desc": "Automatically waters every planted tile on whichever farm you're actively working, every morning - no more manual watering there."},
	"scarecrow": {"name": "Scarecrow", "cost": 180, "desc": "Halves the chance of blight starting or spreading on whichever farm you're actively working."},
	"greenhouse": {"name": "Greenhouse", "cost": 500, "desc": "Lets you plant any unlocked crop in any season, ignoring its normal growing season."},
	"regional_council": {"name": "Regional Council", "cost": 1000, "desc": "Each morning, automatically pays to maintain as many owned world regions as you can afford (cheapest first) instead of maintaining them one by one from the World Map."},
}

const TOOLS := {
	"hoe": {"name": "Hoe", "emoji": "🔨"},
	"water": {"name": "Watering Can", "emoji": "💧"},
	"seed": {"name": "Seed Bag", "emoji": "🌱"},
	"cure": {"name": "Cure Spray", "emoji": "🧪"},
	"fertilize": {"name": "Fertilizer", "emoji": "🪴"},
}
const TOOL_KEYS := ["hoe", "water", "seed", "cure", "fertilize"]
const WILT_DAYS := 3
const CURE_COST := 15

# ---------- Soil (early-game depth: a single quality score per tile) ----------
# Planting the same crop repeatedly depletes soil faster than rotating
# crops; fertilizer restores it directly; leaving a tile fallow (untilled
# grass) slowly recovers it on its own. Soil quality gates the existing
# well-tended yield bonus and, when badly exhausted, risks losing the
# harvest outright - a real reason to rotate crops or invest in fertilizer
# instead of just replanting the same profitable crop forever.
const SOIL_DEGRADE_SAME_CROP := 15.0
const SOIL_DEGRADE_ROTATED := 5.0
const SOIL_FALLOW_REGEN := 1.0
const SOIL_FERTILIZE_BOOST := 30.0
const SOIL_DEPLETED_THRESHOLD := 70.0
const SOIL_EXHAUSTED_THRESHOLD := 40.0
const SOIL_EXHAUSTED_FAIL_CHANCE := 0.3
const FERTILIZER_COST := 12

# ---------- Harvest quality (separate from yield/quantity) ----------
# Quantity (well-tended 2x bonus) already existed; this adds a distinct
# quality grade affecting SALE PRICE, so "how much you grew" and "how good
# it is" are two different, both-visible outcomes of the same care.
const QUALITY_KEYS := ["poor", "good", "excellent"]
const QUALITY_LABELS := {"poor": "Poor", "good": "Good", "excellent": "Excellent"}
const QUALITY_MULTIPLIER := {"poor": 0.7, "good": 1.0, "excellent": 1.35}

# ---------- Processing (turns raw produce into a higher-value good) ----------
# Unlocked alongside the market, Act 2+. Consumes the WORST-quality raw
# produce first (poor, then good, then excellent) so a Poor harvest that
# would otherwise sell for a pittance still has a use, while top-quality
# produce stays worth selling raw at full price.
const PROCESSING := {
	"wheat": {"product": "flour", "product_name": "Flour", "input_amount": 3, "price": 45},
	"corn": {"product": "cornmeal", "product_name": "Cornmeal", "input_amount": 3, "price": 95},
	"tomato": {"product": "sauce", "product_name": "Tomato Sauce", "input_amount": 3, "price": 180},
	"pumpkin": {"product": "pumpkin_pie", "product_name": "Pumpkin Pie", "input_amount": 3, "price": 275},
}
const PROCESSED_KEYS := ["flour", "cornmeal", "sauce", "pumpkin_pie"]

# ---------- World map (real continents, real countries) ----------
# Each "region" is a real country, grouped under its real continent. This
# is the full roster: essentially every UN member state grouped by its
# real continent (Africa's 54, Europe's ~44, etc.), plus a handful of
# widely-recognized non-UN places commonly included in "countries of the
# world" lists (Taiwan, Kosovo, Palestine, Vatican City, Greenland) -
# matching how atlases and geography games usually scope "every country",
# rather than a fictional set piece. Hemisphere placement follows reality:
# Europe and virtually all of North America sit entirely in the Northern
# Hemisphere, Oceania and most of South America in the Southern.
const CONTINENTS := [
	{"name": "Africa", "regions": [
		"Algeria", "Angola", "Benin", "Botswana", "Burkina Faso",
		"Burundi", "Cabo Verde", "Cameroon", "Central African Republic", "Chad",
		"Comoros", "Democratic Republic of the Congo", "Republic of the Congo", "Djibouti", "Egypt",
		"Equatorial Guinea", "Eritrea", "Eswatini", "Ethiopia", "Gabon",
		"Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Ivory Coast",
		"Kenya", "Lesotho", "Liberia", "Libya", "Madagascar",
		"Malawi", "Mali", "Mauritania", "Mauritius", "Morocco",
		"Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
		"Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone", "Somalia",
		"South Africa", "South Sudan", "Sudan", "Tanzania", "Togo",
		"Tunisia", "Uganda", "Zambia", "Zimbabwe",
	]},
	{"name": "Asia", "regions": [
		"Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh",
		"Bhutan", "Brunei", "Cambodia", "China", "Cyprus",
		"Georgia", "India", "Indonesia", "Iran", "Iraq",
		"Israel", "Japan", "Jordan", "Kazakhstan", "Kuwait",
		"Kyrgyzstan", "Laos", "Lebanon", "Malaysia", "Maldives",
		"Mongolia", "Myanmar", "Nepal", "North Korea", "Oman",
		"Pakistan", "Palestine", "Philippines", "Qatar", "Saudi Arabia",
		"Singapore", "South Korea", "Sri Lanka", "Syria", "Taiwan",
		"Tajikistan", "Thailand", "Timor-Leste", "Turkey", "Turkmenistan",
		"United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen",
	]},
	{"name": "Europe", "regions": [
		"Albania", "Andorra", "Austria", "Belarus", "Belgium",
		"Bosnia and Herzegovina", "Bulgaria", "Croatia", "Czechia", "Denmark",
		"Estonia", "Finland", "France", "Germany", "Greece",
		"Hungary", "Iceland", "Ireland", "Italy", "Kosovo",
		"Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta",
		"Moldova", "Monaco", "Montenegro", "Netherlands", "North Macedonia",
		"Norway", "Poland", "Portugal", "Romania", "Russia",
		"San Marino", "Serbia", "Slovakia", "Slovenia", "Spain",
		"Sweden", "Switzerland", "Ukraine", "United Kingdom", "Vatican City",
	]},
	{"name": "North America", "regions": [
		"Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Canada",
		"Costa Rica", "Cuba", "Dominica", "Dominican Republic", "El Salvador",
		"Grenada", "Guatemala", "Haiti", "Honduras", "Jamaica",
		"Mexico", "Nicaragua", "Panama", "Saint Kitts and Nevis", "Saint Lucia",
		"Saint Vincent and the Grenadines", "Trinidad and Tobago", "United States", "Greenland",
	]},
	{"name": "South America", "regions": [
		"Argentina", "Bolivia", "Brazil", "Chile", "Colombia",
		"Ecuador", "Guyana", "Paraguay", "Peru", "Suriname",
		"Uruguay", "Venezuela",
	]},
	{"name": "Oceania", "regions": [
		"Australia", "Fiji", "Kiribati", "Marshall Islands", "Micronesia",
		"Nauru", "New Zealand", "Palau", "Papua New Guinea", "Samoa",
		"Solomon Islands", "Tonga", "Tuvalu", "Vanuatu",
	]},
]

# Each country's terrain reflects its real, well-known dominant geography
# (mountainous nations get "cliff", major agricultural exporters get
# "farmland", small island/atoll nations get "water" or "beach", etc.)
# rather than an arbitrary round-robin - keeping the "accurate to real
# Earth" goal from CONTINENTS consistent down to the terrain flavor text
# each region shows. Falls back to "grass" for anything not listed.
const COUNTRY_TERRAIN := {
	# Africa
	"Algeria": "cliff", "Angola": "grass", "Benin": "farmland", "Botswana": "grass", "Burkina Faso": "farmland",
	"Burundi": "cliff", "Cabo Verde": "water", "Cameroon": "grass", "Central African Republic": "grass", "Chad": "grass",
	"Comoros": "water", "Democratic Republic of the Congo": "grass", "Republic of the Congo": "grass", "Djibouti": "beach", "Egypt": "water",
	"Equatorial Guinea": "water", "Eritrea": "beach", "Eswatini": "cliff", "Ethiopia": "cliff", "Gabon": "grass",
	"Gambia": "farmland", "Ghana": "farmland", "Guinea": "cliff", "Guinea-Bissau": "beach", "Ivory Coast": "farmland",
	"Kenya": "grass", "Lesotho": "cliff", "Liberia": "beach", "Libya": "beach", "Madagascar": "grass",
	"Malawi": "water", "Mali": "grass", "Mauritania": "grass", "Mauritius": "beach", "Morocco": "cliff",
	"Mozambique": "beach", "Namibia": "cliff", "Niger": "grass", "Nigeria": "farmland", "Rwanda": "cliff",
	"Sao Tome and Principe": "water", "Senegal": "beach", "Seychelles": "beach", "Sierra Leone": "beach", "Somalia": "beach",
	"South Africa": "cliff", "South Sudan": "water", "Sudan": "grass", "Tanzania": "grass", "Togo": "farmland",
	"Tunisia": "beach", "Uganda": "water", "Zambia": "water", "Zimbabwe": "cliff",
	# Asia
	"Afghanistan": "cliff", "Armenia": "cliff", "Azerbaijan": "water", "Bahrain": "water", "Bangladesh": "water",
	"Bhutan": "cliff", "Brunei": "beach", "Cambodia": "water", "China": "farmland", "Cyprus": "beach",
	"Georgia": "cliff", "India": "farmland", "Indonesia": "beach", "Iran": "cliff", "Iraq": "farmland",
	"Israel": "beach", "Japan": "cliff", "Jordan": "cliff", "Kazakhstan": "grass", "Kuwait": "beach",
	"Kyrgyzstan": "cliff", "Laos": "cliff", "Lebanon": "cliff", "Malaysia": "beach", "Maldives": "water",
	"Mongolia": "grass", "Myanmar": "farmland", "Nepal": "cliff", "North Korea": "cliff", "Oman": "cliff",
	"Pakistan": "farmland", "Palestine": "beach", "Philippines": "beach", "Qatar": "beach", "Saudi Arabia": "grass",
	"Singapore": "water", "South Korea": "cliff", "Sri Lanka": "beach", "Syria": "farmland", "Taiwan": "cliff",
	"Tajikistan": "cliff", "Thailand": "beach", "Timor-Leste": "beach", "Turkey": "cliff", "Turkmenistan": "grass",
	"United Arab Emirates": "beach", "Uzbekistan": "grass", "Vietnam": "water", "Yemen": "cliff",
	# Europe
	"Albania": "cliff", "Andorra": "cliff", "Austria": "cliff", "Belarus": "farmland", "Belgium": "farmland",
	"Bosnia and Herzegovina": "cliff", "Bulgaria": "farmland", "Croatia": "beach", "Czechia": "farmland", "Denmark": "farmland",
	"Estonia": "water", "Finland": "water", "France": "farmland", "Germany": "farmland", "Greece": "beach",
	"Hungary": "farmland", "Iceland": "cliff", "Ireland": "grass", "Italy": "beach", "Kosovo": "cliff",
	"Latvia": "water", "Liechtenstein": "cliff", "Lithuania": "water", "Luxembourg": "farmland", "Malta": "beach",
	"Moldova": "farmland", "Monaco": "beach", "Montenegro": "cliff", "Netherlands": "water", "North Macedonia": "cliff",
	"Norway": "cliff", "Poland": "farmland", "Portugal": "beach", "Romania": "cliff", "Russia": "grass",
	"San Marino": "cliff", "Serbia": "farmland", "Slovakia": "cliff", "Slovenia": "cliff", "Spain": "beach",
	"Sweden": "water", "Switzerland": "cliff", "Ukraine": "farmland", "United Kingdom": "beach", "Vatican City": "grass",
	# North America
	"Antigua and Barbuda": "beach", "Bahamas": "water", "Barbados": "beach", "Belize": "water", "Canada": "grass",
	"Costa Rica": "beach", "Cuba": "beach", "Dominica": "cliff", "Dominican Republic": "beach", "El Salvador": "cliff",
	"Grenada": "beach", "Guatemala": "cliff", "Haiti": "cliff", "Honduras": "beach", "Jamaica": "beach",
	"Mexico": "cliff", "Nicaragua": "water", "Panama": "water", "Saint Kitts and Nevis": "beach", "Saint Lucia": "cliff",
	"Saint Vincent and the Grenadines": "beach", "Trinidad and Tobago": "beach", "United States": "farmland", "Greenland": "cliff",
	# South America
	"Argentina": "grass", "Bolivia": "cliff", "Brazil": "farmland", "Chile": "cliff", "Colombia": "farmland",
	"Ecuador": "cliff", "Guyana": "water", "Paraguay": "grass", "Peru": "cliff", "Suriname": "water",
	"Uruguay": "grass", "Venezuela": "beach",
	# Oceania
	"Australia": "grass", "Fiji": "beach", "Kiribati": "water", "Marshall Islands": "water", "Micronesia": "water",
	"Nauru": "water", "New Zealand": "cliff", "Palau": "water", "Papua New Guinea": "cliff", "Samoa": "beach",
	"Solomon Islands": "water", "Tonga": "beach", "Tuvalu": "water", "Vanuatu": "beach",
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
		"intro": "A mysterious blight has appeared on the farm! The Cure Spray is now in your toolkit. The world map has opened - stake your first claim in Africa.",
		"tools": ["hoe", "water", "seed", "cure", "fertilize"],
		"crops": ["wheat", "corn"],
		"continents": ["Africa"],
		"blight": true,
		"goal_text": "Own all 54 regions of Africa.",
	},
	{
		"title": "Act 3: Expanding Empire",
		"intro": "Your empire is spreading. Tomatoes fetch a fine price, and every other continent on Earth is open for the taking.",
		"tools": ["hoe", "water", "seed", "cure", "fertilize"],
		"crops": ["wheat", "corn", "tomato"],
		"continents": ["Africa", "Asia", "Europe", "North America", "South America", "Oceania"],
		"blight": true,
		"goal_text": "Own at least half of the world's 198 regions.",
	},
	{
		"title": "Act 4: World Domination",
		"intro": "Every continent is in play. Finish what you started. Pumpkins are now in season - a premium late-game crop for the truly advanced farmer.",
		"tools": ["hoe", "water", "seed", "cure", "fertilize"],
		"crops": ["wheat", "corn", "tomato", "pumpkin"],
		"continents": ["Africa", "Asia", "Europe", "North America", "South America", "Oceania"],
		"blight": true,
		"goal_text": "Own all 198 regions - total world domination.",
	},
]

# ---------- Farm progression (infrastructure ladder, separate from the Acts) ----------
# The Acts above are the story/unlock gate; this ladder reflects how
# built-out the player's actual farming operation is, driven by a simple
# score: +1 per Act reached beyond the first, +1 per equipment upgrade
# owned. It tracks the same growth the player is already causing (more
# Acts, more upgrades) rather than gating anything new of its own - but a
# higher tier means the farm's reputation now earns a small, real sell-price
# bonus, so the label isn't purely cosmetic.
const FARM_TIERS := [
	"Basic Farm", "Improved Farm", "Specialised Farm",
	"Productive Farm", "Commercial Operation", "Advanced Agricultural Business",
]
const TIER_PRICE_BONUS_PER_LEVEL := 0.03 # +3% sell price per tier above Basic

# ---------- Continent mastery bonus ----------
# Owning HALF the world (the Act 3 goal) is a checkpoint, but fully owning
# an individual continent gets no reward of its own beyond that one-time
# gate - once past Act 2 there's no reason to finish off Africa's last few
# countries instead of spreading thin everywhere. This gives each of the
# 6 continents its own permanent sell-price bonus once every region in it
# is owned, so "clean up this continent completely" is worth doing at any
# point in the game, not just the first one.
const CONTINENT_MASTERY_BONUS_PER_CONTINENT := 0.02 # +2% sell price per fully-owned continent

# ---------- Game state ----------
var cash := 100
var day := 1
var day_progress := 0.0
var seeds := {"wheat": 6, "corn": 2, "tomato": 0, "pumpkin": 0}
var fertilizer := 3
var produce := {
	"wheat": {"poor": 0, "good": 0, "excellent": 0},
	"corn": {"poor": 0, "good": 0, "excellent": 0},
	"tomato": {"poor": 0, "good": 0, "excellent": 0},
	"pumpkin": {"poor": 0, "good": 0, "excellent": 0},
}
var processed_goods := {"flour": 0, "cornmeal": 0, "sauce": 0, "pumpkin_pie": 0}
var prices := {"wheat": 10, "corn": 22, "tomato": 45, "pumpkin": 70}
var selected_crop := "wheat"
var selected_tool := "hoe"
var current_act := 0 # index into ACTS
var victory_shown := false
var lifetime_harvested := 0 # total crop units ever harvested, never decreases
var lifetime_earned := 0 # total $ ever earned selling crops/processed goods, never decreases
var owned_upgrades := {} # upgrade key -> bool
var active_event := {} # {} = none, else {"crop":key, "multiplier":float, "days_left":int}
var season_idx := 0
var season_day := 0
var current_weather := "sunny"
var forecast_weather := "sunny"
var tiles := [] # reference to plots[active_plot_id] - the grid currently on screen
var plots := {} # plot_id ("home" or an owned region's name) -> ROWSxCOLS tile grid
var active_plot_id := "home"
var regions := []
var log_text := "Welcome! Hoe tills grass, Seed Bag plants, Watering Can grows crops. Harvest by hand when ready."
var farm_name := "" # player-chosen name for the Home Farm, set on the first-launch intro screen
var is_new_game := false # true only for the very first _ready() before any save file exists

var player_pos := Vector2(TILE * 2, TILE * 2)
var player_facing := "down"

# ---------- Node refs ----------
var world_scenes := {} # key -> PackedScene (3D models)
var farm_viewport: SubViewport
var world_root: Node3D
var tile_nodes := [] # 2D array of {"node":Node3D, "ground":Node3D, "ground_key":String, "crop":Node3D}
var player_node: Node3D
var player_skin_material: StandardMaterial3D

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
var update_banner: Panel
var update_banner_label: Label
var current_build_commit := ""
var update_download_url := ""

var intro_name_panel: Panel
var farm_name_edit: LineEdit
var intro_dialog_panel: Panel
var intro_dialog_body: Label
var intro_dialog_next_btn: Button
var intro_dialog_index := 0
var active_dialogue_pages: Array = [] # Kacie's lines for whichever Act triggered the dialogue panel
var act_title_panel: Panel
var act_title_label: Label
var act_title_goal_label: Label
var pending_act_transition_idx := 0
var move_up_held := false
var move_down_held := false
var move_left_held := false
var move_right_held := false

var inventory_panel: Panel
var seed_rows_container: VBoxContainer
var market_rows_container: VBoxContainer
var processing_rows_container: VBoxContainer
var upgrade_rows_container: VBoxContainer
var blight_label: Label
var soil_label: Label
var fertilizer_label: Label
var lifetime_stats_label: Label

var map_panel: Panel
var map_summary_label: Label
var map_scroll_content: VBoxContainer
var map_scroll: ScrollContainer
var map_continent_headings := {} # continent name -> Label, for jump buttons

# ---------- Lifecycle ----------
func _ready():
	randomize()
	is_new_game = not FileAccess.file_exists(SAVE_PATH)
	_load_world_assets()
	_init_fresh_state()
	_load_game()
	_build_ui()
	_build_farm_grid()
	_redraw_all_tiles()
	_build_scenery()
	_build_player()
	_refresh_all()
	if debug_start_act >= 0:
		current_act = clampi(debug_start_act, 0, ACTS.size() - 1)
		if selected_tool != "" and not _tool_unlocked(selected_tool):
			selected_tool = _act()["tools"][0]
		if not _crop_unlocked(selected_crop):
			selected_crop = _act()["crops"][0]
		_refresh_all()
		_show_act_transition(current_act)
	elif is_new_game:
		intro_name_panel.visible = true
	elif current_act == 0:
		_show_act_banner(0)
	_load_build_commit()
	_check_for_update()

func _load_world_assets():
	const NK := "res://assets_3d/nature_kit/"
	world_scenes["ground_grass"] = load(NK + "ground_grass.glb")
	# crops_dirtSingle.glb is a small raised dirt MOUND meant to sit decoratively
	# on top of a full grass tile, not a full-tile ground mesh - using it as the
	# tilled-soil ground left every tilled/planted tile with no ground plane at
	# all (sky showing through, mound floating above nothing). ground_pathTile
	# is a proper flat 1x1 tile with a dirt-path center, so it reads correctly
	# as tilled soil.
	world_scenes["ground_soil"] = load(NK + "ground_pathTile.glb")
	world_scenes["wheat_a"] = load(NK + "crops_wheatStageA.glb")
	world_scenes["wheat_b"] = load(NK + "crops_wheatStageB.glb")
	world_scenes["corn_a"] = load(NK + "crops_cornStageA.glb")
	world_scenes["corn_b"] = load(NK + "crops_cornStageB.glb")
	world_scenes["corn_c"] = load(NK + "crops_cornStageC.glb")
	world_scenes["corn_d"] = load(NK + "crops_cornStageD.glb")
	# Nature Kit has no tomato-specific staged model; a generic leafy plant
	# stands in for the growing phase and a round fruit model for "ready".
	world_scenes["tomato_a"] = load(NK + "crops_leafsStageA.glb")
	world_scenes["tomato_b"] = load(NK + "crops_leafsStageB.glb")
	world_scenes["tomato_ready"] = load(NK + "crop_melon.glb")
	world_scenes["pumpkin_a"] = load(NK + "crops_leafsStageA.glb")
	world_scenes["pumpkin_b"] = load(NK + "crops_leafsStageB.glb")
	world_scenes["pumpkin_ready"] = load(NK + "crop_pumpkin.glb")
	world_scenes["fence"] = load(NK + "fence_simple.glb")
	world_scenes["fence_corner"] = load(NK + "fence_corner.glb")
	world_scenes["tree"] = load(NK + "tree_default.glb")
	world_scenes["pine"] = load(NK + "tree_pineRoundA.glb")
	world_scenes["player"] = load("res://assets_3d/character/basicCharacter.gltf")
	player_skin_material = StandardMaterial3D.new()
	player_skin_material.albedo_texture = load("res://assets_3d/character/skin_man.png")

func _init_fresh_state():
	plots = {"home": _make_empty_grid()}
	active_plot_id = "home"
	tiles = plots["home"]
	owned_upgrades = {}
	active_event = {}
	regions.clear()
	for continent in CONTINENTS:
		for rname in continent["regions"]:
			regions.append({
				"name": rname,
				"continent": continent["name"],
				"terrain": COUNTRY_TERRAIN.get(rname, "grass"),
				"health": 100.0,
				"owned": false,
				"maintained_today": false,
			})
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
			row.append({"type": "grass", "soil_quality": 100.0, "last_crop": ""})
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
	if plot_id == "home":
		return farm_name if farm_name != "" else "Home Farm"
	return plot_id

func _switch_active_plot(plot_id: String) -> void:
	if plot_id == active_plot_id or not plots.has(plot_id):
		return
	active_plot_id = plot_id
	tiles = plots[plot_id]
	_redraw_all_tiles()
	var terrain = _terrain_for_plot(plot_id)
	_log("Now farming: %s (%s)." % [_plot_display_name(plot_id), TERRAIN_FLAVOR.get(terrain, "")])
	_refresh_all()

# ---------- Farm grid rendering (3D) ----------
func _build_farm_view(layer: CanvasLayer) -> void:
	var container := SubViewportContainer.new()
	container.position = FARM_ORIGIN
	container.size = Vector2(COLS * TILE, ROWS * TILE)
	container.stretch = true
	layer.add_child(container)

	farm_viewport = SubViewport.new()
	farm_viewport.size = Vector2i(COLS * TILE, ROWS * TILE)
	farm_viewport.transparent_bg = false
	farm_viewport.own_world_3d = true
	container.add_child(farm_viewport)

	world_root = Node3D.new()
	farm_viewport.add_child(world_root)

	var env_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.55, 0.75, 0.95)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.78, 0.8, 0.85)
	environment.ambient_light_energy = 1.2
	env_node.environment = environment
	world_root.add_child(env_node)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -35, 0)
	light.light_energy = 1.0
	world_root.add_child(light)

	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = COLS * WORLD_TILE * 1.7
	var center := Vector3((COLS - 1) * WORLD_TILE * 0.5, 0, (ROWS - 1) * WORLD_TILE * 0.5)
	# The camera offset's height (the "7") has to grow with cam.size, not stay
	# fixed: for this fixed viewing angle, an orthogonal camera's bottom-row
	# rays start at world Y = offset.y - half_frustum_height * 0.85 (0.85 is
	# this angle's vertical basis component) and travel further downward from
	# there - so if that start point is already below Y=0, those rays never
	# reach the ground plane at all and the sky shows through no matter how
	# much backdrop is added. Scaling the whole offset with COLS keeps the
	# same angle while keeping the start point comfortably above the ground.
	var cam_offset := Vector3(8, 7, 8) * (COLS / 10.0) * 1.3
	cam.position = center + cam_offset
	world_root.add_child(cam)
	cam.look_at(center, Vector3.UP)
	cam.current = true

func _build_farm_grid():
	tile_nodes.clear()
	for r in range(ROWS):
		var row := []
		for c in range(COLS):
			var slot_node := Node3D.new()
			slot_node.position = Vector3(c * WORLD_TILE, 0, r * WORLD_TILE)
			world_root.add_child(slot_node)
			row.append({"node": slot_node, "ground": null, "ground_key": "", "crop": null})
		tile_nodes.append(row)

func _build_scenery():
	# "The world keeps going" backdrop: a skirt of the exact same grass tile
	# used on the real farm grid, extending well past the fence in every
	# direction, so the empty space beyond the playable plot reads as more
	# unclaimed farmland stretching toward the horizon instead of a flat
	# sky-blue void. Individual real tiles (not one scaled-up mesh) so the
	# shading matches the actual grid perfectly with no visible seam.
	# Scaled off COLS (tuned as 20 tiles at the original COLS=10) so a bigger
	# playable grid - which also zooms the camera out further, see cam.size
	# in _build_farm_view - still gets enough backdrop to hide the sky.
	var BACKDROP_MARGIN := int(COLS * 2.0)
	for tz in range(-BACKDROP_MARGIN, ROWS + BACKDROP_MARGIN):
		for tx in range(-BACKDROP_MARGIN, COLS + BACKDROP_MARGIN):
			if tx >= 0 and tx < COLS and tz >= 0 and tz < ROWS:
				continue # the real playable grid already covers this cell
			var backdrop_tile: Node3D = world_scenes["ground_grass"].instantiate()
			backdrop_tile.position = Vector3(tx * WORLD_TILE, -0.01, tz * WORLD_TILE)
			world_root.add_child(backdrop_tile)

	var deco = [
		{"key": "tree", "tx": -1, "tz": -1},
		{"key": "pine", "tx": COLS, "tz": -1},
		{"key": "tree", "tx": COLS, "tz": ROWS},
		{"key": "pine", "tx": -1, "tz": ROWS},
	]
	for d in deco:
		var s = world_scenes[d["key"]].instantiate()
		s.position = Vector3(d["tx"] * WORLD_TILE, 0, d["tz"] * WORLD_TILE)
		world_root.add_child(s)

	for c in range(-1, COLS + 1):
		var f = world_scenes["fence"].instantiate()
		f.position = Vector3(c * WORLD_TILE, 0, -1 * WORLD_TILE)
		world_root.add_child(f)
		var f2 = world_scenes["fence"].instantiate()
		f2.position = Vector3(c * WORLD_TILE, 0, ROWS * WORLD_TILE)
		f2.rotation.y = PI
		world_root.add_child(f2)
	for r in range(ROWS):
		var f3 = world_scenes["fence"].instantiate()
		f3.position = Vector3(-1 * WORLD_TILE, 0, r * WORLD_TILE)
		f3.rotation.y = -PI / 2.0
		world_root.add_child(f3)
		var f4 = world_scenes["fence"].instantiate()
		f4.position = Vector3(COLS * WORLD_TILE, 0, r * WORLD_TILE)
		f4.rotation.y = PI / 2.0
		world_root.add_child(f4)

func _build_player():
	player_node = world_scenes["player"].instantiate()
	player_node.scale = Vector3.ONE * PLAYER_SCALE
	_apply_player_skin(player_node)
	world_root.add_child(player_node)

func _apply_player_skin(node: Node) -> void:
	if node is MeshInstance3D:
		node.material_override = player_skin_material
	for child in node.get_children():
		_apply_player_skin(child)

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
	var world_x = (player_pos.x / TILE) * WORLD_TILE
	var world_z = (player_pos.y / TILE) * WORLD_TILE
	player_node.position = Vector3(world_x, PLAYER_Y_OFFSET, world_z)
	# left/right were swapped from the character model's actual facing - it
	# visibly turned to look right when moving left, and vice versa.
	var facing_yaw: float = {"down": 0.0, "up": PI, "left": -PI / 2.0, "right": PI / 2.0}[player_facing]
	player_node.rotation.y = facing_yaw

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_E: _do_action()
			KEY_M: _toggle_map()
			KEY_1: _select_tool("hoe")
			KEY_2: _select_tool("water")
			KEY_3: _select_tool("seed")
			KEY_4: _select_tool("cure")
			KEY_5: _select_tool("fertilize")

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
			var sq: float = tile.get("soil_quality", 100.0)
			if sq < SOIL_EXHAUSTED_THRESHOLD and randf() < SOIL_EXHAUSTED_FAIL_CHANCE:
				_log("The exhausted soil ruined this %s harvest - fertilize or rotate crops here." % CROPS[tile["crop"]]["name"])
				tile["type"] = "soil"
			else:
				var watered_enough = tile.get("times_watered", 0) >= CROPS[tile["crop"]]["grow_days"]
				var well_tended = watered_enough and sq >= SOIL_DEPLETED_THRESHOLD
				var amount = 2 if well_tended else 1
				var cap = _storage_cap()
				if _produce_total(tile["crop"]) + amount > cap:
					_log("Storage is full for %s (%d/%d) - sell some or upgrade your silo." % [CROPS[tile["crop"]]["name"], _produce_total(tile["crop"]), cap])
					return
				var quality = _harvest_quality(tile, sq, watered_enough)
				produce[tile["crop"]][quality] += amount
				lifetime_harvested += amount
				_log("Harvested %dx %s (%s quality)%s." % [amount, CROPS[tile["crop"]]["name"], QUALITY_LABELS[quality], " - well-tended bonus!" if well_tended else ""])
				tile["type"] = "soil"
			var same_crop = tile.get("last_crop", "") == tile["crop"]
			tile["soil_quality"] = max(0.0, sq - (SOIL_DEGRADE_SAME_CROP if same_crop else SOIL_DEGRADE_ROTATED))
			tile["last_crop"] = tile["crop"]
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
			if not CROPS[selected_crop]["seasons"].has(_season_name()) and not owned_upgrades.get("greenhouse", false):
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
			tile["damaged"] = false
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
		"fertilize":
			if tile["type"] == "grass":
				_log("Nothing to fertilize here - till it first.")
				return
			if fertilizer <= 0:
				_log("No fertilizer left! Buy more.")
				return
			fertilizer -= 1
			tile["soil_quality"] = min(100.0, tile.get("soil_quality", 100.0) + SOIL_FERTILIZE_BOOST)
			_log("Fertilized the soil (now %d%%)." % int(round(tile["soil_quality"])))
	_update_tile_visual(f.y, f.x)
	_refresh_all()

# ---------- Tile visuals ----------
func _crop_mesh_key(crop: String, stage: int) -> String:
	match crop:
		"wheat":
			return "wheat_a" if stage < 3 else "wheat_b"
		"corn":
			if stage <= 0: return "corn_a"
			elif stage == 1: return "corn_b"
			elif stage == 2: return "corn_c"
			else: return "corn_d"
		"tomato":
			if stage <= 1: return "tomato_a"
			elif stage <= 3: return "tomato_b"
			else: return "tomato_ready"
		"pumpkin":
			if stage <= 1: return "pumpkin_a"
			elif stage <= 3: return "pumpkin_b"
			else: return "pumpkin_ready"
	return "wheat_a"

func _tint_node(node: Node, color: Color) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			var mat := StandardMaterial3D.new()
			mat.albedo_color = color
			child.material_override = mat
		_tint_node(child, color)

func _update_tile_visual(r: int, c: int) -> void:
	var tile: Dictionary = tiles[r][c]
	var slot: Dictionary = tile_nodes[r][c]
	var node: Node3D = slot["node"]

	var ground_key = "ground_soil" if tile["type"] != "grass" else "ground_grass"
	if slot["ground"] == null or slot.get("ground_key", "") != ground_key:
		if slot["ground"]:
			slot["ground"].queue_free()
		var g = world_scenes[ground_key].instantiate()
		node.add_child(g)
		slot["ground"] = g
		slot["ground_key"] = ground_key

	if slot["crop"]:
		slot["crop"].queue_free()
		slot["crop"] = null

	if tile["type"] == "planted":
		var mesh_key = _crop_mesh_key(tile["crop"], tile.get("stage", 0))
		var cnode = world_scenes[mesh_key].instantiate()
		node.add_child(cnode)
		slot["crop"] = cnode
		if tile.get("infected", false):
			_tint_node(cnode, Color(0.75, 0.35, 0.3))

func _redraw_all_tiles() -> void:
	for r in range(ROWS):
		for c in range(COLS):
			_update_tile_visual(r, c)

# ---------- Day tick ----------
# Advances one plot's tile grid by a day: growth, watering/weather, wilt,
# and blight infection/spread. Runs for every plot the player owns (not
# just the one on screen) so farms left untended elsewhere keep changing.
func _advance_tiles(t_grid: Array, terrain: String, sprinklered: bool = false, warded: bool = false) -> Dictionary:
	var infected_tiles := []
	var wilted := 0
	var storm_damaged := 0
	var frost_damaged := 0
	var auto_watered := current_weather == "rainy" or current_weather == "storm" or terrain == "water" or sprinklered
	var blight_mult := 0.5 if terrain == "cliff" else 1.0
	if warded:
		blight_mult *= 0.5

	for r in range(ROWS):
		for c in range(COLS):
			var t: Dictionary = t_grid[r][c]
			if t["type"] == "grass":
				t["soil_quality"] = min(100.0, t.get("soil_quality", 100.0) + SOIL_FALLOW_REGEN)
				continue
			if t["type"] != "planted":
				continue
			if auto_watered:
				t["watered"] = true

			var crop_info = CROPS[t["crop"]]
			var dry_step := 2 if terrain == "beach" else 1
			if current_weather == "heatwave" and crop_info.get("heat_sensitive", false) and terrain != "water":
				dry_step += 1
			if crop_info.get("thirsty", false) and terrain != "water":
				dry_step += 1

			if current_weather == "frost" and terrain != "water" and not crop_info.get("frost_hardy", false):
				if randf() < 0.5:
					t["type"] = "grass"
					wilted += 1
					t["watered"] = false
					continue
				else:
					t["stage"] = max(0, t.get("stage", 0) - 1)
					t["damaged"] = true
					frost_damaged += 1

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
				t["damaged"] = true
				storm_damaged += 1

			if t.get("infected", false):
				t["infected_days"] = t.get("infected_days", 0) + 1
				infected_tiles.append(Vector2i(c, r))
				if t["infected_days"] >= 4:
					t["type"] = "grass"
			elif _act()["blight"]:
				var chance = (0.02 + infected_tiles.size() * 0.01) * blight_mult
				if crop_info.get("blight_resistant", false):
					chance *= 0.5
				if randf() < chance:
					t["infected"] = true
					t["infected_days"] = 0

	for pos in infected_tiles:
		var neighbors = [Vector2i(pos.x - 1, pos.y), Vector2i(pos.x + 1, pos.y), Vector2i(pos.x, pos.y - 1), Vector2i(pos.x, pos.y + 1)]
		for n in neighbors:
			if n.x < 0 or n.y < 0 or n.x >= COLS or n.y >= ROWS:
				continue
			var nt: Dictionary = t_grid[n.y][n.x]
			if nt["type"] == "planted" and not nt.get("infected", false):
				var spread_chance = 0.3 * blight_mult
				if CROPS[nt["crop"]].get("blight_resistant", false):
					spread_chance *= 0.5
				if randf() < spread_chance:
					nt["infected"] = true
					nt["infected_days"] = 0

	return {"wilted": wilted, "storm_damaged": storm_damaged, "frost_damaged": frost_damaged, "infected_count": infected_tiles.size()}

func _day_tick() -> void:
	day += 1
	_advance_calendar()
	var wilted := 0
	var storm_damaged := 0
	var frost_damaged := 0
	var total_infected := 0

	for plot_id in plots.keys():
		var sprinklered = plot_id == active_plot_id and owned_upgrades.get("sprinkler_system", false)
		var warded = plot_id == active_plot_id and owned_upgrades.get("scarecrow", false)
		var result := _advance_tiles(plots[plot_id], _terrain_for_plot(plot_id), sprinklered, warded)
		total_infected += result["infected_count"]
		if plot_id == active_plot_id:
			wilted = result["wilted"]
			storm_damaged = result["storm_damaged"]
			frost_damaged = result["frost_damaged"]

	if wilted > 0:
		var reason = "the drought" if current_weather == "drought" else ("the frost" if current_weather == "frost" else "neglect")
		_log("%d crop(s) wilted from %s - remember to water with the Watering Can." % [wilted, reason])
	elif storm_damaged > 0:
		_log("The storm damaged %d crop(s), setting their growth back." % storm_damaged)
	elif frost_damaged > 0:
		_log("Frost nipped %d crop(s), setting their growth back." % frost_damaged)

	for key in CROP_KEYS:
		var base = CROPS[key]["base_price"]
		var drift = (randf() - 0.5) * base * 0.3
		var np = clamp(prices[key] + drift, base * 0.4, base * 1.8)
		prices[key] = int(round(np))

	_advance_market_event()

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

	if owned_upgrades.get("regional_council", false):
		var auto_maintain_count = _auto_maintain_regions()
		if auto_maintain_count > 0:
			_log("Regional Council auto-maintained %d region(s)." % auto_maintain_count)

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

func _produce_total(key: String) -> int:
	var total := 0
	for q in QUALITY_KEYS:
		total += produce[key][q]
	return total

func _harvest_quality(tile: Dictionary, sq: float, well_tended: bool) -> String:
	if tile.get("damaged", false) or sq < SOIL_EXHAUSTED_THRESHOLD:
		return "poor"
	elif well_tended and sq >= SOIL_DEPLETED_THRESHOLD:
		return "excellent"
	else:
		return "good"

func _processing_unlocked() -> bool:
	return current_act >= 1

func _process_batches_available(key: String) -> int:
	return _produce_total(key) / PROCESSING[key]["input_amount"]

func _process_crop(key: String) -> void:
	var recipe = PROCESSING[key]
	var needed = recipe["input_amount"]
	if _produce_total(key) < needed:
		return
	var remaining = needed
	for q in QUALITY_KEYS:
		var take = min(remaining, produce[key][q])
		produce[key][q] -= take
		remaining -= take
		if remaining <= 0:
			break
	processed_goods[recipe["product"]] += 1
	_log("Processed %d %s into 1 %s." % [needed, CROPS[key]["name"], recipe["product_name"]])
	_refresh_all()

func _farm_tier_index() -> int:
	var owned_upgrade_count := 0
	for key in UPGRADE_KEYS:
		if owned_upgrades.get(key, false):
			owned_upgrade_count += 1
	var score = current_act + owned_upgrade_count
	return clampi(score, 0, FARM_TIERS.size() - 1)

func _farm_tier_name() -> String:
	return FARM_TIERS[_farm_tier_index()]

func _fully_owned_continent_count() -> int:
	var count := 0
	for continent in CONTINENTS:
		var owned_here = regions.filter(func(r): return r["continent"] == continent["name"] and r["owned"]).size()
		if owned_here >= continent["regions"].size():
			count += 1
	return count

func _upgrade_locked_reason(key: String) -> String:
	if key == "storage_silo_2" and not owned_upgrades.get("storage_silo_1", false):
		return "requires Storage Silo first"
	if key == "sprinkler_system" and current_act < 2:
		return "unlocks in Act 3"
	if key == "greenhouse" and current_act < 2:
		return "unlocks in Act 3"
	if key == "regional_council" and current_act < 2:
		return "unlocks in Act 3"
	return ""

# ---------- Market events ----------
func _effective_price(key: String) -> int:
	var bonus_mult = 1.0 + TIER_PRICE_BONUS_PER_LEVEL * _farm_tier_index()
	bonus_mult += CONTINENT_MASTERY_BONUS_PER_CONTINENT * _fully_owned_continent_count()
	var base = prices[key] * bonus_mult
	if active_event.get("crop", "") == key:
		return int(round(base * active_event["multiplier"]))
	return int(round(base))

func _advance_market_event() -> void:
	if active_event.is_empty():
		if current_act >= 1 and randf() < EVENT_CHANCE:
			var unlocked_crops = CROP_KEYS.filter(func(k): return _crop_unlocked(k))
			if unlocked_crops.size() > 0:
				var key = unlocked_crops[randi() % unlocked_crops.size()]
				var mult = EVENT_MIN_MULT + randf() * (EVENT_MAX_MULT - EVENT_MIN_MULT)
				var days = EVENT_MIN_DAYS + (randi() % (EVENT_MAX_DAYS - EVENT_MIN_DAYS + 1))
				active_event = {"crop": key, "multiplier": mult, "days_left": days}
				_log("Demand spike! %s is selling for %.1fx price for the next %d day(s)." % [CROPS[key]["name"], mult, days])
	else:
		active_event["days_left"] -= 1
		if active_event["days_left"] <= 0:
			_log("The demand spike for %s has ended." % CROPS[active_event["crop"]]["name"])
			active_event = {}

func _maintenance_cost(reg: Dictionary) -> int:
	return max(5, int(round(_region_price(reg) * 0.15)))

func _auto_maintain_regions() -> int:
	# Owning dozens (or all 198) of the world's regions makes clicking
	# "Maintain" on each one by hand every day untenable, and affording all
	# of them at once often isn't possible either. This upgrade pays for as
	# many as the player can currently afford, cheapest first, so the money
	# available covers the most regions rather than being wasted maintaining
	# expensive ones while cheap ones are left to decay.
	var candidates = regions.filter(func(r): return r["owned"] and not r.get("maintained_today", false))
	candidates.sort_custom(func(a, b): return _maintenance_cost(a) < _maintenance_cost(b))
	var maintained_count := 0
	for reg in candidates:
		var cost = _maintenance_cost(reg)
		if cash < cost:
			break # sorted ascending - nothing pricier is affordable either
		cash -= cost
		reg["maintained_today"] = true
		maintained_count += 1
	return maintained_count

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
	var season = _season_name()
	var weights := {}
	for key in WEATHER_WEIGHTS:
		if key == "frost" and not (season == "Fall" or season == "Winter"):
			continue
		if key == "heatwave" and not (season == "Spring" or season == "Summer"):
			continue
		weights[key] = WEATHER_WEIGHTS[key]
	var total := 0
	for key in weights:
		total += weights[key]
	var roll := randi() % total
	var acc := 0
	for key in weights:
		acc += weights[key]
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
			var first_continent = CONTINENTS[0]["name"]
			var first_owned = regions.filter(func(r): return r["continent"] == first_continent and r["owned"]).size()
			if first_owned >= CONTINENTS[0]["regions"].size():
				advanced = true
		2:
			if _owned_count() >= int(regions.size() / 2.0):
				advanced = true
	if advanced:
		current_act += 1
		if selected_tool != "" and not _tool_unlocked(selected_tool):
			selected_tool = _act()["tools"][0]
		if not _crop_unlocked(selected_crop):
			selected_crop = _act()["crops"][0]
		_show_act_transition(current_act)
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

func _add_opaque_backdrop(parent: Control) -> void:
	# Plain Panel controls use the theme's default translucent style, which
	# lets whatever is underneath (the 3D farm view, HUD buttons) show
	# through - fine for small overlays, but confusing for a full-screen
	# intro/dialogue screen that should read as its own separate scene.
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.08, 0.13, 0.09)
	backdrop.size = parent.size
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(backdrop)
	parent.move_child(backdrop, 0)

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

	_build_farm_view(layer)

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

	var action_y = tool_row_y + 76
	_add_button(layer, "Use Tool", Vector2(FARM_ORIGIN.x, action_y), Vector2(210, 72), func(): _do_action())
	_add_button(layer, "Inventory", Vector2(FARM_ORIGIN.x + 222, action_y), Vector2(210, 72), _open_inventory)
	map_button = _add_button(layer, "World Map", Vector2(FARM_ORIGIN.x + 444, action_y), Vector2(230, 72), func(): _toggle_map())

	# On-screen D-pad - sized generously for real touchscreens, using the
	# extra vertical space the 19.5:9-ish canvas leaves below the farm UI.
	var dpad_button := 96
	var dpad_step := dpad_button + 10
	var dpad_y = action_y + 120
	var dpad_x = FARM_ORIGIN.x + 60
	_add_touch_button(layer, "^", Vector2(dpad_x + dpad_step, dpad_y), Vector2(dpad_button, dpad_button), func(p): move_up_held = p)
	_add_touch_button(layer, "v", Vector2(dpad_x + dpad_step, dpad_y + dpad_step * 2), Vector2(dpad_button, dpad_button), func(p): move_down_held = p)
	_add_touch_button(layer, "<", Vector2(dpad_x, dpad_y + dpad_step), Vector2(dpad_button, dpad_button), func(p): move_left_held = p)
	_add_touch_button(layer, ">", Vector2(dpad_x + dpad_step * 2, dpad_y + dpad_step), Vector2(dpad_button, dpad_button), func(p): move_right_held = p)

	_build_inventory_panel(layer)
	_build_map_panel(layer)
	_build_act_banner(layer)
	_build_update_banner(layer)
	_build_intro_ui(layer)

func _build_intro_ui(layer: CanvasLayer) -> void:
	# Screen 1, first launch only: name the Home Farm before anything else happens.
	intro_name_panel = Panel.new()
	intro_name_panel.position = Vector2.ZERO
	intro_name_panel.size = Vector2(720, 1560)
	intro_name_panel.visible = false
	layer.add_child(intro_name_panel)
	_add_opaque_backdrop(intro_name_panel)

	var title_label := _add_label(intro_name_panel, "Farm World", Vector2(0, 420), Vector2(720, 50), 34, Color(1, 0.85, 0.3))
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var subtitle_label := _add_label(intro_name_panel, "Outbreak & Empire", Vector2(0, 472), Vector2(720, 30), 18, Color(0.75, 0.85, 0.95))
	subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var prompt_label := _add_label(intro_name_panel, "What will you name your farm?", Vector2(60, 640), Vector2(600, 30), 20)
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	farm_name_edit = LineEdit.new()
	farm_name_edit.position = Vector2(110, 690)
	farm_name_edit.size = Vector2(500, 60)
	farm_name_edit.placeholder_text = "e.g. Sunny Acres"
	farm_name_edit.max_length = 24
	farm_name_edit.add_theme_font_size_override("font_size", 22)
	farm_name_edit.text_submitted.connect(func(_t): _on_farm_name_confirmed())
	intro_name_panel.add_child(farm_name_edit)

	_add_button(intro_name_panel, "Start Farming", Vector2(210, 780), Vector2(300, 64), _on_farm_name_confirmed)

	# Screen 2, right after naming: Kacie's onboarding dialogue - the game's
	# goal, how Act 1 works and what it takes to clear it, hazards to watch
	# for, and how clearing Acts opens up more of the world map.
	intro_dialog_panel = Panel.new()
	intro_dialog_panel.position = Vector2.ZERO
	intro_dialog_panel.size = Vector2(720, 1560)
	intro_dialog_panel.visible = false
	layer.add_child(intro_dialog_panel)
	_add_opaque_backdrop(intro_dialog_panel)

	var portrait_rect := TextureRect.new()
	portrait_rect.texture = load("res://assets_3d/textures/kacie_portrait.png")
	portrait_rect.position = Vector2(240, 250)
	portrait_rect.size = Vector2(240, 304)
	portrait_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait_rect.custom_minimum_size = Vector2(240, 304)
	intro_dialog_panel.add_child(portrait_rect)
	# Controls clamp to their computed minimum size the instant they enter the
	# tree, and a TextureRect's minimum size tracks its texture regardless of
	# expand_mode - so the requested size only sticks if it's (re)applied
	# after add_child, once that one-time clamp has already happened.
	portrait_rect.size = Vector2(240, 304)
	var speaker_label := _add_label(intro_dialog_panel, "Kacie", Vector2(0, 566), Vector2(720, 36), 26, Color(1, 0.85, 0.3))
	speaker_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	var body_panel := Panel.new()
	body_panel.position = Vector2(40, 620)
	body_panel.size = Vector2(640, 300)
	intro_dialog_panel.add_child(body_panel)
	intro_dialog_body = _add_label(body_panel, "", Vector2(20, 20), Vector2(600, 260), 18)
	intro_dialog_body.autowrap_mode = TextServer.AUTOWRAP_WORD

	intro_dialog_next_btn = _add_button(intro_dialog_panel, "Next", Vector2(440, 950), Vector2(240, 64), _advance_intro_dialog)

	# Screen 3 (also the very first screen after Act 1's naming/dialogue):
	# a plain chapter-card announcing whichever Act is about to start, shown
	# before Kacie's dialogue for that Act - reused for every 1->2->3->4
	# transition, not just the very first one.
	act_title_panel = Panel.new()
	act_title_panel.position = Vector2.ZERO
	act_title_panel.size = Vector2(720, 1560)
	act_title_panel.visible = false
	layer.add_child(act_title_panel)
	_add_opaque_backdrop(act_title_panel)

	act_title_label = _add_label(act_title_panel, "", Vector2(0, 660), Vector2(720, 50), 36, Color(1, 0.85, 0.3))
	act_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	act_title_goal_label = _add_label(act_title_panel, "", Vector2(60, 730), Vector2(600, 120), 18)
	act_title_goal_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	act_title_goal_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	_add_button(act_title_panel, "Continue", Vector2(240, 880), Vector2(240, 64), _on_act_title_continue)

func _kacie_dialogue_for_act(idx: int) -> Array:
	var act = ACTS[idx]
	if idx == 0:
		var shown_name = farm_name if farm_name != "" else "Home Farm"
		return [
			"Hi there! I'm Kacie - I run the co-op down the road, and I'll be showing you the ropes.",
			"Here's the big picture: your goal is to become the biggest farm in the world. Every region on the map, from tiny islands to whole continents, can eventually be yours.",
			"Right now you're just getting started on %s. Till soil with the Hoe, plant seeds with the Seed Bag, keep the crop watered with the Watering Can, then harvest it by hand and sell it for cash." % shown_name,
			"Act 1 - First Harvest: reach $150 in cash to prove you can run a farm. Clearing it unlocks the World Map, where you can start claiming real regions around the globe.",
			"Watch out, though: once the Outbreak begins, blight can infect your crops; bad weather like drought and frost can ruin a harvest; and regions you own need upkeep, or you'll lose them.",
			"Clearing each Act's goal unlocks bigger tools, new crops, and more of the map to conquer - check the banner at the top any time to see what's next and what it takes to get there.",
			"That's the whole pitch! Grab your Hoe and get started - I'll be cheering you on.",
		]
	match idx:
		1:
			return [
				"Uh oh - a blight's broken out. Keep watch on your crops, and hit anything infected with the Cure Spray right away before it spreads to its neighbors.",
				"Good news, though: the World Map just opened up. Africa's ready to claim - buy up its regions from the map screen to expand past this one plot.",
				"%s: %s" % [act["title"], act["goal_text"]],
			]
		2:
			return [
				"You're really building something now. Tomatoes just came into season - they sell for a lot more than wheat or corn, so work them into your rotation.",
				"Every continent on Earth is open to you at this point. Spread out, but don't forget: every region you own needs upkeep, or you'll lose it right back.",
				"%s: %s" % [act["title"], act["goal_text"]],
			]
		3:
			return [
				"This is the big one. Every continent is in play, and pumpkins are your best cash crop yet - a premium pick for a farm at your level.",
				"Finish what you started. Every region left unowned is one more step toward the biggest farm in the world.",
				"%s: %s" % [act["title"], act["goal_text"]],
			]
		_:
			return [act["intro"], act["goal_text"]]

func _show_act_transition(idx: int) -> void:
	pending_act_transition_idx = idx
	var act = ACTS[idx]
	act_title_label.text = act["title"]
	act_title_goal_label.text = "%s\n\nGoal: %s" % [act["intro"], act["goal_text"]]
	act_title_panel.visible = true

func _on_act_title_continue() -> void:
	act_title_panel.visible = false
	active_dialogue_pages = _kacie_dialogue_for_act(pending_act_transition_idx)
	intro_dialog_index = 0
	_show_intro_dialog_page()
	intro_dialog_panel.visible = true

func _on_farm_name_confirmed() -> void:
	var typed := farm_name_edit.text.strip_edges()
	farm_name = typed if typed != "" else "Sunny Acres"
	intro_name_panel.visible = false
	_refresh_all()
	_show_act_transition(0)

func _show_intro_dialog_page() -> void:
	intro_dialog_body.text = active_dialogue_pages[intro_dialog_index]
	intro_dialog_next_btn.text = "Let's Go!" if intro_dialog_index == active_dialogue_pages.size() - 1 else "Next"

func _advance_intro_dialog() -> void:
	intro_dialog_index += 1
	if intro_dialog_index >= active_dialogue_pages.size():
		intro_dialog_panel.visible = false
		return
	_show_intro_dialog_page()

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

func _build_update_banner(layer: CanvasLayer) -> void:
	update_banner = Panel.new()
	update_banner.position = Vector2(40, 1190)
	update_banner.size = Vector2(640, 130)
	update_banner.visible = false
	layer.add_child(update_banner)

	update_banner_label = _add_label(update_banner, "A new version is available!", Vector2(16, 12), Vector2(608, 50), 18, Color(1, 0.9, 0.4))
	update_banner_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	_add_button(update_banner, "Download & Install", Vector2(16, 66), Vector2(280, 48), func(): OS.shell_open(update_download_url))
	_add_button(update_banner, "Later", Vector2(310, 66), Vector2(120, 48), func(): update_banner.visible = false)

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
	inventory_panel.size = Vector2(680, 1480)
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

	_add_label(inventory_panel, "Processing", Vector2(20, 630), Vector2(400, 30), 24)
	processing_rows_container = VBoxContainer.new()
	processing_rows_container.position = Vector2(20, 670)
	processing_rows_container.size = Vector2(640, 140)
	inventory_panel.add_child(processing_rows_container)

	_add_label(inventory_panel, "Upgrades", Vector2(20, 820), Vector2(400, 30), 24)
	# Scrollable so the growing upgrade list (already past the point of
	# fitting statically) can never again push Soil Care/Save/Reset out of
	# position - same pattern as the World Map's region list.
	var upgrades_scroll := ScrollContainer.new()
	upgrades_scroll.position = Vector2(20, 860)
	upgrades_scroll.size = Vector2(640, 300)
	inventory_panel.add_child(upgrades_scroll)
	upgrade_rows_container = VBoxContainer.new()
	upgrade_rows_container.custom_minimum_size = Vector2(620, 0)
	upgrades_scroll.add_child(upgrade_rows_container)

	_add_label(inventory_panel, "Soil Care", Vector2(20, 1175), Vector2(400, 30), 24)
	soil_label = _add_label(inventory_panel, "", Vector2(20, 1213), Vector2(640, 26), 16, Color(0.8, 0.7, 0.5))
	var fert_row := HBoxContainer.new()
	fert_row.position = Vector2(20, 1245)
	inventory_panel.add_child(fert_row)
	fertilizer_label = Label.new()
	fertilizer_label.custom_minimum_size = Vector2(340, 0)
	fert_row.add_child(fertilizer_label)
	var fert_buy_btn := Button.new()
	fert_buy_btn.text = "Buy $%d" % FERTILIZER_COST
	fert_buy_btn.pressed.connect(func():
		if cash >= FERTILIZER_COST:
			cash -= FERTILIZER_COST
			fertilizer += 1
			_refresh_all()
		else:
			_log("Need $%d for fertilizer." % FERTILIZER_COST)
	)
	fert_row.add_child(fert_buy_btn)

	_add_button(inventory_panel, "Save Game", Vector2(20, 1310), Vector2(300, 56), _on_save_button_pressed)
	_add_button(inventory_panel, "Reset Game", Vector2(340, 1310), Vector2(300, 56), func(): _reset_game())
	lifetime_stats_label = _add_label(inventory_panel, "", Vector2(20, 1390), Vector2(640, 26), 15, Color(0.65, 0.65, 0.7))

func _build_map_panel(layer: CanvasLayer) -> void:
	map_panel = Panel.new()
	map_panel.position = Vector2(20, 40)
	map_panel.size = Vector2(680, 1480)
	map_panel.visible = false
	layer.add_child(map_panel)

	_add_button(map_panel, "Close", Vector2(600, 10), Vector2(60, 40), func(): map_panel.visible = false)
	_add_label(map_panel, "World Map - Farm Empire Expansion", Vector2(20, 10), Vector2(560, 30), 20)
	map_summary_label = _add_label(map_panel, "", Vector2(20, 46), Vector2(640, 30), 16, Color(0.7, 0.8, 0.7))

	# Jump buttons - with up to 198 countries in the scrollable list below,
	# scrolling past 54 African entries just to reach Oceania is real
	# tedium. Each button scrolls straight to that continent's heading.
	var jump_scroll := ScrollContainer.new()
	jump_scroll.position = Vector2(20, 78)
	jump_scroll.size = Vector2(640, 44)
	jump_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	map_panel.add_child(jump_scroll)
	var jump_row := HBoxContainer.new()
	jump_row.add_theme_constant_override("separation", 6)
	jump_scroll.add_child(jump_row)
	for continent in CONTINENTS:
		var cname = continent["name"]
		var jump_btn := Button.new()
		jump_btn.text = cname
		jump_btn.pressed.connect(func():
			if map_continent_headings.has(cname) and is_instance_valid(map_continent_headings[cname]):
				map_scroll.ensure_control_visible(map_continent_headings[cname])
		)
		jump_row.add_child(jump_btn)

	map_scroll = ScrollContainer.new()
	map_scroll.position = Vector2(20, 130)
	map_scroll.size = Vector2(640, 1334)
	map_panel.add_child(map_scroll)

	map_scroll_content = VBoxContainer.new()
	map_scroll_content.custom_minimum_size = Vector2(620, 0)
	map_scroll.add_child(map_scroll_content)

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
	var event_suffix = ""
	if not active_event.is_empty():
		event_suffix = "  |  🔥 %s demand spike x%.1f (%dd left)" % [
			CROPS[active_event["crop"]]["name"], active_event["multiplier"], active_event["days_left"],
		]
	hud_season.text = "%s (day %d/%d) - %s %s  |  Tomorrow: %s %s%s" % [
		_season_name(), season_day + 1, SEASON_LENGTH,
		WEATHER[current_weather]["emoji"], WEATHER[current_weather]["name"],
		WEATHER[forecast_weather]["emoji"], WEATHER[forecast_weather]["name"],
		event_suffix,
	]
	var terrain = _terrain_for_plot(active_plot_id)
	var tier_idx = _farm_tier_index()
	var tier_bonus_tag = ("  (+%d%% sell price)" % int(round(TIER_PRICE_BONUS_PER_LEVEL * tier_idx * 100))) if tier_idx > 0 else ""
	hud_farm.text = "Farming: %s%s  |  Tier: %s%s" % [_plot_display_name(active_plot_id), "" if active_plot_id == "home" else " (%s)" % terrain, _farm_tier_name(), tier_bonus_tag]
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
		btn.custom_minimum_size = Vector2(170, 64)
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
		var trait_parts := []
		if crop.get("frost_hardy", false):
			trait_parts.append("🥶 frost-hardy")
		if crop.get("heat_sensitive", false):
			trait_parts.append("🌡 heat-sensitive")
		if crop.get("thirsty", false):
			trait_parts.append("💧 thirsty")
		if crop.get("blight_resistant", false):
			trait_parts.append("🛡 blight-resistant")
		var trait_tag = ("  " + " ".join(trait_parts)) if trait_parts.size() > 0 else ""
		var season_tag = ""
		if not crop["seasons"].has(_season_name()):
			season_tag = "  🏚 greenhouse only" if owned_upgrades.get("greenhouse", false) else "  ⛔ out of season"
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s (seeds: %d)%s%s%s" % [crop["name"], seeds[key], trait_tag, season_tag, "  [selected]" if key == selected_crop else ""]
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
		var row := VBoxContainer.new()
		var top_row := HBoxContainer.new()
		var label := Label.new()
		var eff_price = _effective_price(key)
		var spike_tag = ("  🔥 x%.1f (%dd)" % [active_event["multiplier"], active_event["days_left"]]) if active_event.get("crop", "") == key else ""
		var total = _produce_total(key)
		label.text = "%s  seeds:%d  produce:%d/%d  $%d base%s" % [crop["name"], seeds[key], total, storage_cap, eff_price, spike_tag]
		label.custom_minimum_size = Vector2(420, 0)
		top_row.add_child(label)
		var sell_btn := Button.new()
		sell_btn.text = "Sell all"
		sell_btn.disabled = total == 0
		sell_btn.pressed.connect(func():
			var amount = 0
			var earnings = 0
			for q in QUALITY_KEYS:
				var n = produce[key][q]
				if n == 0:
					continue
				var price = int(round(_effective_price(key) * QUALITY_MULTIPLIER[q]))
				amount += n
				earnings += n * price
				produce[key][q] = 0
			cash += earnings
			lifetime_earned += earnings
			_log("Sold %d %s for $%d." % [amount, crop["name"], earnings])
			_check_act_progress()
			_refresh_all()
		)
		top_row.add_child(sell_btn)
		row.add_child(top_row)
		var quality_parts := []
		for q in QUALITY_KEYS:
			if produce[key][q] > 0:
				var price = int(round(_effective_price(key) * QUALITY_MULTIPLIER[q]))
				quality_parts.append("%s x%d ($%d ea)" % [QUALITY_LABELS[q], produce[key][q], price])
		if quality_parts.size() > 0:
			var breakdown := Label.new()
			breakdown.text = "  " + ", ".join(quality_parts)
			breakdown.add_theme_font_size_override("font_size", 14)
			breakdown.add_theme_color_override("font_color", Color(0.7, 0.75, 0.7))
			row.add_child(breakdown)
		market_rows_container.add_child(row)

	for child in processing_rows_container.get_children():
		child.queue_free()
	if not _processing_unlocked():
		var locked_label := Label.new()
		locked_label.text = "Processing unlocks in Act 2."
		locked_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
		processing_rows_container.add_child(locked_label)
	else:
		for key in CROP_KEYS:
			if not _crop_unlocked(key):
				continue
			var recipe = PROCESSING[key]
			var batches = _process_batches_available(key)
			var row := HBoxContainer.new()
			var label := Label.new()
			label.text = "%d %s -> 1 %s (sells $%d)" % [recipe["input_amount"], CROPS[key]["name"], recipe["product_name"], recipe["price"]]
			label.custom_minimum_size = Vector2(420, 0)
			row.add_child(label)
			var process_btn := Button.new()
			process_btn.text = "Process"
			process_btn.disabled = batches <= 0
			process_btn.pressed.connect(func(): _process_crop(key))
			row.add_child(process_btn)
			processing_rows_container.add_child(row)
		for product in PROCESSED_KEYS:
			var amount = processed_goods[product]
			if amount <= 0:
				continue
			var price = 0
			for key in CROP_KEYS:
				if PROCESSING[key]["product"] == product:
					price = PROCESSING[key]["price"]
					break
			var row2 := HBoxContainer.new()
			var label2 := Label.new()
			label2.text = "In storage: %s x%d ($%d ea)" % [product.capitalize(), amount, price]
			label2.custom_minimum_size = Vector2(420, 0)
			row2.add_child(label2)
			var sell_btn2 := Button.new()
			sell_btn2.text = "Sell all"
			sell_btn2.pressed.connect(func():
				var earnings = amount * price
				cash += earnings
				lifetime_earned += earnings
				processed_goods[product] = 0
				_log("Sold %d %s for $%d." % [amount, product.capitalize(), earnings])
				_refresh_all()
			)
			row2.add_child(sell_btn2)
			processing_rows_container.add_child(row2)

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

	if current_act < 1:
		soil_label.text = "Soil care unlocks in Act 2."
		fertilizer_label.text = ""
	else:
		soil_label.text = "Avg soil quality on this plot: %d%% (%s)" % [int(round(_avg_soil_quality())), _soil_quality_label(_avg_soil_quality())]
		fertilizer_label.text = "Fertilizer: %d in stock (+%d%% quality per use)" % [fertilizer, int(SOIL_FERTILIZE_BOOST)]
	lifetime_stats_label.text = "Lifetime: %d crops harvested, $%d earned from farming" % [lifetime_harvested, lifetime_earned]

func _avg_soil_quality() -> float:
	var total := 0.0
	for r in range(ROWS):
		for c in range(COLS):
			total += tiles[r][c].get("soil_quality", 100.0)
	return total / (ROWS * COLS)

func _soil_quality_label(sq: float) -> String:
	if sq >= SOIL_DEPLETED_THRESHOLD:
		return "Fertile"
	elif sq >= SOIL_EXHAUSTED_THRESHOLD:
		return "Depleted"
	else:
		return "Exhausted"

func _refresh_map_panel() -> void:
	var owned_count = regions.filter(func(r): return r["owned"]).size()
	var mastered = _fully_owned_continent_count()
	var mastery_tag = ""
	if mastered > 0:
		mastery_tag = "  |  %d continent(s) fully owned: +%d%% sell price" % [mastered, int(round(mastered * CONTINENT_MASTERY_BONUS_PER_CONTINENT * 100))]
	map_summary_label.text = "%d / %d regions under your control across %d continents.%s" % [owned_count, regions.size(), CONTINENTS.size(), mastery_tag]

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
		var heading = "%s (%d/%d)%s" % [continent["name"], owned_here, continent["regions"].size(), "  👑 mastered" if owned_here >= continent["regions"].size() else ""]
		if locked:
			heading = "🔒 %s - unlock in a later Act" % continent["name"]
		var heading_label = _add_label_child(map_scroll_content, heading, 20, Color(0.6, 0.6, 0.6) if locked else Color(1, 0.85, 0.3))
		map_continent_headings[continent["name"]] = heading_label
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

func _add_label_child(parent: Node, text: String, font_size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	parent.add_child(l)
	return l

# ---------- In-app update check ----------
func _load_build_commit() -> void:
	if not FileAccess.file_exists("res://build_version.json"):
		return
	var f := FileAccess.open("res://build_version.json", FileAccess.READ)
	if not f:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) == TYPE_DICTIONARY:
		current_build_commit = parsed.get("commit", "")

func _check_for_update() -> void:
	if OS.get_name() != "Android" or current_build_commit == "":
		return
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result, response_code, headers, body):
		_on_update_check_completed(result, response_code, headers, body)
		http.queue_free()
	)
	var err := http.request(UPDATE_CHECK_URL, ["User-Agent: FarmWorldApp"])
	if err != OK:
		http.queue_free()

func _on_update_check_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var release_body: String = parsed.get("body", "")
	var marker := "build_commit: "
	var idx := release_body.find(marker)
	if idx == -1:
		return
	var remote_commit := release_body.substr(idx + marker.length()).strip_edges().split("\n")[0]
	if remote_commit == "" or remote_commit == current_build_commit:
		return
	for asset in parsed.get("assets", []):
		var asset_name: String = asset.get("name", "")
		if asset_name.ends_with(".apk"):
			update_download_url = asset.get("browser_download_url", "")
			break
	if update_download_url != "":
		update_banner.visible = true

# ---------- Save / Load ----------
func _save_game() -> void:
	var data := {
		"cash": cash, "day": day, "seeds": seeds, "fertilizer": fertilizer, "produce": produce,
		"processed_goods": processed_goods, "prices": prices,
		"selected_crop": selected_crop, "selected_tool": selected_tool,
		"current_act": current_act, "victory_shown": victory_shown,
		"lifetime_harvested": lifetime_harvested, "lifetime_earned": lifetime_earned,
		"season_idx": season_idx, "season_day": season_day,
		"current_weather": current_weather, "forecast_weather": forecast_weather,
		"plots": plots, "active_plot_id": active_plot_id, "regions": regions,
		"owned_upgrades": owned_upgrades, "active_event": active_event,
		"player_x": player_pos.x, "player_y": player_pos.y,
		"farm_name": farm_name,
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
	for key in CROP_KEYS:
		if not seeds.has(key):
			seeds[key] = 0
	fertilizer = parsed.get("fertilizer", fertilizer)
	var loaded_produce = parsed.get("produce", null)
	if typeof(loaded_produce) == TYPE_DICTIONARY:
		for key in CROP_KEYS:
			if not loaded_produce.has(key):
				continue
			var entry = loaded_produce[key]
			if typeof(entry) == TYPE_DICTIONARY:
				produce[key] = entry
			else:
				# Pre-quality-grade save: a flat int count. Treat it as "good".
				produce[key] = {"poor": 0, "good": int(entry), "excellent": 0}
	var loaded_processed = parsed.get("processed_goods", null)
	if typeof(loaded_processed) == TYPE_DICTIONARY:
		for key in PROCESSED_KEYS:
			if loaded_processed.has(key):
				processed_goods[key] = int(loaded_processed[key])
	prices = parsed.get("prices", prices)
	for key in CROP_KEYS:
		if not prices.has(key):
			prices[key] = CROPS[key]["base_price"]
	selected_crop = parsed.get("selected_crop", selected_crop)
	selected_tool = parsed.get("selected_tool", selected_tool)
	current_act = clampi(int(parsed.get("current_act", current_act)), 0, ACTS.size() - 1)
	farm_name = parsed.get("farm_name", farm_name)
	victory_shown = parsed.get("victory_shown", victory_shown)
	lifetime_harvested = int(parsed.get("lifetime_harvested", lifetime_harvested))
	lifetime_earned = int(parsed.get("lifetime_earned", lifetime_earned))
	season_idx = clampi(int(parsed.get("season_idx", season_idx)), 0, SEASONS.size() - 1)
	season_day = clampi(int(parsed.get("season_day", season_day)), 0, SEASON_LENGTH - 1)
	current_weather = parsed.get("current_weather", current_weather)
	if not WEATHER.has(current_weather):
		current_weather = "sunny"
	forecast_weather = parsed.get("forecast_weather", forecast_weather)
	if not WEATHER.has(forecast_weather):
		forecast_weather = "sunny"
	owned_upgrades = parsed.get("owned_upgrades", owned_upgrades)
	active_event = parsed.get("active_event", active_event)
	if not (active_event.is_empty() or (active_event.has("crop") and CROPS.has(active_event["crop"]))):
		active_event = {}
	if parsed.has("regions"):
		var loaded_regions = parsed["regions"]
		# `regions` here still holds the freshly initialized real-world roster
		# built by _init_fresh_state() before this function ran. A save from
		# before the real-world map overhaul (or any future roster change)
		# would carry a different set of names/counts entirely - trusting it
		# wholesale would silently resurrect fictional countries that no
		# longer exist anywhere in CONTINENTS. Only accept the loaded list
		# when it actually matches the current roster; otherwise keep the
		# fresh one and let region ownership reset cleanly.
		var valid_names := {}
		for r in regions:
			valid_names[r["name"]] = true
		var regions_valid = loaded_regions.size() == regions.size()
		if regions_valid:
			for r in loaded_regions:
				if not valid_names.has(r.get("name", "")):
					regions_valid = false
					break
		if regions_valid:
			regions = loaded_regions

	if parsed.has("plots"):
		plots = parsed["plots"]
	elif parsed.has("tiles"):
		# Pre-multi-plot save: the single grid it had becomes the home plot.
		plots = {"home": parsed["tiles"]}
	# A save from before a ROWS/COLS change carries grids sized to the old
	# dimensions - indexing those with the current ROWS/COLS would run past
	# their bounds. Replace any mismatched grid with a fresh one rather than
	# trying to splice old tile data into a different-sized grid.
	for plot_key in plots.keys():
		var grid = plots[plot_key]
		var grid_ok = typeof(grid) == TYPE_ARRAY and grid.size() == ROWS and (ROWS == 0 or (typeof(grid[0]) == TYPE_ARRAY and grid[0].size() == COLS))
		if not grid_ok:
			plots[plot_key] = _make_empty_grid()
	if not plots.has("home"):
		plots["home"] = _make_empty_grid()
	for reg in regions:
		if reg.get("owned", false) and not plots.has(reg["name"]):
			plots[reg["name"]] = _make_empty_grid()

	active_plot_id = parsed.get("active_plot_id", "home")
	if active_plot_id != "home" and not regions.any(func(r): return r["name"] == active_plot_id):
		active_plot_id = "home"
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
	seeds = {"wheat": 6, "corn": 2, "tomato": 0, "pumpkin": 0}
	fertilizer = 3
	produce = {
		"wheat": {"poor": 0, "good": 0, "excellent": 0},
		"corn": {"poor": 0, "good": 0, "excellent": 0},
		"tomato": {"poor": 0, "good": 0, "excellent": 0},
		"pumpkin": {"poor": 0, "good": 0, "excellent": 0},
	}
	processed_goods = {"flour": 0, "cornmeal": 0, "sauce": 0, "pumpkin_pie": 0}
	prices = {"wheat": 10, "corn": 22, "tomato": 45, "pumpkin": 70}
	selected_crop = "wheat"
	selected_tool = "hoe"
	current_act = 0
	victory_shown = false
	lifetime_harvested = 0
	lifetime_earned = 0
	player_pos = Vector2(TILE * 2, TILE * 2)
	farm_name = ""
	tiles.clear()
	regions.clear()
	_init_fresh_state()
	_redraw_all_tiles()
	_refresh_all()
	inventory_panel.visible = false
	map_panel.visible = false
	_log("Game reset.")
	# Route back through the same naming screen + Kacie intro a truly new
	# game gets, rather than the old plain Act 1 banner - a manual reset
	# should feel like starting over, not resume with a name that no longer
	# applies to the just-cleared farm.
	farm_name_edit.text = ""
	intro_name_panel.visible = true

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_PAUSED:
		_save_game()
