# Font credits

- `emoji_fallback.ttf` — a subset of Google's "Noto Emoji" (monochrome
  variant, not the color "Noto Color Emoji"), OFL licensed
  (SIL Open Font License 1.1, Copyright 2013 Google LLC), sourced from
  the `google/fonts` GitHub repo (`ofl/notoemoji/NotoEmoji[wght].ttf`).
  Pinned to its Regular (wght=400) static instance and subsetted down to
  only the 21 emoji glyphs this game actually uses (weather icons, tool
  icons, and a handful of UI accents) via `fonttools`, shrinking it from
  ~2MB to ~15KB.

  Registered as a project-wide fallback font (see `_apply_emoji_font_fallback()`
  in `scripts/Main.gd`, called first thing in `_ready()`) rather than a
  color emoji font, because Godot's font rendering support for color font
  formats (COLR/CBDT) is inconsistent across rendering backends - a plain
  monochrome vector font is guaranteed to render identically everywhere,
  including the Web export, where Godot's built-in default font has no
  emoji glyphs at all and was rendering them as literal Unicode-codepoint
  fallback text (e.g. "0 1F 528") instead of an icon.
