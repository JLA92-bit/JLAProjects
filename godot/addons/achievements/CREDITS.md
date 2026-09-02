# Achievements addon credits

`addons/achievements/` is "Godot Paradise Achievements" by BananaHolograma
(MIT licensed, see `LICENSE.md`), sourced from
https://github.com/BananaHolograma/Achievements. Provides local, save-file-
backed achievement tracking (`unlock_achievement()`, `update_achievement()`,
signals on unlock) with no external service - see the achievement list and
unlock call sites in `scripts/Main.gd` (search `_achv()`).

Two deviations from the upstream file as-is:

- `achievements.gd`'s config (which JSON file to read, where to save
  progress, the save file's encryption password) is normally read from
  ProjectSettings entries that its `plugin.gd` EditorPlugin writes the
  first time the addon is enabled via the editor's Plugins tab. This
  project never runs that EditorPlugin - `plugin.cfg`/`plugin.gd` are kept
  here only for reference/provenance, not actually used - so those getters
  are hardcoded directly in this copy of `achievements.gd` instead (see
  the comment at the top of that file).
- The addon is meant to be registered as a Godot autoload
  ([autoload] in project.godot), which is how its README documents using
  it (a bare `GodotParadiseAchievements` global identifier). That hit
  something seriously broken in this specific project: with an
  `[autoload]` entry present, no entry in that section ever actually
  registered at all - confirmed by adding a second, trivial one-line dummy
  autoload alongside it, which also silently never appeared as a child of
  the scene tree root, even after clearing every Godot cache and rebuilding
  from scratch. The root cause was never isolated. Worked around by not
  using `[autoload]` at all - `_achv()` in `scripts/Main.gd` lazily
  instantiates `achievements.tscn` as a child of the Main node itself on
  first use instead, which every other call site in `Main.gd` goes through
  rather than referencing a global autoload name directly.

The achievement template (`data/achievements.json`, `res://data/
achievements.json`) is this project's own content, not part of the addon.
