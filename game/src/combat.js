// Combat: a simple hitscan pistol for on-foot Dana. Click fires a ray from the camera
// through the crosshair; a pedestrian hit knocks them down and raises heat, a car hit
// dents it, and a short-lived tracer shows the shot. No ammo to manage — the cooldown
// is the limiter.
import * as THREE from 'three';
import { addWanted } from './wanted.js';
import { knockDownPedestrian, scarePedestrians, getCorners } from './pedestrians.js';

const FIRE_INTERVAL = 0.28;
const RANGE = 90;

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = RANGE;
  const tracerGeometry = new THREE.BufferGeometry();
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
  tracer.visible = false;
  scene.add(tracer);
  return {
    raycaster, tracer, tracerUntil: 0, lastShotAt: -99, shotsFired: 0, hits: 0,
  };
}

function showTracer(combat, from, to, now) {
  combat.tracer.geometry.setFromPoints([from, to]);
  combat.tracer.visible = true;
  combat.tracerUntil = now + 0.07;
}

// Fire once. `targets` is { peds, traffic, police, corners, random, wanted, audio, onEvent }.
export function fireWeapon(combat, camera, targets, now) {
  if (now - combat.lastShotAt < FIRE_INTERVAL) return false;
  combat.lastShotAt = now;
  combat.shotsFired += 1;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  combat.raycaster.set(camera.position, direction);
  const hitTargets = [];
  for (const ped of targets.peds) {
    if (now < ped.downUntil) continue;
    hitTargets.push(ped.mesh);
  }
  for (const car of [...targets.traffic, ...targets.police]) hitTargets.push(car.mesh);
  const hits = combat.raycaster.intersectObjects(hitTargets, true);
  const end = camera.position.clone().addScaledVector(direction, RANGE);
  if (hits.length > 0) {
    const hit = hits[0];
    end.copy(hit.point);
    combat.hits += 1;
    let root = hit.object;
    while (root.parent && root.parent.type === 'Group') root = root.parent;
    const ped = targets.peds.find((p) => p.mesh === root);
    if (ped) {
      knockDownPedestrian(ped, now, targets.corners, targets.random);
      addWanted(targets.wanted, 1, 'Pedestrian down — the PD saw that.', now, targets.onEvent);
      scarePedestrians(targets.peds, ped.mesh.position.x, ped.mesh.position.z, now, 4);
    } else {
      const car = [...targets.traffic, ...targets.police].find((c) => c.mesh === root);
      if (car && car.kind === 'police') {
        addWanted(targets.wanted, 1, 'Shots fired at the PD.', now, targets.onEvent);
      }
    }
  }
  scarePedestrians(targets.peds, camera.position.x, camera.position.z, now, 1.5);
  showTracer(combat, camera.position.clone(), end, now);
  if (targets.audio) targets.audio.shot();
  return true;
}

export function updateCombat(combat, now) {
  if (combat.tracer.visible && now > combat.tracerUntil) combat.tracer.visible = false;
}

export function cornersForCombat() {
  return getCorners();
}
