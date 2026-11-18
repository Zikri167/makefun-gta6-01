// The wanted level: Solmar PD's attention, from zero to five stars. Crimes add heat,
// quiet time cools it, and the police on the street always match the stars. Get caught
// on foot and it is BUSTED; lose all your health and it is WASTED. Ducking inside a
// building shelters Dana: the cops wait on the street, they cannot follow her in,
// and the heat cools while she is out of sight.
import { createPoliceCar, updatePoliceCar } from './vehicles.js';

export const MAX_STARS = 5;
const COOL_AFTER = 8; // quiet seconds before the first star falls
const COOL_STEP = 9; // seconds between stars after that
const SPOTTED_RANGE = 65; // a cop this close restarts the cooling clock

export function createWanted() {
  return {
    stars: 0,
    lastCrimeAt: -999,
    nextCoolAt: 0,
    bustedProgress: 0,
    police: [],
  };
}

export function addWanted(wanted, stars, reason, now, onEvent) {
  const before = wanted.stars;
  wanted.stars = Math.min(MAX_STARS, wanted.stars + stars);
  wanted.lastCrimeAt = now;
  wanted.nextCoolAt = now + COOL_AFTER;
  if (wanted.stars !== before && onEvent) onEvent(wanted.stars, reason);
  return wanted.stars;
}

export function clearWanted(wanted) {
  wanted.stars = 0;
  wanted.bustedProgress = 0;
}

// How many police cars the stars call for. One per star up to three, then one more
// for the last two, so five stars still runs on this machine.
export function policeTarget(stars) {
  return stars === 0 ? 0 : Math.min(1 + stars, 5);
}

function syncPolice(wanted, scene, city, random, playerPos) {
  const target = policeTarget(wanted.stars);
  while (wanted.police.length < target) {
    wanted.police.push(createPoliceCar(scene, city.nodes, random, playerPos));
  }
  while (wanted.police.length > target) {
    const car = wanted.police.pop();
    scene.remove(car.mesh);
  }
}

export function updateWanted(wanted, scene, city, random, player, world, now, dt) {
  // Sheltered indoors, the PD cannot reach Dana: the cars hold their positions
  // outside and the heat cools as if she vanished. closest stays Infinity, so
  // the cooling branch below runs and no bust can start.
  const sheltered = Boolean(world.interior);
  let closest = Infinity;
  if (!sheltered) {
    syncPolice(wanted, scene, city, random, player.pos);
    for (const car of wanted.police) {
      const dist = updatePoliceCar(car, player.pos, player.mode === 'drive', city.colliders, city.nodes, random, dt, wanted.stars);
      closest = Math.min(closest, dist);
      if (player.mode === 'drive') {
        // A police ram at speed hurts the car and the driver — at most once every
        // two seconds, so a long contact does not grind the car to a halt.
        const dx = car.mesh.position.x - player.pos.x;
        const dz = car.mesh.position.z - player.pos.z;
        if (Math.hypot(dx, dz) < 4.6 && Math.abs(car.speed) > 4 && now - car.lastRamAt > 2) {
          car.lastRamAt = now;
          player.carSpeed *= 0.65;
          hurtPlayer(player, 6, now, world);
          if (world.onCrash) world.onCrash(6);
        }
      }
    }
  }
  // Cooling only starts once the cops lose sight of Dana: a police car nearby
  // restarts the clock, and each star then takes its own quiet stretch to fall.
  if (wanted.stars > 0) {
    if (closest < SPOTTED_RANGE) {
      wanted.nextCoolAt = now + COOL_AFTER;
    } else if (now >= wanted.nextCoolAt) {
      wanted.stars -= 1;
      wanted.nextCoolAt = now + COOL_STEP;
      if (world.onEvent) world.onEvent(wanted.stars, wanted.stars === 0 ? 'The heat is off.' : 'Heat cooling down.');
    }
  }
  // On foot, a cop that reaches Dana starts the bust. Break contact to shake it.
  if (player.mode === 'foot' && wanted.stars > 0 && !sheltered) {
    if (closest < 3.2) {
      wanted.bustedProgress += dt / 1.6;
      if (wanted.bustedProgress >= 1) {
        wanted.bustedProgress = 0;
        if (world.onBusted) world.onBusted();
      }
    } else {
      wanted.bustedProgress = Math.max(0, wanted.bustedProgress - dt / 2);
    }
  } else {
    wanted.bustedProgress = Math.max(0, wanted.bustedProgress - dt / 2);
  }
  return closest;
}

export function hurtPlayer(player, amount, now, world) {
  if (now - player.lastHurtAt < 0.5) return;
  player.lastHurtAt = now;
  player.health = Math.max(0, player.health - amount);
  if (player.health <= 0 && world.onWasted) world.onWasted();
}

export function healPlayer(player, amount) {
  player.health = Math.min(100, player.health + amount);
}
