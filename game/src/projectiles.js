// Grenades: a thrown frag with gravity, bounces off the map's boxes, a fuse,
// and an area blast that falls off with distance and is blocked by walls.
// The player's grenades and any bot grenades share this one pool.
import * as THREE from 'three';

const GRAVITY = 14;
const FUSE = 1.7;
const BLAST_RADIUS = 7;
const BLAST_DAMAGE = 95;

export function createProjectiles(scene, colliders, effects, audio) {
  const grenades = [];
  const probe = new THREE.Box3();

  function makeGrenadeMesh() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c2f22, roughness: 0.5, metalness: 0.6 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  function explode(grenade, onBlast) {
    effects.explosion(grenade.position);
    audio.explosion();
    onBlast(grenade.position, BLAST_RADIUS, BLAST_DAMAGE);
    grenade.mesh.visible = false;
    grenade.active = false;
  }

  return {
    throwGrenade(origin, direction, power = 13) {
      const mesh = makeGrenadeMesh();
      mesh.visible = true;
      mesh.position.copy(origin);
      const velocity = direction.clone().multiplyScalar(power);
      velocity.y += 3.5;
      grenades.push({ mesh, position: mesh.position, velocity, fuse: FUSE, active: true, bounced: 0 });
    },
    count() {
      return grenades.filter((g) => g.active).length;
    },
    step(dt, onBlast) {
      for (const grenade of grenades) {
        if (!grenade.active) continue;
        grenade.fuse -= dt;
        grenade.velocity.y -= GRAVITY * dt;
        const next = grenade.position.clone().addScaledVector(grenade.velocity, dt);
        const hit = overlaps(next.x, next.y, next.z);
        if (hit) {
          // Bounce: reflect the velocity component along the shallowest axis.
          const cx = Math.max(hit.min.x, Math.min(next.x, hit.max.x));
          const cy = Math.max(hit.min.y, Math.min(next.y, hit.max.y));
          const cz = Math.max(hit.min.z, Math.min(next.z, hit.max.z));
          const dx = Math.abs(next.x - cx);
          const dy = Math.abs(next.y - cy);
          const dz = Math.abs(next.z - cz);
          if (dx <= dy && dx <= dz) grenade.velocity.x *= -0.45;
          else if (dy <= dx && dy <= dz) grenade.velocity.y *= -0.45;
          else grenade.velocity.z *= -0.45;
          grenade.velocity.multiplyScalar(0.85);
          grenade.bounced += 1;
          audio.bounce();
          if (grenade.bounced > 4) grenade.velocity.set(0, 0, 0);
        } else {
          grenade.position.copy(next);
        }
        if (grenade.position.y < 0.09) {
          grenade.position.y = 0.09;
          if (Math.abs(grenade.velocity.y) > 1.5) audio.bounce();
          grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.4;
          grenade.velocity.x *= 0.8;
          grenade.velocity.z *= 0.8;
        }
        if (grenade.fuse <= 0) explode(grenade, onBlast);
      }
    },
    reset() {
      for (const grenade of grenades) {
        grenade.active = false;
        grenade.mesh.visible = false;
      }
    },
  };
}
