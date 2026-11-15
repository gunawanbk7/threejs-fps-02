// Bots: the other nine players. Each bot has a body (built from boxes, team
// colours, a health bar overhead), a waypoint route, and a small state machine:
// HOLD a post, PATROL a lane, PUSH toward a site, ENGAGE a visible enemy,
// INVESTIGATE a sound, DEFUSE the charge. They see through a line-of-sight ray
// with a field of view and a reaction time, shoot in bursts whose accuracy
// grows the longer they hold a target, and hear gunshots nearby.
import * as THREE from 'three';
import { TEAM } from './palette.js';
import { createMover, findRoute } from './physics.js';
import { WEAPONS } from './weapons.js';

const BOT_HEIGHT = 1.72;
const BOT_SPEED = 3.6;
const VISION_RANGE = 42;
const VISION_COS = 0.35; // ~69 degrees half-angle
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.65;

const ALLY_NAMES = ['Rook', 'Wren'];
const ENEMY_NAMES = ['Ash', 'Bramble', 'Cinder', 'Dusk', 'Flint'];

// Defender posts: two hold A, two hold B, one roams mid.
const DEFEND_POSTS = [
  { site: 'A', node: 8, hold: new THREE.Vector3(-14, 0, -10) },
  { site: 'A', node: 7, hold: new THREE.Vector3(-16.5, 0, -13) },
  { site: 'B', node: 12, hold: new THREE.Vector3(14, 0, -10) },
  { site: 'B', node: 11, hold: new THREE.Vector3(16.5, 0, -13) },
  { site: null, node: 3, hold: new THREE.Vector3(0, 0, -8) },
];

function buildBotMesh(team) {
  const colors = TEAM[team];
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.dark), roughness: 0.85, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.color), roughness: 0.6, metalness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6f5c, roughness: 0.9, metalness: 0 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.5, metalness: 0.5 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.17), cloth);
  legL.position.set(-0.11, 0.26, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.17), cloth);
  legR.position.set(0.11, 0.26, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
  torso.position.set(0, 0.84, 0);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.36), accent);
  vest.position.set(0, 0.9, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.set(0, 1.32, 0);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), accent);
  helmet.position.set(0, 1.44, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), gunMat);
  gun.position.set(0.18, 1.02, -0.28);
  group.add(legL, legR, torso, vest, head, helmet, gun);
  for (const mesh of group.children) {
    mesh.castShadow = true;
  }
  return { group, legL, legR, torso, head, gun };
}

function makeHealthBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.9, 0.11, 1);
  sprite.position.y = 1.85;
  return { canvas, texture, sprite };
}

function drawHealthBar(bar, fraction) {
  const ctx = bar.canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 8);
  ctx.fillStyle = 'rgba(10,10,12,0.7)';
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = fraction > 0.5 ? '#4caf6d' : fraction > 0.25 ? '#e8c33a' : '#d84a2a';
  ctx.fillRect(1, 1, 62 * Math.max(0, fraction), 6);
  bar.texture.needsUpdate = true;
}

export function createBots(scene, map, effects, audio, random) {
  const mover = createMover(map.colliders);
  const raycaster = new THREE.Raycaster();
  raycaster.far = VISION_RANGE + 10;
  const bots = [];
  const tmpDirection = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function createBot(id, name, team) {
    const parts = buildBotMesh(team);
    const bar = makeHealthBar();
    parts.group.add(bar.sprite);
    parts.head.userData = { bot: null, part: 'head' };
    parts.torso.userData = { bot: null, part: 'body' };
    parts.legL.userData = { bot: null, part: 'body' };
    parts.legR.userData = { bot: null, part: 'body' };
    scene.add(parts.group);
    const bot = {
      id, name, team,
      alive: true,
      health: 100,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      yaw: 0,
      state: 'HOLD',
      post: null,
      route: [],
      routeIndex: 0,
      target: null, // { kind: 'player' | 'bot', ref }
      lastSeen: new THREE.Vector3(),
      lastSeenTime: -100,
      tracking: 0,
      reaction: 0,
      burstLeft: 0,
      burstTimer: 0,
      fireTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      walkPhase: 0,
      hearPos: null,
      idleTimer: 0,
      defuseProgress: 0,
      defusePause: 0,
      flinch: 0,
      weapon: WEAPONS.rifle,
      parts,
      bar,
      hitMeshes: [parts.head, parts.torso, parts.legL, parts.legR],
    };
    for (const mesh of bot.hitMeshes) mesh.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  // Roster: the player plus two Vanguard allies against five Sentinels.
  createBot(0, ALLY_NAMES[0], 'vanguard');
  createBot(1, ALLY_NAMES[1], 'vanguard');
  for (let i = 0; i < 5; i += 1) createBot(2 + i, ENEMY_NAMES[i], 'sentinel');

  function spawnRound() {
    const allies = bots.filter((b) => b.team === 'vanguard');
    const enemies = bots.filter((b) => b.team === 'sentinel');
    allies.forEach((bot, i) => {
      bot.alive = true;
      bot.health = 100;
      bot.position.copy(map.spawns.vanguard[i % map.spawns.vanguard.length]);
      bot.yaw = 0;
      bot.velocity.set(0, 0, 0);
      bot.state = 'PUSH';
      bot.route = [];
      bot.routeIndex = 0;
      bot.target = null;
      bot.tracking = 0;
      bot.defuseProgress = 0;
      bot.parts.group.visible = true;
      bot.parts.group.rotation.set(0, 0, 0);
      drawHealthBar(bot.bar, 1);
    });
    enemies.forEach((bot, i) => {
      bot.alive = true;
      bot.health = 100;
      bot.position.copy(map.spawns.sentinel[i % map.spawns.sentinel.length]);
      bot.yaw = Math.PI;
      bot.velocity.set(0, 0, 0);
      bot.post = DEFEND_POSTS[i % DEFEND_POSTS.length];
      bot.state = bot.post.site === null ? 'PATROL' : 'HOLD';
      bot.route = [];
      bot.routeIndex = 0;
      bot.target = null;
      bot.tracking = 0;
      bot.defuseProgress = 0;
      bot.parts.group.visible = true;
      bot.parts.group.rotation.set(0, 0, 0);
      drawHealthBar(bot.bar, 1);
    });
  }

  function eyeOf(bot) {
    tmpEye.set(bot.position.x, bot.position.y + 1.5, bot.position.z);
    return tmpEye;
  }

  function canSee(bot, targetPos) {
    tmpDirection.copy(targetPos).sub(eyeOf(bot));
    const distance = tmpDirection.length();
    if (distance > VISION_RANGE) return false;
    tmpDirection.normalize();
    // Field of view: the bot must be roughly facing the target.
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (forward.dot(tmpDirection) < VISION_COS && distance > 3) return false;
    raycaster.set(eyeOf(bot), tmpDirection);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(map.shootables, false)[0];
    return !hit;
  }

  function nearestVisibleEnemy(bot, player, now) {
    let best = null;
    let bestDist = Infinity;
    const candidates = [];
    // The player fights for Vanguard: only Sentinels count them as an enemy.
    if (bot.team === 'sentinel' && player.state.alive && player.state.health > 0) {
      candidates.push({ kind: 'player', ref: player, pos: new THREE.Vector3(player.state.position.x, player.state.position.y + 1.2, player.state.position.z) });
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      candidates.push({ kind: 'bot', ref: other, pos: new THREE.Vector3(other.position.x, other.position.y + 1.2, other.position.z) });
    }
    for (const candidate of candidates) {
      const dist = bot.position.distanceTo(candidate.pos);
      if (dist >= bestDist) continue;
      if (canSee(bot, candidate.pos)) {
        best = candidate;
        bestDist = dist;
      }
    }
    return best;
  }

  function setRoute(bot, targetNode) {
    const from = map.nearestWaypoint(bot.position.x, bot.position.z);
    const route = findRoute(map.edges, from, targetNode);
    bot.route = route ?? [targetNode];
    bot.routeIndex = 0;
  }

  function routeTarget(bot) {
    if (bot.routeIndex >= bot.route.length) return null;
    return map.waypoints[bot.route[bot.routeIndex]];
  }

  function hearShot(bot, position, shooterTeam) {
    if (!bot.alive || shooterTeam === bot.team) return;
    if (bot.state === 'ENGAGE' || bot.state === 'DEFUSE') return;
    const dist = bot.position.distanceTo(position);
    if (dist > 32) return;
    bot.hearPos = position.clone();
    bot.state = 'INVESTIGATE';
    setRoute(bot, map.nearestWaypoint(position.x, position.z));
    bot.idleTimer = 0;
  }

  function damage(bot, amount, part, fromPos = null) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.flinch = 0.4;
    bot.defusePause = 1;
    drawHealthBar(bot.bar, Math.max(0, bot.health / 100));
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.state = 'DEAD';
      bot.target = null;
      // Fall over: the body stays visible as a casualty of the round.
      bot.parts.group.rotation.z = Math.PI / 2;
      bot.parts.group.position.y = 0.2;
      bot.bar.sprite.visible = false;
      return true;
    }
    // Being shot at makes a bot turn toward the shooter and fight back.
    if (fromPos && (bot.state === 'HOLD' || bot.state === 'PATROL' || bot.state === 'PUSH')) {
      bot.hearPos = fromPos.clone();
      bot.state = 'INVESTIGATE';
      setRoute(bot, map.nearestWaypoint(fromPos.x, fromPos.z));
      bot.idleTimer = 0;
    }
    return false;
  }

  function shootAt(bot, target, distance, dt, ctx) {
    bot.fireTimer -= dt;
    if (bot.fireTimer > 0) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.fireTimer = 0.45 + random() * 0.5;
      return;
    }
    bot.burstLeft -= 1;
    bot.fireTimer = 0.11;
    const targetSpeed = target.kind === 'player'
      ? Math.hypot(target.ref.state.velocity.x, target.ref.state.velocity.z)
      : Math.hypot(target.ref.velocity.x, target.ref.velocity.z);
    const aim = Math.max(0.06, Math.min(0.85,
      0.62 - distance * 0.011 - targetSpeed * 0.02 + bot.tracking * 0.12));
    const hitRoll = random();
    const muzzle = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
    const end = new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z);
    if (hitRoll < aim) {
      // A hit: damage with falloff, a small headshot chance, and a tracer on target.
      const head = random() < 0.1;
      const falloff = Math.max(bot.weapon.falloffMin, 1 - Math.max(0, distance - bot.weapon.falloffStart) * 0.012);
      const amount = bot.weapon.damage * falloff * (head ? bot.weapon.headMult : 1);
      ctx.onBotShot(bot, target, amount, head, muzzle, end);
    } else {
      // A miss still shows a tracer whipping past the target.
      end.x += (random() - 0.5) * 2.2;
      end.y += (random() - 0.5) * 1.6;
      end.z += (random() - 0.5) * 2.2;
      effects.tracer(muzzle, end);
      audio.shot(distance);
    }
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) return;
    const now = ctx.time;
    bot.flinch = Math.max(0, bot.flinch - dt);
    bot.defusePause = Math.max(0, bot.defusePause - dt);

    // The charge is gone (defused or detonated): stop trying to defuse it.
    if (bot.state === 'DEFUSE' && !ctx.chargePlanted) {
      bot.state = 'HOLD';
      bot.defuseProgress = 0;
    }

    // Vanguard allies push toward the site the player is nearest to. This runs
    // before the movement logic below, so a fresh PUSH always has a route.
    if (bot.team === 'vanguard' && bot.state === 'PUSH' && bot.route.length === 0) {
      const siteNode = ctx.playerSite === 'A' ? 8 : 12;
      setRoute(bot, siteNode);
    }

    // Perception, staggered by bot id so all nine bots never raycast at once.
    if (Math.floor((now + bot.id * 0.13) / 0.12) !== Math.floor((now - dt + bot.id * 0.13) / 0.12)) {
      const seen = nearestVisibleEnemy(bot, ctx.player, now);
      if (seen) {
        if (!bot.target || bot.target.ref !== seen.ref) {
          bot.reaction = REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
          bot.tracking = 0;
        }
        bot.target = seen;
        bot.lastSeen.copy(seen.pos);
        bot.lastSeenTime = now;
      } else if (bot.target && now - bot.lastSeenTime > 2.5) {
        bot.target = null;
        bot.tracking = 0;
      }
    }

    // Reaction time: a bot that just spotted an enemy does not fire instantly.
    if (bot.target) {
      bot.reaction -= dt;
      if (bot.reaction <= 0) {
        bot.state = 'ENGAGE';
        bot.tracking = Math.min(2.5, bot.tracking + dt);
      }
    } else if (bot.state === 'ENGAGE') {
      bot.state = 'INVESTIGATE';
      bot.hearPos = bot.lastSeen.clone();
      setRoute(bot, map.nearestWaypoint(bot.lastSeen.x, bot.lastSeen.z));
      bot.idleTimer = 0;
    }

    // The charge changes everything for defenders: the nearest living Sentinel
    // routes to it and defuses; the rest converge on the site.
    if (ctx.chargePlanted && bot.team === 'sentinel' && bot.state !== 'ENGAGE') {
      if (bot.state !== 'DEFUSE') {
        const others = bots.filter((b) => b.team === 'sentinel' && b.alive && b.state === 'DEFUSE' && b !== bot);
        if (others.length === 0) {
          bot.state = 'DEFUSE';
          setRoute(bot, map.nearestWaypoint(ctx.chargePos.x, ctx.chargePos.z));
        } else {
          bot.state = 'PUSH';
          setRoute(bot, map.nearestWaypoint(ctx.chargePos.x, ctx.chargePos.z));
        }
      }
    }

    let moveX = 0;
    let moveZ = 0;
    let moveSpeed = BOT_SPEED;

    if (bot.state === 'ENGAGE' && bot.target && bot.reaction <= 0) {
      // Face the target, strafe to stay a hard target, and shoot in bursts.
      const dx = bot.target.pos.x - bot.position.x;
      const dz = bot.target.pos.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.8 + random() * 0.8;
      }
      const dist = Math.hypot(dx, dz);
      const strafeX = Math.cos(bot.yaw) * bot.strafeDir;
      const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir;
      moveX = strafeX * 0.7;
      moveZ = strafeZ * 0.7;
      if (dist > 14) {
        moveX += -Math.sin(bot.yaw) * 0.6;
        moveZ += -Math.cos(bot.yaw) * 0.6;
      } else if (dist < 5) {
        moveX += Math.sin(bot.yaw) * 0.5;
        moveZ += Math.cos(bot.yaw) * 0.5;
      }
      if (bot.flinch <= 0) shootAt(bot, bot.target, dist, dt, ctx);
    } else if (bot.state === 'DEFUSE') {
      const dist = Math.hypot(ctx.chargePos.x - bot.position.x, ctx.chargePos.z - bot.position.z);
      if (dist > 1.7) {
        const node = routeTarget(bot);
        if (node) {
          moveX = node.x - bot.position.x;
          moveZ = node.z - bot.position.z;
          const len = Math.hypot(moveX, moveZ) || 1;
          moveX /= len;
          moveZ /= len;
          if (Math.hypot(node.x - bot.position.x, node.z - bot.position.z) < 0.7) bot.routeIndex += 1;
        } else {
          moveX = ctx.chargePos.x - bot.position.x;
          moveZ = ctx.chargePos.z - bot.position.z;
          const len = Math.hypot(moveX, moveZ) || 1;
          moveX /= len;
          moveZ /= len;
        }
      } else if (bot.defusePause <= 0) {
        bot.defuseProgress += dt;
        if (bot.defuseProgress >= 5) ctx.onDefused(bot);
        bot.yaw = Math.atan2(-(ctx.chargePos.x - bot.position.x), -(ctx.chargePos.z - bot.position.z));
      }
    } else if (bot.state === 'PUSH' || bot.state === 'INVESTIGATE') {
      const node = routeTarget(bot);
      let tx;
      let tz;
      if (node) {
        tx = node.x;
        tz = node.z;
        if (Math.hypot(tx - bot.position.x, tz - bot.position.z) < 0.7) bot.routeIndex += 1;
      } else if (bot.hearPos) {
        tx = bot.hearPos.x;
        tz = bot.hearPos.z;
      } else {
        tx = bot.position.x;
        tz = bot.position.z;
      }
      const dx = tx - bot.position.x;
      const dz = tz - bot.position.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.4) {
        moveX = dx / len;
        moveZ = dz / len;
        bot.yaw = Math.atan2(-moveX, -moveZ);
      }
      if (bot.routeIndex >= bot.route.length) {
        bot.idleTimer += dt;
        if (bot.state === 'PUSH') {
          bot.state = 'HOLD';
        } else if (bot.idleTimer > 4) {
          bot.state = bot.team === 'sentinel' ? 'HOLD' : 'PUSH';
          bot.idleTimer = 0;
          if (bot.team === 'sentinel' && bot.post) {
            setRoute(bot, bot.post.node);
          }
        }
      }
    } else if (bot.state === 'PATROL') {
      const node = routeTarget(bot);
      if (node) {
        const dx = node.x - bot.position.x;
        const dz = node.z - bot.position.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.7) {
          bot.routeIndex += 1;
          if (bot.routeIndex >= bot.route.length) {
            const patrol = [2, 3, 6, 10];
            const next = patrol[Math.floor(random() * patrol.length)];
            setRoute(bot, next);
          }
        } else {
          moveX = dx / len;
          moveZ = dz / len;
          bot.yaw = Math.atan2(-moveX, -moveZ);
        }
      } else {
        setRoute(bot, 2);
      }
    } else if (bot.state === 'HOLD') {
      // Hold the post, slowly scanning the lane.
      bot.yaw += Math.sin(now * 0.5 + bot.id * 1.7) * dt * 0.35;
      if (bot.post && bot.position.distanceTo(bot.post.hold) > 1.2) {
        setRoute(bot, bot.post.node);
        bot.state = 'PUSH';
      }
    }

    // Separation: bots never stack on each other.
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const dx = bot.position.x - other.position.x;
      const dz = bot.position.z - other.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.01 && d2 < 0.64) {
        const d = Math.sqrt(d2);
        moveX += (dx / d) * 0.8;
        moveZ += (dz / d) * 0.8;
      }
    }

    const moving = Math.hypot(moveX, moveZ) > 0.01;
    if (moving) {
      const len = Math.hypot(moveX, moveZ);
      bot.velocity.x = (moveX / len) * moveSpeed;
      bot.velocity.z = (moveZ / len) * moveSpeed;
      bot.walkPhase += dt * 9;
    } else {
      bot.velocity.x = 0;
      bot.velocity.z = 0;
    }
    bot.velocity.y -= 20 * dt;
    bot.onGround = mover.move(bot.position, bot.velocity, BOT_HEIGHT, dt);

    // Animate the mesh: position, facing, walk cycle, flinch flash.
    bot.parts.group.position.set(bot.position.x, bot.position.y, bot.position.z);
    bot.parts.group.rotation.y = bot.yaw;
    const swing = moving ? Math.sin(bot.walkPhase) * 0.5 : 0;
    bot.parts.legL.rotation.x = swing;
    bot.parts.legR.rotation.x = -swing;
    bot.parts.group.rotation.x = bot.flinch > 0 ? -0.08 : 0;
  }

  return {
    list: bots,
    spawnRound,
    damage,
    hearShot,
    allHitMeshes() {
      const meshes = [];
      for (const bot of bots) if (bot.alive) meshes.push(...bot.hitMeshes);
      return meshes;
    },
    step(dt, ctx) {
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
  };
}
