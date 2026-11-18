// Time of day: day and dusk. One function, no per-frame cost — it sets the sun, the
// sky and fog, the hemisphere light and the street-lamp glow once, and the renderer
// keeps painting that mood until the mode changes. SUNDOWN (job 4) plays at dusk:
// the sun drops low and orange, the sky turns purple-orange, the fog closes in, and
// the lamps burn brighter. resetWorld restores day; the finale keeps dusk.
import * as THREE from 'three';

const MODES = {
  day: {
    sunColor: 0xfff2d0, sunIntensity: 2.6, sunPos: [80, 140, 60],
    sky: 0x87b7d9, fogColor: 0x9fc3dd, fogNear: 120, fogFar: 320,
    hemiIntensity: 1.1, lampGlow: 0.9,
  },
  dusk: {
    sunColor: 0xff9a4d, sunIntensity: 1.1, sunPos: [-90, 48, 110],
    sky: 0x3a2b4d, fogColor: 0x4a3560, fogNear: 55, fogFar: 210,
    hemiIntensity: 0.45, lampGlow: 2.4,
  },
};

export function setTimeOfDay(game, mode) {
  const preset = MODES[mode];
  if (!preset) return game.timeOfDay ?? 'day';
  game.sun.color.set(preset.sunColor);
  game.sun.intensity = preset.sunIntensity;
  game.sun.position.set(preset.sunPos[0], preset.sunPos[1], preset.sunPos[2]);
  game.scene.background.set(preset.sky);
  if (game.scene.fog) {
    game.scene.fog.color.set(preset.fogColor);
    game.scene.fog.near = preset.fogNear;
    game.scene.fog.far = preset.fogFar;
  }
  if (game.hemi) game.hemi.intensity = preset.hemiIntensity;
  if (game.city.lampHeadMaterial) {
    game.city.lampHeadMaterial.emissiveIntensity = preset.lampGlow;
  }
  game.timeOfDay = mode;
  return mode;
}

export function timeOfDayModes() {
  return Object.keys(MODES);
}
