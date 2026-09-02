extends Node

signal achievement_unlocked(name: String, achievement: Dictionary)
signal achievement_updated(name: String, achievement: Dictionary)
signal achievement_reset(name: String, achievement: Dictionary)
signal all_achievements_unlocked

@onready var http_request: HTTPRequest = $HTTPRequest
# Upstream reads its config (source file path, save location, password) from
# ProjectSettings, normally written by its EditorPlugin the first time it's
# enabled via the editor's Plugins tab - this project never runs that, so
# these were instead hand-written into project.godot as a custom section.
# That hit a real Godot project.godot parsing quirk: a custom top-level
# section placed immediately before [autoload] never loads into
# ProjectSettings at all (confirmed via a minimal throwaway-project repro),
# and even moved after [autoload] it's still not loaded yet by the time
# this autoload's own _ready() runs, since Godot instantiates [autoload]
# entries synchronously while still parsing the rest of the file. Simplest
# robust fix: skip ProjectSettings entirely and hardcode the config here -
# nothing in this project needs it configurable at runtime anyway.

var current_achievements: Dictionary = {}
var unlocked_achievements: Dictionary = {}
var achievements_keys: PackedStringArray = []

## Basic achievement dictionary structure
# "achievement-name": {
#		"name": "MY achievement",
#		"description": "This is my awesome achievement",
#		"is_secret": false,
#		"count_goal": 25,
#		"current_progress": 0.0,
#		"icon_path": "res://assets/icon/my-achievement.png",
#		"unlocked": false,
#		"active": true
#	}

func _ready():
	http_request.request_completed.connect(_on_request_completed)
	achievement_updated.connect(_on_achievement_updated)
	achievement_unlocked.connect(_on_achievement_updated)
	
	_create_save_directory(_save_directory())
	_prepare_achievements()


func get_achievement(name: String) -> Dictionary:
	if current_achievements.has(name):
		return current_achievements[name]
	
	return {}

func update_achievement(name: String, data: Dictionary) -> void:
	if current_achievements.has(name):
		current_achievements[name].merge(data, true)
		
		achievement_updated.emit(name, data)
		

func unlock_achievement(name: String) -> void:
	if current_achievements.has(name):
		var achievement: Dictionary = current_achievements[name]
		if not achievement["unlocked"]:
			achievement["unlocked"] = true
			unlocked_achievements[name] = achievement
			achievement_unlocked.emit(name, achievement)


func reset_achievement(name: String, data: Dictionary = {}) -> void:
	if current_achievements.has(name):
		current_achievements[name].merge(data, true)
		current_achievements[name]["unlocked"] = false
		current_achievements[name]["current_progress"] = 0.0
		
		if unlocked_achievements.has(name):
			unlocked_achievements.erase(name)
			
		achievement_reset.emit(name, current_achievements[name])
		achievement_updated.emit(name, current_achievements[name])


func _read_from_local_source() -> void:
	var local_source_file = _local_source_file_path()

	if FileAccess.file_exists(local_source_file):
		var content = JSON.parse_string(FileAccess.get_file_as_string(local_source_file))
		if content == null:
			push_error("GodotEssentials2DPlugin: Failed reading achievement file {path}".format({"path": local_source_file}))
			return
			
		current_achievements = content
		achievements_keys = current_achievements.keys()
		

func _read_from_remote_source() -> void:
	if _is_valid_url(_remote_source_url()):
		http_request.request(_remote_source_url())
		await http_request.request_completed


func _create_save_directory(path: String) -> void:
	DirAccess.make_dir_absolute(path)


func _prepare_achievements() -> void:
	_read_from_local_source()
	_read_from_remote_source()
	_sync_achievements_with_encrypted_saved_file()
	
	for key in current_achievements.keys():
		if current_achievements[key]["unlocked"]:
			unlocked_achievements[key] = current_achievements[key]


func _sync_achievements_with_encrypted_saved_file() -> void:
	var saved_file_path = _encrypted_save_file_path()
	
	if FileAccess.file_exists(saved_file_path):
		var content = FileAccess.open_encrypted_with_pass(saved_file_path, FileAccess.READ, _get_password())
		if content == null:
			push_error("GodotParadiseAchievements: Failed reading saved achievement file {path} with error {error}".format({"path": saved_file_path, "error": FileAccess.get_open_error()}))
			return
			
		var achievements = JSON.parse_string(content.get_as_text())
		if achievements:
			current_achievements.merge(achievements, true)


func _check_if_all_achievements_are_unlocked() -> bool:
	var all_unlocked = unlocked_achievements.size() == current_achievements.size()
	
	if all_unlocked:
		all_achievements_unlocked.emit()
		
	return all_unlocked


func _update_encrypted_save_file() -> void:
	if current_achievements.is_empty():
		return
	
	var saved_file_path = _encrypted_save_file_path()

	var file = FileAccess.open_encrypted_with_pass(saved_file_path, FileAccess.WRITE, _get_password())
	if file == null:
		push_error("GodotParadiseAchievements: Failed writing saved achievement file {path} with error {error}".format({"path": saved_file_path, "error": FileAccess.get_open_error()}))
		return
	
	file.store_string(JSON.stringify(current_achievements))
	file.close()


func _local_source_file_path() -> String:
	return "res://data/achievements.json"


func _remote_source_url() -> String:
	return "" # no remote source - _is_valid_url("") is false, so _read_from_remote_source() is a no-op


func _save_directory() -> String:
	return "user://"


func _encrypted_save_file_path() -> String:
	return "{dir}achievements.json".format({"dir": _save_directory()})


func _get_password() -> String:
	return "farmworld-achv-2026" # "minimal security practices" per the addon's own README - this only deters casual save-file editing, not real tampering


func _is_valid_url(url: String) -> bool:
	var regex = RegEx.new()
	var url_pattern = "/(https:\\/\\/www\\.|http:\\/\\/www\\.|https:\\/\\/|http:\\/\\/)?[a-zA-Z]{2,}(\\.[a-zA-Z]{2,})(\\.[a-zA-Z]{2,})?\\/[a-zA-Z0-9]{2,}|((https:\\/\\/www\\.|http:\\/\\/www\\.|https:\\/\\/|http:\\/\\/)?[a-zA-Z]{2,}(\\.[a-zA-Z]{2,})(\\.[a-zA-Z]{2,})?)|(https:\\/\\/www\\.|http:\\/\\/www\\.|https:\\/\\/|http:\\/\\/)?[a-zA-Z0-9]{2,}\\.[a-zA-Z0-9]{2,}\\.[a-zA-Z0-9]{2,}(\\.[a-zA-Z0-9]{2,})?/g"
	regex.compile(url_pattern)
	
	return regex.search(url) != null

func _on_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if result == HTTPRequest.RESULT_SUCCESS:
		var content = JSON.parse_string(body.get_string_from_utf8())
		if content:
			current_achievements.merge(content, true)
		return
	
	push_error("GodotParadiseAchievements: Failed request with code {code} to remote source url from achievements: {body}".format({"body": body, "code": response_code}))


func _on_achievement_updated(_name: String, _achievement: Dictionary) -> void:
	_update_encrypted_save_file()
	_check_if_all_achievements_are_unlocked()
