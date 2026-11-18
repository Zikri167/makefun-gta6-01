// Solmar Heat: boot and the one loop. Input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves between
// four screens: title, play, paused and busted/wasted.
//
// ?seed=N fixes the city. ?shot=start|chase|street|mission|night (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import * as THREE from 'three';
import { makeRandom, clamp } from './random.js';
import { createCity } from './city.js';
import {
  createCarMesh, createTraffic, createParkedCars, updateTraffic,
} from './vehicles.js';
import { createPedestrians, updatePedestrians, getCorners } from './pedestrians.js';
import { createPlayer, resetPlayer, updatePlayer, updateCamera, nearestStealable, enterCar, exitCar } from './player.js';
import { createWanted, addWanted, clearWanted, updateWanted, healPlayer } from './wanted.js';
import {
  createMissions, currentMission, startMission, updateMissions, missionObjectiveText,
  missionDistance, missionMarker,
} from './missions.js';
import { createCombat, fireWeapon, updateCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { defaultSave, loadSave, writeSave, clearSave } from './save.js';
import { createInteriors, updateInteriorDoors, interiorById } from './interiors.js';
import { setTimeOfDay } from './dusk.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const TRAFFIC_COUNT = 10;
const PARKED_COUNT = 8;
const PED_COUNT = 14;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7d9);
scene.fog = new THREE.Fog(0x9fc3dd, 120, 320);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);

const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
sun.position.set(80, 140, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.camera.far = 420;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a7a5a, 1.1);
scene.add(hemi);

// --- The world -------------------------------------------------------------
const random = makeRandom(seed);
const city = createCity(scene, seed);
const corners = getCorners();
const game = {
  scene, camera, renderer, city, random, corners, sun, hemi,
  now: 0,
  phase: 'menu',
  save: loadSave() ?? defaultSave(),
  cash: 0,
  flags: { stoleSports: false },
  traffic: [],
  parked: [],
  peds: [],
  sportsCar: null,
  player: null,
  wanted: null,
  missions: null,
  combat: null,
  interiors: null,
  interior: null,
  returnPos: null,
  activeColliders: null,
  roomBounds: null,
  doorCooldownUntil: 0,
  timeOfDay: 'day',
  audio: createAudio(),
  hud: createHud(),
  keys: {},
  look: { yaw: 0, pitch: 0 },
  dragging: false,
  saveTimer: 0,
  onEvent: null,
  onCrash: null,
  onBusted: null,
  onWasted: null,
};
game.cash = game.save.cash;

function buildDynamics() {
  game.traffic = createTraffic(scene, city, random, TRAFFIC_COUNT);
  game.parked = createParkedCars(scene, city, random, PARKED_COUNT);
  // The orange Comet GT for Job 2, parked on Marina Avenue (x = 0, z = -100).
  const sportsMesh = createCarMesh({ color: 0xff6a00, sports: true });
  sportsMesh.position.set(0, 0, -100);
  sportsMesh.rotation.y = Math.PI;
  scene.add(sportsMesh);
  game.sportsCar = { kind: 'parked', mesh: sportsMesh, heading: Math.PI, speed: 0, isSports: true };
  game.parked.push(game.sportsCar);
  game.peds = createPedestrians(scene, random, PED_COUNT);
}

function clearDynamics() {
  for (const car of [...game.traffic, ...game.parked]) scene.remove(car.mesh);
  for (const car of game.wanted.police) scene.remove(car.mesh);
  for (const ped of game.peds) scene.remove(ped.mesh);
  game.traffic = [];
  game.parked = [];
  game.peds = [];
  game.wanted.police = [];
  game.sportsCar = null;
}

game.player = createPlayer(scene);
game.wanted = createWanted();
game.missions = createMissions(scene);
game.combat = createCombat(scene);
game.interiors = createInteriors(scene);
buildDynamics();
resetPlayer(game.player, 0, 20);

// --- Interiors -------------------------------------------------------------
function enterInterior(id) {
  const room = interiorById(game.interiors, id);
  if (!room) return;
  game.returnPos = game.player.pos.clone();
  game.interior = id;
  game.player.pos.set(room.def.inside.x, 0, room.def.inside.z);
  game.player.mesh.position.copy(game.player.pos);
  game.player.camDistance = 4.5;
  game.activeColliders = room.colliders;
  game.roomBounds = room.bounds;
  game.doorCooldownUntil = game.now + 1.5;
  game.audio.door();
  game.hud.feed(room.def.enterText);
}

function exitInterior() {
  if (!game.interior) return;
  const room = interiorById(game.interiors, game.interior);
  // Land on the room's exit drop, a few metres clear of the portal — landing on
  // the exact entry point would suck Dana straight back inside once the door
  // cooldown ends. Fall back to where she entered if a room has no drop point.
  const drop = room ? room.def.exitDrop : null;
  if (drop) {
    game.player.pos.set(drop.x, 0, drop.z);
    game.player.mesh.position.copy(game.player.pos);
  } else if (game.returnPos) {
    game.player.pos.copy(game.returnPos);
    game.player.mesh.position.copy(game.player.pos);
  }
  game.interior = null;
  game.returnPos = null;
  game.activeColliders = null;
  game.roomBounds = null;
  game.player.camDistance = 7.5;
  game.doorCooldownUntil = game.now + 1.5;
  game.audio.door();
  game.hud.feed('Back on the street.');
}

game.enterInterior = enterInterior;
game.exitInterior = exitInterior;

game.onEvent = (stars, reason) => {
  game.hud.feed(reason);
};
game.onCrash = (strength) => {
  game.audio.crash(strength);
  if (strength > 9) game.hud.feed('Crash! The car is holding together — barely.');
};
game.onBusted = () => {
  if (game.phase !== 'play') return;
  game.phase = 'end';
  clearWanted(game.wanted);
  game.cash = Math.max(0, game.cash - 100);
  game.save.cash = game.cash;
  writeSave(game.save);
  game.audio.busted();
  game.hud.showEnd('BUSTED', 'The Solmar PD caught up with Dana. Bail cost $100 — the car is impounded, but the jobs are still waiting.');
};
game.onWasted = () => {
  if (game.phase !== 'play') return;
  game.phase = 'end';
  clearWanted(game.wanted);
  game.cash = Math.max(0, game.cash - 100);
  game.save.cash = game.cash;
  writeSave(game.save);
  game.audio.busted();
  game.hud.showEnd('WASTED', 'Dana is down. The harbor clinic patched her up for $100 — Marlow still wants his money.');
};

// --- Simulation ------------------------------------------------------------
function resetWorld() {
  clearDynamics();
  buildDynamics();
  clearWanted(game.wanted);
  resetPlayer(game.player, 0, 20);
  // Out of any interior, back to day: the sun resets with the day.
  game.interior = null;
  game.returnPos = null;
  game.activeColliders = null;
  game.roomBounds = null;
  game.doorCooldownUntil = 0;
  game.player.camDistance = 7.5;
  setTimeOfDay(game, 'day');
  game.now = 0;
  game.flags.stoleSports = false;
  game.missions.activeIndex = Math.min(game.save.missionIndex, 3);
  game.missions.stepIndex = 0;
  game.missions.started = false;
  game.missions.done = false;
  game.missions.beacon.visible = false;
  game.missions.ring.visible = false;
}

game.resetWorld = resetWorld;

game.putPlayerInCarNear = (x, z, heading) => {
  const car = game.parked[0] || game.traffic[0];
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  enterCar(game.player, car, game.traffic, game.parked);
  game.player.carSpeed = 12;
  game.player.camYaw = heading;
};

game.putPlayerInSportsCar = (x, z, heading) => {
  const car = game.sportsCar;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  enterCar(game.player, car, game.traffic, game.parked);
  game.player.carSpeed = 16;
  game.player.camYaw = heading;
};

game.syncPoliceNow = () => {
  updateWanted(game.wanted, scene, city, random, game.player, game, game.now, 0);
};

function playerForward() {
  const player = game.player;
  if (player.mode === 'drive' && player.car) {
    const heading = player.car.mesh.rotation.y;
    return { x: Math.sin(heading), z: Math.cos(heading) };
  }
  return { x: Math.sin(player.yaw), z: Math.cos(player.yaw) };
}

// Starting a job. The Harbor Run (job 3) starts hot: the PD is already out, and
// every drop raises the heat another star. SUNDOWN (job 4) starts hotter still —
// three stars, at dusk — and every step raises the heat.
function beginMission(index) {
  const mission = startMission(game.missions, index, game.now);
  if (index === 2) {
    addWanted(game.wanted, 2, 'Marlow wants his money tonight — the PD is already out.', game.now, game.onEvent);
  }
  if (index === 3) {
    setTimeOfDay(game, 'dusk');
    addWanted(game.wanted, 3, 'Sundown. Marlow’s money, three stars, no excuses.', game.now, game.onEvent);
  }
  return mission;
}

function step(dt, keys) {
  game.now += dt;
  const player = game.player;
  const motion = updatePlayer(player, keys, game, dt);
  updateTraffic(game.traffic, scene, city, random, player.pos, playerForward(), dt);
  const playerSpeed = player.mode === 'drive' ? Math.abs(player.carSpeed) : player.footSpeed;
  updatePedestrians(game.peds, corners, player.pos, playerSpeed, game.now, dt, random);
  const closestPolice = updateWanted(game.wanted, scene, city, random, player, game, game.now, dt);
  const missionEvent = updateMissions(game.missions, player, game.wanted, game.flags, game.now, dt);
  game.flags.stoleSports = false;
  if (missionEvent) {
    game.hud.feed(missionEvent);
    if (missionEvent.startsWith('MISSION COMPLETE')) {
      const mission = currentMission(game.missions);
      game.cash += mission.reward;
      game.save.cash = game.cash;
      game.save.jobsDone += 1;
      game.save.bestCash = Math.max(game.save.bestCash, game.cash);
      game.audio.missionDone();
      game.hud.banner('MISSION COMPLETE', `+$${mission.reward} — ${mission.title}`);
      if (game.missions.activeIndex < 3) {
        game.save.missionIndex = game.missions.activeIndex + 1;
        beginMission(game.save.missionIndex);
      } else {
        game.save.missionIndex = 3;
        game.audio.finale();
        game.hud.banner('ALL JOBS DONE', 'Marlow is paid. Solmar is yours, Dana.');
      }
      writeSave(game.save);
    } else if (missionEvent.startsWith('TIME UP')) {
      game.hud.banner('JOB FAILED', 'Out of time. Ilsa is not happy. Try again.');
    } else {
      game.audio.pickup();
      // Every Harbor Run and SUNDOWN drop raises the heat a star.
      if (game.missions.activeIndex >= 2) {
        addWanted(game.wanted, 1, 'The heat rises with every drop.', game.now, game.onEvent);
      }
    }
  }
  // Doorways run AFTER the mission check on purpose: a step that ends at a door
  // (SUNDOWN step 4) must register before the portal teleports Dana inside, or
  // the step would never see her at the door.
  if (player.mode === 'foot' && game.now >= game.doorCooldownUntil) {
    const door = updateInteriorDoors(game.interiors, player, game.interior);
    if (door === 'exit') exitInterior();
    else if (door) enterInterior(door);
  }
  updateCombat(game.combat, game.now);
  // Slow health regen when Dana has been out of trouble for a while.
  if (game.now - player.lastHurtAt > 8 && player.health > 0 && player.health < 100) {
    healPlayer(player, 2 * dt);
  }
  game.audio.engine(player.mode === 'drive' ? player.carSpeed : 0, player.mode === 'drive');
  game.audio.siren(game.wanted.stars, closestPolice);
  const look = { yaw: game.look.yaw, pitch: game.look.pitch };
  game.look.yaw = 0;
  game.look.pitch = 0;
  if (player.mode === 'drive') {
    player.orbitOffset = clamp(player.orbitOffset + look.yaw, -1.4, 1.4);
    look.yaw = 0;
  }
  updateCamera(player, camera, look, dt);
  game.saveTimer += dt;
  if (game.saveTimer > 10) {
    game.saveTimer = 0;
    game.save.cash = game.cash;
    writeSave(game.save);
  }
}

game.step = step;

game.hudState = () => {
  const player = game.player;
  const heading = player.mode === 'drive' && player.car ? player.car.mesh.rotation.y : player.yaw;
  return {
    cash: game.cash,
    health: player.health,
    stars: game.wanted.stars,
    inside: game.interior,
    objective: {
      ...missionObjectiveText(game.missions),
      dist: missionDistance(game.missions, player),
    },
    timeLeft: game.missions.started && currentMission(game.missions)?.timeLimit
      ? game.missions.timeLeft : 0,
    speedKmh: Math.abs(player.mode === 'drive' ? player.carSpeed : player.footSpeed) * 3.6,
    driving: player.mode === 'drive',
    marker: missionMarker(game.missions),
    player: { x: player.pos.x, z: player.pos.z, heading },
    traffic: game.traffic.map((car) => ({ x: car.mesh.position.x, z: car.mesh.position.z })),
    police: game.wanted.police.map((car) => ({ x: car.mesh.position.x, z: car.mesh.position.z })),
    now: game.now,
  };
};

// --- Input -----------------------------------------------------------------
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  game.keys[event.code] = true;
  if (event.code === 'KeyE' && game.phase === 'play') {
    if (game.interior) {
      exitInterior();
    } else if (game.player.mode === 'foot') {
      const car = nearestStealable(game.player, game.traffic, game.parked);
      if (car) {
        const wasSports = car.isSports === true;
        enterCar(game.player, car, game.traffic, game.parked);
        if (wasSports) game.flags.stoleSports = true;
        addWanted(game.wanted, 1, 'Grand theft auto — the PD is on its way.', game.now, game.onEvent);
        game.audio.pickup();
        game.hud.feed(car.isSports ? 'The Comet GT is yours. Drive!' : 'Car stolen. Keep it smooth.');
      }
    } else {
      exitCar(game.player, game.parked);
    }
  }
  if (event.code === 'KeyP' && (game.phase === 'play' || game.phase === 'pause')) {
    game.phase = game.phase === 'play' ? 'pause' : 'play';
    game.hud.showPause(game.phase === 'pause');
  }
  if (event.code === 'KeyM') {
    game.save.muted = !game.save.muted;
    game.audio.setMuted(game.save.muted);
    game.hud.feed(game.save.muted ? 'Sound muted.' : 'Sound on.');
    writeSave(game.save);
  }
});
window.addEventListener('keyup', (event) => {
  game.keys[event.code] = false;
});
renderer.domElement.addEventListener('mousedown', (event) => {
  game.dragging = true;
  game.audio.unlock();
  if (game.phase === 'play' && game.player.mode === 'foot' && event.button === 0) {
    fireWeapon(game.combat, camera, {
      peds: game.peds, traffic: game.traffic, police: game.wanted.police,
      corners, random, wanted: game.wanted, audio: game.audio, onEvent: game.onEvent,
    }, game.now);
  }
});
window.addEventListener('mouseup', () => {
  game.dragging = false;
});
window.addEventListener('mousemove', (event) => {
  if (!game.dragging) return;
  game.look.yaw -= event.movementX * 0.004;
  game.look.pitch += event.movementY * 0.003;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'play') {
    game.phase = 'pause';
    game.hud.showPause(true);
  }
});

game.hud.onPlay((continueSave) => {
  game.audio.unlock();
  game.audio.setMuted(game.save.muted);
  game.hud.hideStart();
  game.hud.hideEnd();
  if (!continueSave) {
    game.save = defaultSave();
    game.cash = 0;
    resetWorld();
  } else {
    game.cash = game.save.cash;
    resetWorld();
  }
  beginMission(Math.min(game.save.missionIndex, 3));
  game.phase = 'play';
  game.hud.feed('Job 1: pick up the package at the docks. Follow the yellow beacon.');
});
game.hud.onResume(() => {
  game.phase = 'play';
  game.hud.showPause(false);
});
game.hud.onRestart(() => {
  clearSave();
  game.save = defaultSave();
  game.cash = 0;
  game.hud.showPause(false);
  resetWorld();
  beginMission(0);
  game.phase = 'play';
});
game.hud.onRetry(() => {
  game.hud.hideEnd();
  resetPlayer(game.player, 0, 100);
  game.player.health = 100;
  clearWanted(game.wanted);
  game.phase = 'play';
});

// --- Run -------------------------------------------------------------------
function runShot(name) {
  stageShot(name, game);
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  game.hud.showStart(game.save);
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (game.phase === 'play') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 6) {
        step(STEP, game.keys);
        accumulator -= STEP;
        steps += 1;
      }
      if (accumulator > STEP * 6) accumulator = 0;
    } else if (game.phase === 'menu') {
      // The city idles behind the title screen: traffic rolls, pedestrians stroll.
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 3) {
        game.now += STEP;
        updateTraffic(game.traffic, scene, city, random, game.player.pos, playerForward(), STEP);
        updatePedestrians(game.peds, corners, game.player.pos, 0, game.now, STEP, random);
        updateCamera(game.player, camera, null, STEP);
        accumulator -= STEP;
        steps += 1;
      }
    }
    game.hud.update(game.hudState());
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// A read-only handle for automated playtests (and curious players in devtools).
window.__solmar = game;
