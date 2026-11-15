// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. The player shoots hitscan rays against bot bodies and the
// map; bots, the charge, grenades and the round clock all advance in the same
// fixed steps. ?shot=cover|buy|plant|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './physics.js';
import { createAudio } from './audio.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createCharge } from './charge.js';
import { createProjectiles } from './projectiles.js';
import { createEffects } from './effects.js';
import { createEconomy, SHOP } from './economy.js';
import { createHud } from './hud.js';
import { createGame, WIN_ROUNDS, MAX_ROUNDS } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

const audio = createAudio();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.dusk);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.dusk), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const effects = createEffects(scene);
const economy = createEconomy();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const player = createPlayer(map.colliders, map.spawns.vanguard[0]);
const weapon = createWeaponRig(camera);
const bots = createBots(scene, map, effects, audio, random);
const charge = createCharge(scene);
const projectiles = createProjectiles(scene, map.colliders, effects, audio);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const game = createGame({
  map, player, bots, charge, projectiles, effects, audio, hud, economy, input, random,
  weapon, camera, raycaster, shotMode: Boolean(shot),
});

const ctx = {
  player, camera, raycaster,
  time: 0,
  chargePlanted: false,
  chargePos: new THREE.Vector3(),
  playerSite: 'A',
  onBotShot: (...args) => game.onBotShot(...args),
  onDefused: (bot) => game.onDefused(bot),
};

const body = player.state;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
let lastAmmo = '';
let lastVitals = '';
let lastFireHeld = false;
let lastDryFire = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let bobPhase = 0;
let bobY = 0;
let stepTimer = 0;

const ammoStore = {
  pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
  smg: null, rifle: null, shotgun: null,
};

function saveAmmo() {
  ammoStore[weapon.state.def.id] = { mag: weapon.state.mag, reserve: weapon.state.reserve };
}

function equipWeapon(def) {
  saveAmmo();
  const kept = ammoStore[def.id];
  weapon.equip(def, kept);
  hud.setWeapon(def.name, economy.state.grenades);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye + bobY, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzleWorld() {
  muzzle.set(0.22, -0.2, -0.88);
  return camera.localToWorld(muzzle);
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return;
  }
  const def = weapon.state.def;
  camera.getWorldDirection(direction);
  const origin = camera.position.clone();
  let anyHit = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    const dir = direction.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(origin, dir);
    raycaster.far = 90;
    const targets = bots.allHitMeshes().concat(map.shootables);
    const hit = raycaster.intersectObjects(targets, false)[0];
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 80);
    effects.tracer(muzzleWorld(), end);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const distance = hit.distance;
      const falloff = Math.max(def.falloffMin, 1 - Math.max(0, distance - def.falloffStart) * 0.012);
      const amount = def.damage * falloff * (part === 'head' ? def.headMult : 1);
      const killed = bots.damage(bot, amount, part, body.position);
      hud.hitMarker(killed);
      audio.hit(killed);
      anyHit = true;
      if (killed) game.playerKilled(bot, part === 'head');
    } else if (hit) {
      hitPoint.copy(hit.point);
      effects.impact(hitPoint, hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0));
    }
  }
  weapon.pullTrigger();
  player.recoil(def.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * def.recoil * 0.35);
  audio.shot(0);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  for (const bot of bots.list) bots.hearShot(bot, body.position, 'vanguard');
  if (!anyHit) hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function throwGrenade() {
  if (economy.state.grenades <= 0 || !body.alive) return;
  economy.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const origin = camera.position.clone().addScaledVector(direction, 0.4);
  origin.y -= 0.1;
  projectiles.throwGrenade(origin, direction.clone());
  hud.setWeapon(weapon.state.def.name, economy.state.grenades);
  audio.bounce();
}

function handleKeys() {
  const keys = input.state.keys;
  const phase = game.state.phase;
  if (phase === 'live' && body.alive) {
    if (input.wasPressed('KeyR')) {
      if (weapon.reload()) audio.reload();
    }
    if (input.wasPressed('KeyG')) throwGrenade();
    if (input.wasPressed('Digit1')) equipWeapon(WEAPONS.pistol);
    if (input.wasPressed('Digit2') && economy.state.primary) equipWeapon(WEAPONS[economy.state.primary]);
    if (input.wasPressed('WheelDown') || input.wasPressed('WheelUp')) {
      if (weapon.state.def.id === 'pistol' && economy.state.primary) equipWeapon(WEAPONS[economy.state.primary]);
      else equipWeapon(WEAPONS.pistol);
    }
  }
  if (phase === 'buy') {
    for (let i = 0; i < SHOP.length; i += 1) {
      if (input.wasPressed(`Digit${i + 1}`)) buyItem(SHOP[i].id);
    }
    if (input.wasPressed('Enter')) game.startRound();
    if (input.wasPressed('KeyB')) hud.showBuy(hud.els.buyPanel.hidden);
  }
}

function buyItem(itemId) {
  const message = economy.buy(itemId);
  if (message) {
    audio.buy();
    hud.toast(message);
    hud.setMoney(economy.state.money);
    if (itemId === economy.state.primary) equipWeapon(WEAPONS[itemId]);
    if (itemId === 'armor') {
      player.state.armor = economy.state.armor;
      hud.setArmor(player.state.armor);
    }
    hud.setWeapon(weapon.state.def.name, economy.state.grenades);
  } else {
    audio.denied();
  }
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  const phase = game.state.phase;
  if (phase === 'menu' || phase === 'matchEnd') game.startMatch();
  else if (phase === 'paused') input.requestLock();
  else if (phase === 'roundEnd') {
    const decided = game.state.score.vanguard >= WIN_ROUNDS || game.state.score.sentinel >= WIN_ROUNDS || game.state.round >= MAX_ROUNDS;
    if (decided) game.endMatch();
    else game.startBuyPhase();
  }
});
hud.onBuy((itemId) => buyItem(itemId));
hud.onDeploy(() => {
  audio.unlock();
  if (game.state.phase === 'buy') game.startRound();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (game.state.phase === 'live' && body.alive) {
    game.state.phase = 'paused';
    hud.showOverlay('paused');
  }
}

function step(dt) {
  ctx.time += dt;
  ctx.chargePlanted = charge.state.planted;
  ctx.chargePos.copy(charge.state.position);
  ctx.playerSite = game.state.playerSite;
  const speed = player.groundSpeed();
  player.step(dt, input.state.keys);
  weapon.step(dt);
  // Bots only simulate once a match exists: before the first deploy they sit
  // at the origin and would otherwise spot each other and start fighting.
  if (game.state.phase !== 'menu' && game.state.phase !== 'matchEnd') bots.step(dt, ctx);
  projectiles.step(dt, (pos, radius, damage) => game.onBlast(pos, radius, damage));
  effects.step(dt);
  game.step(dt);
  hud.step(dt);

  // Footsteps and view bob while moving on the ground.
  if (player.state.onGround && speed > 1) {
    bobPhase += dt * speed * 1.6;
    bobY = Math.sin(bobPhase * 2) * 0.012 * Math.min(1, speed / 5);
    stepTimer -= dt;
    if (stepTimer <= 0) {
      stepTimer = 0.38;
      audio.step();
    }
  } else {
    bobY = 0;
  }

  // Readouts, written only when they change.
  const ammo = `${weapon.state.mag}|${weapon.state.reserve}|${weapon.state.def.id}|${economy.state.grenades}`;
  if (ammo !== lastAmmo) {
    lastAmmo = ammo;
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    hud.setWeapon(weapon.state.def.name, economy.state.grenades);
  }
  const vitals = `${Math.ceil(body.health)}|${Math.ceil(body.armor)}|${economy.state.money}`;
  if (vitals !== lastVitals) {
    lastVitals = vitals;
    hud.setHealth(body.health);
    hud.setArmor(body.armor);
    hud.setMoney(economy.state.money);
  }
  const spreadPx = 4 + weapon.spread(speed, body.crouching, body.onGround) * 900;
  hud.setCrosshair(spreadPx);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    handleKeys();
    const firing = input.state.firing;
    const semiEdge = firing && !lastFireHeld;
    lastFireHeld = firing;
    if (body.alive && game.state.phase === 'live') {
      if (weapon.state.def.auto ? firing : semiEdge) {
        if (weapon.ready()) shoot(weapon.spread(player.groundSpeed(), body.crouching, body.onGround));
        else if (weapon.state.mag === 0 && weapon.state.cooldown === 0 && now - lastDryFire > 300) {
          lastDryFire = now;
          audio.dryFire();
        }
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  game.startMatch();
  if (name === 'buy') {
    body.position.set(-2, 0, 14);
    body.yaw = 0.12;
    body.pitch = 0;
    settle(10);
    hud.showBuy(true);
    paintTwiceThenReady();
    return;
  }
  game.startRound();
  if (name === 'cover') {
    // Mid-lane firefight: the player advances from spawn as a Sentinel roamer
    // crosses mid, and lands a shot on them.
    body.position.set(0, 0, 1.5);
    body.yaw = 0.05;
    body.pitch = 0;
    const roamer = bots.list.find((b) => b.team === 'sentinel' && b.post && b.post.site === null);
    if (roamer) {
      roamer.position.set(-1, 0, -5);
      roamer.yaw = Math.PI;
    }
    settle(30);
    if (roamer && roamer.alive) {
      aimAt(new THREE.Vector3(roamer.position.x, roamer.position.y + 1.2, roamer.position.z));
      shoot(0);
      settle(2);
    }
    hud.hideBanner();
    paintTwiceThenReady();
    return;
  }
  if (name === 'plant') {
    // Site A, charge planted, defenders converging, fuse running.
    body.position.set(-11.5, 0, -8.5);
    body.yaw = 0.9;
    body.pitch = -0.02;
    charge.plantAt(new THREE.Vector3(-15, 0, -11), 'A');
    game.state.plants = 1;
    hud.banner('CHARGE PLANTED', 'at Site A — defend it for 40 seconds');
    const defender = bots.list.find((b) => b.team === 'sentinel');
    if (defender) {
      defender.position.set(-12.5, 0, -12.8);
      defender.yaw = Math.PI * 0.75;
    }
    settle(40);
    paintTwiceThenReady();
    return;
  }
  if (name === 'end') {
    // Match won: the final overlay over the yard at dusk.
    game.state.score.vanguard = 5;
    game.state.score.sentinel = 3;
    game.state.kills = 11;
    game.state.deaths = 4;
    game.state.plants = 2;
    game.state.phase = 'matchEnd';
    hud.setScore(5, 3, 9);
    hud.setTimer(0);
    hud.showOverlay('match', {
      title: 'VANGUARD WINS THE MATCH',
      copy: 'Final score 5–3 · 11 eliminations, 4 deaths, 2 plants. Click to play again.',
    });
    body.position.set(0, 0, 12);
    body.yaw = -0.3;
    body.pitch = 0.02;
    settle(10);
    paintTwiceThenReady();
    return;
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = game;
window.__emberline = { game, player, bots, input, weapon };
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
