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

# ---------- HUD v2 (glass HUD over a full-bleed 3D viewport) ----------
# Design spec was authored at 392x860 dp (a reference Android portrait
# screen); this game's actual canvas is 720x1560 - UI_SCALE converts the
# spec's dp measurements to this canvas's pixels 1:1 in true physical size
# (720/392 and 1560/860 are both ~1.82-1.84, close enough to treat as one
# scale factor). _dp() below is the intended way to use it.
const UI_SCALE := 1.82
const COL_CREAM := Color(0.949, 0.929, 0.890)      # #F2EDE3 - primary HUD text/glyphs
const COL_GLASS_BG := Color(0.0549, 0.0784, 0.0667) # base RGB for every glass chip/card (alpha varies per element)
const COL_AMBER := Color(0.949, 0.761, 0.302)       # ~oklch(0.85 0.14 85) - selection/action/focus
const COL_AMBER_DEEP := Color(0.816, 0.514, 0.204)  # ~oklch(0.72 0.16 62) - action gradient's dark end
const COL_SEASON_FALL := Color(0.890, 0.604, 0.361) # ~oklch(0.8 0.13 55) - season text, toast dot
const COL_BERRY := Color(0.831, 0.451, 0.659)       # ~oklch(0.75 0.13 350) - act label
const COL_LEAF := Color(0.475, 0.831, 0.541)        # ~oklch(0.84 0.14 145) - seeds glyph
const COL_WATER := Color(0.561, 0.776, 0.910)       # ~oklch(0.85 0.09 220) - water glyph, frost
const COL_ALERT := Color(0.910, 0.384, 0.235)       # ~oklch(0.72 0.17 28) - badges

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
const WALK_CYCLE_SPEED := 9.0 # radians/sec the leg/arm swing phase advances at while moving
const WALK_LEG_SWING := 0.55 # radians, peak hip rotation
const WALK_ARM_SWING := 0.4 # radians, peak shoulder rotation
const WALK_BLEND_SPEED := 4.0 # how fast walk_amount eases toward 0/1 on start/stop, in 1/sec

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

# ---------- Livestock (feed -> produce -> sell, the drought->feed->meat chain) ----------
# Feed is bought with cash rather than a dedicated wheat/corn recipe (those
# crops already have their own flour/cornmeal processing recipe, and this
# keeps "buy feed" a single action instead of a second competing use for
# the same harvest) - its price is derived from live wheat/corn prices in
# _feed_price_per_unit(), so a grain shortage still raises feed cost exactly
# like the real crop would have.
const LIVESTOCK := {
	"chicken": {"name": "Chicken", "cost": 30, "feed_per_day": 1, "product": "eggs", "product_name": "Eggs", "base_price": 8},
	"sheep": {"name": "Sheep", "cost": 70, "feed_per_day": 2, "product": "wool", "product_name": "Wool", "base_price": 20},
	"cow": {"name": "Cow", "cost": 150, "feed_per_day": 4, "product": "milk", "product_name": "Milk", "base_price": 18},
	"pig": {"name": "Pig", "cost": 90, "feed_per_day": 3, "product": "pork", "product_name": "Pork", "base_price": 35},
}
const LIVESTOCK_KEYS := ["chicken", "sheep", "cow", "pig"]
const LIVESTOCK_PRODUCT_KEYS := ["eggs", "wool", "milk", "pork"]
const FEED_BATCH_SIZE := 10
const FEED_COST_FACTOR := 0.5 # feed $/unit = avg(wheat, corn effective price) * this

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

# ---------- Dynamic economy ----------
# Replaces the old pure-random daily price drift with real causes:
#   WEATHER -> world_supply_index (a per-crop scarcity/surplus aggregate,
#     nudged by the same weather rules _advance_tiles already applies to
#     the player's own tiles) -> prices[key] eases toward base/index, so a
#     drought that hurts a thirsty crop's growth also raises its price
#     market-wide, not just on the player's own farm.
#   PLAYER SUPPLY -> oversupply_pressure (rises when the player sells,
#     decays daily) -> a price penalty, so flooding the market with one
#     crop actually softens its own price for a while.
#   REGIONAL DEMAND -> owned region count feeds the same sell-price bonus
#     multiplier the farm-tier/continent-mastery bonuses already use, so
#     territory expansion is also economic demand growth, not just a
#     separate passive-income minigame.
# All three combine multiplicatively in _effective_price().
const REGIONAL_DEMAND_PER_REGION := 0.001 # +0.1% sell price per owned region (198 max -> ~+20% at full ownership)
const OVERSUPPLY_PER_UNIT := 0.02 # price-pressure added per unit sold
const OVERSUPPLY_DECAY := 0.85 # daily multiplicative decay of that pressure
const OVERSUPPLY_MIN_MULT := 0.6 # price floor from oversupply (never crashes below 60% of the driven base)
const WORLD_SUPPLY_STEP := 0.06 # daily nudge to world_supply_index from a weather shock
const WORLD_SUPPLY_RECOVER := 0.05 # fraction of the gap back to the 1.0 baseline closed each day
const WORLD_SUPPLY_MIN := 0.6
const WORLD_SUPPLY_MAX := 1.4
const PRICE_EASE := 0.35 # how much of the gap to the driven target price prices[key] closes per day - eases as a visible trend rather than snapping
# Storage upkeep: hoarding past a small free buffer costs a little cash
# each day, so waiting out a low-price dip is a real tradeoff rather than
# a strictly-dominant strategy. Counts raw produce + processed goods +
# livestock goods together as one pool.
const STORAGE_FREE_THRESHOLD := 40
const STORAGE_UPKEEP_PER_UNIT := 0.1

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
var price_trend := {"wheat": 0, "corn": 0, "tomato": 0, "pumpkin": 0} # -1/0/1, set each day tick for the UI's trend arrow
var oversupply_pressure := {"wheat": 0.0, "corn": 0.0, "tomato": 0.0, "pumpkin": 0.0}
var world_supply_index := {"wheat": 1.0, "corn": 1.0, "tomato": 1.0, "pumpkin": 1.0}
var livestock := {"chicken": 0, "sheep": 0, "cow": 0, "pig": 0}
var feed_stock := 0
var livestock_goods := {"eggs": 0, "wool": 0, "milk": 0, "pork": 0}
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
var player_is_moving := false
var walk_phase := 0.0
var walk_amount := 0.0 # smoothed 0..1 - how much walk-swing to blend in, so stopping doesn't snap the limbs to idle

# ---------- Node refs ----------
var world_scenes := {} # key -> PackedScene (3D models)
var farm_viewport: SubViewport
var world_root: Node3D
var tile_nodes := [] # 2D array of {"node":Node3D, "ground":Node3D, "ground_key":String, "crop":Node3D}
var player_node: Node3D
var player_leg_left_pivot: Node3D
var player_leg_right_pivot: Node3D
var player_arm_left_pivot: Node3D
var player_arm_right_pivot: Node3D
var player_skin_material: StandardMaterial3D
var tile_highlight: MeshInstance3D
var farm_camera: Camera3D
var cam_base_size: float
var cam_zoom := 1.0
const CAM_ZOOM_MIN := 0.55
const CAM_ZOOM_MAX := 1.7
const CAM_ZOOM_STEP := 0.15
var sfx_player: AudioStreamPlayer
var sfx := {} # key -> AudioStream
var footstep_player: AudioStreamPlayer # separate from sfx_player so walking never cuts off a tool-use/harvest sound
var footstep_timer := 0.0
const FOOTSTEP_INTERVAL := 0.32

var hud_cash: Label            # coin pill value
var hud_day: Label             # day pill's "DAY N" mono label
var hud_dom: Label             # act card's "N% owned" label
var hud_act: Label             # act card title ("First Harvest")
var hud_season: Label          # day pill's season text ("Fall 6/7")
var hud_farm: Label            # small livestock/feed status line under the act card
var tool_label: Label          # kept for _refresh_tool_ui() compatibility; not shown (no on-screen equivalent in HUD v2)
var log_label: Label           # kept for _log() compatibility; not shown (messages now surface as toasts)
var tool_row: GridContainer
var tool_buttons := {}
var tool_belt_bottom_y: float
var tool_belt_side: float
var tool_belt_card_h: float
var act_roman_label: Label     # "ACT I"
var act_progress_fill: Panel   # width-driven progress bar fill
var act_progress_track_w: float
var act_farmname_label: Label
var act_tier_label: Label
var act_tier_badge: Panel
var forecast_today_label: Label
var forecast_tomorrow_label: Label
var shop_badge_label: Label
var toast_panel: Panel
var toast_label: Label
var toast_timer: Timer
var action_button: Control
var action_sublabel: Label
var bag_button: Control
var thumbstick_base: Control
var thumbstick_knob: Control
var thumbstick_dragging := false
var act_banner: Panel
var act_banner_title: Label
var act_banner_body: Label
var map_button: Control
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

var livestock_panel: Panel
var feed_label: Label
var livestock_rows_container: VBoxContainer

# Godot's built-in default font has no emoji glyphs at all - on the Web
# export specifically (no OS-level emoji font to fall back to, unlike
# desktop testing where the system usually has one), every 🔥/🐄/🔨-style
# glyph used throughout this file's UI text was rendering as literal
# fallback text (the Unicode codepoint, e.g. "0 1F 528") instead of an
# icon. Registers a small monochrome emoji font (see assets_fonts/
# CREDITS.md) as a fallback on the project's default font, applying to
# every Label/Button created anywhere in the game with no explicit font
# override - which is all of them, via the _add_label()/_add_button()
# helpers - without touching each of the ~25 individual call sites.
func _apply_emoji_font_fallback() -> void:
	var emoji_font: FontFile = load("res://assets_fonts/emoji_fallback.ttf")
	var variation := FontVariation.new()
	variation.base_font = ThemeDB.fallback_font
	variation.fallbacks = [emoji_font]
	var theme := Theme.new()
	theme.default_font = variation
	get_window().theme = theme

# ---------- Lifecycle ----------
func _ready():
	randomize()
	_apply_emoji_font_fallback()
	is_new_game = not FileAccess.file_exists(SAVE_PATH)
	_load_audio()
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

func _build_textured_ground_scene(texture_path: String, tint: Color = Color.WHITE) -> PackedScene:
	var mesh_instance := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(WORLD_TILE, WORLD_TILE)
	mesh_instance.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load(texture_path)
	mat.albedo_color = tint
	mat.roughness = 0.95 # matte, not shiny/plastic-looking under the directional light
	# Mipmapped filtering (the default) is what keeps the far backdrop tiles
	# from turning into visual static - the viewport is only a few hundred
	# pixels across, so a huge swath of distant tiles has to compress into a
	# handful of pixels, and only mipmaps can average that down cleanly.
	mesh_instance.material_override = mat
	var scene := PackedScene.new()
	scene.pack(mesh_instance)
	return scene

func _set_owner_recursive(node: Node, root: Node) -> void:
	for child in node.get_children():
		child.owner = root
		_set_owner_recursive(child, root)

# A small cottage assembled from real Kenney "Fantasy Town Kit" pieces (CC0,
# see CREDITS.md) rather than another procedural stand-in - these wood wall
# models are each authored to occupy one edge of a 1x1x1 cell (a thin slab
# spanning the full width of one side), so instantiating the same cell's
# four wall pieces at yaw 0/90/180/270 around a shared origin closes them
# into a simple box, with the gable roof piece sized to cap that same cell.
func _build_farmhouse_scene() -> PackedScene:
	const FT := "res://assets_3d/fantasy_town_kit/"
	var root := Node3D.new()
	var walls = [
		{"path": "wallWoodDoor.glb", "yaw": 0.0}, # front, the only side with an entrance
		{"path": "wallWood.glb", "yaw": PI / 2.0},
		{"path": "wallWood.glb", "yaw": PI},
		{"path": "wallWood.glb", "yaw": -PI / 2.0},
	]
	for w in walls:
		var inst = load(FT + w["path"]).instantiate()
		inst.rotation.y = w["yaw"]
		root.add_child(inst)

	var roof_inst = load(FT + "roofGable.glb").instantiate()
	roof_inst.position = Vector3(0, 1.0, 0)
	root.add_child(roof_inst)

	var chimney_inst = load(FT + "chimney.glb").instantiate()
	chimney_inst.position = Vector3(0.2, 1.0, -0.2)
	root.add_child(chimney_inst)

	_set_owner_recursive(root, root)
	var scene := PackedScene.new()
	scene.pack(root)
	return scene

# Real CC0 animal models (Sirrobzeroone's Auroch/Mouflon, see CREDITS.md) are
# modeled at a Minetest-mob scale wildly larger than this game's WORLD_TILE=1.0
# convention, so each needs its own scale-down factor to read as an
# appropriately-sized farm animal next to the fence/crops.
func _build_real_animal_scene(path: String, model_scale: float) -> PackedScene:
	var root := Node3D.new()
	var inst = load(path).instantiate()
	inst.scale = Vector3.ONE * model_scale
	root.add_child(inst)
	_set_owner_recursive(root, root)
	var scene := PackedScene.new()
	scene.pack(root)
	return scene

# CC0 sound effects from Kenney's Interface Sounds / Impact Sounds packs
# (see assets_audio/LICENSE.txt) - short, punchy feedback for tool use and
# harvesting rather than anything looping/ambient, to keep this a light
# first pass rather than a full audio overhaul.
func _load_audio() -> void:
	const AUD := "res://assets_audio/"
	sfx["till"] = load(AUD + "till.ogg")
	sfx["water"] = load(AUD + "water.ogg")
	sfx["plant"] = load(AUD + "plant.ogg")
	sfx["harvest"] = load(AUD + "harvest.ogg")
	sfx["success"] = load(AUD + "success.ogg")
	sfx["error"] = load(AUD + "error.ogg")
	sfx["click"] = load(AUD + "click.ogg")
	sfx["act_complete"] = load(AUD + "act_complete.ogg")
	sfx["footstep"] = load(AUD + "footstep.ogg")
	sfx_player = AudioStreamPlayer.new()
	add_child(sfx_player)
	footstep_player = AudioStreamPlayer.new()
	footstep_player.volume_db = -6.0 # footsteps repeat constantly while walking - quieter so they sit as texture, not a nag
	add_child(footstep_player)

func _play_sfx(key: String) -> void:
	if not sfx.has(key):
		return
	sfx_player.stream = sfx[key]
	sfx_player.play()

func _load_world_assets():
	const NK := "res://assets_3d/nature_kit/"
	# Kenney's ground_grass.glb is a flat solid vertex color (no texture at
	# all), which read as an unrealistic flat-green void once it was also
	# used to fill the whole backdrop beyond the farm. Swapped for a real
	# photographed, seamless grass texture (see CREDITS.md) applied to a
	# plain 1x1 quad, built once here and reused via .instantiate() exactly
	# like the other world_scenes entries.
	world_scenes["ground_grass"] = _build_textured_ground_scene("res://assets_3d/textures/grass_real.webp")
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
	# stands in for the growing phase. A real tomato model (Kenney's Food
	# Kit) covers "ready" now instead of the melon that used to stand in
	# for it - see CREDITS.md.
	world_scenes["tomato_a"] = load(NK + "crops_leafsStageA.glb")
	world_scenes["tomato_b"] = load(NK + "crops_leafsStageB.glb")
	world_scenes["tomato_ready"] = load("res://assets_3d/food_kit/tomato.glb")
	world_scenes["pumpkin_a"] = load(NK + "crops_leafsStageA.glb")
	world_scenes["pumpkin_b"] = load(NK + "crops_leafsStageB.glb")
	world_scenes["pumpkin_ready"] = load(NK + "crop_pumpkin.glb")
	world_scenes["fence"] = load(NK + "fence_simple.glb")
	world_scenes["fence_corner"] = load(NK + "fence_corner.glb")
	world_scenes["tree"] = load(NK + "tree_default.glb")
	world_scenes["pine"] = load(NK + "tree_pineRoundA.glb")
	# A pull of extra Nature Kit scenery for backdrop variety beyond the
	# handful of pieces the farm grid itself needs - see
	# assets_3d/ASSET_LIBRARY.md for the much larger set still available in
	# the same upstream pack if more variety is ever wanted later.
	world_scenes["rock_large_a"] = load(NK + "rock_largeA.glb")
	world_scenes["rock_large_c"] = load(NK + "rock_largeC.glb")
	world_scenes["rock_small_b"] = load(NK + "rock_smallB.glb")
	world_scenes["flower_red"] = load(NK + "flower_redA.glb")
	world_scenes["flower_yellow"] = load(NK + "flower_yellowB.glb")
	world_scenes["flower_purple"] = load(NK + "flower_purpleC.glb")
	world_scenes["mushroom_red"] = load(NK + "mushroom_red.glb")
	world_scenes["mushroom_tan"] = load(NK + "mushroom_tan.glb")
	world_scenes["stump"] = load(NK + "stump_round.glb")
	world_scenes["sign"] = load(NK + "sign.glb")
	world_scenes["bush"] = load(NK + "plant_bush.glb")
	world_scenes["player"] = load("res://assets_3d/character/basicCharacter.gltf")
	player_skin_material = StandardMaterial3D.new()
	player_skin_material.albedo_texture = load("res://assets_3d/character/skin_man.png")
	# Real CC0/MIT models (see CREDITS.md) replace all four procedural
	# primitive-mesh animals - scale factors picked so each reads at a
	# believable size next to the 1x1 fence/crop tiles (see
	# _build_real_animal_scene above).
	world_scenes["chicken"] = _build_real_animal_scene("res://assets_3d/animal_models/chicken.glb", 0.07)
	world_scenes["pig"] = _build_real_animal_scene("res://assets_3d/animal_models/pig.glb", 0.053)
	world_scenes["sheep"] = _build_real_animal_scene("res://assets_3d/animal_models/sheep.glb", 0.055)
	world_scenes["cow"] = _build_real_animal_scene("res://assets_3d/animal_models/cow.glb", 0.075)
	world_scenes["farmhouse"] = _build_farmhouse_scene()

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
	# Full-bleed per the HUD v2 design: the 3D render fills the entire
	# 720x1560 canvas edge to edge, with every HUD element floating over it
	# on its own CanvasLayer children rather than the world being boxed into
	# a letterboxed sub-region.
	var container := SubViewportContainer.new()
	container.position = Vector2.ZERO
	container.size = Vector2(720, 1560)
	container.stretch = true
	layer.add_child(container)

	farm_viewport = SubViewport.new()
	farm_viewport.size = Vector2i(720, 1560)
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
	# KEEP_WIDTH pins the horizontal extent to cam.size (below) regardless of
	# viewport aspect - needed now that the viewport is a tall 720x1560 full-
	# bleed rect rather than the old ~1:1 letterboxed box, so the same COLS-
	# wide framing holds and the extra height just reveals more world above/
	# below instead of squishing or over-zooming the scene.
	cam.keep_aspect = Camera3D.KEEP_WIDTH
	cam_base_size = COLS * WORLD_TILE * 1.7
	cam.size = cam_base_size * cam_zoom
	var center := Vector3((COLS - 1) * WORLD_TILE * 0.5, 0, (ROWS - 1) * WORLD_TILE * 0.5)
	# The camera offset's height (the "7") has to grow with cam.size, not stay
	# fixed: for this fixed viewing angle, an orthogonal camera's bottom-row
	# rays start at world Y = offset.y - half_frustum_height * 0.85 (0.85 is
	# this angle's vertical basis component) and travel further downward from
	# there - so if that start point is already below Y=0, those rays never
	# reach the ground plane at all and the sky shows through no matter how
	# much backdrop is added. Scaling the whole offset with COLS keeps the
	# same angle while keeping the start point comfortably above the ground.
	var cam_offset := Vector3(8, 22, 8) * (COLS / 10.0) * 1.3
	cam.position = center + cam_offset
	world_root.add_child(cam)
	cam.look_at(center, Vector3.UP)
	cam.current = true
	farm_camera = cam

func _adjust_camera_zoom(step: float) -> void:
	cam_zoom = clamp(cam_zoom + step, CAM_ZOOM_MIN, CAM_ZOOM_MAX)
	farm_camera.size = cam_base_size * cam_zoom

# One tap on the rail's ZOOM tile steps in; once it can't step in any
# further, the next tap wraps back out to the max (least zoomed-in) level
# instead of just sitting stuck at the limit.
func _cycle_camera_zoom() -> void:
	if cam_zoom - CAM_ZOOM_STEP < CAM_ZOOM_MIN - 0.001:
		cam_zoom = CAM_ZOOM_MAX
	else:
		cam_zoom = max(CAM_ZOOM_MIN, cam_zoom - CAM_ZOOM_STEP)
	farm_camera.size = cam_base_size * cam_zoom

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
	# One large plane with the grass texture UV-tiled across it, instead of
	# thousands of individual 1x1 backdrop tile nodes (the old approach
	# instantiated ~6000 separate MeshInstance3D nodes for a COLS*2 margin).
	# That many draw calls was always wasteful, but it became a real
	# stability risk once the HUD v2 full-bleed camera started keeping far
	# more of them simultaneously in view than the old letterboxed camera
	# ever did - WebGL/mobile GPUs have a much smaller per-frame draw-call
	# budget than a native desktop process, and this is the kind of thing
	# that renders fine locally while silently failing (a black viewport,
	# no error) in an actual browser. One mesh with a repeated UV costs the
	# same single draw call regardless of how far it extends.
	var backdrop_size := COLS * 6.0
	var backdrop_plane := MeshInstance3D.new()
	var backdrop_mesh := PlaneMesh.new()
	backdrop_mesh.size = Vector2(backdrop_size, backdrop_size)
	backdrop_plane.mesh = backdrop_mesh
	var backdrop_mat := StandardMaterial3D.new()
	backdrop_mat.albedo_texture = load("res://assets_3d/textures/grass_real.webp")
	backdrop_mat.albedo_color = Color(0.82, 0.86, 0.78)
	backdrop_mat.roughness = 0.95
	backdrop_mat.uv1_scale = Vector3(backdrop_size, backdrop_size, 1.0)
	backdrop_plane.material_override = backdrop_mat
	backdrop_plane.position = Vector3((COLS - 1) * WORLD_TILE * 0.5, -0.01, (ROWS - 1) * WORLD_TILE * 0.5)
	world_root.add_child(backdrop_plane)

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

	# The farmhouse - a landmark sitting in the backdrop behind the top
	# fence, not on the playable grid itself.
	var farmhouse: Node3D = world_scenes["farmhouse"].instantiate()
	farmhouse.position = Vector3((COLS - 1) * 0.5 * WORLD_TILE, 0, -3.0 * WORLD_TILE)
	world_root.add_child(farmhouse)

	# A few farm animals wandering just outside the fence, purely for
	# ambience - not interactive, not on the playable grid.
	var animal_deco = [
		{"key": "chicken", "tx": 2.3, "tz": -1.6},
		{"key": "chicken", "tx": 3.1, "tz": -1.4},
		{"key": "pig", "tx": COLS - 2, "tz": ROWS + 0.5},
		{"key": "sheep", "tx": -1.7, "tz": ROWS * 0.35},
		{"key": "cow", "tx": COLS + 1.6, "tz": ROWS * 0.6},
	]
	for d in animal_deco:
		var a = world_scenes[d["key"]].instantiate()
		a.position = Vector3(d["tx"] * WORLD_TILE, 0, d["tz"] * WORLD_TILE)
		a.rotation.y = randf() * TAU
		world_root.add_child(a)

	# Extra backdrop variety - flowers by the farmhouse, mushrooms and a
	# stump in the treeline, rocks and a bush scattered further out.
	var extra_deco = [
		{"key": "sign", "tx": (COLS - 1) * 0.5, "tz": -2.2},
		{"key": "flower_red", "tx": COLS * 0.3, "tz": -2.4},
		{"key": "flower_yellow", "tx": COLS * 0.3 + 0.6, "tz": -2.6},
		{"key": "flower_purple", "tx": COLS * 0.7, "tz": -2.3},
		{"key": "mushroom_red", "tx": -2.2, "tz": ROWS * 0.3},
		{"key": "mushroom_tan", "tx": -2.5, "tz": ROWS * 0.45},
		{"key": "rock_large_a", "tx": COLS + 2.0, "tz": 2.0},
		{"key": "rock_large_c", "tx": COLS + 2.6, "tz": 6.0},
		{"key": "rock_small_b", "tx": -2.6, "tz": ROWS - 1.5},
		{"key": "stump", "tx": COLS * 0.15, "tz": ROWS + 1.6},
		{"key": "bush", "tx": COLS * 0.85, "tz": ROWS + 1.7},
	]
	for d in extra_deco:
		var e = world_scenes[d["key"]].instantiate()
		e.position = Vector3(d["tx"] * WORLD_TILE, 0, d["tz"] * WORLD_TILE)
		e.rotation.y = randf() * TAU
		world_root.add_child(e)

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
	_rig_walk_pivots()
	_build_tile_highlight()

# basicCharacter.gltf ships as six flat mesh nodes (Body1/Head1/Arm*1/Leg*1)
# with no skeleton and no animations - the geometry itself is baked at its
# final world-space offset rather than centred on a joint. To swing a limb
# it first needs a pivot Node3D placed at its joint (shoulder/hip), with the
# mesh reparented underneath and shifted back by the same amount so nothing
# visually moves until the pivot rotates.
func _rig_walk_pivots() -> void:
	player_leg_left_pivot = _make_limb_pivot("LegLeft1", Vector3(1, 6, 0))
	player_leg_right_pivot = _make_limb_pivot("LegRight1", Vector3(-1, 6, 0))
	player_arm_left_pivot = _make_limb_pivot("ArmLeft1", Vector3(3, 12, 0))
	player_arm_right_pivot = _make_limb_pivot("ArmRight1", Vector3(-3, 12, 0))

func _make_limb_pivot(node_name: String, pivot_pos: Vector3) -> Node3D:
	var mesh := player_node.get_node_or_null(node_name) as MeshInstance3D
	if mesh == null:
		return null
	var pivot := Node3D.new()
	pivot.name = node_name + "Pivot"
	pivot.position = pivot_pos
	player_node.add_child(pivot)
	player_node.remove_child(mesh)
	pivot.add_child(mesh)
	mesh.position = -pivot_pos
	return pivot

# A bright, semi-transparent quad marking the tile a tool use (or harvest)
# will actually land on - sized slightly smaller than a full tile so the
# grid line still shows as a border around it.
func _build_tile_highlight() -> void:
	tile_highlight = MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(WORLD_TILE * 0.92, WORLD_TILE * 0.92)
	tile_highlight.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.95, 0.15, 0.7)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	tile_highlight.material_override = mat
	world_root.add_child(tile_highlight)

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
	_update_player_walk_anim(delta)
	_update_tile_highlight()

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
	player_is_moving = dir.length() > 0
	if player_is_moving:
		dir = dir.normalized()
		player_pos += dir * PLAYER_SPEED * delta
		player_pos.x = clamp(player_pos.x, 0, (COLS - 1) * TILE)
		player_pos.y = clamp(player_pos.y, 0, (ROWS - 1) * TILE)
		footstep_timer -= delta
		if footstep_timer <= 0.0:
			footstep_timer = FOOTSTEP_INTERVAL
			footstep_player.stream = sfx["footstep"]
			footstep_player.play()
	else:
		footstep_timer = 0.0 # next step plays immediately on the next move, not after a stale leftover cooldown

func _update_player_visual() -> void:
	var world_x = (player_pos.x / TILE) * WORLD_TILE
	var world_z = (player_pos.y / TILE) * WORLD_TILE
	player_node.position = Vector3(world_x, PLAYER_Y_OFFSET, world_z)
	# left/right were swapped from the character model's actual facing - it
	# visibly turned to look right when moving left, and vice versa.
	var facing_yaw: float = {"down": 0.0, "up": PI, "left": -PI / 2.0, "right": PI / 2.0}[player_facing]
	player_node.rotation.y = facing_yaw

func _update_player_walk_anim(delta: float) -> void:
	walk_amount = move_toward(walk_amount, 1.0 if player_is_moving else 0.0, delta * WALK_BLEND_SPEED)
	if player_is_moving or walk_amount > 0.001:
		walk_phase += delta * WALK_CYCLE_SPEED
	var leg_swing := sin(walk_phase) * WALK_LEG_SWING * walk_amount
	var arm_swing := sin(walk_phase) * WALK_ARM_SWING * walk_amount
	if player_leg_left_pivot:
		player_leg_left_pivot.rotation.x = leg_swing
	if player_leg_right_pivot:
		player_leg_right_pivot.rotation.x = -leg_swing
	# arms swing opposite the same-side leg, like a natural gait
	if player_arm_left_pivot:
		player_arm_left_pivot.rotation.x = -arm_swing
	if player_arm_right_pivot:
		player_arm_right_pivot.rotation.x = arm_swing

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
			KEY_EQUAL, KEY_KP_ADD: _adjust_camera_zoom(-CAM_ZOOM_STEP)
			KEY_MINUS, KEY_KP_SUBTRACT: _adjust_camera_zoom(CAM_ZOOM_STEP)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_adjust_camera_zoom(-CAM_ZOOM_STEP * 0.5)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_adjust_camera_zoom(CAM_ZOOM_STEP * 0.5)

func _facing_tile() -> Vector2i:
	var tx := int(round(player_pos.x / TILE))
	var ty := int(round(player_pos.y / TILE))
	match player_facing:
		"up": ty -= 1
		"down": ty += 1
		"left": tx -= 1
		"right": tx += 1
	return Vector2i(tx, ty)

# Shows the player where a tool will land before they commit to using it -
# updated every frame alongside the player's own position/facing so it
# never lags a step behind while moving.
func _update_tile_highlight() -> void:
	var f := _facing_tile()
	if f.x < 0 or f.y < 0 or f.x >= COLS or f.y >= ROWS:
		tile_highlight.visible = false
		return
	tile_highlight.visible = true
	tile_highlight.position = Vector3(f.x * WORLD_TILE, 0.02, f.y * WORLD_TILE)

# ---------- Tools & actions ----------
func _select_tool(key: String) -> void:
	if not _tool_unlocked(key):
		_log("The %s isn't unlocked yet." % TOOLS[key]["name"])
		_play_sfx("error")
		return
	selected_tool = key
	_refresh_tool_ui()
	_play_sfx("click")

func _select_crop(key: String) -> void:
	selected_crop = key
	_refresh_inventory_panel()

func _log(msg: String) -> void:
	log_text = msg
	if log_label:
		log_label.text = msg
	_show_toast(msg)

func _do_action() -> void:
	var f := _facing_tile()
	if f.x < 0 or f.y < 0 or f.x >= COLS or f.y >= ROWS:
		return
	var tile: Dictionary = tiles[f.y][f.x]

	if tile["type"] == "planted" and tile.get("stage", 0) >= 4:
		if tile.get("infected", false):
			_log("That crop is blighted - harvest yields nothing. Cure it or till it under.")
			_play_sfx("error")
			tile["type"] = "grass"
		else:
			var sq: float = tile.get("soil_quality", 100.0)
			if sq < SOIL_EXHAUSTED_THRESHOLD and randf() < SOIL_EXHAUSTED_FAIL_CHANCE:
				_log("The exhausted soil ruined this %s harvest - fertilize or rotate crops here." % CROPS[tile["crop"]]["name"])
				_play_sfx("error")
				tile["type"] = "soil"
			else:
				var watered_enough = tile.get("times_watered", 0) >= CROPS[tile["crop"]]["grow_days"]
				var well_tended = watered_enough and sq >= SOIL_DEPLETED_THRESHOLD
				var amount = 2 if well_tended else 1
				var cap = _storage_cap()
				if _produce_total(tile["crop"]) + amount > cap:
					_log("Storage is full for %s (%d/%d) - sell some or upgrade your silo." % [CROPS[tile["crop"]]["name"], _produce_total(tile["crop"]), cap])
					_play_sfx("error")
					return
				var quality = _harvest_quality(tile, sq, watered_enough)
				produce[tile["crop"]][quality] += amount
				lifetime_harvested += amount
				_log("Harvested %dx %s (%s quality)%s." % [amount, CROPS[tile["crop"]]["name"], QUALITY_LABELS[quality], " - well-tended bonus!" if well_tended else ""])
				_play_sfx("harvest")
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
				_play_sfx("till")
			else:
				_log("The hoe only works on grass.")
				_play_sfx("error")
		"seed":
			if tile["type"] != "soil":
				_log("Seeds need tilled soil - till it with the hoe first.")
				_play_sfx("error")
				return
			if not CROPS[selected_crop]["seasons"].has(_season_name()) and not owned_upgrades.get("greenhouse", false):
				_log("%s can't be planted in %s." % [CROPS[selected_crop]["name"], _season_name()])
				_play_sfx("error")
				return
			if seeds[selected_crop] <= 0:
				_log("No %s seeds left! Buy more." % CROPS[selected_crop]["name"])
				_play_sfx("error")
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
			_play_sfx("plant")
		"water":
			if not owned_upgrades.get("watering_can_2", false):
				if tile["type"] != "planted":
					_log("Nothing planted here to water.")
					_play_sfx("error")
					return
				if tile.get("watered", false):
					_log("Already watered today. It's growing...")
					_play_sfx("error")
					return
				tile["watered"] = true
				tile["times_watered"] = tile.get("times_watered", 0) + 1
				_log("Watered the crop.")
				_play_sfx("water")
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
					_play_sfx("water")
				else:
					_log("Nothing nearby needs watering.")
					_play_sfx("error")
		"cure":
			if tile["type"] == "planted" and tile.get("infected", false):
				if cash < CURE_COST:
					_log("Need $%d to cure this blight." % CURE_COST)
					_play_sfx("error")
					return
				cash -= CURE_COST
				tile["infected"] = false
				tile["infected_days"] = 0
				_log("Cured the blight for $%d." % CURE_COST)
				_play_sfx("success")
			else:
				_log("Nothing to cure here.")
				_play_sfx("error")
				return
		"fertilize":
			if tile["type"] == "grass":
				_log("Nothing to fertilize here - till it first.")
				_play_sfx("error")
				return
			if fertilizer <= 0:
				_log("No fertilizer left! Buy more.")
				_play_sfx("error")
				return
			fertilizer -= 1
			tile["soil_quality"] = min(100.0, tile.get("soil_quality", 100.0) + SOIL_FERTILIZE_BOOST)
			_log("Fertilized the soil (now %d%%)." % int(round(tile["soil_quality"])))
			_play_sfx("success")
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
		if mesh_key == "tomato_ready":
			# Kenney's Food Kit is modeled at its own, much smaller scale than
			# Nature Kit's crops (a real kitchen-table tomato vs. a garden
			# plant) - scaled up here to read at the same size as the other
			# ready-to-harvest crops on the same size tile.
			cnode.scale = Vector3.ONE * 2.4
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

	_update_world_supply()
	_update_crop_prices()
	var unfed = _tick_livestock()
	if unfed > 0:
		_log("%d of your livestock went unfed today and produced nothing - buy more feed from the Livestock panel." % unfed)
	_apply_storage_upkeep()
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

# ---------- Dynamic economy ----------
# Weather shock to one crop's aggregate world supply - the same trait
# checks _advance_tiles() already runs per-tile against the player's own
# crops, applied here as one abstracted market-wide number per crop
# instead of simulating individual NPC farms.
func _update_world_supply() -> void:
	for key in CROP_KEYS:
		var crop_info = CROPS[key]
		var idx = world_supply_index.get(key, 1.0)
		match current_weather:
			"drought":
				idx -= WORLD_SUPPLY_STEP * (1.5 if crop_info.get("thirsty", false) else 0.5)
			"frost":
				if not crop_info.get("frost_hardy", false):
					idx -= WORLD_SUPPLY_STEP
			"heatwave":
				if crop_info.get("heat_sensitive", false):
					idx -= WORLD_SUPPLY_STEP
			"storm":
				idx -= WORLD_SUPPLY_STEP * 0.4
			"rainy":
				idx += WORLD_SUPPLY_STEP * 0.5
			"sunny":
				idx += WORLD_SUPPLY_STEP * 0.3
		idx += (1.0 - idx) * WORLD_SUPPLY_RECOVER # a run of good weather fully heals a past shock over time
		world_supply_index[key] = clamp(idx, WORLD_SUPPLY_MIN, WORLD_SUPPLY_MAX)

# Eases prices[key] toward base/world_supply_index (scarcity raises it,
# surplus lowers it) instead of the old pure random walk, and decays
# oversupply_pressure - call once per day, after _update_world_supply().
func _update_crop_prices() -> void:
	for key in CROP_KEYS:
		var base = CROPS[key]["base_price"]
		var target = base / world_supply_index.get(key, 1.0)
		var eased = lerp(float(prices[key]), clamp(target, base * 0.5, base * 2.0), PRICE_EASE)
		var rounded = int(round(eased))
		price_trend[key] = sign(rounded - prices[key])
		prices[key] = rounded
		oversupply_pressure[key] = max(0.0, oversupply_pressure.get(key, 0.0) * OVERSUPPLY_DECAY - 0.01)

# One line explaining the dominant reason behind a crop's current price,
# so the causes above stay visible to the player instead of just moving a
# number - checked in priority order from most to least specific.
func _market_reason(key: String) -> String:
	if active_event.get("kind", "crop") == "crop" and active_event.get("crop", "") == key:
		return "Demand spike in effect!"
	var idx = world_supply_index.get(key, 1.0)
	if idx <= 0.8:
		return "Weather has hurt %s supply - prices are up." % CROPS[key]["name"].to_lower()
	if oversupply_pressure.get(key, 0.0) >= 0.25:
		return "You've been flooding the market with %s." % CROPS[key]["name"].to_lower()
	if idx >= 1.2:
		return "Good weather has kept %s plentiful - prices are down." % CROPS[key]["name"].to_lower()
	return "Prices are steady."

func _trend_arrow(key: String) -> String:
	var t = price_trend.get(key, 0)
	return "▲" if t > 0 else ("▼" if t < 0 else "→")

func _effective_price(key: String) -> int:
	var bonus_mult = 1.0 + TIER_PRICE_BONUS_PER_LEVEL * _farm_tier_index()
	bonus_mult += CONTINENT_MASTERY_BONUS_PER_CONTINENT * _fully_owned_continent_count()
	bonus_mult += REGIONAL_DEMAND_PER_REGION * _owned_count()
	var oversupply_mult = clamp(1.0 - oversupply_pressure.get(key, 0.0), OVERSUPPLY_MIN_MULT, 1.0)
	var base = prices[key] * bonus_mult * oversupply_mult
	if active_event.get("kind", "crop") == "crop" and active_event.get("crop", "") == key:
		return int(round(base * active_event["multiplier"]))
	return int(round(base))

# A processed good's price rides the same supply/demand/weather drivers as
# its source crop, scaled by the same ratio _effective_price() moved that
# crop's own price - so a wheat shortage raises flour's price too, without
# needing a second tracked-price system just for processed goods.
func _effective_processed_price(source_crop_key: String) -> int:
	var recipe = PROCESSING[source_crop_key]
	var ratio = float(_effective_price(source_crop_key)) / float(CROPS[source_crop_key]["base_price"])
	return int(round(recipe["price"] * ratio))

# ---------- Livestock (feed -> produce -> sell) ----------
func _feed_price_per_unit() -> int:
	return max(1, int(round((_effective_price("wheat") + _effective_price("corn")) * 0.5 * FEED_COST_FACTOR)))

# Cost-plus pricing: a livestock good's sell price rises with how expensive
# feed currently is relative to its own long-run baseline - the direct
# "higher feed costs -> higher livestock production costs -> higher meat
# prices" chain from the design brief, without needing a second supply/
# demand tracker just for animal goods.
func _livestock_sell_price(product_key: String) -> int:
	var baseline_feed = (CROPS["wheat"]["base_price"] + CROPS["corn"]["base_price"]) * 0.5 * FEED_COST_FACTOR
	var feed_cost_mult = clamp(_feed_price_per_unit() / max(1.0, baseline_feed), 0.7, 1.8)
	var event_mult = 1.0
	if active_event.get("kind", "crop") == "livestock" and active_event.get("crop", "") == product_key:
		event_mult = active_event["multiplier"]
	for key in LIVESTOCK_KEYS:
		if LIVESTOCK[key]["product"] == product_key:
			return int(round(LIVESTOCK[key]["base_price"] * feed_cost_mult * event_mult))
	return 0

func _livestock_total() -> int:
	var total := 0
	for key in LIVESTOCK_KEYS:
		total += livestock.get(key, 0)
	return total

func _feed_needed_per_day() -> int:
	var total := 0
	for key in LIVESTOCK_KEYS:
		total += livestock.get(key, 0) * LIVESTOCK[key]["feed_per_day"]
	return total

# Each owned animal eats its species' feed_per_day and, if fed, produces 1
# unit of its good. Feed is consumed species-by-species so a shortage
# leaves whichever species is processed later partly or fully unfed rather
# than failing all of them at once. Returns the total count left unfed, so
# the caller can warn the player instead of production just silently
# stopping with no explanation.
func _tick_livestock() -> int:
	var unfed_total := 0
	for key in LIVESTOCK_KEYS:
		var count: int = livestock.get(key, 0)
		if count <= 0:
			continue
		var per_day: int = LIVESTOCK[key]["feed_per_day"]
		var fed_count = min(count, feed_stock / per_day)
		feed_stock -= fed_count * per_day
		unfed_total += count - fed_count
		if fed_count > 0:
			var product = LIVESTOCK[key]["product"]
			livestock_goods[product] = livestock_goods.get(product, 0) + fed_count
	return unfed_total

func _total_stored_units() -> int:
	var total := 0
	for key in CROP_KEYS:
		total += _produce_total(key)
	for key in PROCESSED_KEYS:
		total += processed_goods[key]
	for key in LIVESTOCK_PRODUCT_KEYS:
		total += livestock_goods[key]
	return total

func _apply_storage_upkeep() -> void:
	var stored = _total_stored_units()
	if stored <= STORAGE_FREE_THRESHOLD:
		return
	var upkeep = int(ceil((stored - STORAGE_FREE_THRESHOLD) * STORAGE_UPKEEP_PER_UNIT))
	if upkeep <= 0:
		return
	cash = max(0, cash - upkeep)
	_log("Storage upkeep cost $%d for %d units stored above the free threshold - sell some or process it." % [upkeep, stored - STORAGE_FREE_THRESHOLD])

# ---------- Market events ----------

# Display name for whatever active_event currently targets - a crop
# (CROPS dict) or, since demand spikes also cover livestock goods, a
# livestock product (LIVESTOCK dict, keyed by its own "product" field).
func _event_target_name() -> String:
	if active_event.get("kind", "crop") == "livestock":
		for key in LIVESTOCK_KEYS:
			if LIVESTOCK[key]["product"] == active_event["crop"]:
				return LIVESTOCK[key]["product_name"]
		return active_event["crop"].capitalize()
	return CROPS[active_event["crop"]]["name"]

func _advance_market_event() -> void:
	if active_event.is_empty():
		if current_act >= 1 and randf() < EVENT_CHANCE:
			var unlocked_crops = CROP_KEYS.filter(func(k): return _crop_unlocked(k))
			# Livestock goods join the same event pool, weighted lighter (1 slot
			# vs. each unlocked crop's own) so a demand spike doesn't become
			# "usually eggs" once several crops unlock - reuses the exact same
			# event mechanic instead of a separate livestock-only system.
			var pool := []
			for k in unlocked_crops:
				pool.append({"key": k, "kind": "crop"})
			if unlocked_crops.size() > 0:
				pool.append({"key": LIVESTOCK_PRODUCT_KEYS[randi() % LIVESTOCK_PRODUCT_KEYS.size()], "kind": "livestock"})
			if pool.size() > 0:
				var pick = pool[randi() % pool.size()]
				var mult = EVENT_MIN_MULT + randf() * (EVENT_MAX_MULT - EVENT_MIN_MULT)
				var days = EVENT_MIN_DAYS + (randi() % (EVENT_MAX_DAYS - EVENT_MIN_DAYS + 1))
				active_event = {"crop": pick["key"], "kind": pick["kind"], "multiplier": mult, "days_left": days}
				_log("Demand spike! %s is selling for %.1fx price for the next %d day(s)." % [_event_target_name(), mult, days])
	else:
		active_event["days_left"] -= 1
		if active_event["days_left"] <= 0:
			_log("The demand spike for %s has ended." % _event_target_name())
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
			_play_sfx("act_complete")
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
		_play_sfx("act_complete")
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

# ---------- HUD v2 helpers ----------
func _dp(v: float) -> float:
	return v * UI_SCALE

# Screen width/height expressed in the same dp space the design spec uses,
# so positions below can be transcribed straight from the spec's numbers.
func _screen_w_dp() -> float:
	return 720.0 / UI_SCALE
func _screen_h_dp() -> float:
	return 1560.0 / UI_SCALE

func _glass_style(bg_alpha: float, radius: float, border_alpha: float = 0.12) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(COL_GLASS_BG.r, COL_GLASS_BG.g, COL_GLASS_BG.b, bg_alpha)
	sb.set_corner_radius_all(int(radius))
	sb.set_border_width_all(1)
	sb.border_color = Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, border_alpha)
	sb.shadow_color = Color(0, 0, 0, 0.5)
	sb.shadow_size = int(_dp(8))
	return sb

func _glass_panel(parent: Node, pos: Vector2, size: Vector2, radius: float, bg_alpha := 0.62, border_alpha := 0.12) -> Panel:
	var p := Panel.new()
	p.position = pos
	p.size = size
	p.add_theme_stylebox_override("panel", _glass_style(bg_alpha, radius, border_alpha))
	parent.add_child(p)
	return p

func _solid_panel(parent: Node, pos: Vector2, size: Vector2, radius: float, color: Color, border_color := Color(0, 0, 0, 0), border_w := 0) -> Panel:
	var p := Panel.new()
	p.position = pos
	p.size = size
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(int(radius))
	if border_w > 0:
		sb.set_border_width_all(border_w)
		sb.border_color = border_color
	p.add_theme_stylebox_override("panel", sb)
	parent.add_child(p)
	return p

# A square Panel rotated 45deg reads as a diamond - used for the map rail
# icon and the forecast chip's "frost" marker, matching the design spec's
# own primitive-shape iconography (no image assets).
func _diamond(parent: Node, center: Vector2, size: float, border_color: Color, filled: bool) -> Panel:
	var p: Panel
	if filled:
		p = _solid_panel(parent, Vector2.ZERO, Vector2(size, size), size * 0.15, border_color)
	else:
		p = _solid_panel(parent, Vector2.ZERO, Vector2(size, size), size * 0.15, Color(0, 0, 0, 0), border_color, 2)
	p.pivot_offset = Vector2(size, size) * 0.5
	p.rotation = PI / 4.0
	p.position = center - Vector2(size, size) * 0.5
	return p

func _circle(parent: Node, pos: Vector2, size: float, color: Color, border_color := Color(0, 0, 0, 0), border_w := 0) -> Panel:
	return _solid_panel(parent, pos, Vector2(size, size), size * 0.5, color, border_color, border_w)

# Coin pill, day/season pill, menu button, forecast chip, act card - the
# always-visible top status stack, floating over the full-bleed 3D view.
# Two gradient scrims over the render surface (top for the status stack,
# bottom for the tool belt/controls) so cream HUD text stays legible over
# a bright noon field - added first so every other HUD element draws on
# top of them.
func _build_hud_scrims(layer: CanvasLayer) -> void:
	var top_scrim := ColorRect.new()
	top_scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_scrim.size = Vector2(720, _dp(230))
	var top_grad := Gradient.new()
	top_grad.set_color(0, Color(0.031, 0.047, 0.039, 0.72))
	top_grad.set_color(1, Color(0.031, 0.047, 0.039, 0.0))
	var top_tex := GradientTexture2D.new()
	top_tex.gradient = top_grad
	top_tex.fill_from = Vector2(0, 0)
	top_tex.fill_to = Vector2(0, 1)
	var top_rect := TextureRect.new()
	top_rect.texture = top_tex
	top_rect.size = top_scrim.size
	top_rect.stretch_mode = TextureRect.STRETCH_SCALE
	top_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(top_rect)

	var bottom_h = _dp(420)
	var bottom_grad := Gradient.new()
	bottom_grad.set_color(0, Color(0.031, 0.047, 0.039, 0.0))
	bottom_grad.add_point(0.28, Color(0.031, 0.047, 0.039, 0.0))
	bottom_grad.set_color(1, Color(0.031, 0.047, 0.039, 0.86))
	var bottom_tex := GradientTexture2D.new()
	bottom_tex.gradient = bottom_grad
	bottom_tex.fill_from = Vector2(0, 0)
	bottom_tex.fill_to = Vector2(0, 1)
	var bottom_rect := TextureRect.new()
	bottom_rect.texture = bottom_tex
	bottom_rect.position = Vector2(0, 1560.0 - bottom_h)
	bottom_rect.size = Vector2(720, bottom_h)
	bottom_rect.stretch_mode = TextureRect.STRETCH_SCALE
	bottom_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(bottom_rect)

func _build_hud_top(layer: CanvasLayer) -> void:
	var side = _dp(16)
	var top_y = _dp(34)
	var row1_h = _dp(36)

	# A. Coin pill
	var coin_w = _dp(80)
	var coin_pill := _glass_panel(layer, Vector2(side, top_y), Vector2(coin_w, row1_h), row1_h * 0.5)
	var coin_dot_sb := StyleBoxFlat.new()
	coin_dot_sb.bg_color = Color(0.918, 0.706, 0.263) # midpoint of the spec's gold gradient
	coin_dot_sb.set_corner_radius_all(int(_dp(10)))
	coin_dot_sb.set_border_width_all(1)
	coin_dot_sb.border_color = Color(1, 1, 1, 0.25)
	var coin_dot := Panel.new()
	coin_dot.position = Vector2(_dp(9), row1_h * 0.5 - _dp(10))
	coin_dot.size = Vector2(_dp(20), _dp(20))
	coin_dot.add_theme_stylebox_override("panel", coin_dot_sb)
	coin_pill.add_child(coin_dot)
	hud_cash = _add_label(coin_pill, "100", Vector2(_dp(33), row1_h * 0.5 - _dp(11)), Vector2(_dp(45), _dp(22)), int(_dp(15)), COL_CREAM)

	# B. Day/season pill
	var day_x = side + coin_w + _dp(9)
	var day_w = _dp(155)
	var day_pill := _glass_panel(layer, Vector2(day_x, top_y), Vector2(day_w, row1_h), row1_h * 0.5)
	hud_day = _add_label(day_pill, "DAY 1", Vector2(_dp(14), row1_h * 0.5 - _dp(9)), Vector2(_dp(70), _dp(18)), int(_dp(12)), COL_CREAM)
	_solid_panel(day_pill, Vector2(_dp(88), row1_h * 0.5 - _dp(6)), Vector2(1, _dp(12)), 0, Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.18))
	hud_season = _add_label(day_pill, "Spring 1/7", Vector2(_dp(96), row1_h * 0.5 - _dp(9)), Vector2(_dp(60), _dp(18)), int(_dp(12)), COL_SEASON_FALL)

	# C. Menu button - purely decorative in the design spec (no bound
	# behavior in the prototype either; a future settings menu would live
	# here).
	var menu_size = _dp(38)
	var menu_btn := _glass_panel(layer, Vector2(720.0 - side - menu_size, top_y), Vector2(menu_size, menu_size), menu_size * 0.5)
	for i in range(3):
		_circle(menu_btn, Vector2(menu_size * 0.5 - _dp(1.5), _dp(11) + i * _dp(6)), _dp(3), COL_CREAM)

	# D. Forecast chip
	var forecast_y = top_y + row1_h + _dp(9)
	var forecast_w = _dp(180)
	var forecast_h = _dp(27)
	var forecast_chip := _glass_panel(layer, Vector2(side, forecast_y), Vector2(forecast_w, forecast_h), 999, 0.5, 0.09)
	_diamond(forecast_chip, Vector2(_dp(17), forecast_h * 0.5), _dp(9), COL_WATER, true)
	forecast_today_label = _add_label(forecast_chip, "Sunny today", Vector2(_dp(26), forecast_h * 0.5 - _dp(8)), Vector2(_dp(90), _dp(16)), int(_dp(11.5)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.9))
	_add_label(forecast_chip, "→", Vector2(_dp(118), forecast_h * 0.5 - _dp(8)), Vector2(_dp(12), _dp(16)), int(_dp(11)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.35))
	_circle(forecast_chip, Vector2(_dp(134), forecast_h * 0.5 - _dp(4.5)), _dp(9), COL_AMBER)
	forecast_tomorrow_label = _add_label(forecast_chip, "Sunny", Vector2(_dp(147), forecast_h * 0.5 - _dp(8)), Vector2(_dp(60), _dp(16)), int(_dp(11.5)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.6))

	# E. Act card
	var act_y = forecast_y + forecast_h + _dp(9)
	var act_w = 720.0 - side * 2.0
	var act_h = _dp(78)
	var act_card := _glass_panel(layer, Vector2(side, act_y), Vector2(act_w, act_h), _dp(16), 0.5, 0.09)
	var pad = _dp(13)
	act_roman_label = _add_label(act_card, "ACT I", Vector2(pad, _dp(11)), Vector2(_dp(50), _dp(14)), int(_dp(9.5)), COL_BERRY)
	hud_act = _add_label(act_card, "First Harvest", Vector2(pad + _dp(46), _dp(9)), Vector2(_dp(160), _dp(18)), int(_dp(12.5)), COL_CREAM)
	hud_dom = _add_label(act_card, "0% owned", Vector2(act_w - pad - _dp(90), _dp(11)), Vector2(_dp(90), _dp(14)), int(_dp(10.5)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.5))
	hud_dom.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

	var bar_y = _dp(35)
	act_progress_track_w = act_w - pad * 2.0
	var bar_track := _solid_panel(act_card, Vector2(pad, bar_y), Vector2(act_progress_track_w, _dp(4)), _dp(2), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.12))
	act_progress_fill = _solid_panel(bar_track, Vector2.ZERO, Vector2(0, _dp(4)), _dp(2), COL_BERRY)

	var row2_y = bar_y + _dp(12)
	act_farmname_label = _add_label(act_card, "Home Farm", Vector2(pad, row2_y), Vector2(_dp(115), _dp(16)), int(_dp(11)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.75))
	act_tier_badge = _glass_panel(act_card, Vector2(pad + _dp(120), row2_y - _dp(1)), Vector2(_dp(70), _dp(18)), _dp(6), 0.09, 0.0)
	act_tier_label = _add_label(act_tier_badge, "BASIC", Vector2(_dp(7), _dp(3)), Vector2(_dp(200), _dp(12)), int(_dp(9)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.6))

	hud_farm = _add_label(act_card, "", Vector2(pad, row2_y + _dp(20)), Vector2(act_w - pad * 2.0, _dp(16)), int(_dp(10)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.6))

# One 44x44 glass tile + micro label underneath, used by the right rail -
# returns the tile Control so callers can toggle .visible.
func _build_rail_tile(layer: CanvasLayer, pos: Vector2, label_text: String, cb: Callable) -> Control:
	var tile_size = _dp(44)
	var tile := _glass_panel(layer, pos, Vector2(tile_size, tile_size), _dp(15), 0.6)
	var btn := Button.new()
	btn.flat = true
	btn.size = Vector2(tile_size, tile_size)
	btn.pressed.connect(cb)
	tile.add_child(btn)
	# Parented to the tile (not the layer) so hiding the tile - e.g. the MAP
	# tile before the World Map unlocks - hides its label too, instead of
	# leaving the micro-label floating with no icon above it.
	var label := _add_label(tile, label_text, Vector2(-_dp(18), tile_size + _dp(4)), Vector2(tile_size + _dp(36), _dp(12)), int(_dp(8)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.45))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return tile

# Right rail: MAP / SHOP / FARM (livestock) - three quick-access tiles,
# plus a small camera zoom rocker tucked underneath (not part of the
# design spec, which has no zoom control, but this game already has one
# and it needs a home somewhere out of the primary thumb zone).
func _build_hud_rail(layer: CanvasLayer) -> void:
	var tile_size = _dp(44)
	var rail_x = 720.0 - _dp(14) - tile_size
	var rail_y = _dp(264)
	var pitch = tile_size + _dp(10) + _dp(16)

	map_button = _build_rail_tile(layer, Vector2(rail_x, rail_y), "MAP", func(): _toggle_map())
	_diamond(map_button, Vector2(tile_size, tile_size) * 0.5, _dp(15), COL_CREAM, false)

	var shop_tile = _build_rail_tile(layer, Vector2(rail_x, rail_y + pitch), "SHOP", _open_inventory)
	_circle(shop_tile, Vector2(tile_size, tile_size) * 0.5 - Vector2(_dp(8), _dp(8)), _dp(16), Color(0, 0, 0, 0), COL_CREAM, 2)
	var badge := _glass_panel(shop_tile, Vector2(tile_size - _dp(11), -_dp(3)), Vector2(_dp(16), _dp(16)), _dp(8), 1.0, 0.0)
	badge.add_theme_stylebox_override("panel", _solid_style(COL_ALERT, _dp(8)))
	shop_badge_label = _add_label(badge, "0", Vector2(0, _dp(2)), Vector2(_dp(16), _dp(12)), int(_dp(9)), Color.WHITE)
	shop_badge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	var farm_tile = _build_rail_tile(layer, Vector2(rail_x, rail_y + pitch * 2.0), "FARM", func(): _toggle_livestock_panel())
	_solid_panel(farm_tile, Vector2(tile_size, tile_size) * 0.5 - Vector2(_dp(7), _dp(7)), Vector2(_dp(14), _dp(14)), _dp(4), Color(0, 0, 0, 0), COL_CREAM, 0).add_theme_stylebox_override("panel", _outline_style(_dp(4)))

	# Camera zoom - not part of the design spec (which has no zoom control),
	# but this game already has one; per design feedback it joins the rail
	# as a fourth same-sized tile rather than ad-hoc floating +/- circles.
	# One tap cycles zoom in a step, wrapping back out once it hits the max.
	var zoom_tile = _build_rail_tile(layer, Vector2(rail_x, rail_y + pitch * 3.0), "ZOOM", func(): _cycle_camera_zoom())
	_circle(zoom_tile, Vector2(tile_size, tile_size) * 0.5 - Vector2(_dp(6), _dp(6)), _dp(12), Color(0, 0, 0, 0), COL_CREAM, 2)
	_solid_panel(zoom_tile, Vector2(tile_size * 0.5 + _dp(4), tile_size * 0.5 + _dp(4)), Vector2(_dp(7), 2), 0, COL_CREAM)

func _solid_style(color: Color, radius: float) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(int(radius))
	return sb

func _outline_style(radius: float) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0)
	sb.set_corner_radius_all(int(radius))
	sb.set_border_width_all(2)
	sb.border_color = COL_CREAM
	return sb

# Toast: a transient glass card confirming the last logged event. _log()
# calls this so every existing _log() call site in the file surfaces here
# with no other changes needed.
func _build_hud_toast(layer: CanvasLayer) -> void:
	var toast_w = _dp(280)
	var toast_h = _dp(40)
	var toast_x = (720.0 - toast_w) * 0.5
	var toast_y = _screen_h_dp_px() - _dp(250) - toast_h
	toast_panel = _glass_panel(layer, Vector2(toast_x, toast_y), Vector2(toast_w, toast_h), _dp(14), 0.82, 0.14)
	toast_panel.visible = false
	_circle(toast_panel, Vector2(_dp(14), toast_h * 0.5 - _dp(4)), _dp(8), COL_SEASON_FALL)
	toast_label = _add_label(toast_panel, "", Vector2(_dp(30), toast_h * 0.5 - _dp(9)), Vector2(toast_w - _dp(40), _dp(18)), int(_dp(12.5)), COL_CREAM)
	toast_timer = Timer.new()
	toast_timer.one_shot = true
	toast_timer.timeout.connect(func(): toast_panel.visible = false)
	add_child(toast_timer)

func _show_toast(msg: String, duration := 3.0) -> void:
	if not toast_panel:
		return
	toast_label.text = msg
	toast_panel.visible = true
	toast_timer.start(duration)

func _screen_h_dp_px() -> float:
	return 1560.0

# Empty 3-column grid positioned per spec - _refresh_tool_ui() populates it
# with one glass card per unlocked tool (up to 5 once cure/fertilize
# unlock, wrapping to a second row - the design spec only shows the 3
# Act-1 tools, but the grid handles more the same way).
func _build_tool_belt(layer: CanvasLayer) -> void:
	# Bottom edge stays fixed at the spec's anchor regardless of row count;
	# _refresh_tool_ui() grows the belt upward as more tools unlock (Act 2+
	# adds Cure Spray and Fertilizer, wrapping past the spec's 3-tool row)
	# so extra rows never collide with the controls below.
	tool_belt_card_h = _dp(74)
	tool_belt_side = _dp(16)
	tool_belt_bottom_y = _screen_h_dp_px() - _dp(190)
	tool_row = GridContainer.new()
	tool_row.columns = 3
	tool_row.position = Vector2(tool_belt_side, tool_belt_bottom_y - tool_belt_card_h)
	tool_row.size = Vector2(720.0 - tool_belt_side * 2.0, tool_belt_card_h)
	tool_row.add_theme_constant_override("h_separation", int(_dp(9)))
	tool_row.add_theme_constant_override("v_separation", int(_dp(9)))
	layer.add_child(tool_row)

# Thumbstick (left) + Bag button and primary USE action button (right),
# both inside natural thumb arcs at the bottom of the screen, plus the
# home-indicator bar. Movement stays discrete (move_*_held booleans, same
# as the old D-pad) - the stick is a drag surface that maps its angle to
# up to two of those booleans (8-way), not a true analog input, since the
# rest of the movement code only ever reads on/off directions.
func _build_hud_controls(layer: CanvasLayer) -> void:
	var bottom_y = _screen_h_dp_px() - _dp(34)
	var side = _dp(20)

	var stick_size = _dp(126)
	thumbstick_base = _glass_panel(layer, Vector2(side, bottom_y - stick_size), Vector2(stick_size, stick_size), stick_size * 0.5, 0.35, 0.13)
	thumbstick_base.mouse_filter = Control.MOUSE_FILTER_STOP
	thumbstick_base.gui_input.connect(_on_thumbstick_input)
	var knob_size = _dp(58)
	thumbstick_knob = _solid_panel(thumbstick_base, (Vector2(stick_size, stick_size) - Vector2(knob_size, knob_size)) * 0.5, Vector2(knob_size, knob_size), knob_size * 0.5, Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.9))
	thumbstick_knob.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var action_size = _dp(96)
	var action_x = 720.0 - side - action_size
	var action_y = bottom_y - action_size
	action_button = _solid_panel(layer, Vector2(action_x, action_y), Vector2(action_size, action_size), action_size * 0.5, COL_AMBER_DEEP)
	var action_btn := Button.new()
	action_btn.flat = true
	action_btn.size = Vector2(action_size, action_size)
	action_btn.pressed.connect(func(): _do_action())
	action_button.add_child(action_btn)
	_add_label(action_button, "USE", Vector2(0, action_size * 0.5 - _dp(18)), Vector2(action_size, _dp(18)), int(_dp(15)), Color(0.125, 0.094, 0.039)).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	action_sublabel = _add_label(action_button, "Hoe", Vector2(0, action_size * 0.5 + _dp(2)), Vector2(action_size, _dp(14)), int(_dp(10.5)), Color(0.125, 0.094, 0.039, 0.7))
	action_sublabel.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# Pulsing ring - a slightly larger, borderless-fill glass circle behind
	# the button, breathing via a looping Tween (Godot has no native CSS-
	# keyframe equivalent, so this is the direct way to loop it).
	var ring := _solid_panel(layer, Vector2(action_x, action_y) - Vector2(_dp(8), _dp(8)), Vector2(action_size + _dp(16), action_size + _dp(16)), (action_size + _dp(16)) * 0.5, Color(0, 0, 0, 0), COL_AMBER, 2)
	layer.move_child(ring, layer.get_children().find(action_button))
	var ring_tween := create_tween().set_loops()
	ring_tween.tween_property(ring, "modulate:a", 0.15, 1.3).from(0.55)
	ring_tween.tween_property(ring, "modulate:a", 0.55, 1.3)

	var bag_size = _dp(56)
	var bag_x = action_x - _dp(12) - bag_size
	var bag_y = bottom_y - bag_size
	bag_button = _glass_panel(layer, Vector2(bag_x, bag_y), Vector2(bag_size, bag_size), bag_size * 0.5, 0.62, 0.14)
	var bag_btn := Button.new()
	bag_btn.flat = true
	bag_btn.size = Vector2(bag_size, bag_size)
	bag_btn.pressed.connect(_open_inventory)
	bag_button.add_child(bag_btn)
	_solid_panel(bag_button, Vector2(bag_size, bag_size) * 0.5 - Vector2(_dp(9), _dp(7.5)), Vector2(_dp(18), _dp(15)), _dp(4), Color(0, 0, 0, 0), COL_CREAM, 0).add_theme_stylebox_override("panel", _outline_style(_dp(4)))
	_add_label(layer, "BAG", Vector2(bag_x - _dp(10), bag_y + bag_size + _dp(4)), Vector2(bag_size + _dp(20), _dp(12)), int(_dp(8)), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.45)).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	# Home indicator
	var home_w = _dp(120)
	_solid_panel(layer, Vector2((720.0 - home_w) * 0.5, _screen_h_dp_px() - _dp(9) - _dp(4)), Vector2(home_w, _dp(4)), _dp(2), Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.3))

func _on_thumbstick_input(event: InputEvent) -> void:
	var stick_size = thumbstick_base.size
	var center = stick_size * 0.5
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				thumbstick_dragging = true
				_thumbstick_drag_to(event.position)
			else:
				thumbstick_dragging = false
				_thumbstick_reset()
	elif event is InputEventMouseMotion and thumbstick_dragging:
		_thumbstick_drag_to(event.position)

func _thumbstick_drag_to(local_pos: Vector2) -> void:
	var stick_size = thumbstick_base.size
	var center = stick_size * 0.5
	var delta = local_pos - center
	var max_radius = _dp(34)
	if delta.length() > max_radius:
		delta = delta.normalized() * max_radius
	thumbstick_knob.position = center + delta - thumbstick_knob.size * 0.5
	# 8-way octant from the drag angle - matches the old D-pad's discrete
	# held-direction booleans so _handle_movement() needs no changes.
	move_up_held = false
	move_down_held = false
	move_left_held = false
	move_right_held = false
	if delta.length() > _dp(14): # dead zone near center
		var angle = delta.angle() # 0 = right, PI/2 = down (Godot's Y-down 2D space)
		var deg = fmod(rad_to_deg(angle) + 360.0, 360.0)
		move_right_held = deg <= 67.5 or deg > 292.5
		if deg > 22.5 and deg <= 157.5:
			move_down_held = true
		if deg > 112.5 and deg <= 247.5:
			move_left_held = true
		if deg > 202.5 and deg <= 337.5:
			move_up_held = true

func _thumbstick_reset() -> void:
	move_up_held = false
	move_down_held = false
	move_left_held = false
	move_right_held = false
	var stick_size = thumbstick_base.size
	thumbstick_knob.position = (stick_size - thumbstick_knob.size) * 0.5

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	_build_farm_view(layer)

	# HUD v2 - full-bleed world, floating glass chrome (see design_handoff_farm_hud/).
	_build_hud_scrims(layer)
	_build_hud_top(layer)
	_build_hud_rail(layer)
	_build_tool_belt(layer)
	_build_hud_controls(layer)
	_build_hud_toast(layer)

	# Kept for _log()/_refresh_tool_ui() compatibility - not part of the new
	# visible chrome (messages surface as toasts; the active tool is shown
	# by the tool belt's glow + the action button's sub-label instead).
	tool_label = Label.new()
	tool_label.visible = false
	layer.add_child(tool_label)
	log_label = Label.new()
	log_label.visible = false
	layer.add_child(log_label)

	_build_inventory_panel(layer)
	_build_map_panel(layer)
	_build_livestock_panel(layer)
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

# Restyled to match the glass HUD - a dim backdrop behind a rounded card,
# same visual language as every other floating surface, instead of the
# old flat unstyled box (a jarring "2015 dialog" moment on a player's
# very first launch, since this doubles as the Act 1 welcome screen).
func _build_act_banner(layer: CanvasLayer) -> void:
	act_banner = Panel.new()
	act_banner.position = Vector2.ZERO
	act_banner.size = Vector2(720, 1560)
	act_banner.visible = false
	act_banner.add_theme_stylebox_override("panel", _solid_style(Color(0.031, 0.047, 0.039, 0.7), 0))
	layer.add_child(act_banner)

	var card_w = 640.0
	var card_x = (720.0 - card_w) * 0.5
	var card := _glass_panel(act_banner, Vector2(card_x, 300), Vector2(card_w, 500), _dp(22), 0.7, 0.13)
	act_banner_title = _add_label(card, "", Vector2(24, 24), Vector2(card_w - 48, 40), 26, COL_CREAM)
	act_banner_body = _add_label(card, "", Vector2(24, 80), Vector2(card_w - 48, 340), 18, Color(COL_CREAM.r, COL_CREAM.g, COL_CREAM.b, 0.75))
	act_banner_body.autowrap_mode = TextServer.AUTOWRAP_WORD

	var continue_btn := _solid_panel(card, Vector2(24, 430), Vector2(card_w - 48, 56), _dp(15), COL_AMBER_DEEP)
	var continue_click := Button.new()
	continue_click.flat = true
	continue_click.size = continue_btn.size
	continue_click.pressed.connect(func(): act_banner.visible = false)
	continue_btn.add_child(continue_click)
	var continue_label := _add_label(continue_btn, "Continue", Vector2.ZERO, continue_btn.size, 20, Color(0.125, 0.094, 0.039))
	continue_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	continue_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER

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
	# Scrollable, same pattern as Upgrades below - each row now carries a
	# trend arrow and a market-reason line on top of the existing quality
	# breakdown, which no longer reliably fits 4 crops in a fixed-height box.
	var market_scroll := ScrollContainer.new()
	market_scroll.position = Vector2(20, 280)
	market_scroll.size = Vector2(640, 220)
	inventory_panel.add_child(market_scroll)
	market_rows_container = VBoxContainer.new()
	market_rows_container.custom_minimum_size = Vector2(620, 0)
	market_scroll.add_child(market_rows_container)

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

func _build_livestock_panel(layer: CanvasLayer) -> void:
	livestock_panel = Panel.new()
	livestock_panel.position = Vector2(20, 40)
	livestock_panel.size = Vector2(680, 1480)
	livestock_panel.visible = false
	layer.add_child(livestock_panel)

	_add_button(livestock_panel, "Close", Vector2(600, 10), Vector2(60, 40), func(): livestock_panel.visible = false)
	_add_label(livestock_panel, "Livestock Ranch", Vector2(20, 10), Vector2(400, 30), 24)
	_add_label(livestock_panel, "Feed comes from wheat/corn - its price rises and falls with theirs, so a grain shortage means pricier feed and pricier eggs/wool/milk/pork too.", Vector2(20, 50), Vector2(640, 50), 14, Color(0.7, 0.75, 0.7))

	var feed_row := HBoxContainer.new()
	feed_row.position = Vector2(20, 110)
	livestock_panel.add_child(feed_row)
	feed_label = Label.new()
	feed_label.custom_minimum_size = Vector2(420, 0)
	feed_row.add_child(feed_label)
	var buy_feed_btn := Button.new()
	buy_feed_btn.text = "Buy %d Feed" % FEED_BATCH_SIZE
	buy_feed_btn.pressed.connect(func():
		var cost = _feed_price_per_unit() * FEED_BATCH_SIZE
		if cash >= cost:
			cash -= cost
			feed_stock += FEED_BATCH_SIZE
			_log("Bought %d feed for $%d." % [FEED_BATCH_SIZE, cost])
			_play_sfx("success")
			_refresh_livestock_panel()
		else:
			_log("Need $%d for %d feed." % [cost, FEED_BATCH_SIZE])
			_play_sfx("error")
	)
	feed_row.add_child(buy_feed_btn)

	var livestock_scroll := ScrollContainer.new()
	livestock_scroll.position = Vector2(20, 160)
	livestock_scroll.size = Vector2(640, 1300)
	livestock_panel.add_child(livestock_scroll)
	livestock_rows_container = VBoxContainer.new()
	livestock_rows_container.custom_minimum_size = Vector2(620, 0)
	livestock_scroll.add_child(livestock_rows_container)

func _toggle_livestock_panel() -> void:
	livestock_panel.visible = not livestock_panel.visible
	if livestock_panel.visible:
		_refresh_livestock_panel()

func _refresh_livestock_panel() -> void:
	feed_label.text = "Feed in storage: %d  (buy price: $%d/unit)" % [feed_stock, _feed_price_per_unit()]

	for child in livestock_rows_container.get_children():
		child.queue_free()

	for key in LIVESTOCK_KEYS:
		var animal = LIVESTOCK[key]
		var row := VBoxContainer.new()
		var top_row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s  owned:%d  eats %d feed/day  buy $%d" % [animal["name"], livestock.get(key, 0), animal["feed_per_day"], animal["cost"]]
		label.custom_minimum_size = Vector2(420, 0)
		top_row.add_child(label)
		var buy_btn := Button.new()
		buy_btn.text = "Buy"
		buy_btn.pressed.connect(func():
			if cash >= animal["cost"]:
				cash -= animal["cost"]
				livestock[key] = livestock.get(key, 0) + 1
				_log("Bought a %s." % animal["name"])
				_play_sfx("success")
				_refresh_all()
			else:
				_log("Need $%d for a %s." % [animal["cost"], animal["name"]])
				_play_sfx("error")
		)
		top_row.add_child(buy_btn)
		row.add_child(top_row)

		var product = animal["product"]
		var amount = livestock_goods.get(product, 0)
		var sell_row := HBoxContainer.new()
		var sell_label := Label.new()
		var price = _livestock_sell_price(product)
		var livestock_spike_tag = ("  🔥 x%.1f (%dd)" % [active_event["multiplier"], active_event["days_left"]]) if (active_event.get("kind", "crop") == "livestock" and active_event.get("crop", "") == product) else ""
		sell_label.text = "  %s: %d in storage ($%d ea)%s" % [animal["product_name"], amount, price, livestock_spike_tag]
		sell_label.custom_minimum_size = Vector2(420, 0)
		sell_label.add_theme_font_size_override("font_size", 15)
		sell_row.add_child(sell_label)
		var sell_btn := Button.new()
		sell_btn.text = "Sell all"
		sell_btn.disabled = amount == 0
		sell_btn.pressed.connect(func():
			var earnings = amount * price
			cash += earnings
			lifetime_earned += earnings
			livestock_goods[product] = 0
			_log("Sold %d %s for $%d." % [amount, animal["product_name"], earnings])
			_play_sfx("success")
			_refresh_all()
		)
		sell_row.add_child(sell_btn)
		row.add_child(sell_row)
		livestock_rows_container.add_child(row)

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
const ACT_ROMAN := ["I", "II", "III", "IV"]

func _refresh_all() -> void:
	var owned_count = _owned_count()
	var owned_frac = float(owned_count) / float(regions.size())
	hud_cash.text = "%d" % cash
	hud_day.text = "DAY %d" % day
	hud_season.text = "%s %d/%d" % [_season_name(), season_day + 1, SEASON_LENGTH]
	forecast_today_label.text = "%s today" % WEATHER[current_weather]["name"]
	forecast_tomorrow_label.text = WEATHER[forecast_weather]["name"]

	act_roman_label.text = "ACT %s" % ACT_ROMAN[current_act]
	hud_act.text = ACTS[current_act]["title"]
	hud_dom.text = "%d%% owned" % int(round(100.0 * owned_frac))
	act_progress_fill.size = Vector2(act_progress_track_w * clamp(owned_frac, 0.0, 1.0), act_progress_fill.size.y)

	var terrain = _terrain_for_plot(active_plot_id)
	act_farmname_label.text = "%s%s" % [_plot_display_name(active_plot_id), "" if active_plot_id == "home" else " (%s)" % terrain]
	var tier_text = _farm_tier_name().to_upper()
	act_tier_label.text = tier_text
	act_tier_badge.size.x = max(_dp(70), tier_text.length() * _dp(6.4) + _dp(14))

	var livestock_total = _livestock_total()
	if livestock_total > 0:
		var feed_needed_per_day = _feed_needed_per_day()
		var feed_warning = "  ⚠ low feed" if feed_stock < feed_needed_per_day else ""
		hud_farm.text = "🐄 %d livestock, feed:%d%s" % [livestock_total, feed_stock, feed_warning]
	else:
		hud_farm.text = ""

	var badge_count = _shop_badge_count()
	if shop_badge_label:
		shop_badge_label.get_parent().visible = badge_count > 0
		shop_badge_label.text = "9+" if badge_count > 9 else str(badge_count)

	map_button.visible = _act()["continents"].size() > 0
	_refresh_tool_ui()
	_refresh_inventory_panel()
	if map_panel and map_panel.visible:
		_refresh_map_panel()
	if livestock_panel and livestock_panel.visible:
		_refresh_livestock_panel()

# Number of distinct sellable stock types currently in storage (produce,
# processed goods, livestock goods) - shown as the SHOP rail tile's badge,
# a genuinely useful "things you could go sell" count rather than the
# design spec's static placeholder "2".
func _shop_badge_count() -> int:
	var count := 0
	for key in CROP_KEYS:
		if _produce_total(key) > 0:
			count += 1
	for key in PROCESSED_KEYS:
		if processed_goods[key] > 0:
			count += 1
	for key in LIVESTOCK_PRODUCT_KEYS:
		if livestock_goods[key] > 0:
			count += 1
	return count

func _refresh_tool_ui() -> void:
	tool_label.text = "Tool: %s %s" % [TOOLS[selected_tool]["emoji"], TOOLS[selected_tool]["name"]]
	if action_sublabel:
		action_sublabel.text = TOOLS[selected_tool]["name"]
	for child in tool_row.get_children():
		child.queue_free()
	tool_buttons.clear()
	var card_h = _dp(74)

	var unlocked_count = TOOL_KEYS.filter(func(k): return _tool_unlocked(k)).size()
	var rows = int(ceil(float(unlocked_count) / float(tool_row.columns)))
	var belt_h = rows * card_h + max(0, rows - 1) * _dp(9)
	tool_row.position.y = tool_belt_bottom_y - belt_h
	tool_row.size.y = belt_h
	if toast_panel:
		toast_panel.position.y = tool_row.position.y - _dp(20) - toast_panel.size.y

	for key in TOOL_KEYS:
		if not _tool_unlocked(key):
			continue
		var t = TOOLS[key]
		var card := Panel.new()
		card.custom_minimum_size = Vector2(0, card_h)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.add_theme_stylebox_override("panel", _glass_style(0.62, _dp(18), 0.11))
		var btn := Button.new()
		btn.flat = true
		btn.anchor_right = 1.0
		btn.anchor_bottom = 1.0
		btn.pressed.connect(func(): _select_tool(key))
		card.add_child(btn)
		var glyph := _add_label(card, t["emoji"], Vector2(0, card_h * 0.5 - _dp(22)), Vector2.ZERO, int(_dp(20)), COL_CREAM)
		glyph.size = Vector2(0, _dp(24))
		glyph.anchor_right = 1.0
		glyph.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var name_label := _add_label(card, t["name"], Vector2(0, card_h * 0.5 + _dp(4)), Vector2.ZERO, int(_dp(11.5)), COL_CREAM)
		name_label.size = Vector2(0, _dp(16))
		name_label.anchor_right = 1.0
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		if key == selected_tool:
			var glow_sb := StyleBoxFlat.new()
			glow_sb.bg_color = Color(0, 0, 0, 0)
			glow_sb.set_corner_radius_all(int(_dp(18)))
			glow_sb.set_border_width_all(2)
			glow_sb.border_color = COL_AMBER
			glow_sb.shadow_color = Color(COL_AMBER.r, COL_AMBER.g, COL_AMBER.b, 0.55)
			glow_sb.shadow_size = int(_dp(10))
			var glow := Panel.new()
			glow.anchor_right = 1.0
			glow.anchor_bottom = 1.0
			glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
			glow.add_theme_stylebox_override("panel", glow_sb)
			card.add_child(glow)
		tool_row.add_child(card)
		tool_buttons[key] = card

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
		var spike_tag = ("  🔥 x%.1f (%dd)" % [active_event["multiplier"], active_event["days_left"]]) if (active_event.get("kind", "crop") == "crop" and active_event.get("crop", "") == key) else ""
		var total = _produce_total(key)
		label.text = "%s  seeds:%d  produce:%d/%d  $%d base %s" % [crop["name"], seeds[key], total, storage_cap, eff_price, _trend_arrow(key)] + spike_tag
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
			oversupply_pressure[key] = min(2.0, oversupply_pressure.get(key, 0.0) + amount * OVERSUPPLY_PER_UNIT)
			_log("Sold %d %s for $%d." % [amount, crop["name"], earnings])
			_play_sfx("success")
			_check_act_progress()
			_refresh_all()
		)
		top_row.add_child(sell_btn)
		row.add_child(top_row)
		var reason_label := Label.new()
		reason_label.text = "  " + _market_reason(key)
		reason_label.add_theme_font_size_override("font_size", 13)
		reason_label.add_theme_color_override("font_color", Color(0.65, 0.7, 0.8))
		row.add_child(reason_label)
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
			label.text = "%d %s -> 1 %s (sells $%d)" % [recipe["input_amount"], CROPS[key]["name"], recipe["product_name"], _effective_processed_price(key)]
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
			var source_key = ""
			for key in CROP_KEYS:
				if PROCESSING[key]["product"] == product:
					source_key = key
					break
			var price = _effective_processed_price(source_key)
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
				# Processed goods still come from the source crop's supply, just
				# at half weight since converting it already took the raw units
				# out of the produce market.
				oversupply_pressure[source_key] = min(2.0, oversupply_pressure.get(source_key, 0.0) + amount * OVERSUPPLY_PER_UNIT * 0.5)
				_log("Sold %d %s for $%d." % [amount, product.capitalize(), earnings])
				_play_sfx("success")
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
		"oversupply_pressure": oversupply_pressure, "world_supply_index": world_supply_index,
		"livestock": livestock, "feed_stock": feed_stock, "livestock_goods": livestock_goods,
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
	oversupply_pressure = parsed.get("oversupply_pressure", oversupply_pressure)
	world_supply_index = parsed.get("world_supply_index", world_supply_index)
	for key in CROP_KEYS:
		if not oversupply_pressure.has(key):
			oversupply_pressure[key] = 0.0
		if not world_supply_index.has(key):
			world_supply_index[key] = 1.0
	livestock = parsed.get("livestock", livestock)
	for key in LIVESTOCK_KEYS:
		if not livestock.has(key):
			livestock[key] = 0
	feed_stock = int(parsed.get("feed_stock", feed_stock))
	livestock_goods = parsed.get("livestock_goods", livestock_goods)
	for key in LIVESTOCK_PRODUCT_KEYS:
		if not livestock_goods.has(key):
			livestock_goods[key] = 0
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
	if not active_event.is_empty():
		var event_valid = active_event.has("crop")
		if event_valid:
			event_valid = (active_event.get("kind", "crop") == "livestock" and LIVESTOCK_PRODUCT_KEYS.has(active_event["crop"])) \
				or (active_event.get("kind", "crop") == "crop" and CROPS.has(active_event["crop"]))
		if not event_valid:
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
	oversupply_pressure = {"wheat": 0.0, "corn": 0.0, "tomato": 0.0, "pumpkin": 0.0}
	world_supply_index = {"wheat": 1.0, "corn": 1.0, "tomato": 1.0, "pumpkin": 1.0}
	livestock = {"chicken": 0, "sheep": 0, "cow": 0, "pig": 0}
	feed_stock = 0
	livestock_goods = {"eggs": 0, "wool": 0, "milk": 0, "pork": 0}
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
	livestock_panel.visible = false
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
