// The charge: the objective beyond killing. The Vanguard player plants it at
// Site A or Site B by holding E; it beeps faster as its 40-second fuse runs
// down, and a living Sentinel can defuse it by holding position beside it for
// 5 seconds. Plant it and the round is won when it blows; defuse it and the
// Sentinels take the round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3.2;
export const FUSE_TIME = 40;
export const DEFUSE_TIME = 5;

export function createCharge(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.5, metalness: 0.3 }),
  );
  body.castShadow = true;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  );
  light.position.set(0.1, 0.12, 0);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.4, metalness: 0.6 }),
  );
  antenna.position.set(-0.12, 0.22, 0);
  group.add(body, light, antenna);
  group.visible = false;
  scene.add(group);

  const state = {
    planted: false,
    planting: 0, // 0..1 progress of the player's plant channel
    fuse: 0,
    position: new THREE.Vector3(),
    site: null,
    beepTimer: 0,
  };

  return {
    state,
    reset() {
      state.planted = false;
      state.planting = 0;
      state.fuse = 0;
      state.site = null;
      group.visible = false;
    },
    // Called every fixed step while the player holds E inside a site.
    plantStep(dt, inSite, holding) {
      if (state.planted) return;
      if (inSite && holding) {
        state.planting = Math.min(1, state.planting + dt / PLANT_TIME);
      } else {
        state.planting = Math.max(0, state.planting - dt / (PLANT_TIME * 0.5));
      }
    },
    plantAt(position, site) {
      state.planted = true;
      state.planting = 0;
      state.fuse = FUSE_TIME;
      state.position.copy(position);
      state.position.y = 0.11;
      state.site = site;
      group.position.copy(state.position);
      group.visible = true;
    },
    step(dt, onBeep) {
      if (!state.planted) return;
      state.fuse -= dt;
      // Beeps accelerate: every 1.0 s early, every 0.35 s in the last ten seconds.
      const interval = state.fuse > 10 ? 1.0 : 0.35;
      state.beepTimer -= dt;
      if (state.beepTimer <= 0) {
        state.beepTimer = interval;
        onBeep();
      }
      light.material.color.setHex(Math.sin(state.fuse * 8) > 0 ? 0xff2a1a : 0x551008);
    },
  };
}
