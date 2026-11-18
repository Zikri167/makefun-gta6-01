// Ilsa's jobs: three story missions, each a chain of steps (go somewhere, pick
// something up, deliver it, lose the cops). A glowing beacon marks the current step
// in the world and on the minimap, and finishing a job pays cash and unlocks the next.
import * as THREE from 'three';

// Mission scripts. Positions are world metres: the docks sit south-west, the garage
// north-east, Marlow's office downtown, the harbor on the south beach road.
export const MISSIONS = [
  {
    id: 'pickup',
    title: 'JOB 1 — THE PICKUP',
    giver: 'Ilsa at the harbor',
    brief: 'A package is waiting at the docks. Grab it and bring it to the garage — no questions, no cops.',
    reward: 150,
    steps: [
      { type: 'goto', pos: { x: -125, z: 125 }, radius: 6, text: 'Go to the docks — the package is at the south-west pier' },
      { type: 'pickup', pos: { x: -125, z: 125 }, radius: 6, text: 'Pick up the package (walk into the marker)' },
      { type: 'goto', pos: { x: 125, z: -125 }, radius: 7, text: 'Deliver it to the garage, north-east corner' },
    ],
  },
  {
    id: 'hotwheels',
    title: 'JOB 2 — HOT WHEELS',
    giver: 'Ilsa at the harbor',
    brief: 'A client wants the orange Comet GT parked on Marina Avenue. Steal it, lose the heat, and bring it home.',
    reward: 300,
    steps: [
      { type: 'steal', pos: { x: 0, z: -100 }, radius: 6, text: 'Steal the orange Comet GT on Marina Avenue (press E beside it)' },
      { type: 'escape', pos: { x: 0, z: -100 }, radius: 6, text: 'Lose the cops — get your wanted level to zero' },
      { type: 'goto', pos: { x: 125, z: -125 }, radius: 7, text: 'Deliver the Comet GT to the garage' },
    ],
  },
  {
    id: 'harborrun',
    title: 'JOB 3 — THE HARBOR RUN',
    giver: 'Ilsa at the harbor',
    brief: 'Marlow wants his money tonight. Three drops across town, the PD on your tail, 90 seconds. Do not stop.',
    reward: 500,
    timeLimit: 90,
    steps: [
      { type: 'goto', pos: { x: -125, z: -125 }, radius: 7, text: 'Drop 1/3 — the north-west corner' },
      { type: 'goto', pos: { x: 125, z: 125 }, radius: 7, text: 'Drop 2/3 — the beachfront, south-east' },
      { type: 'goto', pos: { x: 0, z: 0 }, radius: 8, text: 'Final drop — the park plaza, city centre' },
    ],
  },
];

export function createMissions(scene) {
  // The beacon: a tall glowing cylinder plus a ring on the ground, moved to the
  // current step. Yellow for a job, green for a pickup.
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc21e, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 26, 20, 1, true), beaconMaterial);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc21e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  beacon.position.y = 13;
  beacon.visible = false;
  ring.visible = false;
  scene.add(beacon, ring);
  return {
    defs: MISSIONS,
    activeIndex: 0,
    stepIndex: 0,
    started: false,
    done: false,
    timeLeft: 0,
    beacon,
    ring,
    beaconMaterial,
  };
}

export function currentMission(missions) {
  return missions.defs[missions.activeIndex] ?? null;
}

export function currentStep(missions) {
  const mission = currentMission(missions);
  return mission ? mission.steps[missions.stepIndex] ?? null : null;
}

export function startMission(missions, index, now) {
  missions.activeIndex = index;
  missions.stepIndex = 0;
  missions.started = true;
  missions.done = false;
  const mission = currentMission(missions);
  missions.timeLeft = mission.timeLimit ?? 0;
  moveBeacon(missions);
  return mission;
}

function moveBeacon(missions) {
  const step = currentStep(missions);
  if (!step) {
    missions.beacon.visible = false;
    missions.ring.visible = false;
    return;
  }
  missions.beacon.visible = true;
  missions.ring.visible = true;
  missions.beacon.position.set(step.pos.x, 13, step.pos.z);
  missions.ring.position.set(step.pos.x, 0.12, step.pos.z);
  missions.beaconMaterial.color.set(step.type === 'pickup' ? 0x3ddc5f : 0xffc21e);
  missions.ring.material.color.set(step.type === 'pickup' ? 0x3ddc5f : 0xffc21e);
}

export function missionMarker(missions) {
  const step = currentStep(missions);
  return step && missions.started && !missions.done ? step.pos : null;
}

// Advance the mission state machine. Returns an event string for the feed, or null.
// `events` carries what the player just did: { stoleSports: bool, inCar: bool }.
export function updateMissions(missions, player, wanted, events, now, dt) {
  if (!missions.started || missions.done) return null;
  const mission = currentMission(missions);
  const step = currentStep(missions);
  if (!mission || !step) return null;
  if (mission.timeLimit) {
    missions.timeLeft -= dt;
    if (missions.timeLeft <= 0) {
      missions.started = false;
      missions.stepIndex = 0;
      return 'TIME UP — the Harbor Run failed. Ilsa is not happy. Try again.';
    }
  }
  const dist = Math.hypot(player.pos.x - step.pos.x, player.pos.z - step.pos.z);
  let advanced = false;
  if (step.type === 'goto' && dist < step.radius) advanced = true;
  if (step.type === 'pickup' && dist < step.radius && player.mode === 'foot') advanced = true;
  if (step.type === 'steal' && events.stoleSports) advanced = true;
  if (step.type === 'escape' && wanted.stars === 0) advanced = true;
  if (!advanced) return null;
  missions.stepIndex += 1;
  if (missions.stepIndex >= mission.steps.length) {
    missions.done = true;
    missions.beacon.visible = false;
    missions.ring.visible = false;
    return `MISSION COMPLETE — ${mission.title} · +$${mission.reward}`;
  }
  moveBeacon(missions);
  return currentStep(missions).text;
}

export function missionObjectiveText(missions) {
  const mission = currentMission(missions);
  if (!mission) return { title: 'SOLMAR HEAT', text: 'All jobs done. The city is yours, Dana.' };
  if (missions.done) {
    return { title: 'JOB DONE', text: `Next job unlocks at the harbor. Cash your $${mission.reward} and breathe.` };
  }
  const step = currentStep(missions);
  return { title: mission.title, text: step ? step.text : mission.brief };
}

export function missionDistance(missions, player) {
  const step = currentStep(missions);
  if (!step || !missions.started || missions.done) return null;
  return Math.round(Math.hypot(player.pos.x - step.pos.x, player.pos.z - step.pos.z));
}
