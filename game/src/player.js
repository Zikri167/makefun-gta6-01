// Dana Vega, on foot and behind the wheel. On foot she walks and runs relative to the
// camera with a dragged orbit view; in a car she gets arcade handling (accelerate,
// brake/reverse, speed-sensitive steering) and a chase camera that settles behind the
// car. E steals the nearest car or steps out of the one she is driving. Indoors, the
// same walk code runs against the room's own colliders and bounds (world.roomBounds /
// world.activeColliders), so interiors need no second movement system.
import * as THREE from 'three';
import { clamp, lerp } from './random.js';
import { resolveBuildingCollision, WORLD_HALF } from './city.js';
import { separateCars } from './vehicles.js';

const WALK_SPEED = 5;
const RUN_SPEED = 8.5;
const CAR_MAX_SPEED = 27;
const CAR_MAX_REVERSE = 8;
const CAR_ACCEL = 11;
const CAR_BRAKE = 20;

function makeBodyMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xe86a1e, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.95, 10), jacket);
  torso.position.y = 0.95;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 10), pants);
  legs.position.y = 0.28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.62;
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), hair);
  hairMesh.position.y = 1.7;
  hairMesh.scale.set(1, 0.75, 1);
  for (const part of [torso, legs, head, hairMesh]) part.castShadow = true;
  group.add(torso, legs, head, hairMesh);
  return group;
}

export function createPlayer(scene) {
  const mesh = makeBodyMesh();
  scene.add(mesh);
  return {
    mesh,
    mode: 'foot',
    pos: new THREE.Vector3(0, 0, 20),
    yaw: Math.PI,
    camYaw: Math.PI,
    camPitch: 0.32,
    camDistance: 7.5,
    orbitOffset: 0,
    footSpeed: 0,
    health: 100,
    lastHurtAt: -99,
    car: null,
    carSpeed: 0,
    carSteer: 0,
    crashCooldown: 0,
  };
}

export function resetPlayer(player, x, z) {
  player.mode = 'foot';
  player.pos.set(x, 0, z);
  player.yaw = Math.PI;
  player.camYaw = Math.PI;
  player.health = 100;
  player.car = null;
  player.carSpeed = 0;
  player.mesh.visible = true;
}

// The nearest car Dana can steal: parked or in traffic, never a police car.
export function nearestStealable(player, traffic, parked) {
  let best = null;
  let bestDist = 4.6;
  for (const car of [...traffic, ...parked]) {
    const d = Math.hypot(car.mesh.position.x - player.pos.x, car.mesh.position.z - player.pos.z);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(player, car, traffic, parked) {
  const trafficIndex = traffic.indexOf(car);
  if (trafficIndex >= 0) traffic.splice(trafficIndex, 1);
  const parkedIndex = parked.indexOf(car);
  if (parkedIndex >= 0) parked.splice(parkedIndex, 1);
  player.car = car;
  player.carSpeed = 0;
  player.mode = 'drive';
  player.mesh.visible = false;
  player.orbitOffset = 0;
  return car;
}

export function exitCar(player, parked) {
  const car = player.car;
  if (!car) return;
  const side = new THREE.Vector3(Math.cos(car.mesh.rotation.y), 0, -Math.sin(car.mesh.rotation.y));
  player.pos.set(
    car.mesh.position.x + side.x * 2.2,
    0,
    car.mesh.position.z + side.z * 2.2,
  );
  player.yaw = car.mesh.rotation.y;
  player.camYaw = car.mesh.rotation.y;
  player.mode = 'foot';
  player.mesh.visible = true;
  player.mesh.position.copy(player.pos);
  player.car = null;
  player.carSpeed = 0;
  car.kind = 'parked';
  car.speed = 0;
  parked.push(car);
}

function stepFoot(player, keys, colliders, bounds, dt) {
  const forward = { x: -Math.sin(player.camYaw), z: -Math.cos(player.camYaw) };
  const right = { x: -forward.z, z: forward.x };
  let mx = 0;
  let mz = 0;
  if (keys.KeyW) { mx += forward.x; mz += forward.z; }
  if (keys.KeyS) { mx -= forward.x; mz -= forward.z; }
  if (keys.KeyD) { mx += right.x; mz += right.z; }
  if (keys.KeyA) { mx -= right.x; mz -= right.z; }
  const len = Math.hypot(mx, mz);
  const running = keys.ShiftLeft || keys.ShiftRight;
  const target = len > 0 ? (running ? RUN_SPEED : WALK_SPEED) : 0;
  player.footSpeed = lerp(player.footSpeed, target, Math.min(1, dt * 10));
  if (len > 0) {
    player.pos.x += (mx / len) * player.footSpeed * dt;
    player.pos.z += (mz / len) * player.footSpeed * dt;
    const targetYaw = Math.atan2(mx, mz);
    let diff = targetYaw - player.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.yaw += clamp(diff, -10 * dt, 10 * dt);
  }
  resolveBuildingCollision(colliders, player.pos, 0.5);
  if (bounds) {
    player.pos.x = clamp(player.pos.x, bounds.minX, bounds.maxX);
    player.pos.z = clamp(player.pos.z, bounds.minZ, bounds.maxZ);
  } else {
    player.pos.x = clamp(player.pos.x, -WORLD_HALF + 2, WORLD_HALF + 2);
    player.pos.z = clamp(player.pos.z, -WORLD_HALF + 2, WORLD_HALF + 2);
  }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.yaw;
  // Walk bob.
  player.mesh.position.y = player.footSpeed > 0.5 ? Math.abs(Math.sin(performance.now() / 90)) * 0.05 : 0;
}

function stepDrive(player, keys, world, dt) {
  const car = player.car;
  const mesh = car.mesh;
  const heading = mesh.rotation.y;
  const forward = { x: Math.sin(heading), z: Math.cos(heading) };
  let throttle = 0;
  if (keys.KeyW) throttle = 1;
  if (keys.KeyS) throttle = -1;
  if (throttle > 0) player.carSpeed += CAR_ACCEL * dt;
  else if (throttle < 0) {
    player.carSpeed += player.carSpeed > 0.5 ? -CAR_BRAKE * dt : -CAR_ACCEL * 0.6 * dt;
  } else {
    player.carSpeed -= Math.sign(player.carSpeed) * Math.min(Math.abs(player.carSpeed), 6 * dt);
  }
  player.carSpeed = clamp(player.carSpeed, -CAR_MAX_REVERSE, CAR_MAX_SPEED);
  const steerInput = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const steerTarget = steerInput * 0.55 * (1 - Math.min(Math.abs(player.carSpeed) / CAR_MAX_SPEED, 0.75) * 0.55);
  player.carSteer = lerp(player.carSteer, steerTarget, Math.min(1, dt * 8));
  const turnRate = (player.carSpeed / 2.9) * Math.tan(player.carSteer);
  mesh.rotation.y += turnRate * dt;
  const newHeading = mesh.rotation.y;
  mesh.position.x += Math.sin(newHeading) * player.carSpeed * dt;
  mesh.position.z += Math.cos(newHeading) * player.carSpeed * dt;
  if (resolveBuildingCollision(world.city.colliders, mesh.position, 2.3)) {
    if (Math.abs(player.carSpeed) > 7 && player.crashCooldown <= 0) {
      world.onCrash(Math.abs(player.carSpeed));
      player.crashCooldown = 0.5;
    }
    player.carSpeed *= 0.45;
  }
  player.crashCooldown = Math.max(0, player.crashCooldown - dt);
  for (const other of [...world.traffic, ...world.wanted.police]) {
    const impact = separateCars(car, other);
    if (impact > 4 && player.crashCooldown <= 0) {
      player.carSpeed *= 0.6;
      world.onCrash(impact);
      player.crashCooldown = 0.5;
    }
  }
  mesh.position.x = clamp(mesh.position.x, -WORLD_HALF + 2, WORLD_HALF + 2);
  mesh.position.z = clamp(mesh.position.z, -WORLD_HALF + 2, WORLD_HALF + 2);
  player.pos.copy(mesh.position);
  return { forward, speed: player.carSpeed };
}

export function updatePlayer(player, keys, world, dt) {
  if (player.mode === 'drive') return stepDrive(player, keys, world, dt);
  stepFoot(player, keys, world.activeColliders ?? world.city.colliders, world.roomBounds ?? null, dt);
  return { forward: null, speed: player.footSpeed };
}

// Third-person camera: an orbit on foot, a chase cam that settles behind the car.
export function updateCamera(player, camera, look, dt) {
  if (player.mode === 'drive' && player.car) {
    const mesh = player.car.mesh;
    const heading = mesh.rotation.y + player.orbitOffset;
    const desired = new THREE.Vector3(
      mesh.position.x - Math.sin(heading) * 9.5,
      4.2,
      mesh.position.z - Math.cos(heading) * 9.5,
    );
    camera.position.lerp(desired, Math.min(1, dt * 4));
    player.orbitOffset = lerp(player.orbitOffset, 0, Math.min(1, dt * 1.2));
    camera.lookAt(mesh.position.x + Math.sin(mesh.rotation.y) * 8, 1.6, mesh.position.z + Math.cos(mesh.rotation.y) * 8);
    return;
  }
  const yaw = player.camYaw + (look ? look.yaw : 0);
  const pitch = clamp(player.camPitch + (look ? look.pitch : 0), 0.05, 1.1);
  player.camYaw = yaw;
  player.camPitch = pitch;
  const distance = player.camDistance;
  const cx = player.pos.x + Math.sin(yaw) * Math.cos(pitch) * distance;
  const cz = player.pos.z + Math.cos(yaw) * Math.cos(pitch) * distance;
  camera.position.set(cx, 1.6 + Math.sin(pitch) * distance, cz);
  camera.lookAt(player.pos.x, 1.6, player.pos.z);
}
