// Weapons: the catalogue, the view model and the firing cycle. Every weapon is
// hitscan with a magazine, a reload and a spread that grows with movement and
// shrinks when the shooter stops, crouches or stands still — stopping to aim
// pays. main.js owns the ray and the damage; this module owns the numbers and
// the gun in the player's hands.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// damage is per hit at close range; falloff starts past falloffStart and bottoms
// out at falloffMin. headMult multiplies damage on a head hit.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 'sidearm', price: 0,
    mag: 12, reserve: 48, auto: false, fireGap: 0.16, reloadTime: 1.4,
    damage: 26, headMult: 2.0, falloffStart: 18, falloffMin: 0.55,
    spreadStill: 0.0025, spreadMove: 0.02, recoil: 0.011, pellets: 1,
    tracer: PALETTE.lamp,
  },
  smg: {
    id: 'smg', name: 'VK-9 Jackal', slot: 'primary', price: 950,
    mag: 28, reserve: 84, auto: true, fireGap: 0.077, reloadTime: 1.7,
    damage: 22, headMult: 2.0, falloffStart: 14, falloffMin: 0.5,
    spreadStill: 0.004, spreadMove: 0.03, recoil: 0.008, pellets: 1,
    tracer: PALETTE.lamp,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longbow', slot: 'primary', price: 2700,
    mag: 25, reserve: 75, auto: true, fireGap: 0.1, reloadTime: 2.1,
    damage: 34, headMult: 2.5, falloffStart: 22, falloffMin: 0.7,
    spreadStill: 0.0016, spreadMove: 0.026, recoil: 0.013, pellets: 1,
    tracer: PALETTE.lamp,
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Hailstorm', slot: 'primary', price: 1400,
    mag: 6, reserve: 24, auto: false, fireGap: 0.85, reloadTime: 2.4,
    damage: 12, headMult: 1.8, falloffStart: 9, falloffMin: 0.35,
    spreadStill: 0.02, spreadMove: 0.03, recoil: 0.03, pellets: 8,
    tracer: PALETTE.lamp,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const ARMOR_VALUE = 50;

export function createWeaponRig(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.7, metalness: 0.25 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2e3236), roughness: 0.45, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.5, metalness: 0.3 });

  // One view model rebuilt per weapon: a receiver, barrel, stock and a sight.
  // Proportions differ per weapon so the gun on screen reads as the gun bought.
  function buildModel(def) {
    const model = new THREE.Group();
    const long = def.id === 'rifle' ? 0.56 : def.id === 'shotgun' ? 0.52 : def.id === 'smg' ? 0.38 : 0.22;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, long), bodyMat);
    model.add(receiver);
    const barrelLen = def.id === 'pistol' ? 0.14 : long * 0.55;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, barrelLen), gripMat);
    barrel.position.set(0, 0.03, -long / 2 - barrelLen / 2 + 0.05);
    model.add(barrel);
    if (def.id !== 'pistol') {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.2), gripMat);
      stock.position.set(0, -0.02, long / 2 + 0.06);
      model.add(stock);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accentMat);
      sight.position.set(0, 0.08, -0.05);
      model.add(sight);
    }
    if (def.id === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.18), accentMat);
      pump.position.set(0, -0.03, -long / 2 + 0.08);
      model.add(pump);
    }
    model.position.set(0.22, -0.23, -0.42);
    return model;
  }

  // Muzzle flash: a small canvas-drawn starburst, additive so it glows against
  // the dusk. A plain square plane reads as a card; the star reads as a flash.
  function flashTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(255, 240, 200, 1)');
    gradient.addColorStop(0.35, 'rgba(255, 179, 71, 0.9)');
    gradient.addColorStop(1, 'rgba(255, 179, 71, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255, 240, 200, 0.95)';
    ctx.beginPath();
    ctx.moveTo(32, 2);
    ctx.lineTo(37, 27);
    ctx.lineTo(62, 32);
    ctx.lineTo(37, 37);
    ctx.lineTo(32, 62);
    ctx.lineTo(27, 37);
    ctx.lineTo(2, 32);
    ctx.lineTo(27, 27);
    ctx.closePath();
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  flash.position.set(0.22, -0.2, -0.88);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 0, 6);
  flashLight.position.set(0.22, -0.18, -0.6);
  camera.add(flashLight);

  let model = null;
  const state = {
    def: WEAPONS.pistol,
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    switchLeft: 0,
  };

  function equip(def, keepAmmo = null) {
    if (model) {
      camera.remove(model);
      model.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    state.def = def;
    state.mag = keepAmmo ? keepAmmo.mag : def.mag;
    state.reserve = keepAmmo ? keepAmmo.reserve : def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
    state.switchLeft = 0.28;
    model = buildModel(def);
    camera.add(model);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (model) {
      model.position.z = -0.42 + state.kick;
      model.position.y = -0.23 - state.switchLeft * 0.12;
      model.rotation.x = state.kick * 2.4;
      if (state.reloadLeft > 0) model.rotation.x = -0.55 * Math.min(1, (state.def.reloadTime - state.reloadLeft) * 2);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = Math.random() * Math.PI;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    pullTrigger() {
      state.cooldown = state.def.fireGap;
      state.flash = 0.06;
      state.kick = 0.05 + state.def.recoil;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.def.reloadTime;
      return true;
    },
    spread(speed, crouching, onGround) {
      const move = Math.min(1, speed / 5.2);
      let value = state.def.spreadStill + move * state.def.spreadMove;
      if (crouching) value *= 0.7;
      if (!onGround) value *= 1.8;
      return value;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    hide() {
      if (model) model.visible = false;
      flash.visible = false;
    },
    show() {
      if (model) model.visible = true;
    },
  };
}
