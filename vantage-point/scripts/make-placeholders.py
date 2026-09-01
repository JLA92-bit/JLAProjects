#!/usr/bin/env python3
"""Generates clearly-labeled placeholder scene art (SVG) for each level.

Not final art. Swap scenes/level-N.svg for a real photo/photo-realistic
image (level-N.jpg) and update data/case.json's "image" field per level.
"""
import json
import os

SCENES = [
    {"n": 1, "title": "THE STUDY", "sub": "Hargrove Gallery - Private Study", "bg": ("#2b2420", "#171310")},
    {"n": 2, "title": "THE GALLERY FLOOR", "sub": "Main Exhibition Hall", "bg": ("#241f2b", "#120f17")},
    {"n": 3, "title": "THE LOADING ALLEY", "sub": "Service Entrance", "bg": ("#1c2420", "#0d1210")},
    {"n": 4, "title": "ELENA'S OFFICE", "sub": "Co-Director's Office", "bg": ("#2b201f", "#150f0e")},
    {"n": 5, "title": "THE CAR", "sub": "Long-Term Parking - Level 2", "bg": ("#20232b", "#0f1015")},
]

W, H = 1200, 1600

TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{c1}"/>
      <stop offset="1" stop-color="{c2}"/>
    </linearGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#bg)"/>
  <rect width="{w}" height="{h}" fill="url(#grid)"/>
  <rect x="0" y="0" width="{w}" height="{h}" fill="none" stroke="#c9932f" stroke-opacity="0.25" stroke-width="10"/>
  <text x="{cx}" y="{ty1}" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#e8dcc0" fill-opacity="0.85" letter-spacing="4">{title}</text>
  <text x="{cx}" y="{ty2}" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#c9932f" fill-opacity="0.8">{sub}</text>
  <text x="{cx}" y="{ty3}" text-anchor="middle" font-family="monospace" font-size="22" fill="#ffffff" fill-opacity="0.35">PLACEHOLDER SCENE - LEVEL {n}</text>
  <text x="{cx}" y="{ty4}" text-anchor="middle" font-family="monospace" font-size="20" fill="#ffffff" fill-opacity="0.3">replace with scenes/level-{n}.jpg</text>
  <circle cx="{cx}" cy="{h2}" r="220" fill="none" stroke="#c9932f" stroke-opacity="0.12" stroke-width="2"/>
  <circle cx="{cx}" cy="{h2}" r="360" fill="none" stroke="#c9932f" stroke-opacity="0.08" stroke-width="2"/>
</svg>"""

out_dir = os.path.join(os.path.dirname(__file__), "..", "scenes")
os.makedirs(out_dir, exist_ok=True)

for s in SCENES:
    svg = TEMPLATE.format(
        w=W, h=H, c1=s["bg"][0], c2=s["bg"][1],
        cx=W // 2, ty1=H // 2 - 40, ty2=H // 2 + 20, ty3=H // 2 + 90, ty4=H // 2 + 125,
        h2=H // 2, title=s["title"], sub=s["sub"], n=s["n"],
    )
    path = os.path.join(out_dir, f"level-{s['n']}.svg")
    with open(path, "w") as f:
        f.write(svg)
    print("wrote", path)
