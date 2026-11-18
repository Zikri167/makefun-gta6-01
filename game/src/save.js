// Save: one small localStorage record — cash, which job Dana is on (0-3 across the
// four jobs, SUNDOWN included), how many jobs she finished, and the mute setting.
// Written on every mission payout and every ten seconds of play; a missing or
// corrupt record just starts a fresh day.
const SAVE_KEY = 'solmar-heat-save-v1';

export function defaultSave() {
  return { cash: 0, missionIndex: 0, jobsDone: 0, muted: false, bestCash: 0 };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...defaultSave(), ...parsed };
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): the day then lasts this visit only.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
