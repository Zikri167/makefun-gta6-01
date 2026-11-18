// Solmar Bay: the city itself. A 7x7 road grid with a beach on the south edge, a park
// plaza at the centre, and a downtown of taller towers near the middle. Everything the
// game needs to drive, walk and chase through it comes from here: the road graph the
// traffic follows, the building boxes the player collides with, and the ground texture
// that paints roads, crosswalks and sand in one draw call.
import * as THREE from 'three';
import { makeRandom, pick, range, rangeInt, clamp } from './random.js';

export const GRID = 7; // intersections per side
export const PITCH = 50; // metres between intersections
export const ROAD_HALF = 6; // half the road width
export const WORLD_HALF = 170; // ground plane half-size
export const BLOCK = PITCH - ROAD_HALF * 2;

export function gridCoord(index) {
  return (index - (GRID - 1) / 2) * PITCH;
}

export function nodeKey(i, j) {
  return `${i},${j}`;
}

// The road graph: every intersection and its neighbours, so traffic, police and the
// minimap all agree on where the roads are.
export function buildRoadGraph() {
  const nodes = new Map();
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const neighbours = [];
      if (i > 0) neighbours.push(nodeKey(i - 1, j));
      if (i < GRID - 1) neighbours.push(nodeKey(i + 1, j));
      if (j > 0) neighbours.push(nodeKey(i, j - 1));
      if (j < GRID - 1) neighbours.push(nodeKey(i, j + 1));
      nodes.set(nodeKey(i, j), { i, j, x: gridCoord(i), z: gridCoord(j), neighbours });
    }
  }
  return nodes;
}

export function nearestNode(nodes, x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const node of nodes.values()) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

export function nodeByKey(nodes, key) {
  return nodes.get(key);
}

// One shared facade texture: a lit-window grid the building materials tint.
function makeFacadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  const rand = makeRandom(4242);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = rand() < 0.22;
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3e50';
      ctx.fillRect(10 + col * 19, 12 + row * 20, 12, 13);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The ground in one texture: sidewalks, asphalt roads with dashes, crosswalks at every
// intersection, block interiors, and the sand strip on the south edge.
function makeGroundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const toPx = (world) => ((world + WORLD_HALF) / (WORLD_HALF * 2)) * size;
  const pxPerMetre = size / (WORLD_HALF * 2);

  ctx.fillStyle = '#a9a294'; // sidewalk base
  ctx.fillRect(0, 0, size, size);
  // Block interiors, slightly warmer, with a little variation.
  const rand = makeRandom(99);
  for (let i = 0; i < GRID - 1; i += 1) {
    for (let j = 0; j < GRID - 1; j += 1) {
      const x0 = gridCoord(i) + ROAD_HALF;
      const z0 = gridCoord(j) + ROAD_HALF;
      const shade = 168 + Math.floor(rand() * 14);
      ctx.fillStyle = `rgb(${shade},${shade - 6},${shade - 22})`;
      ctx.fillRect(toPx(x0), toPx(z0), BLOCK * pxPerMetre, BLOCK * pxPerMetre);
    }
  }
  // Central park plaza, green — drawn before the roads so the avenues stay asphalt
  // through the centre, like a roundabout.
  const park = toPx(0);
  ctx.fillStyle = '#5d8a4a';
  ctx.beginPath();
  ctx.arc(park, park, BLOCK * 0.35 * pxPerMetre, 0, Math.PI * 2);
  ctx.fill();
  // Roads.
  ctx.fillStyle = '#33363b';
  for (let i = 0; i < GRID; i += 1) {
    const c = gridCoord(i);
    ctx.fillRect(toPx(c - ROAD_HALF), 0, ROAD_HALF * 2 * pxPerMetre, size);
    ctx.fillRect(0, toPx(c - ROAD_HALF), size, ROAD_HALF * 2 * pxPerMetre);
  }
  // Centre dashes.
  ctx.fillStyle = '#e8c33c';
  ctx.setLineDash([10, 14]);
  ctx.lineWidth = 2;
  for (let i = 0; i < GRID; i += 1) {
    const c = toPx(gridCoord(i));
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, c);
    ctx.lineTo(size, c);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalk stripes at every intersection.
  ctx.fillStyle = '#d8d8d2';
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const cx = toPx(gridCoord(i));
      const cz = toPx(gridCoord(j));
      for (let s = -2; s <= 2; s += 1) {
        ctx.fillRect(cx - ROAD_HALF * pxPerMetre + 3, cz + s * 7 - 2, 6, 4);
        ctx.fillRect(cx + s * 7 - 2, cz - ROAD_HALF * pxPerMetre + 3, 4, 6);
      }
    }
  }
  // Sand strip on the south edge (high z).
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, toPx(GRID * PITCH / 2 + 6), size, size - toPx(GRID * PITCH / 2 + 6));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const FACADE_COLORS = [0xf2e8d5, 0xe8c9a0, 0xd99a7a, 0xbcd3dd, 0xc9c9b8, 0xe5b7b0];

export function createCity(scene, seed) {
  const random = makeRandom(seed);
  const nodes = buildRoadGraph();
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // The sea, south of the beach.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, 90),
    new THREE.MeshStandardMaterial({ color: 0x2a7fa8, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, WORLD_HALF + 45);
  group.add(sea);

  // Buildings, one block at a time. The centre block is the park; the rest get 1-3
  // towers, taller toward downtown, each a tinted box with a dark roof.
  const facadeTexture = makeFacadeTexture();
  const facadeMaterials = FACADE_COLORS.map(
    (color) => new THREE.MeshStandardMaterial({ map: facadeTexture, color, roughness: 0.85 }),
  );
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.95 });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  boxGeometry.translate(0, 0.5, 0);
  const buildings = [];
  for (let i = 0; i < GRID - 1; i += 1) {
    for (let j = 0; j < GRID - 1; j += 1) {
      if (i === 3 && j === 3) continue; // park plaza
      const blockX = gridCoord(i) + ROAD_HALF;
      const blockZ = gridCoord(j) + ROAD_HALF;
      const centreDist = Math.hypot(blockX + BLOCK / 2, blockZ + BLOCK / 2);
      const downtown = clamp(1 - centreDist / 230, 0, 1);
      const count = rangeInt(random, 1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = range(random, 10, 19);
        const d = range(random, 10, 19);
        const x = blockX + 4 + random() * Math.max(0.1, BLOCK - 8 - w);
        const z = blockZ + 4 + random() * Math.max(0.1, BLOCK - 8 - d);
        const h = 8 + downtown * 34 + random() * 10;
        const material = pick(random, facadeMaterials);
        const mesh = new THREE.Mesh(boxGeometry, [
          material, material, roofMaterial, roofMaterial, material, material,
        ]);
        mesh.scale.set(w, h, d);
        mesh.position.set(x + w / 2, 0, z + d / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        buildings.push(mesh);
        colliders.push({ minX: x, maxX: x + w, minZ: z, maxZ: z + d });
        if (random() < 0.5) {
          const unit = new THREE.Mesh(boxGeometry, roofMaterial);
          unit.scale.set(3, 1.4, 2.4);
          unit.position.set(x + w / 2, h, z + d / 2);
          group.add(unit);
        }
      }
    }
  }

  // Street lamps along every road, alternating sides, as two instanced meshes.
  const lampSpots = [];
  for (let i = 0; i < GRID; i += 1) {
    for (let s = -140; s <= 140; s += 25) {
      lampSpots.push([gridCoord(i) + ROAD_HALF - 0.8, s]);
      lampSpots.push([s, gridCoord(i) + ROAD_HALF - 0.8]);
    }
  }
  const poleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  poleGeometry.translate(0, 2.7, 0);
  const poles = new THREE.InstancedMesh(
    poleGeometry, new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.6, metalness: 0.6 }), lampSpots.length,
  );
  const headGeometry = new THREE.SphereGeometry(0.28, 8, 6);
  const heads = new THREE.InstancedMesh(
    headGeometry, new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffdf80, emissiveIntensity: 0.9 }), lampSpots.length,
  );
  const matrix = new THREE.Matrix4();
  lampSpots.forEach(([x, z], index) => {
    matrix.makeTranslation(x, 0, z);
    poles.setMatrixAt(index, matrix);
    matrix.makeTranslation(x, 5.4, z);
    heads.setMatrixAt(index, matrix);
  });
  group.add(poles, heads);

  // Palm trees: a row along the beach and a few around the park.
  const palmSpots = [];
  for (let x = -150; x <= 150; x += 18) palmSpots.push([x + range(random, -3, 3), 162]);
  for (let a = 0; a < 4; a += 1) {
    const angle = Math.PI / 4 + (a / 4) * Math.PI * 2;
    palmSpots.push([Math.cos(angle) * 12, Math.sin(angle) * 12]);
  }
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.26, 6, 6);
  trunkGeometry.translate(0, 3, 0);
  const trunks = new THREE.InstancedMesh(
    trunkGeometry, new THREE.MeshStandardMaterial({ color: 0x8a6b48, roughness: 0.9 }), palmSpots.length,
  );
  const crownGeometry = new THREE.IcosahedronGeometry(2.1, 0);
  const crowns = new THREE.InstancedMesh(
    crownGeometry, new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9 }), palmSpots.length,
  );
  palmSpots.forEach(([x, z], index) => {
    matrix.makeTranslation(x, 0, z);
    trunks.setMatrixAt(index, matrix);
    matrix.makeTranslation(x, 6.4, z);
    crowns.setMatrixAt(index, matrix);
  });
  group.add(trunks, crowns);

  return { group, nodes, colliders, buildings };
}

// Push a circle (player, car, pedestrian) out of every building box it overlaps.
// Returns true when a push happened; the caller decides what the push costs.
export function resolveBuildingCollision(colliders, position, radius) {
  let pushed = false;
  for (const box of colliders) {
    const closestX = clamp(position.x, box.minX, box.maxX);
    const closestZ = clamp(position.z, box.minZ, box.maxZ);
    const dx = position.x - closestX;
    const dz = position.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    pushed = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      position.x = closestX + (dx / dist) * radius;
      position.z = closestZ + (dz / dist) * radius;
    } else {
      // Centre inside the box: shove out along the smallest penetration axis.
      const left = position.x - box.minX;
      const right = box.maxX - position.x;
      const top = position.z - box.minZ;
      const bottom = box.maxZ - position.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) position.x = box.minX - radius;
      else if (min === right) position.x = box.maxX + radius;
      else if (min === top) position.z = box.minZ - radius;
      else position.z = box.maxZ + radius;
    }
  }
  return pushed;
}

// Is this point on a road (not inside a block)? Roads run on the grid lines
// (-150, -100, …, 150) with a 6 m half-width. Used to keep spawns legal.
export function isOnRoad(x, z) {
  const distToLine = (v) => {
    const r = (((v + 150) % PITCH) + PITCH) % PITCH;
    return Math.min(r, PITCH - r);
  };
  return distToLine(x) <= ROAD_HALF || distToLine(z) <= ROAD_HALF;
}
