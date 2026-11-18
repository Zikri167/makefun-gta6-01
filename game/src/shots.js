// The screenshot scenes behind ?shot=start|chase|street|mission|night. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered by a
// scripted driver, so the frame is what a short game really looks like and the same
// seed always gives the same frame. The cover (chase) shows the most at once: the car,
// the wanted stars, the police behind, the minimap and a mission objective. The
// mission frame is now the SUNDOWN finale inside Marlow's office at dusk, the start
// frame is the title screen over the city at dusk, and night is a dusk chase down
// Marina Avenue.
import { startMission } from './missions.js';
import { addWanted } from './wanted.js';
import { setTimeOfDay } from './dusk.js';
import { updateCamera } from './player.js';

const STEP = 1 / 60;

function holdKeys(...codes) {
  const keys = {};
  for (const code of codes) keys[code] = true;
  return keys;
}

// Drive the player forward for `seconds`, then hand the frame back.
function driveForward(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, holdKeys('KeyW'));
}

function walkForward(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, holdKeys('KeyW'));
}

function settle(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, {});
}

// A police chase down Marina Avenue, staged the same way for day and dusk: Dana in
// the Comet GT, three stars, police closing in from behind.
function stageChase(game, dusk) {
  if (dusk) setTimeOfDay(game, 'dusk');
  startMission(game.missions, 0, 0);
  game.putPlayerInSportsCar(0, 60, Math.PI);
  addWanted(game.wanted, 3, 'Grand theft auto.', 0, null);
  game.syncPoliceNow();
  // Clear the avenue of traffic for the run, so the frame shows a clean chase
  // instead of the player rear-ending a commuter.
  for (const car of game.traffic) {
    const pos = car.mesh.position;
    if (Math.abs(pos.x) < 12 && pos.z > -80 && pos.z < 70) {
      const keys = [...game.city.nodes.keys()].filter((key) => {
        const node = game.city.nodes.get(key);
        return Math.abs(node.x) >= 100;
      });
      const node = game.city.nodes.get(keys[Math.floor(game.random() * keys.length)]);
      car.from = node;
      car.to = game.city.nodes.get(node.neighbours[0]);
      car.edgeT = game.random();
      car.speed = car.cruise;
    }
  }
  // Stage the pursuit: two police close in from behind, one comes head-on down
  // the avenue and one cuts in from the next cross street — so the frame catches
  // the chase from every side instead of a head-on pile-up.
  const heading = game.player.car.mesh.rotation.y;
  const right = { x: -Math.cos(heading), z: Math.sin(heading) };
  const fwd = { x: Math.sin(heading), z: Math.cos(heading) };
  game.wanted.police.forEach((cop, i) => {
    let px;
    let pz;
    let ch = heading;
    if (i === 2) {
      // Ahead of the player, racing the same way to cut her off at the next
      // junction — visible down the avenue, but it never reaches her in frame.
      px = game.player.pos.x + fwd.x * 42 + right.x * 2.4;
      pz = game.player.pos.z + fwd.z * 42 + right.z * 2.4;
      ch = heading;
    } else if (i === 3) {
      px = game.player.pos.x - fwd.x * 55;
      pz = game.player.pos.z - fwd.z * 55;
    } else {
      const behind = 20 + i * 12;
      const side = i % 2 === 0 ? -4.5 : 4.5;
      px = game.player.pos.x - fwd.x * behind + right.x * side;
      pz = game.player.pos.z - fwd.z * behind + right.z * side;
    }
    cop.mesh.position.set(px, 0, pz);
    cop.mesh.rotation.y = ch;
    cop.heading = ch;
    cop.speed = i === 2 ? 17 : 14;
  });
  driveForward(game, 3.5);
  game.hud.update(game.hudState());
}

export function stageShot(name, game) {
  const { player, camera } = game;
  game.resetWorld();
  if (name === 'start') {
    // The title screen over a high view of downtown and the beach beyond, at dusk.
    setTimeOfDay(game, 'dusk');
    game.hud.showStart(null);
    settle(game, 2);
    camera.position.set(95, 62, 150);
    camera.lookAt(0, 8, -20);
    game.hud.update(game.hudState());
    return;
  }
  game.hud.hideStart();
  if (name === 'chase') {
    // Cover: Dana in the Comet GT, three stars, police cars closing in from behind
    // on Marina Avenue, mission 1's objective on the HUD.
    stageChase(game, false);
    return;
  }
  if (name === 'night') {
    // The same chase at dusk: low orange sun, purple sky, lamps glowing, the
    // avenue lit by headlights and the police light bars.
    stageChase(game, true);
    return;
  }
  if (name === 'mission') {
    // The SUNDOWN finale: Dana on foot inside Marlow's office at dusk, three
    // stars, the cash on the desk and the beacon on the handover point. Staged
    // directly (no loop steps) so the mission does not complete mid-frame. Dana
    // faces north (yaw 0) toward the desk, so the frame shows the handover target
    // and the beacon, not the exit portal behind her.
    setTimeOfDay(game, 'dusk');
    startMission(game.missions, 3, 0);
    game.missions.stepIndex = 4;
    game.missions.timeLeft = 42;
    game.missions.beacon.position.set(1000, 13, -4.8);
    game.missions.ring.position.set(1000, 0.12, -4.8);
    game.missions.beacon.visible = true;
    game.missions.ring.visible = true;
    game.missions.beaconMaterial.color.set(0xffc21e);
    game.missions.ring.material.color.set(0xffc21e);
    addWanted(game.wanted, 3, 'Sundown.', 0, null);
    game.enterInterior('office');
    game.doorCooldownUntil = 0;
    player.pos.set(1000, 0, 2);
    player.mesh.position.copy(player.pos);
    player.yaw = 0;
    player.camYaw = 0;
    player.camPitch = 0.32;
    updateCamera(player, camera, null, 1 / 60);
    game.hud.update(game.hudState());
    return;
  }
  // street: on foot walking north up Marina Avenue, traffic and pedestrians around her.
  startMission(game.missions, 0, 0);
  player.pos.set(2, 0, 40);
  player.yaw = 0;
  player.camYaw = 0;
  player.mesh.position.copy(player.pos);
  walkForward(game, 3);
  game.hud.update(game.hudState());
}
