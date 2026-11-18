# Make GTA 6 — Solmar Heat

An original 3D open-world crime game built for the make.fun GTA 6 bounty. Dana Vega
owes loan shark Marlow $2,000 by sundown, and the only way to pay is to run three jobs
for Ilsa at the harbor: steal cars, dodge the Solmar PD, and finish the Harbor Run
before the city eats her.

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Zikri167/makefun-gta6-01/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Zikri167/makefun-gta6-01/reward.svg)](https://make.fun/c/gta6-01)

## The game

Solmar Bay is a sun-soaked coastal city on a 7×7 road grid: downtown towers, a park
plaza, a beach and the sea. Everything is original — the city, the characters, the
cars, the story, the art and the sounds. No names, art or music from any commercial
game.

- **On foot and by car** — walk and run with an orbit camera, or steal any parked or
  traffic car with E and drive it with arcade handling and a chase camera.
- **Traffic and pedestrians** — cars drive the road graph in the right-hand lane and
  slow for the car ahead; pedestrians stroll the sidewalks and run from speeding cars
  and gunshots.
- **Wanted level** — stealing a car, knocking a pedestrian down or shooting at the PD
  raises the heat to five stars; police cars spawn to match and chase, ram and try to
  bust Dana on foot. Quiet time cools the heat back down.
- **Three story missions** — The Pickup, Hot Wheels (steal the orange Comet GT and
  lose the cops), and the timed Harbor Run — each with a beacon in the world, an
  objective on the HUD and a cash payout.
- **Combat** — a hitscan pistol on foot, with a tracer and consequences.
- **HUD and minimap** — cash, health, wanted stars, mission objective with distance,
  speed, and a live 2D minimap with traffic, police and the job marker.
- **Start screen, pause, Busted/Wasted, and a save** — progress (cash, jobs done,
  mute) is stored in localStorage and the title screen offers Continue.
- **Sound** — engine hum, sirens, shots, crashes and mission jingles, all synthesized
  live with WebAudio. No audio files.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

WASD move / drive · mouse drag camera · E steal / exit car · click shoot (on foot) ·
Shift run · P pause · M mute.

## How it is built

Plain static files under `game/` — `index.html` plus ES modules in `game/src/`, one
file per job (`city.js`, `vehicles.js`, `pedestrians.js`, `player.js`, `wanted.js`,
`missions.js`, `combat.js`, `hud.js`, `audio.js`, `save.js`, `shots.js`, `main.js`) —
with three.js vendored as minified builds under `game/vendor/three/`. No build step,
no network request while playing. `main.ts` hands the game in as `/output` with
`dossier.json`, and `screenshots/` holds four frames taken from the game itself
(`?shot=chase|street|mission|start` stages them deterministically).
