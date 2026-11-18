// The wanted level and its mini police cars. A small pre-allocated pool of cars spawns at the
// top of the field and steers toward the player while falling; touching one raises the wanted
// level by one star (and costs a life, handled by the world), while a quiet stretch lowers it.
// step() returns bit flags so the world can react without knowing the details.
import { FIELD, POLICE, WANTED } from './config.js';

export const WANTED_HIT = 1;
export const WANTED_CHANGED = 2;

function overlapsPolice(car, player) {
  return car.x < player.x + player.width && car.x + car.width > player.x
    && car.y < player.y + player.height && car.y + car.height > player.y;
}

export function createWanted(random) {
  const cars = [];
  for (let index = 0; index < POLICE.poolSize; index += 1) {
    cars.push({ active: false, x: 0, y: 0, width: POLICE.width, height: POLICE.height, siren: 0 });
  }
  const state = { stars: 0, decayTimer: 0, spawnTimer: POLICE.spawnBase, invulnTimer: 0, cars };

  function reset() {
    state.stars = 0;
    state.decayTimer = 0;
    state.spawnTimer = POLICE.spawnBase;
    state.invulnTimer = 0;
    for (const car of cars) car.active = false;
  }

  function spawnInterval() {
    return Math.max(POLICE.spawnMin, POLICE.spawnBase - POLICE.spawnStep * state.stars);
  }

  function spawnCar() {
    for (const car of cars) {
      if (car.active) continue;
      car.active = true;
      car.x = random() * (FIELD.width - car.width);
      car.y = -car.height;
      car.siren = 0;
      return;
    }
  }

  function step(dt, player, harmless) {
    let flags = 0;
    if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);

    if (state.stars > 0) {
      state.decayTimer -= dt;
      if (state.decayTimer <= 0) {
        state.stars -= 1;
        state.decayTimer = state.stars > 0 ? WANTED.decaySeconds : 0;
        flags |= WANTED_CHANGED;
      }
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnCar();
      state.spawnTimer = spawnInterval();
    }

    const playerCentre = player.x + player.width / 2;
    for (const car of cars) {
      if (!car.active) continue;
      const carCentre = car.x + car.width / 2;
      const gap = playerCentre - carCentre;
      const steer = gap > 4 ? 1 : gap < -4 ? -1 : 0;
      car.x = Math.min(
        FIELD.width - car.width,
        Math.max(0, car.x + steer * (POLICE.chaseSpeed + POLICE.chasePerStar * state.stars) * dt),
      );
      car.y += (POLICE.fallSpeed + POLICE.fallPerStar * state.stars) * dt;
      car.siren += dt;
      if (car.y > FIELD.height) {
        car.active = false;
        continue;
      }
      if (harmless || state.invulnTimer > 0 || !overlapsPolice(car, player)) continue;
      car.active = false;
      state.stars = Math.min(WANTED.maxStars, state.stars + 1);
      state.decayTimer = WANTED.decaySeconds;
      state.invulnTimer = WANTED.invulnSeconds;
      flags |= WANTED_HIT | WANTED_CHANGED;
    }
    return flags;
  }

  reset();
  return { state, reset, step };
}
