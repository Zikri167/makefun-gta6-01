# Make GTA 6 — Solmar Heat

Built for the make.fun GTA 6 bounty — $1,666 prize pool, 100 prize places.

An original 3D open-world crime game built for the make.fun GTA 6 bounty. Dana Vega
owes loan shark Marlow $2,000 by sundown, and the only way to pay is to run four jobs
for Ilsa at the harbor: steal cars, dodge the Solmar PD, and finish the SUNDOWN finale
inside Marlow's office before the city eats her.

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
- **Four story missions** — The Pickup, Hot Wheels (steal the orange Comet GT and
  lose the cops), the timed Harbor Run, and the SUNDOWN finale: collect Marlow's
  $2,000 at the harbor, make two drops across town at dusk with three stars already
  on you, then walk the money into his downtown office and hand it over at his desk.
  Each job has a beacon in the world, an objective on the HUD and a cash payout.
- **Enterable interiors** — walk into a glowing doorway to step inside Marlow's
  office downtown or the garage in the north-east corner; the cops cannot follow
  you in, and the heat cools while you hide. Press E (or the exit marker) to step
  back out onto the street.
- **Dusk** — the finale plays at sundown: a low orange sun, a purple-orange sky,
  fog closing in and the street lamps burning brighter. Try `?shot=night` for a
  dusk chase down Marina Avenue.
- **Combat** — a hitscan pistol on foot, with a tracer and consequences.
- **HUD and minimap** — cash, health, wanted stars, mission objective with distance,
  speed, and a live 2D minimap with traffic, police and the job marker.
- **Start screen, pause, Busted/Wasted, and a save** — progress (cash, jobs done,
  mute) is stored in localStorage and the title screen offers Continue.
- **Sound** — engine hum, sirens, shots, crashes, door knocks and mission jingles,
  all synthesized live with WebAudio. No audio files.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

WASD move / drive · mouse drag camera · E steal / exit car / leave building ·
click shoot (on foot) · Shift run · P pause · M mute.

## How it is built

Plain static files under `game/` — `index.html` plus ES modules in `game/src/`, one
file per job (`city.js`, `vehicles.js`, `pedestrians.js`, `player.js`, `wanted.js`,
`missions.js`, `combat.js`, `hud.js`, `audio.js`, `save.js`, `shots.js`, `main.js`,
plus `interiors.js` for the enterable rooms and `dusk.js` for the time of day) —
with three.js vendored as minified builds under `game/vendor/three/`. No build step,
no network request while playing. `main.ts` hands the game in as `/output` with
`dossier.json`, and `screenshots/` holds four frames taken from the game itself
(`?shot=chase|street|mission|start` stages them deterministically; `?shot=night`
stages a fifth, dusk-chase scene you can open in the browser).
