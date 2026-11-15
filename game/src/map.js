// The map: EMBERLINE YARD, a dusk freight yard built from boxes. Three lanes run
// north from the Vanguard spawn to the Sentinel side: the west lane to Site A
// (the crane deck), the east lane to Site B (the warehouse), and mid through the
// container stacks. Every box is both a collider and a surface bullets stop on.
// Waypoints form a graph the bots route over; site zones are where the charge
// can be planted. Nothing here copies any commercial map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [width, height, depth, x, y, z, material] — y is the box centre height.
const BOXES = [
  // Ground slab and perimeter walls (the yard is 44 x 36 m, walls 3.6 m high).
  [44.4, 0.4, 36.4, 0, -0.2, 0, 'asphalt'],
  [0.4, 3.6, 36.4, -22.2, 1.8, 0, 'concrete'],
  [0.4, 3.6, 36.4, 22.2, 1.8, 0, 'concrete'],
  [44.4, 3.6, 0.4, 0, 1.8, -18.2, 'concrete'],
  [44.4, 3.6, 0.4, 0, 1.8, 18.2, 'concrete'],

  // Mid: container stacks that split the middle lane into two sightlines.
  [5.0, 2.6, 2.4, 0, 1.3, 4.0, 'steel'],
  [3.0, 2.6, 2.4, -4.5, 1.3, -3.0, 'rust'],
  [3.0, 2.6, 2.4, 4.5, 1.3, -4.0, 'teal'],
  [2.2, 1.1, 2.2, -1.5, 0.55, -0.5, 'steelDark'],
  [2.2, 1.1, 2.2, 3.0, 0.55, 1.0, 'steelDark'],

  // West lane cover.
  [2.4, 2.6, 6.0, -16.5, 1.3, -2.0, 'steel'],
  [2.0, 1.1, 2.0, -12.0, 0.55, 4.0, 'steelDark'],
  [1.6, 1.0, 1.6, -9.5, 0.5, -5.0, 'steelDark'],
  [1.6, 1.0, 1.6, -17.0, 0.5, -8.0, 'steelDark'],

  // East lane cover.
  [2.4, 2.6, 6.0, 16.5, 1.3, -2.0, 'teal'],
  [2.0, 1.1, 2.0, 12.0, 0.55, 4.0, 'steelDark'],
  [1.6, 1.0, 1.6, 9.5, 0.5, -5.0, 'steelDark'],
  [1.6, 1.0, 1.6, 17.0, 0.5, -8.0, 'steelDark'],

  // Site A — the crane deck (west-north). Gantry legs and beam, deck crates.
  [2.4, 2.6, 5.0, -19.0, 1.3, -13.0, 'rust'],
  [1.8, 1.0, 1.8, -12.5, 0.5, -14.5, 'steelDark'],
  [1.8, 1.0, 1.8, -12.5, 0.5, -8.5, 'steelDark'],
  [0.8, 4.6, 0.8, -18.5, 2.3, -15.5, 'steelDark'],
  [0.8, 4.6, 0.8, -11.5, 2.3, -15.5, 'steelDark'],
  [7.8, 0.7, 0.9, -15.0, 4.6, -15.5, 'steel'],

  // Site B — the warehouse (east-north). A roofed room, open to the south and west.
  [8.0, 3.4, 0.4, 15.0, 1.7, -15.5, 'concrete'],
  [0.4, 3.4, 6.0, 19.0, 1.7, -12.5, 'concrete'],
  [0.4, 3.4, 2.6, 11.0, 1.7, -14.2, 'concrete'],
  [8.4, 0.3, 6.4, 15.0, 3.55, -12.5, 'steelDark'],
  [2.4, 1.1, 2.4, 16.5, 0.55, -11.0, 'steelDark'],
  [1.4, 2.2, 1.4, 12.5, 1.1, -14.0, 'rust'],

  // North mid blockers, in front of the Sentinel spawn.
  [4.0, 2.6, 2.4, -5.5, 1.3, -11.0, 'steel'],
  [3.0, 2.6, 2.4, 6.0, 1.3, -11.0, 'steelDark'],

  // South spawn cover for the Vanguard side.
  [2.0, 1.1, 2.0, -4.0, 0.55, 12.0, 'steelDark'],
  [2.0, 1.1, 2.0, 4.0, 0.55, 12.0, 'steelDark'],
  [3.0, 2.6, 2.4, -8.0, 1.3, 14.5, 'rust'],
  [3.0, 2.6, 2.4, 8.0, 1.3, 14.5, 'teal'],
];

// Waypoint graph: bots route over these nodes. Coordinates are (x, z).
const WAYPOINTS = [
  [0, 15], // 0 Vanguard spawn
  [0, 8], // 1 mid south
  [0, 0], // 2 mid
  [0, -8], // 3 mid north
  [0, -15], // 4 Sentinel spawn
  [-13, 8], // 5 west lane south
  [-13, 0], // 6 west lane mid
  [-13, -8], // 7 west lane north
  [-15, -11], // 8 Site A
  [13, 8], // 9 east lane south
  [13, 0], // 10 east lane mid
  [13, -8], // 11 east lane north
  [15, -11], // 12 Site B
  [-6, 0], // 13 west mid connector
  [6, 0], // 14 east mid connector
  [-8, -11], // 15 A approach
  [8, -11], // 16 B approach
];

const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [2, 13], [13, 6], [2, 14], [14, 10],
  [3, 15], [15, 8], [3, 16], [16, 12],
  [1, 5], [1, 9], [7, 15], [11, 16],
  [5, 13], [9, 14], [6, 13], [10, 14],
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {
    asphalt: new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.96, metalness: 0.02 }),
    concrete: new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.94, metalness: 0.02 }),
    steel: new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.72, metalness: 0.45 }),
    steelDark: new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.8, metalness: 0.35 }),
    rust: new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.78, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.78, metalness: 0.25 }),
    hazard: new THREE.MeshStandardMaterial({ color: PALETTE.hazard, roughness: 0.7, metalness: 0.1 }),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, mat] of BOXES) box(w, h, d, x, y, z, mat);

  // Painted lane lines on the asphalt: thin flat strips, slightly above the slab.
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.hazard });
  function laneLine(w, d, x, z) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
    line.position.set(x, 0.012, z);
    line.receiveShadow = true;
    group.add(line);
  }
  laneLine(0.18, 12, -13, 2);
  laneLine(0.18, 12, 13, 2);
  laneLine(0.18, 10, 0, 8);
  laneLine(6, 0.18, -15, -11);
  laneLine(6, 0.18, 15, -11);

  // Hazard pads marking the two plant zones.
  const padMatA = new THREE.MeshBasicMaterial({ color: PALETTE.rust, transparent: true, opacity: 0.35 });
  const padMatB = new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.35 });
  function sitePad(x, z, mat) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(7, 5.5), mat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.015, z);
    group.add(pad);
  }
  sitePad(-15, -11, padMatA);
  sitePad(15, -11, padMatB);

  // Floating site letters, drawn on canvas textures — no image files.
  function siteLetter(letter, x, z, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(2.2, 2.2, 1);
    sprite.position.set(x, 5.2, z);
    group.add(sprite);
  }
  siteLetter('A', -15, -11, PALETTE.rust);
  siteLetter('B', 15, -11, PALETTE.teal);

  // Yard sign over the Vanguard spawn, also canvas-drawn.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 96;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#20262c';
  sctx.fillRect(0, 0, 512, 96);
  sctx.fillStyle = PALETTE.hazard;
  sctx.font = 'bold 52px system-ui, sans-serif';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText('EMBERLINE YARD', 256, 52);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas) }),
  );
  sign.position.set(0, 3.4, 17.9);
  sign.rotation.y = Math.PI;
  group.add(sign);

  // Lamp posts with sodium lights at the three lane mouths.
  const lampPositions = [[-13, 8], [13, 8], [0, -8]];
  const lampLights = [];
  for (const [x, z] of lampPositions) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8),
      materials.steelDark,
    );
    pole.position.set(x, 2.2, z);
    pole.castShadow = true;
    group.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.lamp }),
    );
    bulb.position.set(x, 4.5, z);
    group.add(bulb);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 22, 20, 1.8);
    light.position.set(x, 4.4, z);
    scene.add(light);
    lampLights.push(light);
  }

  // Dusk lighting: a low warm sun from the west, a cool sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6b7d'), new THREE.Color('#2a2118'), 1.2);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb27a'), 2.6);
  sun.position.set(-28, 16, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Waypoint adjacency.
  const edges = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    edges[a].push(b);
    edges[b].push(a);
  }

  const sites = {
    A: { name: 'A — Crane Deck', center: new THREE.Vector3(-15, 0, -11), box: new THREE.Box3(new THREE.Vector3(-18.5, 0, -13.75), new THREE.Vector3(-11.5, 3, -8.25)) },
    B: { name: 'B — Warehouse', center: new THREE.Vector3(15, 0, -11), box: new THREE.Box3(new THREE.Vector3(11.5, 0, -13.75), new THREE.Vector3(18.5, 3, -8.25)) },
  };

  return {
    colliders,
    shootables,
    group,
    sites,
    waypoints: WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    edges,
    spawns: {
      vanguard: [new THREE.Vector3(0, 0, 15), new THREE.Vector3(-2.5, 0, 15.5), new THREE.Vector3(2.5, 0, 15.5)],
      sentinel: [new THREE.Vector3(0, 0, -15), new THREE.Vector3(-2.5, 0, -15.5), new THREE.Vector3(2.5, 0, -15.5), new THREE.Vector3(-6, 0, -14), new THREE.Vector3(6, 0, -14)],
    },
    nearestWaypoint(x, z) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < WAYPOINTS.length; i += 1) {
        const dx = WAYPOINTS[i][0] - x;
        const dz = WAYPOINTS[i][1] - z;
        const d = dx * dx + dz * dz;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    },
  };
}
