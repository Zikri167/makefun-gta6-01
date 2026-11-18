// The four screenshot scenes behind ?shot=start|chase|street|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered by a
// scripted driver, so the frame is what a short game really looks like and the same
// seed always gives the same frame. The cover (chase) shows the most at once: the car,
// the wanted stars, the police behind, the minimap and a mission objective.
import { startMission } from './missions.js';
import { addWanted } from './wanted.js';

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

export function stageShot(name, game) {
  const { player, camera } = game;
  game.resetWorld();
  if (name === 'start') {
    // The title screen over a high view of downtown and the beach beyond.
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
    return;
  }
  if (name === 'mission') {
    // Job 2: steal the orange Comet GT. Dana drives up Marina Avenue toward the beacon.
    startMission(game.missions, 1, 0);
    game.putPlayerInCarNear(0, 30, Math.PI);
    driveForward(game, 4);
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
