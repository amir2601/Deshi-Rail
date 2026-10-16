# Deshi Rail

A pixel-art, real-time simulation of the **Kamalapur → Khulna** intercity train
journey across Bangladesh. Everything — the train, the stations, the passengers,
the villages, the Jamuna river bridge, the kash-phool chars and the paddy fields
of the south-west — is drawn procedurally on a 320×180 canvas and upscaled with
nearest-neighbour scaling, giving a crisp, hand-made pixel look.

## Project structure

The site is split into small, ordered modules with no build step and no
dependencies. All art is generated at runtime — there are no external images,
fonts or third-party scripts.

```
index.html              markup (<canvas> + toolbar) and script tags
css/styles.css          page + toolbar styling and responsive layout
js/01-config.js         tunable constants, the route and the timetable
js/02-palette.js        the 32-colour palette and the day/dusk/night remaps
js/03-drawing.js        pixel drawing helpers and the 3x5 bitmap font
js/04-train.js          locomotive, carriages, wheels, doors and exhaust
js/05-world.js          scenery props, tiles and per-lighting sprite baking
js/06-terrain.js        the five landscape sections and their live entities
js/07-stations.js       station layout, boards, roofs, props and backdrops
js/08-people.js         passenger sprites, crowds and boarding behaviour
js/09-journey.js        the automatic (WATCH) journey state machine
js/10-drive-mode.js     the manual (DRIVE) driving model and timetable
js/11-atmosphere.js     sky, sun/moon/stars, glow, weather, rain and shake
js/12-ui-audio-input.js HUD, banner, panel, title card, map, audio and input
js/13-main.js           buffers, lighting variants, the frame loop and boot
serve.mjs               optional dependency-free static server
```

The modules are plain **classic scripts** loaded in order, so top-level
`const`/`function` declarations are shared across all of them, exactly as if the
program were one file. Each file repeats `'use strict';` because every classic
script is its own compilation unit.

## Running it

Open `index.html` directly in any modern browser, or serve the folder over HTTP:

```
node serve.mjs        # http://localhost:8080 (optional custom port as an arg)
npx serve .           # any other static server works too
```

No build step and no network connection are required.

## Controls

On load you get a **title card**. Choose **WATCH** (a cinematic, automatic ride)
or **DRIVE** (take the controls yourself) with the on-screen buttons, or press
`←`/`→` to choose and `Enter`/`Space` to confirm. `C` jumps straight into DRIVE.

The toolbar under (or beside) the picture holds every control; each also has a
keyboard shortcut:

| Button | Key | Action |
| --- | --- | --- |
| AUTO / DRIVE | `C` | Toggle driver mode (WATCH ↔ DRIVE) |
| START | `E` | Start / stop the engine |
| FWD / REV | `R` | Reverse / forward |
| POWER | `↑` | Power up / release brake |
| BRAKE | `↓` | Power down / brake (`B` = emergency) |
| OPEN | `O` | Open the doors |
| HORN | `H` | Horn (hold) |
| LIGHT | `L` | Headlight |
| PAUSE | `P` / `Space` | Pause |
| 1x / 2x / 4x | `1` `2` `4` | Simulation speed (WATCH mode) |
| NEXT | `N` | Skip to the next station |
| TIME | `T` | Time of day: AUTO / DAY / DUSK / NIGHT |
| RAIN | `W` | Weather: AUTO / rain |
| TAP | `M` | Mute / unmute sound |
| — | `F` | Hold to fast-forward |

Debug overlay: `D`.

Links ending in `#watch` or `#drive` open straight into the trip, skipping the
title card.

## Features

- **Fixed 320×180 pixel canvas** with nearest-neighbour scaling and a
  Bayer-dithered 32-colour palette; a full day/night cycle cross-fades the entire
  palette, plus additive window/lamp/headlight glow.
- **All 39 real stations** with English + Bangla names, station boards, roofs,
  crowds, boarding and a guard's departure flag.
- **Parallax scenery** (clouds, far, mid, track, foreground) across five
  procedurally generated landscape sections — village paddies and ponds, a river
  with a steel truss bridge, kash-phool chars, tea gardens and wooded hills — all
  with swaying plants, animals, boats, rickshaws and people. The Kamalapur →
  Khulna run uses the fields, the Jamuna crossing and the kash chars.
- **A full driving model** in DRIVE mode: 8 power notches, 4 brake steps plus
  emergency, inertia, drag and a timetabled schedule with on-time scoring.
- **Living details:** exhaust smoke, rain and lightning, birds, fishing with cast
  nets, shimmering water, bridge reflections, horn waves and a chugging audio bed
  generated with the Web Audio API.
- **Responsive layout:** the toolbar sits under the picture in portrait and beside
  it on wide screens, with safe-area padding for notched devices. Low-end devices
  automatically drop to lighter particle budgets.

## Verification

Every module parses cleanly, and the site loads with no console errors over both
`file://` and HTTP. Rendering is deterministic apart from animation and particle
timing: two headless captures of the same viewport differ by ~2% of pixels, which
is the animation clock at the instant of capture, not layout or styling.
