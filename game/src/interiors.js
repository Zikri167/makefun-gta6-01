// Enterable interiors: Marlow's downtown office and the north-east garage, each a
// separate enclosed room built far from the city (x near +1000) so it never touches
// city geometry. Outside, a glowing door portal marks each entrance; walk into it on
// foot to step inside, walk into the exit marker (or press E) to step back out.
// Each room has its own collider list in the same { minX, maxX, minZ, maxZ } shape
// city.js uses, so the player walks against the room with the same collision code.
// Police and pedestrians never enter: the wanted system shelters Dana while she is
// inside (see wanted.js), and traffic keeps rolling on the street outside.
import * as THREE from 'three';

// Room definitions. inside is where Dana appears on entry; exit is the marker
// inside the room that sends her back; outside is the door portal in the city;
// bounds is the walkable rectangle (walls inset by the player radius).
export const INTERIORS = [
  {
    id: 'office',
    name: "Marlow's office",
    center: { x: 1000, z: 0 },
    size: { w: 18, d: 14 },
    inside: { x: 1000, z: 2 },
    exit: { x: 1000, z: 6.2 },
    outside: { x: 57, z: 0 },
    // Where Dana lands on exit: on the road west of the door, 4 m clear of the
    // portal, so she is not sucked straight back inside when the cooldown ends.
    exitDrop: { x: 53, z: 0 },
    outsideFacing: Math.PI / 2,
    enterText: "Inside Marlow's office. The money goes on the desk — press E to leave.",
  },
  {
    id: 'garage',
    name: 'The garage',
    center: { x: 1000, z: 40 },
    size: { w: 18, d: 14 },
    inside: { x: 1000, z: 42 },
    exit: { x: 1000, z: 46.2 },
    outside: { x: 118, z: -132 },
    // Where Dana lands on exit: on the road south of the door, 5 m clear of the
    // portal, so she is not sucked straight back inside when the cooldown ends.
    exitDrop: { x: 118, z: -127 },
    outsideFacing: 0,
    enterText: 'Inside the garage. Tools, tyres and Ilsa’s workbench — press E to leave.',
  },
];

const WALL_H = 3.4;
const WALL_T = 0.5;

function box(w, h, d, color, roughness = 0.9) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Build one room: floor, four walls (south wall leaves a gap where the exit marker
// sits, so the doorway reads), ceiling lamps, and the furniture for that room.
// Returns the room's collider list (walls + furniture, in world coordinates).
function buildRoom(scene, def) {
  const { x: cx, z: cz } = def.center;
  const { w, d } = def.size;
  const group = new THREE.Group();
  group.name = `interior-${def.id}`;
  const halfW = w / 2;
  const halfD = d / 2;
  const colliders = [];

  const floorColor = def.id === 'office' ? 0x6b4a2f : 0x565a60;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.02, cz);
  floor.receiveShadow = true;
  group.add(floor);
  // A rug in the middle of the office, an oil stain in the garage.
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(def.id === 'office' ? 7 : 5, def.id === 'office' ? 4.5 : 3.5),
    new THREE.MeshStandardMaterial({ color: def.id === 'office' ? 0x7a2430 : 0x2e2a24, roughness: 1 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(cx, 0.04, cz - 1);
  group.add(rug);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: def.id === 'office' ? 0x9a7d5a : 0x7d838a, roughness: 0.9,
  });
  function wall(px, pz, ww, dd) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ww, WALL_H, dd), wallMaterial);
    mesh.position.set(px, WALL_H / 2, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({
      minX: px - ww / 2, maxX: px + ww / 2, minZ: pz - dd / 2, maxZ: pz + dd / 2,
    });
  }
  // North, west, east walls are solid; the south wall has a 2.4 m gap at the exit.
  wall(cx, cz - halfD - WALL_T / 2, w + WALL_T * 2, WALL_T);
  wall(cx - halfW - WALL_T / 2, cz, WALL_T, d);
  wall(cx + halfW + WALL_T / 2, cz, WALL_T, d);
  const gapHalf = 1.2;
  const southZ = cz + halfD + WALL_T / 2;
  const sideW = (w - gapHalf * 2) / 2;
  wall(cx - gapHalf - sideW / 2, southZ, sideW, WALL_T);
  wall(cx + gapHalf + sideW / 2, southZ, sideW, WALL_T);

  // Warm ceiling lamps: emissive spheres that read even when the room is dim.
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffc95e, emissiveIntensity: 2.2,
  });
  for (const lx of [-4.5, 4.5]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), lampMaterial);
    lamp.position.set(cx + lx, WALL_H - 0.4, cz);
    group.add(lamp);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }),
    );
    cord.position.set(cx + lx, WALL_H - 0.15, cz);
    group.add(cord);
  }

  if (def.id === 'office') {
    // Marlow's desk at the north end, a safe in the corner, two chairs, a plant.
    const desk = box(4.4, 0.85, 1.8, 0x4a2f1d, 0.7);
    desk.position.set(cx, 0.45, cz - halfD + 2.2);
    group.add(desk);
    colliders.push({
      minX: cx - 2.2, maxX: cx + 2.2, minZ: cz - halfD + 1.3, maxZ: cz - halfD + 3.1,
    });
    const deskTop = box(4.8, 0.12, 2.1, 0x6b4423, 0.6);
    deskTop.position.set(cx, 0.95, cz - halfD + 2.2);
    group.add(deskTop);
    // The cash stack on the desk: the handover target.
    const cash = box(0.9, 0.28, 0.6, 0x2e7d32, 0.6);
    cash.position.set(cx + 0.8, 1.15, cz - halfD + 2.2);
    group.add(cash);
    const safe = box(1.6, 1.9, 1.2, 0x2e3438, 0.5);
    safe.position.set(cx - halfW + 1.6, 0.95, cz - halfD + 1.4);
    group.add(safe);
    colliders.push({
      minX: cx - halfW + 0.8, maxX: cx - halfW + 2.4, minZ: cz - halfD + 0.8, maxZ: cz - halfD + 2,
    });
    for (const chairX of [-2.2, 2.2]) {
      const chair = box(0.9, 0.9, 0.9, 0x5a2e2e, 0.85);
      chair.position.set(cx + chairX, 0.45, cz - halfD + 4.6);
      group.add(chair);
    }
    const plantPot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.3, 0.6, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.9 }),
    );
    plantPot.position.set(cx + halfW - 1.2, 0.3, cz + halfD - 1.2);
    group.add(plantPot);
    const plant = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.9, 0),
      new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9 }),
    );
    plant.position.set(cx + halfW - 1.2, 1.4, cz + halfD - 1.2);
    group.add(plant);
  } else {
    // The garage: workbench along the north wall, crates, a tyre stack, a tool board.
    const bench = box(5, 0.9, 1.4, 0x6b4423, 0.8);
    bench.position.set(cx - 3, 0.45, cz - halfD + 1.6);
    group.add(bench);
    colliders.push({
      minX: cx - 5.5, maxX: cx - 0.5, minZ: cz - halfD + 0.9, maxZ: cz - halfD + 2.3,
    });
    for (const [crateX, crateZ, s] of [[-6.5, 3.5, 1.6], [6.8, -3.5, 1.4], [5.6, 3.8, 1.1]]) {
      const crate = box(s, s, s, 0x8a6b48, 0.95);
      crate.position.set(cx + crateX, s / 2, cz + crateZ);
      group.add(crate);
      colliders.push({
        minX: cx + crateX - s / 2, maxX: cx + crateX + s / 2,
        minZ: cz + crateZ - s / 2, maxZ: cz + crateZ + s / 2,
      });
    }
    const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    for (let t = 0; t < 3; t += 1) {
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 8, 18), tyreMaterial);
      tyre.rotation.x = Math.PI / 2;
      tyre.position.set(cx + halfW - 1.6, 0.24 + t * 0.46, cz - halfD + 1.6);
      group.add(tyre);
    }
    const board = box(0.15, 2, 3.4, 0x4a4640, 0.9);
    board.position.set(cx + halfW - 0.2, 1.6, cz + 1);
    group.add(board);
  }

  scene.add(group);
  return {
    bounds: {
      minX: cx - halfW + 0.6, maxX: cx + halfW - 0.6,
      minZ: cz - halfD + 0.6, maxZ: cz + halfD - 0.6,
    },
    colliders,
  };
}

// A glowing door portal: two posts, a lintel, and a translucent amber plane the
// player walks through. `pos` is the outside (or inside) marker position.
function buildPortal(scene, pos, facing) {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = facing;
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.6, metalness: 0.4 });
  for (const px of [-1.3, 1.3]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), postMaterial);
    post.position.set(px, 1.5, 0);
    post.castShadow = true;
    group.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.3, 0.3), postMaterial);
  lintel.position.set(0, 3.05, 0);
  group.add(lintel);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 2.9),
    new THREE.MeshBasicMaterial({
      color: 0xffb02e, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  glow.position.set(0, 1.5, 0);
  group.add(glow);
  scene.add(group);
  return group;
}

export function createInteriors(scene) {
  const rooms = {};
  for (const def of INTERIORS) {
    const built = buildRoom(scene, def);
    const exitPortal = buildPortal(scene, def.exit, Math.PI);
    rooms[def.id] = {
      def, bounds: built.bounds, colliders: built.colliders, exitPortal,
    };
  }
  const doors = INTERIORS.map((def) => ({
    def,
    portal: buildPortal(scene, def.outside, def.outsideFacing),
  }));
  return { defs: INTERIORS, rooms, doors };
}

export function interiorById(interiors, id) {
  return interiors.rooms[id] ?? null;
}

// The door check, called once per fixed step while Dana is on foot. Outside, walk
// into a portal to enter; inside, walk into the exit marker to leave. Returns the
// interior id entered, 'exit' when leaving, or null.
export function updateInteriorDoors(interiors, player, currentId) {
  if (player.mode !== 'foot') return null;
  if (!currentId) {
    for (const door of interiors.doors) {
      const d = Math.hypot(player.pos.x - door.def.outside.x, player.pos.z - door.def.outside.z);
      if (d < 2.5) return door.def.id;
    }
    return null;
  }
  const room = interiors.rooms[currentId];
  if (!room) return null;
  const d = Math.hypot(player.pos.x - room.def.exit.x, player.pos.z - room.def.exit.z);
  return d < 2.2 ? 'exit' : null;
}
