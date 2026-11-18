// Pedestrians: Solmar's foot traffic. They stroll the sidewalks from one block corner
// to the next, and they run when a car bears down on them or a shot goes off. Cheap by
// design: shared geometries, a handful of shirt colours, and a simple waypoint walk.
// They never leave the street grid — nobody follows Dana into an interior.
import * as THREE from 'three';
import { pick, range } from './random.js';
import { GRID, gridCoord, ROAD_HALF, BLOCK } from './city.js';

const SHIRTS = [0xd95f4b, 0x4b7fd9, 0x53a860, 0xd9a441, 0x8a5fd9, 0xe8e4da, 0x3a3f45, 0xd97ba8];
const SKINS = [0xe8b88a, 0xc98d64, 0x8a5a3b, 0xf0c8a0];

const bodyGeometry = new THREE.CylinderGeometry(0.26, 0.32, 0.95, 8);
bodyGeometry.translate(0, 0.95, 0);
const legsGeometry = new THREE.CylinderGeometry(0.2, 0.24, 0.55, 8);
legsGeometry.translate(0, 0.28, 0);
const headGeometry = new THREE.SphereGeometry(0.21, 10, 8);
headGeometry.translate(0, 1.62, 0);

// Every sidewalk corner a pedestrian can walk between.
function cornerWaypoints() {
  const points = [];
  for (let i = 0; i < GRID - 1; i += 1) {
    for (let j = 0; j < GRID - 1; j += 1) {
      const x0 = gridCoord(i) + ROAD_HALF + 1.2;
      const z0 = gridCoord(j) + ROAD_HALF + 1.2;
      points.push(
        { x: x0, z: z0 },
        { x: x0 + BLOCK - 2.4, z: z0 },
        { x: x0, z: z0 + BLOCK - 2.4 },
        { x: x0 + BLOCK - 2.4, z: z0 + BLOCK - 2.4 },
      );
    }
  }
  return points;
}

export function createPedestrians(scene, random, count) {
  const corners = cornerWaypoints();
  const shirtMaterials = SHIRTS.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  const skinMaterials = SKINS.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  const pantsMaterial = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.9 });
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const group = new THREE.Group();
    const shirt = pick(random, shirtMaterials);
    const skin = pick(random, skinMaterials);
    const body = new THREE.Mesh(bodyGeometry, shirt);
    const legs = new THREE.Mesh(legsGeometry, pantsMaterial);
    const head = new THREE.Mesh(headGeometry, skin);
    body.castShadow = true;
    group.add(body, legs, head);
    const start = pick(random, corners);
    group.position.set(start.x + range(random, -1, 1), 0, start.z + range(random, -1, 1));
    scene.add(group);
    peds.push({
      mesh: group, target: pick(random, corners),
      walkSpeed: range(random, 1.0, 1.6),
      fleeUntil: 0, fleeFrom: null, downUntil: 0,
      bobPhase: random() * Math.PI * 2,
    });
  }
  return peds;
}

function retarget(ped, corners, random) {
  let next = pick(random, corners);
  let guard = 0;
  while (Math.hypot(next.x - ped.mesh.position.x, next.z - ped.mesh.position.z) < 6 && guard < 8) {
    next = pick(random, corners);
    guard += 1;
  }
  ped.target = next;
}

// Flee from a threat point (a speeding car, a gunshot) for a few seconds.
export function scarePedestrians(peds, x, z, now, seconds = 3) {
  for (const ped of peds) {
    const d = Math.hypot(ped.mesh.position.x - x, ped.mesh.position.z - z);
    if (d < 26) {
      ped.fleeUntil = now + seconds;
      ped.fleeFrom = { x, z };
    }
  }
}

// A pedestrian the player ran down: they lie flat for a while, then get up elsewhere.
export function knockDownPedestrian(ped, now, corners, random) {
  ped.downUntil = now + 6;
  ped.mesh.rotation.x = Math.PI / 2;
  ped.mesh.position.y = 0.25;
  retarget(ped, corners, random);
}

export function updatePedestrians(peds, corners, playerPos, playerSpeed, now, dt, random) {
  for (const ped of peds) {
    const pos = ped.mesh.position;
    if (now < ped.downUntil) continue;
    if (ped.mesh.rotation.x !== 0) {
      ped.mesh.rotation.x = 0;
      pos.y = 0;
    }
    // A fast car closing in sends them running.
    if (playerSpeed > 6) {
      const d = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);
      if (d < 8) {
        ped.fleeUntil = now + 2.5;
        ped.fleeFrom = { x: playerPos.x, z: playerPos.z };
      }
    }
    let speed = ped.walkSpeed;
    let tx;
    let tz;
    if (now < ped.fleeUntil && ped.fleeFrom) {
      speed = 3.6;
      const dx = pos.x - ped.fleeFrom.x;
      const dz = pos.z - ped.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      tx = pos.x + (dx / len) * 12;
      tz = pos.z + (dz / len) * 12;
    } else {
      tx = ped.target.x;
      tz = ped.target.z;
    }
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      if (now >= ped.fleeUntil) retarget(ped, corners, random);
      continue;
    }
    const step = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    ped.mesh.rotation.y = Math.atan2(dx, dz);
    // A little walk bob so they read as alive, not sliding statues.
    ped.bobPhase += dt * (speed * 5);
    ped.mesh.position.y = Math.abs(Math.sin(ped.bobPhase)) * 0.05;
  }
}

// The corner list, shared with the shot stager and the respawn logic.
export function getCorners() {
  return cornerWaypoints();
}
