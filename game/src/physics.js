// Shared movement physics: a capsule approximated as a box, resolved one axis at
// a time against the map's colliders so a wall never swallows a body. The player
// and every bot move through this one function, so they obey the same map.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createMover(colliders) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  // position and velocity are THREE.Vector3; height is the body's current height.
  // Returns whether the body is standing on something after the move.
  function move(position, velocity, height, dt) {
    const nextX = position.x + velocity.x * dt;
    if (!overlaps(nextX, position.y, position.z, height, 0.04)) position.x = nextX;
    else velocity.x = 0;
    const nextZ = position.z + velocity.z * dt;
    if (!overlaps(position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
    else velocity.z = 0;

    position.y += velocity.y * dt;
    let onGround = false;
    const hit = overlaps(position.x, position.y, position.z, height, 0);
    if (hit && velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      onGround = true;
    } else if (hit) {
      position.y = hit.min.y - height;
      velocity.y = 0;
    }
    if (position.y < 0) {
      position.y = 0;
      velocity.y = 0;
      onGround = true;
    }
    return onGround;
  }

  return { move, overlaps, radius: RADIUS };
}

// A deterministic seeded random, so scripted captures and bot behaviour replay
// from one seed. mulberry32 is small, fast and good enough for a game.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Breadth-first route over the waypoint graph: returns the list of node indices
// from `from` to `to`, or null when no route exists.
export function findRoute(edges, from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of edges[current] ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === to) {
        const route = [to];
        let node = to;
        while (prev.get(node) !== -1) {
          node = prev.get(node);
          route.unshift(node);
        }
        return route;
      }
      queue.push(next);
    }
  }
  return null;
}
