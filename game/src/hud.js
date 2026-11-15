// The HUD: every DOM readout, overlay and menu, driven by the game and nothing
// else. The crosshair gap follows the weapon's spread, the health bar follows
// damage, and the buy menu lists the economy's shop. All ids live in index.html.
import { SHOP } from './economy.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('damage-vignette'),
    healthFill: $('health-fill'),
    healthNum: $('health-num'),
    armorFill: $('armor-fill'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    money: $('money-value'),
    grenades: $('grenades'),
    timer: $('timer'),
    scoreV: $('score-vanguard'),
    scoreS: $('score-sentinel'),
    roundNum: $('round-num'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerText: $('banner-text'),
    bannerSub: $('banner-sub'),
    plantWrap: $('plant-wrap'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    defuseWarn: $('defuse-warn'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play'),
    buyPanel: $('buy-panel'),
    buyList: $('buy-list'),
    buyMoney: $('buy-money'),
    deployBtn: $('deploy'),
    toast: $('toast'),
  };

  let bannerTimer = 0;
  let toastTimer = 0;
  let vignetteTimer = 0;

  // Build the buy menu once from the economy's shop.
  els.buyList.innerHTML = '';
  SHOP.forEach((item, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.item = item.id;
    row.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    els.buyList.appendChild(row);
  });

  function showOverlay(kind, data = {}) {
    els.overlay.hidden = false;
    const titles = {
      start: ['EMBERLINE', 'A dusk freight yard. Plant the charge at Site A or Site B — or eliminate all five Sentinels. Click to deploy.'],
      paused: ['Paused', 'The round is waiting. Click to get back in.'],
      round: [data.title ?? 'Round over', data.copy ?? ''],
      match: [data.title ?? 'Match over', data.copy ?? ''],
    };
    const [title, copy] = titles[kind] ?? titles.start;
    els.overlayTitle.textContent = title;
    els.overlayCopy.textContent = copy;
    els.playBtn.textContent = kind === 'start' ? 'Deploy' : kind === 'paused' ? 'Resume' : kind === 'match' ? 'Play again' : 'Next round';
  }

  return {
    els,
    setHealth(health) {
      els.healthFill.style.width = `${Math.max(0, health)}%`;
      els.healthNum.textContent = Math.ceil(health);
      els.healthFill.classList.toggle('low', health <= 30);
    },
    setArmor(armor) {
      els.armorFill.style.width = `${Math.min(100, armor * 2)}%`;
      els.armorNum.textContent = Math.ceil(armor);
    },
    setAmmo(mag, reserve) {
      els.ammoMag.textContent = mag;
      els.ammoReserve.textContent = `/ ${reserve}`;
    },
    setWeapon(name, grenades) {
      els.weaponName.textContent = name;
      els.grenades.textContent = `◉ ${grenades}`;
    },
    setMoney(money) {
      els.money.textContent = `$${money}`;
      els.buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      els.timer.classList.toggle('urgent', seconds <= 10);
    },
    setScore(vanguard, sentinel, round) {
      els.scoreV.textContent = vanguard;
      els.scoreS.textContent = sentinel;
      els.roundNum.textContent = `ROUND ${round}`;
    },
    setCrosshair(spreadPx) {
      els.crosshair.style.setProperty('--gap', `${spreadPx}px`);
    },
    hitMarker(kill) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', kill);
      setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), 110);
    },
    damageFlash() {
      els.vignette.classList.add('on');
      vignetteTimer = 0.25;
    },
    killfeed(text, good) {
      const entry = document.createElement('div');
      entry.className = `feed-entry${good ? ' good' : ''}`;
      entry.textContent = text;
      els.killfeed.prepend(entry);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => entry.remove(), 6000);
    },
    banner(text, sub = '', ms = 2200) {
      els.bannerText.textContent = text;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('on');
      bannerTimer = ms / 1000;
    },
    hideBanner() {
      els.banner.classList.remove('on');
      bannerTimer = 0;
    },
    toast(text) {
      els.toast.textContent = text;
      els.toast.classList.add('on');
      toastTimer = 2.2;
    },
    setPlant(progress, label) {
      if (progress === null) {
        els.plantWrap.hidden = true;
        return;
      }
      els.plantWrap.hidden = false;
      els.plantFill.style.width = `${Math.round(progress * 100)}%`;
      els.plantLabel.textContent = label;
    },
    setDefuseWarning(on) {
      els.defuseWarn.hidden = !on;
    },
    showOverlay,
    hideOverlay() {
      els.overlay.hidden = true;
    },
    showBuy(open) {
      els.buyPanel.hidden = !open;
      if (open) this.setMoney(Number.parseInt(els.money.textContent.slice(1), 10) || 0);
    },
    onPlay(callback) {
      els.playBtn.addEventListener('click', callback);
    },
    onBuy(callback) {
      els.buyList.addEventListener('click', (event) => {
        const row = event.target.closest('.buy-row');
        if (row) callback(row.dataset.item);
      });
    },
    onDeploy(callback) {
      els.deployBtn.addEventListener('click', callback);
    },
    step(dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) els.banner.classList.remove('on');
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) els.toast.classList.remove('on');
      }
      if (vignetteTimer > 0) {
        vignetteTimer -= dt;
        if (vignetteTimer <= 0) els.vignette.classList.remove('on');
      }
    },
  };
}
