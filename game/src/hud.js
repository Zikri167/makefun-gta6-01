// The HUD: cash and health, wanted stars, the mission objective, speed, the feed of
// what just happened, and the minimap — a 2D canvas that draws the same road grid the
// city is built on, with the player, traffic, police and the job marker on it.
import { GRID, gridCoord, WORLD_HALF, PITCH, ROAD_HALF } from './city.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const size = minimap.width; // 336 backing pixels for a 168 px display
  const scale = size / (WORLD_HALF * 2 + 20);
  const toMapX = (x) => (x + WORLD_HALF + 10) * scale;
  const toMapY = (z) => (z + WORLD_HALF + 10) * scale;
  let frame = 0;
  let bannerTimer = null;

  function drawMinimap(state) {
    const ctx = mapCtx;
    ctx.fillStyle = '#10161f';
    ctx.fillRect(0, 0, size, size);
    // Sea and sand on the south edge.
    ctx.fillStyle = '#2a7fa8';
    ctx.fillRect(0, toMapY(158), size, size - toMapY(158));
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, toMapY(150), size, toMapY(158) - toMapY(150));
    // Blocks.
    ctx.fillStyle = '#3d4450';
    for (let i = 0; i < GRID - 1; i += 1) {
      for (let j = 0; j < GRID - 1; j += 1) {
        const x = toMapX(gridCoord(i) + ROAD_HALF);
        const y = toMapY(gridCoord(j) + ROAD_HALF);
        const w = (PITCH - ROAD_HALF * 2) * scale;
        ctx.fillRect(x, y, w, w);
      }
    }
    // Roads.
    ctx.fillStyle = '#20242b';
    for (let i = 0; i < GRID; i += 1) {
      const c = toMapX(gridCoord(i));
      ctx.fillRect(c - ROAD_HALF * scale, 0, ROAD_HALF * 2 * scale, size);
      const r = toMapY(gridCoord(i));
      ctx.fillRect(0, r - ROAD_HALF * scale, size, ROAD_HALF * 2 * scale);
    }
    // Park plaza.
    ctx.fillStyle = '#5d8a4a';
    ctx.beginPath();
    ctx.arc(toMapX(0), toMapY(0), 13 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Mission marker, pulsing.
    if (state.marker) {
      const pulse = 1 + Math.sin(state.now * 5) * 0.18;
      ctx.fillStyle = '#ffc21e';
      ctx.save();
      ctx.translate(toMapX(state.marker.x), toMapY(state.marker.z));
      ctx.rotate(Math.PI / 4);
      const s = 7 * pulse;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
    // Traffic as white dots, police as red ones.
    ctx.fillStyle = '#e8e4da';
    for (const car of state.traffic) {
      ctx.beginPath();
      ctx.arc(toMapX(car.x), toMapY(car.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff3b30';
    for (const car of state.police) {
      ctx.beginPath();
      ctx.arc(toMapX(car.x), toMapY(car.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing where she faces.
    ctx.save();
    ctx.translate(toMapX(state.player.x), toMapY(state.player.z));
    ctx.rotate(state.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#c9c2b0';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('N', 8, 20);
  }

  function starsText(stars) {
    let out = '';
    for (let i = 0; i < 5; i += 1) out += i < stars ? '★' : '☆';
    return out;
  }

  const hud = {
    feed(message) {
      const feed = el('feed');
      const line = document.createElement('div');
      line.textContent = message;
      feed.prepend(line);
      while (feed.children.length > 4) feed.removeChild(feed.lastChild);
      window.setTimeout(() => {
        if (line.parentNode) line.parentNode.removeChild(line);
      }, 9000);
    },
    banner(title, sub, seconds = 2.6) {
      el('banner-title').textContent = title;
      el('banner-sub').textContent = sub;
      el('banner').hidden = false;
      if (bannerTimer) window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => {
        el('banner').hidden = true;
      }, seconds * 1000);
    },
    update(state) {
      el('cash').innerHTML = `<small>SOLMAR BANK</small>$${state.cash.toLocaleString('en-US')}`;
      el('health-fill').style.width = `${Math.max(0, state.health)}%`;
      el('health-fill').style.background = state.health > 50 ? '#57d977' : state.health > 25 ? '#ffb02e' : '#ff3b30';
      el('health-num').textContent = String(Math.round(state.health));
      const starsEl = el('stars');
      const text = starsText(state.stars);
      if (starsEl.textContent !== text) starsEl.textContent = text;
      el('objective-title').textContent = state.objective.title;
      el('objective-text').textContent = state.objective.text;
      el('objective-dist').textContent = state.objective.dist === null
        ? ''
        : `${state.objective.dist} m${state.timeLeft ? ` · ${Math.ceil(state.timeLeft)}s left` : ''}`;
      el('speed-num').textContent = String(Math.round(state.speedKmh));
      el('gear').textContent = state.driving ? (state.speedKmh > 1 ? 'DRIVE' : state.speedKmh < -1 ? 'REVERSE' : 'DRIVE') : 'ON FOOT';
      el('crosshair').style.display = state.driving ? 'none' : 'block';
      frame += 1;
      if (frame % 3 === 1) drawMinimap(state);
    },
    showStart(save) {
      el('start-screen').hidden = false;
      const continueBtn = el('continue-btn');
      if (save && (save.cash > 0 || save.jobsDone > 0 || save.missionIndex > 0)) {
        continueBtn.hidden = false;
        continueBtn.textContent = `CONTINUE — $${save.cash} · JOB ${save.missionIndex + 1}`;
      } else {
        continueBtn.hidden = true;
      }
    },
    hideStart() {
      el('start-screen').hidden = true;
    },
    showPause(show) {
      el('pause-screen').hidden = !show;
    },
    showEnd(title, text) {
      el('end-title').textContent = title;
      el('end-text').textContent = text;
      el('end-screen').hidden = false;
    },
    hideEnd() {
      el('end-screen').hidden = true;
    },
    onPlay(callback) {
      el('play-btn').addEventListener('click', () => callback(false));
      el('continue-btn').addEventListener('click', () => callback(true));
    },
    onResume(callback) {
      el('resume-btn').addEventListener('click', callback);
    },
    onRestart(callback) {
      el('restart-btn').addEventListener('click', callback);
    },
    onRetry(callback) {
      el('retry-btn').addEventListener('click', callback);
    },
  };
  return hud;
}
