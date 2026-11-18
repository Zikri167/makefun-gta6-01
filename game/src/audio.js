// Sound, synthesized live with WebAudio — no audio files. An engine hum that follows
// the car's speed, a two-tone siren while the heat is on, and short blips for shots,
// pickups, crashes and mission payouts. Everything is a no-op until the player clicks
// START, because browsers will not start audio without a gesture.
export function createAudio() {
  const audio = {
    ctx: null, master: null, engineOsc: null, engineOsc2: null, engineGain: null,
    sirenOsc: null, sirenGain: null, sirenLfo: null, muted: false, started: false,
    failed: false,
  };

  function ensure() {
    if (audio.started) return true;
    if (audio.failed) return false;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(audio.ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch follows speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineOsc2 = audio.ctx.createOscillator();
      audio.engineOsc2.type = 'sawtooth';
      audio.engineOsc2.frequency.value = 82;
      const engineFilter = audio.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc.connect(engineFilter);
      audio.engineOsc2.connect(engineFilter);
      engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      audio.engineOsc2.start();
      // Siren: a square wave whose pitch alternates on a slow LFO.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'square';
      audio.sirenOsc.frequency.value = 780;
      audio.sirenLfo = audio.ctx.createOscillator();
      audio.sirenLfo.type = 'square';
      audio.sirenLfo.frequency.value = 0.55;
      const sirenLfoGain = audio.ctx.createGain();
      sirenLfoGain.gain.value = 160;
      audio.sirenLfo.connect(sirenLfoGain);
      sirenLfoGain.connect(audio.sirenOsc.frequency);
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.sirenLfo.start();
      audio.started = true;
      return true;
    } catch {
      // Headless shells can refuse a context before any gesture: stop retrying
      // on every sound until the player clicks, when unlock() tries again.
      audio.failed = true;
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue) {
    if (!ensure() || !audio.ctx) return;
    const length = Math.floor(audio.ctx.sampleRate * duration);
    const buffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = audio.ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    source.start();
  }

  function blip(frequency, duration, gainValue = 0.25, when = 0) {
    if (!ensure() || !audio.ctx) return;
    const osc = audio.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0, audio.ctx.currentTime + when);
    gain.gain.linearRampToValueAtTime(gainValue, audio.ctx.currentTime + when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + when + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(audio.ctx.currentTime + when);
    osc.stop(audio.ctx.currentTime + when + duration + 0.05);
  }

  return {
    unlock() {
      audio.failed = false;
      if (ensure() && audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    },
    setMuted(muted) {
      audio.muted = muted;
      if (audio.master && audio.ctx) audio.master.gain.value = muted ? 0 : 0.5;
    },
    // speed in m/s, 0 when on foot or parked. The engine fades in with the car.
    engine(speed, driving) {
      if (!audio.started || !audio.ctx) return;
      const target = driving ? 0.05 + Math.min(Math.abs(speed) / 27, 1) * 0.11 : 0;
      audio.engineGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.08);
      const rpm = 55 + Math.min(Math.abs(speed) / 27, 1) * 110;
      audio.engineOsc.frequency.setTargetAtTime(rpm, audio.ctx.currentTime, 0.08);
      audio.engineOsc2.frequency.setTargetAtTime(rpm * 1.5, audio.ctx.currentTime, 0.08);
    },
    siren(wanted, closestPolice) {
      if (!audio.started || !audio.ctx) return;
      const near = closestPolice !== Infinity && closestPolice < 45;
      const target = wanted > 0 && near ? 0.045 : 0;
      audio.sirenGain.gain.setTargetAtTime(target, audio.ctx.currentTime, 0.3);
    },
    shot() {
      noiseBurst(0.14, 2400, 0.5);
    },
    crash(strength) {
      noiseBurst(0.22, 500, Math.min(0.6, 0.2 + strength * 0.03));
    },
    pickup() {
      blip(880, 0.12, 0.25);
      blip(1318, 0.18, 0.25, 0.09);
    },
    // A low wooden knock for stepping through a door, in or out.
    door() {
      blip(196, 0.14, 0.28);
      blip(147, 0.2, 0.22, 0.1);
    },
    missionDone() {
      blip(523, 0.16, 0.3);
      blip(659, 0.16, 0.3, 0.12);
      blip(784, 0.22, 0.3, 0.24);
      blip(1046, 0.34, 0.3, 0.36);
    },
    // The SUNDOWN finale: the mission jingle, stretched into a slow major run.
    finale() {
      blip(523, 0.2, 0.3);
      blip(659, 0.2, 0.3, 0.16);
      blip(784, 0.2, 0.3, 0.32);
      blip(1046, 0.3, 0.3, 0.48);
      blip(1318, 0.55, 0.3, 0.66);
    },
    busted() {
      blip(220, 0.4, 0.3);
      blip(174, 0.6, 0.3, 0.3);
    },
  };
}
