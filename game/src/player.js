// Player movement: acceleration, friction, gravity, crouch and jump, resolved
// through the shared mover in physics.js so the player and the bots obey the
// same map. Spread-relevant state (speed, crouch, airtime) is exposed for the
// weapon, so stopping to aim pays.
import * as THREE from 'three';
import { createMover } from './physics.js';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, spawn) {
  const mover = createMover(colliders);
  const player = {
    position: spawn.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !mover.overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.velocity.y = Math.max(-30, player.velocity.y);

    player.onGround = mover.move(player.position, player.velocity, player.height, dt);
  }

  // Damage with armour: armour absorbs half of each hit until it runs out.
  function damage(amount) {
    if (!player.alive) return 0;
    let remaining = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, remaining * 0.5);
      player.armor -= absorbed;
      remaining -= absorbed;
    }
    player.health -= remaining;
    if (player.health <= 0) {
      player.health = 0;
      player.alive = false;
    }
    return remaining;
  }

  function reset(spawnPoint) {
    player.position.copy(spawnPoint);
    player.velocity.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.onGround = true;
    player.crouching = false;
    player.height = STAND_HEIGHT;
    player.health = 100;
    player.alive = true;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
