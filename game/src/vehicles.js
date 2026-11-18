// Cars: the meshes, the traffic that drives the road graph, the parked cars waiting
// to be stolen, and the police who chase the player. Traffic cars follow edges between
// intersections in the right-hand lane, slow for the car ahead, and respawn far away
// when the player leaves them behind. Police steer straight at the player and ram.
// Headlights and tail lights are emissive, so the cars still read at dusk.
import * as THREE from 'three';
import { pick, range, clamp } from './random.js';
import { nodeByKey, nodeKey, nearestNode, resolveBuildingCollision, ROAD_HALF } from './city.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0x3a9e4d, 0xd8c23a, 0x8a8f96, 0x5b2e86, 0xd97b2e, 0x2eb8a6, 0xe8e4da, 0x22252a];
const GLASS = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.6 });
const TYRE = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });

export function createCarMesh(options = {}) {
  const { color = 0xc23b2e, police = false, sports = false } = options;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: police ? 0xf2f2ee : color, roughness: 0.35, metalness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.3), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.5, sports ? 1.9 : 2.3), police ? TYRE : GLASS,
  );
  cabin.position.set(0, 1.12, sports ? -0.35 : -0.15);
  cabin.castShadow = true;
  group.add(cabin);
  if (sports) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), TYRE);
    spoiler.position.set(0, 1.05, -2.05);
    group.add(spoiler);
  }
  const wheelGeometry = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12);
  wheelGeometry.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeometry, TYRE);
    wheel.position.set(x, 0.37, z);
    group.add(wheel);
  }
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 1.4 });
  for (const x of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headMaterial);
    head.position.set(x, 0.62, 2.16);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xcc0000, emissiveIntensity: 0.9 }),
    );
    tail.position.set(x, 0.62, -2.16);
    group.add(tail);
  }
  if (police) {
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff2222, emissiveIntensity: 1.6 }),
    );
    red.position.set(-0.32, 1.44, -0.15);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x0022cc, emissive: 0x2244ff, emissiveIntensity: 1.6 }),
    );
    blue.position.set(0.32, 1.44, -0.15);
    group.add(red, blue);
    group.userData.lightBar = [red, blue];
  }
  group.userData.paint = paint;
  return group;
}

function edgeVector(from, to) {
  return { dx: to.x - from.x, dz: to.z - from.z, length: Math.hypot(to.x - from.x, to.z - from.z) };
}

// Right-hand lane offset: 2.4 m to the right of the direction of travel.
function laneOffset(dx, dz, length) {
  const nx = dx / length;
  const nz = dz / length;
  return { x: nz * 2.4, z: -nx * 2.4 };
}

function randomEdge(random, nodes) {
  const keys = [...nodes.keys()];
  const from = nodes.get(keys[Math.floor(random() * keys.length)]);
  const to = nodes.get(pick(random, from.neighbours));
  return { from, to };
}

export function createTrafficCar(scene, nodes, random) {
  const edge = randomEdge(random, nodes);
  const mesh = createCarMesh({ color: pick(random, CAR_COLORS) });
  scene.add(mesh);
  return {
    kind: 'traffic', mesh, color: mesh.userData.paint.color.getHex(),
    from: edge.from, to: edge.to, edgeT: random(),
    speed: range(random, 6, 9), cruise: range(random, 6, 9),
    heading: 0, stuckTime: 0,
  };
}

export function createTraffic(scene, city, random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) cars.push(createTrafficCar(scene, city.nodes, random));
  return cars;
}

function advanceTrafficCar(car, nodes, random, dt) {
  const edge = edgeVector(car.from, car.to);
  const ahead = car.edgeT + (car.speed * dt) / edge.length;
  if (ahead >= 1) {
    const next = pick(random, car.to.neighbours.filter((key) => key !== nodeKey(car.from.i, car.from.j)));
    car.from = car.to;
    car.to = nodeByKey(nodes, next);
    car.edgeT = 0;
  } else {
    car.edgeT = ahead;
  }
  const off = laneOffset(edge.dx, edge.dz, edge.length);
  car.mesh.position.set(
    car.from.x + edge.dx * car.edgeT + off.x,
    0,
    car.from.z + edge.dz * car.edgeT + off.z,
  );
  car.heading = Math.atan2(edge.dx, edge.dz);
  car.mesh.rotation.y = car.heading;
}

// Keep traffic moving, and recycle any car the player left far behind to a road near
// the player — biased ahead of where she is heading, so the streets ahead of her
// always feel busy and intersections look alive as she approaches them.
export function updateTraffic(cars, scene, city, random, playerPos, playerForward, dt) {
  for (const car of cars) {
    // Slow for the car ahead on the same edge.
    let target = car.cruise;
    if (car.edgeT > 0.82) target = Math.min(target, 5);
    for (const other of cars) {
      if (other === car || other.to !== car.to || other.from !== car.from) continue;
      const gap = (other.edgeT - car.edgeT) * edgeVector(car.from, car.to).length;
      if (gap > 0 && gap < 10) target = Math.min(target, Math.max(0, other.speed - 1.5));
      if (gap > 0 && gap < 4.5) target = 0;
    }
    car.speed += clamp(target - car.speed, -9 * dt, 5 * dt);
    advanceTrafficCar(car, city.nodes, random, dt);
    const dist = Math.hypot(car.mesh.position.x - playerPos.x, car.mesh.position.z - playerPos.z);
    if (dist > 105) {
      let placed = false;
      for (let attempt = 0; attempt < 8 && !placed; attempt += 1) {
        const edge = randomEdge(random, city.nodes);
        const midX = (edge.from.x + edge.to.x) / 2;
        const midZ = (edge.from.z + edge.to.z) / 2;
        const midDist = Math.hypot(midX - playerPos.x, midZ - playerPos.z);
        const ahead = (midX - playerPos.x) * playerForward.x + (midZ - playerPos.z) * playerForward.z;
        if (midDist > 60 && midDist < 100 && ahead > 20) {
          car.from = edge.from;
          car.to = edge.to;
          car.edgeT = random();
          car.speed = car.cruise;
          placed = true;
        }
      }
      if (!placed) {
        const edge = randomEdge(random, city.nodes);
        const midX = (edge.from.x + edge.to.x) / 2;
        const midZ = (edge.from.z + edge.to.z) / 2;
        const midDist = Math.hypot(midX - playerPos.x, midZ - playerPos.z);
        if (midDist > 45 && midDist < 110) {
          car.from = edge.from;
          car.to = edge.to;
          car.edgeT = random();
          car.speed = car.cruise;
        }
      }
    }
  }
}

// Parked cars along curbs: the easy steals. They never move until the player takes one.
export function createParkedCars(scene, city, random, count) {
  const cars = [];
  const spots = [];
  for (let i = 0; i < 7; i += 1) {
    for (let s = -125; s <= 125; s += 25) {
      const line = (i - 3) * 50;
      spots.push({ x: line + ROAD_HALF - 1.4, z: s, heading: 0 });
      spots.push({ x: s, z: line + ROAD_HALF - 1.4, heading: Math.PI / 2 });
    }
  }
  for (let n = 0; n < count; n += 1) {
    const spot = spots.splice(Math.floor(random() * spots.length), 1)[0];
    const mesh = createCarMesh({ color: pick(random, CAR_COLORS) });
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    cars.push({ kind: 'parked', mesh, heading: spot.heading, speed: 0 });
  }
  return cars;
}

export function createPoliceCar(scene, nodes, random, nearPos) {
  // Spawn on a road node 55-80 m from the player, so the sirens arrive, not teleport in.
  let node = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const keys = [...nodes.keys()];
    const candidate = nodes.get(keys[Math.floor(random() * keys.length)]);
    const d = Math.hypot(candidate.x - nearPos.x, candidate.z - nearPos.z);
    if (d > 55 && d < 85) {
      node = candidate;
      break;
    }
  }
  if (!node) node = nearestNode(nodes, nearPos.x + 60, nearPos.z);
  const mesh = createCarMesh({ police: true });
  mesh.position.set(node.x, 0, node.z);
  scene.add(mesh);
  return {
    kind: 'police', mesh, heading: 0, speed: 0,
    stuckTime: 0, sirenPhase: random() * Math.PI * 2, lastRamAt: -99,
  };
}

// Steer at the player, ram when close, and respawn on a nearby road when boxed in.
// Top speed grows with the wanted level, so higher heat genuinely chases harder.
export function updatePoliceCar(car, playerPos, playerDriving, colliders, nodes, random, dt, stars) {
  const pos = car.mesh.position;
  const dx = playerPos.x - pos.x;
  const dz = playerPos.z - pos.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const desired = Math.atan2(dx, dz);
  let turn = desired - car.heading;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  car.heading += clamp(turn, -2.4 * dt, 2.4 * dt);
  const starSpeed = 17 + (stars ?? 1) * 2.2;
  const targetSpeed = dist > 40 ? starSpeed : dist > 8 ? starSpeed - 2 : 9;
  car.speed += clamp(targetSpeed - car.speed, -12 * dt, 7 * dt);
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.rotation.y = car.heading;
  if (resolveBuildingCollision(colliders, pos, 2.3)) car.speed *= 0.5;
  if (car.speed < 1.2) car.stuckTime += dt;
  else car.stuckTime = 0;
  if (car.stuckTime > 3) {
    const node = nearestNode(nodes, playerPos.x + 55, playerPos.z + 20);
    pos.set(node.x, 0, node.z);
    car.speed = 0;
    car.stuckTime = 0;
  }
  // Flash the light bar.
  car.sirenPhase += dt * 9;
  const [red, blue] = car.mesh.userData.lightBar;
  const on = Math.sin(car.sirenPhase) > 0;
  red.material.emissiveIntensity = on ? 2.2 : 0.25;
  blue.material.emissiveIntensity = on ? 0.25 : 2.2;
  return dist;
}

// Push two cars apart when their circles overlap; returns the impact speed.
export function separateCars(a, b) {
  const pa = a.mesh.position;
  const pb = b.mesh.position;
  const dx = pb.x - pa.x;
  const dz = pb.z - pa.z;
  const dist = Math.hypot(dx, dz);
  const min = 4.4;
  if (dist >= min || dist < 0.001) return 0;
  const push = (min - dist) / 2;
  const nx = dx / dist;
  const nz = dz / dist;
  pa.x -= nx * push;
  pa.z -= nz * push;
  pb.x += nx * push;
  pb.z += nz * push;
  return Math.abs((a.speed ?? 0) - (b.speed ?? 0));
}
