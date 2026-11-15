// Transient combat effects: tracers, impact sparks and the explosion flash.
// Everything is pooled and reused — no new objects in the hot loop — and every
// effect dies on its own timer so the scene never leaks meshes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const SPARK_POOL = 16;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: PALETTE.lamp, transparent: true, opacity: 0 }),
    );
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 5),
      new THREE.MeshBasicMaterial({ color: PALETTE.lamp, transparent: true, opacity: 0 }),
    );
    spark.visible = false;
    scene.add(spark);
    sparks.push({ mesh: spark, life: 0, velocity: new THREE.Vector3() });
  }
  let sparkIndex = 0;

  // The explosion: a flash light and an expanding shell, both fading out.
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 0, 40, 1.5);
  scene.add(boomLight);
  const boomShell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: PALETTE.lamp, transparent: true, opacity: 0, depthWrite: false }),
  );
  boomShell.visible = false;
  scene.add(boomShell);
  let boomLife = 0;

  return {
    tracer(from, to) {
      const tracer = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACER_POOL;
      const positions = tracer.line.geometry.attributes.position;
      positions.setXYZ(0, from.x, from.y, from.z);
      positions.setXYZ(1, to.x, to.y, to.z);
      positions.needsUpdate = true;
      tracer.line.visible = true;
      tracer.line.material.opacity = 0.85;
      tracer.life = 0.09;
    },
    impact(point, normal) {
      for (let i = 0; i < 3; i += 1) {
        const spark = sparks[sparkIndex];
        sparkIndex = (sparkIndex + 1) % SPARK_POOL;
        spark.mesh.position.copy(point);
        spark.velocity.set(
          normal.x + (Math.random() - 0.5) * 2,
          Math.abs(normal.y) + Math.random() * 1.5 + 0.5,
          normal.z + (Math.random() - 0.5) * 2,
        ).normalize().multiplyScalar(2 + Math.random() * 3);
        spark.mesh.visible = true;
        spark.mesh.material.opacity = 1;
        spark.life = 0.25 + Math.random() * 0.15;
      }
    },
    explosion(point) {
      boomLight.position.copy(point);
      boomLight.position.y += 1;
      boomLight.intensity = 400;
      boomShell.position.copy(point);
      boomShell.position.y += 0.5;
      boomShell.scale.setScalar(0.5);
      boomShell.visible = true;
      boomShell.material.opacity = 0.85;
      boomLife = 0.7;
    },
    step(dt) {
      for (const tracer of tracers) {
        if (tracer.life <= 0) continue;
        tracer.life -= dt;
        tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
        if (tracer.life <= 0) tracer.line.visible = false;
      }
      for (const spark of sparks) {
        if (spark.life <= 0) continue;
        spark.life -= dt;
        spark.mesh.position.addScaledVector(spark.velocity, dt);
        spark.velocity.y -= 9 * dt;
        spark.mesh.material.opacity = Math.max(0, spark.life / 0.4);
        if (spark.life <= 0) spark.mesh.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const t = Math.max(0, boomLife / 0.7);
        boomLight.intensity = 400 * t;
        boomShell.scale.setScalar(0.5 + (1 - t) * 9);
        boomShell.material.opacity = 0.85 * t;
        if (boomLife <= 0) {
          boomShell.visible = false;
          boomLight.intensity = 0;
        }
      }
    },
  };
}
