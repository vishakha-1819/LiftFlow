import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FLOORS = 10, FLOOR_H = 2.25, BASE_Y = 0.15, CAPACITY = 6;
const COLORS = { a: 0xDCE2E8, b: 0xC8D5DF };
const $ = id => document.getElementById(id);
const floorName = f => f === 0 ? 'G' : String(f);
const state = {
  lifts: [], waiting: [], nextId: 1, served: 0, waits: [], longest: 0,
  algo: 'nearest', auto: false, rush: false, capacity: true, arrivalRate: 1.5,
  emergency: false, lastAuto: 0, simTime: 0, lastFrame: 0, logs: [], toastTimer: null,
  view: 'orbit'
};
let scene, camera, renderer, controls, clock;
let floorButtons = [], destinationButtons = [], carMeshes = [], floorLamps = [], buildingGroup, trafficCars = [], animatedPeople = [];
const mats = {};

function material(name, color, roughness = .6, metalness = .15, extra = {}) {
  if (!mats[name]) mats[name] = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return mats[name];
}
function box(parent, name, pos, size, mat, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.name = name; mesh.position.set(...pos); mesh.castShadow = opts.castShadow !== false; mesh.receiveShadow = opts.receiveShadow !== false;
  parent.add(mesh); return mesh;
}
function textSprite(text, color = '#eaf0ff', width = 256, height = 128) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height); ctx.fillStyle = color; ctx.font = 'bold 58px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); spr.scale.set(.45, .23, 1); return spr;
}
function floorY(f) { return BASE_Y + f * FLOOR_H; }
function init3D() {
  const wrap = $('canvasWrap'); scene = new THREE.Scene(); scene.background = new THREE.Color('#eaf0f7'); scene.fog = new THREE.Fog('#eaf0f7', 32, 78);
  camera = new THREE.PerspectiveCamera(43, wrap.clientWidth / wrap.clientHeight, .1, 150); camera.position.set(17, 14, 25);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(wrap.clientWidth, wrap.clientHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28; wrap.prepend(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .07; controls.target.set(0, 10, 0); controls.minDistance = 12; controls.maxDistance = 42; controls.maxPolarAngle = Math.PI * .49;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa8b8, 2.35)); const key = new THREE.DirectionalLight(0xfff7e8, 3.0); key.position.set(10, 25, 15); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -22; key.shadow.camera.right = 22; key.shadow.camera.top = 28; key.shadow.camera.bottom = -8; scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 18, 42); rim.position.set(-8, 13, -5); scene.add(rim); const fill = new THREE.PointLight(0xe4f1ff, 24, 36); fill.position.set(8, 10, 8); scene.add(fill);
  buildingGroup = new THREE.Group(); scene.add(buildingGroup); buildBuilding(); buildLift(0); buildLift(1); buildFloorLabels();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material('ground', 0xdce8d5, .96)); ground.rotation.x = -Math.PI / 2; ground.position.y = -.03; ground.receiveShadow = true; scene.add(ground);
  buildSurroundings();
  clock = new THREE.Clock(); window.addEventListener('resize', onResize); $('loading').classList.add('hidden'); setTimeout(() => $('loading').remove(), 600); animate();
}

function buildSurroundings() {
  // A small landscaped street gives the cutaway building a believable outdoor setting.
  const grassMat = material('landscape-grass', 0x9fbd8d, .98, 0);
  const curbMat = material('curb-stone', 0xc8d0d4, .9, .02);
  const sidewalkMat = material('sidewalk', 0xe7e8e3, .94, .02);
  const roadMat = material('asphalt', 0x59636b, .96, .02);
  const lineMat = material('road-marking', 0xf8f1d8, .72, .02, { emissive: 0x28251b, emissiveIntensity: .12 });
  // Road runs across the foreground, with pale sidewalks on both sides.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(54, 6.2), roadMat); road.rotation.x = -Math.PI / 2; road.position.set(0, .015, 9.25); road.receiveShadow = true; scene.add(road);
  for (const z of [5.85, 12.65]) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(54, 1.05), sidewalkMat); walk.rotation.x = -Math.PI / 2; walk.position.set(0, .025, z); walk.receiveShadow = true; scene.add(walk);
    box(scene, 'curb-' + z, [0, .08, z + (z < 9 ? -.55 : .55)], [54, .14, .16], curbMat, { castShadow: false });
    for (let x = -25; x <= 25; x += 2.2) {
      const seam = box(scene, 'sidewalk-joint', [x, .032, z], [.018, .008, .98], material('walk-joint', 0xcbd0ce, .95, 0), { castShadow: false, receiveShadow: false });
    }
  }
  // Dashed lane divider and edge lines.
  for (let x = -25; x <= 25; x += 4.2) box(scene, 'lane-dash', [x, .028, 9.25], [2.1, .012, .09], lineMat, { castShadow: false, receiveShadow: false });
  for (const z of [6.55, 11.95]) box(scene, 'road-edge-line', [0, .027, z], [54, .012, .055], lineMat, { castShadow: false, receiveShadow: false });
  // Landscaped green strips around the building footprint.
  for (const x of [-10.1, 10.1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 20), grassMat); strip.rotation.x = -Math.PI / 2; strip.position.set(x, .006, 1.2); strip.receiveShadow = true; scene.add(strip);
  }
  // Low planted beds, kept outside the elevator cutaway so the cars remain visible.
  for (const side of [-1, 1]) {
    for (const z of [-4.5, 0, 4.5, 14.5]) {
      const x = side * 9.2;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.15, .18, 2.0), material('planter', 0xd1d8d4, .8, .04)); bed.position.set(x, .09, z); bed.castShadow = true; bed.receiveShadow = true; scene.add(bed);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.98, .07, 1.82), material('soil', 0x6b7657, 1, 0)); soil.position.set(x, .205, z); scene.add(soil);
      createTree(x + (side * .12), .24, z);
    }
  }
  // A few distant trees add depth to the skyline without hiding the lift shafts.
  for (const [x, z] of [[-15, -7], [-11, -10], [14, -8], [17, 0], [-16, 8], [15, 14]]) createTree(x, 0, z, .88);
  // Animated traffic. Cars stay on the road and loop back around when they reach the edge.
  trafficCars.push(createTrafficCar(-18, 8.15, 0xe75d4f, 1.0, 1.8));
  trafficCars.push(createTrafficCar(13, 10.35, 0x4285c5, -1.0, 2.25));
  trafficCars.push(createTrafficCar(2, 8.15, 0xf2c14e, 1.0, 2.8));
  // Street lamps along the sidewalks.
  for (const x of [-20, -8, 8, 20]) {
    const pole = material('street-lamp-metal', 0x64717a, .42, .62);
    box(scene, 'street-lamp-pole', [x, 1.75, 5.55], [.09, 3.5, .09], pole);
    box(scene, 'street-lamp-arm', [x + .32, 3.42, 5.55], [.68, .07, .08], pole);
    box(scene, 'street-lamp-head', [x + .62, 3.36, 5.55], [.42, .12, .22], material('street-lamp-light', 0xfff1c4, .3, .05, { emissive: 0xffe6a1, emissiveIntensity: 1.2 }), { castShadow: false });
  }
}
function createTree(x, y, z, scale = 1) {
  const tree = new THREE.Group(); tree.position.set(x, y, z); tree.scale.setScalar(scale); scene.add(tree);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.13, .2, 1.35, 8), material('tree-trunk', 0x806047, .98, 0)); trunk.position.y = .68; trunk.castShadow = true; trunk.receiveShadow = true; tree.add(trunk);
  const leaves = material('tree-leaves', 0x4d8b55, .94, 0);
  const leavesLight = material('tree-leaves-light', 0x6ca665, .94, 0);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(.76, 12, 10), leaves); crown.position.set(0, 1.75, 0); crown.scale.set(1, 1.15, .95); crown.castShadow = true; tree.add(crown);
  const crown2 = new THREE.Mesh(new THREE.SphereGeometry(.53, 10, 8), leavesLight); crown2.position.set(.38, 2.05, .05); crown2.castShadow = true; tree.add(crown2);
  const crown3 = new THREE.Mesh(new THREE.SphereGeometry(.48, 10, 8), leaves); crown3.position.set(-.38, 2.1, -.12); crown3.castShadow = true; tree.add(crown3);
  return tree;
}
function createTrafficCar(x, z, color, direction, speed) {
  const car = new THREE.Group(); car.position.set(x, .08, z); car.userData.direction = direction; car.userData.speed = speed; car.userData.length = 2.2; scene.add(car);
  const paint = material('traffic-paint-' + color, color, .32, .48);
  const glass = material('traffic-glass', 0x9ec5d8, .22, .45, { transparent: true, opacity: .9 });
  const tire = material('traffic-tire', 0x252a2e, .9, .05);
  box(car, 'car-chassis', [0, .34, 0], [2.05, .42, .92], paint);
  box(car, 'car-cabin', [-.12, .68, 0], [1.08, .42, .73], glass);
  box(car, 'car-hood', [.65, .52, 0], [.58, .18, .84], paint);
  box(car, 'car-trunk', [-.78, .51, 0], [.36, .2, .82], paint);
  for (const wx of [-.68, .66]) for (const wz of [-.48, .48]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .12, 12), tire); wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, .2, wz); wheel.castShadow = true; car.add(wheel);
  }
  const headlight = material('car-headlight', 0xfff2c2, .25, .05, { emissive: 0xffdf91, emissiveIntensity: .8 });
  for (const wz of [-.27, .27]) box(car, 'headlight', [direction > 0 ? 1.04 : -1.04, .4, wz], [.025, .11, .16], headlight, { castShadow: false });
  return car;
}
function updateTraffic(dt) {
  for (const car of trafficCars) {
    car.position.x += car.userData.direction * car.userData.speed * dt;
    if (car.userData.direction > 0 && car.position.x > 29) car.position.x = -29;
    else if (car.userData.direction < 0 && car.position.x < -29) car.position.x = 29;
  }
}

function buildBuilding() {
  const width = 11.8, depth = 5.6, height = FLOORS * FLOOR_H;
  // Architectural cutaway: rear wall and slim side columns leave the cars visible.
  box(buildingGroup, 'rear-wall', [0, height / 2, -depth / 2], [width, height, 0.25], material('rear', 0xd7dee6, .82, .08));
  box(buildingGroup, 'left-side', [-width / 2, height / 2, 0], [.25, height, depth], material('side', 0xc2ccd7, .62, .12));
  box(buildingGroup, 'right-side', [width / 2, height / 2, 0], [.25, height, depth], material('side2', 0xe5e9ee, .62, .12));
  box(buildingGroup, 'roof', [0, height + .12, 0], [width + .3, .24, depth + .3], material('roof', 0xe8edf2, .48, .25));
  for (let f = 0; f < FLOORS; f++) {
    const y = f * FLOOR_H + .03;
    box(buildingGroup, `floor-slab-${f}`, [0, y, 0], [width, FLOOR_H * .045, depth], material('slab', 0xb8c3cf, .72, .15));
    // Front lintel and metallic floor edge
    box(buildingGroup, `front-edge-${f}`, [0, y + .08, depth / 2 - .05], [width, .07, .15], material('edge', 0x9ca9b7, .35, .7));
    // Subtle floor lighting strips
    box(buildingGroup, `light-strip-${f}`, [0, y + .13, -depth / 2 + .2], [width - .8, .018, .025], material('strip', 0xfff2d6, .3, .25, { emissive: 0xffe3a3, emissiveIntensity: .8 }), { castShadow: false });
    // Shaft separators
    box(buildingGroup, `shaft-rail-a-${f}`, [-1.55, y + FLOOR_H / 2, -.12], [.09, FLOOR_H, .11], material('rail', 0x8593a2, .3, .8));
    box(buildingGroup, `shaft-rail-b-${f}`, [1.55, y + FLOOR_H / 2, -.12], [.09, FLOOR_H, .11], material('rail2', 0x8593a2, .3, .8));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 10), material(`lamp-${f}`, 0xf4c96a, .3, .2, { emissive: 0xffbd45, emissiveIntensity: 1.1 })); lamp.position.set(5.1, y + .25, depth / 2 - .12); buildingGroup.add(lamp); floorLamps.push(lamp);
  }
  // Elevator shaft outlines and glass-like side rails
  for (const x of [-3.1, 0, 3.1]) box(buildingGroup, `shaft-frame-${x}`, [x, height / 2, .1], [.13, height + .2, .18], material('frame', 0x8c9aa8, .3, .75));
  box(buildingGroup, 'base-plinth', [0, -.06, 0], [width + .7, .25, depth + .7], material('plinth', 0xb9c4cf, .45, .4));
  // Small building nameplate
  const plate = box(buildingGroup, 'nameplate', [0, height + .7, -depth / 2], [3.6, .62, .12], material('plate', 0xf8fafc, .3, .3));
  const label = textSprite('LIFTFLOW', '#526174', 512, 128); label.position.set(0, height + .72, -depth / 2 + .08); label.scale.set(2.8, .7, 1); buildingGroup.add(label);
  // Guide cables in each shaft
  for (const x of [-1.55, 1.55]) box(buildingGroup, `cable-${x}`, [x, height / 2, -.4], [.025, height, .025], material('cable', 0x9aa7b4, .28, .8), { castShadow: false });
}
function buildLift(index) {
  const color = COLORS[index === 0 ? 'a' : 'b'], x = index === 0 ? -1.55 : 1.55;
  const root = new THREE.Group(); root.position.set(x, floorY(0), .58); scene.add(root);
  // Realistic light-finish lift: satin stainless steel, pale stone flooring and warm interior panels.
  const bodyMat = material(`car-body-${index}`, index === 0 ? 0xe3e7eb : 0xd5dfe7, .34, .48);
  const innerMat = material(`car-inner-${index}`, index === 0 ? 0xf0eee8 : 0xe8edf0, .48, .12);
  const metal = material(`car-metal-${index}`, 0xb8c2cc, .24, .78);
  const glass = material(`car-glass-${index}`, index === 0 ? 0xd9dfe5 : 0xcbd6df, .3, .62);
  const floorMat = material(`car-floor-finish-${index}`, 0xc7c2b8, .62, .12);
  const wallAccent = material(`car-wall-accent-${index}`, index === 0 ? 0xd9d4ca : 0xd2dce3, .48, .18);
  const warmLight = material(`car-warm-light-${index}`, 0xfff1d3, .22, .05, { emissive: 0xffd994, emissiveIntensity: 1.8 });
  const w = 2.35, h = 1.93, d = 2.2;
  box(root, `car-floor-${index}`, [0, .04, 0], [w, .12, d], floorMat);
  box(root, `car-floor-inlay-${index}`, [0, .105, .02], [w - .18, .018, d - .18], bodyMat);
  box(root, `car-back-${index}`, [0, h / 2, -d / 2 + .04], [w, h, .10], innerMat);
  box(root, `car-back-feature-panel-${index}`, [0, h * .52, -d / 2 + .095], [w * .42, h * .58, .025], wallAccent);
  box(root, `car-back-trim-${index}`, [0, h * .52, -d / 2 + .115], [.025, h * .58, .025], metal);
  box(root, `car-ceiling-${index}`, [0, h, 0], [w, .1, d], metal);
  box(root, `car-left-${index}`, [-w / 2 + .04, h / 2, 0], [.08, h, d], innerMat);
  box(root, `car-right-${index}`, [w / 2 - .04, h / 2, 0], [.08, h, d], innerMat);
  box(root, `car-left-trim-${index}`, [-w / 2 + .095, h / 2, 0], [.025, h - .12, d - .12], metal);
  box(root, `car-right-trim-${index}`, [w / 2 - .095, h / 2, 0], [.025, h - .12, d - .12], metal);
  // Warm ceiling panels
  for (let j = -1; j <= 1; j++) { const l = new THREE.Mesh(new THREE.BoxGeometry(.48, .025, .4), warmLight); l.position.set(j * .62, h - .06, -.1); root.add(l); }
  // Front sliding doors: two panels animate apart
  const doorGroup = new THREE.Group(); doorGroup.position.set(0, .06, d / 2 - .04); root.add(doorGroup);
  const leftDoor = box(doorGroup, `left-door-${index}`, [-w * .25, h * .48, 0], [w * .49, h * .9, .09], glass);
  const rightDoor = box(doorGroup, `right-door-${index}`, [w * .25, h * .48, 0], [w * .49, h * .9, .09], glass);
  box(doorGroup, `door-frame-top-${index}`, [0, h * .94, 0], [w, .07, .12], metal);
  // door seam / small handle-like vertical trims
  box(leftDoor, 'door-trim-left', [.38, 0, .052], [.025, h * .72, .018], metal, { castShadow: false });
  box(rightDoor, 'door-trim-right', [-.38, 0, .052], [.025, h * .72, .018], metal, { castShadow: false });
  const display = textSprite('G', '#ffffff', 128, 128); display.position.set(0, h + .18, d / 2 + .02); display.scale.set(.3, .3, 1); root.add(display);
  const displayPanel = box(root, `display-panel-${index}`, [0, h + .17, d / 2 + .025], [.55, .36, .045], material(`display-bg-${index}`, 0x263747, .32, .35)); displayPanel.position.y = h + .17;
  // Small passenger silhouettes inside car
  const people = new THREE.Group(); root.add(people);
  const lift = { index, x, root, doorGroup, leftDoor, rightDoor, doorBase: w * .25, doorTravel: w * .5, display, people, floor: 0, target: 0, direction: 0, state: 'idle', stops: [], assigned: [], onboard: [], doorOpen: 0, doorTarget: 0, doorTimer: 0, moveProgress: 0, emergency: false, capacity: CAPACITY, bodyColor: color };
  state.lifts.push(lift); carMeshes.push(root); return lift;
}
function buildFloorLabels() {
  for (let f = 0; f < FLOORS; f++) {
    const y = floorY(f) + .45;
    const t = textSprite(f === 0 ? 'G' : String(f), '#34465b', 128, 128); t.position.set(5.2, y, 2.88); t.scale.set(.3, .3, 1); buildingGroup.add(t);
    const small = textSprite(f === 0 ? 'GROUND' : `FLOOR ${f}`, '#64758a', 256, 64); small.position.set(4.45, y - .28, 2.88); small.scale.set(.5, .13, 1); buildingGroup.add(small);
  }
}
function onResize() { if (!renderer) return; const wrap = $('canvasWrap'); camera.aspect = wrap.clientWidth / wrap.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(wrap.clientWidth, wrap.clientHeight); }
function setView(view) { state.view = view; document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.id === ({ orbit: 'viewOrbit', front: 'viewFront', top: 'viewTop' }[view]))); if (view === 'front') { camera.position.set(0, 12, 30); controls.target.set(0, 10, 0); } else if (view === 'top') { camera.position.set(0, 34, 8); controls.target.set(0, 9, 0); } else { camera.position.set(17, 14, 25); controls.target.set(0, 10, 0); } controls.update(); }
function log(message, type = 'info') { const d = new Date(); const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; state.logs.unshift({ time, message, type }); state.logs = state.logs.slice(0, 35); renderLog(); }
function renderLog() { const el = $('activityLog'); if (!state.logs.length) { el.innerHTML = '<div class="empty-log">Waiting for the first elevator event…</div>'; return; } el.innerHTML = state.logs.map(l => `<div class="log-entry ${l.type}"><span class="log-time">${l.time}</span><i class="log-dot"></i><span class="log-message">${escapeHtml(l.message)}</span></div>`).join(''); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let toastTimer; function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }
function buildUI() {
  const list = $('floorList'); list.innerHTML = ''; for (let f = FLOORS - 1; f >= 0; f--) {
    const row = document.createElement('div'); row.className = 'floor-row'; const label = f === 0 ? 'Ground' : `Floor ${f}`; row.innerHTML = `<span class="floor-number">${floorName(f)}</span><span class="floor-label">${label}</span><button class="hall-button up" data-floor="${f}" data-dir="1" aria-label="Call up from ${label}">↑ Up</button><button class="hall-button down" data-floor="${f}" data-dir="-1" aria-label="Call down from ${label}">↓ Down</button>`;
    // CSS grid uses 3 columns: floor, up, down; merge label into floor number for a compact panel
    row.querySelector('.floor-label').remove(); list.appendChild(row); floorButtons.push(...row.querySelectorAll('button'));
  }
  floorButtons.forEach(btn => btn.addEventListener('click', () => callFloor(+btn.dataset.floor, +btn.dataset.dir, false)));
  const grid = $('destinationGrid'); for (let f = 0; f < FLOORS; f++) { const b = document.createElement('button'); b.className = 'dest-btn'; b.textContent = f === 0 ? 'G' : f; b.dataset.floor = f; b.addEventListener('click', () => destinationCall(+b.dataset.floor)); grid.appendChild(b); destinationButtons.push(b); }
}
function nearestLift(floor, dir) {
  let best = null, bestScore = Infinity;
  for (const l of state.lifts) {
    if (l.emergency) continue; const distance = Math.abs(l.floor - floor); let score = distance;
    if (l.state === 'moving' && l.direction !== 0 && Math.sign(floor - l.floor) !== l.direction) score += 3.5;
    if (l.state === 'doors') score += 1.2; if (state.capacity && l.onboard.length >= CAPACITY) score += 100;
    if (state.algo === 'smart') { score += l.stops.length * .8 + l.assigned.length * .65 + l.onboard.length * .45; if (l.direction !== 0 && dir !== 0 && l.direction !== dir) score += 1.1; }
    if (score < bestScore) { best = l; bestScore = score; }
  }
  return best;
}
function callFloor(floor, dir, automatic = false) {
  if (state.emergency) { if (!automatic) toast('Emergency recall is active.'); return; }
  if ((dir === 1 && floor === FLOORS - 1) || (dir === -1 && floor === 0)) { if (!automatic) toast('There is no hall call in that direction on this floor.'); return; }
  // Calls from the same floor/direction share a hall button but can represent several waiting people.
  const existing = state.waiting.filter(p => p.floor === floor && p.dir === dir).length;
  const p = { id: state.nextId++, floor, dir, created: state.simTime, assigned: null, kind: 'hall' }; state.waiting.push(p);
  if (existing === 0) { const lift = nearestLift(floor, dir); if (lift) { p.assigned = lift.index; lift.assigned.push(p.id); addStop(lift, floor); } }
  else { // keep passengers together at this floor; avoid duplicate stop entries
    const lift = state.waiting.find(q => q.floor === floor && q.dir === dir && q.assigned !== null)?.assigned;
    if (lift !== undefined && lift !== null) { p.assigned = lift; state.lifts[lift].assigned.push(p.id); addStop(state.lifts[lift], floor); }
  }
  if (!automatic) log(`Hall call registered: ${floorName(floor)} ${dir > 0 ? 'UP' : 'DOWN'}.`, 'info'); updateUI();
}
function addStop(lift, floor) { if (!lift.stops.includes(floor)) lift.stops.push(floor); if (lift.state === 'idle' && lift.floor === floor) { openDoors(lift); return; } if (lift.state === 'idle' && lift.floor !== floor) { lift.target = chooseNextStop(lift); lift.direction = Math.sign(lift.target - lift.floor); lift.state = 'moving'; lift.moveProgress = 0; log(`Elevator ${lift.index === 0 ? 'A' : 'B'} departing ${floorName(lift.floor)} toward ${floorName(lift.target)}.`); } }
function chooseNextStop(lift) { if (!lift.stops.length) return lift.floor; const ahead = lift.stops.filter(f => Math.sign(f - lift.floor) === lift.direction); if (ahead.length) return ahead.reduce((a, b) => Math.abs(a - lift.floor) < Math.abs(b - lift.floor) ? a : b); return lift.stops.reduce((a, b) => Math.abs(a - lift.floor) < Math.abs(b - lift.floor) ? a : b); }
function destinationCall(floor) { const idx = +$('carSelect').value, l = state.lifts[idx]; if (state.emergency || l.emergency) { toast('Destinations are disabled during emergency recall.'); return; } if (floor === l.floor && l.state === 'doors') { toast(`Elevator ${idx === 0 ? 'A' : 'B'} is already at ${floorName(floor)}.`); return; } if (!l.stops.includes(floor)) l.stops.push(floor); l.stops.sort((a, b) => a - b); log(`Elevator ${idx === 0 ? 'A' : 'B'} destination selected: ${floorName(floor)}.`, 'info'); if (l.state === 'idle') { l.target = chooseNextStop(l); l.direction = Math.sign(l.target - l.floor); if (l.target === l.floor) openDoors(l); else { l.state = 'moving'; l.moveProgress = 0; } } updateUI(); }
function makeWalkingPerson(shirtColor = 0x3978c7) {
  const g = new THREE.Group();
  const shirt = material(`walker-shirt-${shirtColor}`, shirtColor, .72, .02);
  const skin = material('walker-skin', 0xc9906c, .82, .0);
  const trousers = material('walker-trousers', 0x34445b, .85, .02);
  const shoes = material('walker-shoes', 0x28313a, .8, .02);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.115, .29, 3, 7), shirt); torso.position.y = .91; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.085, 10, 8), skin); head.position.y = 1.18; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.088, 10, 6, 0, Math.PI * 2, 0, Math.PI * .52), material('walker-hair', 0x43372f, .9, .0)); hair.position.y = 1.22; g.add(hair);
  const armGeo = new THREE.CapsuleGeometry(.035, .22, 3, 5), legGeo = new THREE.CapsuleGeometry(.045, .22, 3, 5);
  const arms = [], legs = [];
  for (const side of [-1, 1]) { const arm = new THREE.Mesh(armGeo, shirt); arm.position.set(side * .145, .91, 0); arm.rotation.z = side * -.18; g.add(arm); arms.push(arm); const leg = new THREE.Mesh(legGeo, trousers); leg.position.set(side * .06, .48, 0); g.add(leg); legs.push(leg); const shoe = new THREE.Mesh(new THREE.BoxGeometry(.09, .045, .16), shoes); shoe.position.set(side * .06, .32, .035); g.add(shoe); }
  g.userData.limbs = { arms, legs }; return g;
}
function animatePersonWalk(l, floor, entering, slot = 0, shirtColor) {
  const actor = makeWalkingPerson(shirtColor ?? (l.index === 0 ? 0x587dc4 : 0x2c9aa0));
  const x = l.x + (slot % 3 - .9) * .27, y = floorY(floor), insideZ = .58 + 1.04, outsideZ = 2.65;
  actor.position.set(x, y, entering ? outsideZ : insideZ); scene.add(actor);
  animatedPeople.push({ mesh: actor, lift: l, floor, entering, elapsed: 0, duration: .9, startZ: entering ? outsideZ : insideZ, endZ: entering ? insideZ : outsideZ, startX: x, endX: x + (slot % 2 === 0 ? -.12 : .12) });
}
function updateAnimatedPeople(dt) {
  for (let i = animatedPeople.length - 1; i >= 0; i--) { const a = animatedPeople[i]; a.elapsed += dt; const t = Math.min(1, a.elapsed / a.duration); const eased = t * t * (3 - 2 * t); a.mesh.position.z = THREE.MathUtils.lerp(a.startZ, a.endZ, eased); a.mesh.position.x = THREE.MathUtils.lerp(a.startX, a.endX, eased); const swing = Math.sin(a.elapsed * 17) * .48 * (t < 1 ? 1 : 0); const limbs = a.mesh.userData.limbs; limbs.legs[0].rotation.x = swing; limbs.legs[1].rotation.x = -swing; limbs.arms[0].rotation.x = -swing * .65; limbs.arms[1].rotation.x = swing * .65; if (t >= 1) { scene.remove(a.mesh); a.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); }); animatedPeople.splice(i, 1); } }
}
function openDoors(l) {
  l.state = 'doors'; l.doorTarget = 1; l.doorTimer = 2.8; l.direction = 0; const f = l.floor;
  // Show each arriving passenger walking out through the open doors.
  const leaving = l.onboard.filter(p => p.dest === f); if (leaving.length) { leaving.forEach((p, i) => animatePersonWalk(l, f, false, i, p.shirtColor)); l.onboard = l.onboard.filter(p => p.dest !== f); state.served += leaving.length; log(`Elevator ${l.index === 0 ? 'A' : 'B'} dropped off ${leaving.length} passenger${leaving.length === 1 ? '' : 's'} at ${floorName(f)}.`, 'good'); }
  // Board passengers in the current direction first; if idle, board both directions.
  const eligible = state.waiting.filter(p => p.floor === f && (l.direction === 0 || p.dir === 0 || p.dir === Math.sign(l.direction)));
  const max = state.capacity ? CAPACITY : Infinity; for (const p of eligible) { if (l.onboard.length >= max) break; state.waiting = state.waiting.filter(q => q.id !== p.id); l.assigned = l.assigned.filter(id => id !== p.id); const wait = Math.max(0, state.simTime - p.created); state.waits.push(wait); state.longest = Math.max(state.longest, wait); const dest = choosePassengerDestination(f, p.dir); animatePersonWalk(l, f, true, l.onboard.length, p.shirtColor); l.onboard.push({ id: p.id, from: f, dest, created: p.created, shirtColor: l.index === 0 ? 0x587dc4 : 0x2c9aa0 }); if (!l.stops.includes(dest)) l.stops.push(dest); log(`Passenger boarded Elevator ${l.index === 0 ? 'A' : 'B'} at ${floorName(f)}; destination ${floorName(dest)}.`, 'good'); }
  l.stops = l.stops.filter(s => s !== f); setSpriteText(l.display, floorName(f), '#ffffff'); updateUI();
}
function choosePassengerDestination(floor, dir) { let candidates = []; for (let i = 0; i < 10; i++)if (i !== floor && (dir === 0 || Math.sign(i - floor) === dir)) candidates.push(i); if (!candidates.length) for (let i = 0; i < 10; i++)if (i !== floor) candidates.push(i); return candidates[Math.floor(Math.random() * candidates.length)]; }
function setSpriteText(sprite, text, color) { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 128, 128); ctx.fillStyle = color; ctx.font = 'bold 64px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 64); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; sprite.material.map = tex; sprite.material.needsUpdate = true; }
function updateLift(l, dt) {
  if (l.state === 'moving') {
    const travel = 1.12; l.moveProgress += dt / travel;
    const t = Math.min(1, l.moveProgress); const eased = t * t * (3 - 2 * t); const y0 = floorY(l.floor), y1 = floorY(l.target); l.root.position.y = THREE.MathUtils.lerp(y0, y1, eased);
    if (t >= 1) { l.floor = l.target; l.root.position.y = floorY(l.floor); l.direction = 0; l.state = 'doors'; l.doorTarget = 1; l.doorTimer = 2.0; setSpriteText(l.display, floorName(l.floor), l.index === 0 ? '#d4c6ff' : '#a9e3ff'); log(`Elevator ${l.index === 0 ? 'A' : 'B'} arrived at ${floorName(l.floor)}.`, 'good'); openDoors(l); }
  }
  if (l.state === 'doors') {
    l.doorOpen = THREE.MathUtils.damp(l.doorOpen, l.doorTarget, 5.5, dt); const shift = l.doorOpen * l.doorTravel; l.leftDoor.position.x = -l.doorBase - shift; l.rightDoor.position.x = l.doorBase + shift;
    l.doorTimer -= dt; if (l.doorTimer <= 0 && l.doorOpen > .9) { l.doorTarget = 0; l.state = 'doorClosing'; }
  } else if (l.state === 'doorClosing') {
    l.doorOpen = THREE.MathUtils.damp(l.doorOpen, 0, 5.5, dt); const shift = l.doorOpen * l.doorTravel; l.leftDoor.position.x = -l.doorBase - shift; l.rightDoor.position.x = l.doorBase + shift;
    if (l.doorOpen < .035) { l.doorOpen = 0; l.state = 'idle'; l.leftDoor.position.x = -l.doorBase; l.rightDoor.position.x = l.doorBase; continueAfterStop(l); }
  }
  // Passenger figures are small glowing silhouettes standing in the car.
  syncPassengerMeshes(l);
}
function continueAfterStop(l) {
  if (state.emergency || l.emergency) { if (l.floor !== 0) { l.stops = [0]; l.target = 0; l.direction = Math.sign(-l.floor); l.state = 'moving'; l.moveProgress = 0; } else { l.stops = []; l.state = 'idle'; l.emergency = false; if (state.lifts.every(x => !x.emergency)) { state.emergency = false; log('Emergency recall complete. Both cars are at Ground.', 'good'); toast('Emergency recall complete.'); } } return; }
  if (l.stops.length) { l.target = chooseNextStop(l); l.direction = Math.sign(l.target - l.floor); if (l.target === l.floor) { openDoors(l); return; } l.state = 'moving'; l.moveProgress = 0; log(`Elevator ${l.index === 0 ? 'A' : 'B'} moving toward ${floorName(l.target)}.`); } else { l.state = 'idle'; l.direction = 0; }
  // Reassign waiting people whose car is no longer available.
  for (const p of state.waiting) { if (p.assigned === null || p.assigned === undefined) { const car = nearestLift(p.floor, p.dir); if (car) { p.assigned = car.index; car.assigned.push(p.id); addStop(car, p.floor); } } }
}
function syncPassengerMeshes(l) { while (l.people.children.length < l.onboard.length) { const g = new THREE.Group(); const shirt = material(`person-shirt-${l.index}-${l.people.children.length}`, l.index === 0 ? 0xc2b1ff : 0x86d7ff, .65, .1); const skin = material(`person-skin-${l.index}-${l.people.children.length}`, 0xe0b99c, .8, .0); const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.085, .28, 3, 6), shirt); torso.position.y = .48; const head = new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 8), skin); head.position.y = .72; g.add(torso, head); g.userData.offset = Math.random() * 2; l.people.add(g); } while (l.people.children.length > l.onboard.length) l.people.remove(l.people.children[l.people.children.length - 1]); l.people.children.forEach((g, i) => { g.position.set(-.72 + (i % 3) * .7, .12, -.45 + Math.floor(i / 3) * .65); }); }
function updateUI() {
  for (const l of state.lifts) { const letter = l.index === 0 ? 'A' : 'B'; $(`floor${letter}`).textContent = floorName(l.floor); $(`status${letter}`).textContent = l.emergency ? 'Emergency recall' : l.state === 'moving' ? `Moving ${l.direction > 0 ? 'up' : 'down'} to ${floorName(l.target)}` : l.state === 'doors' || l.state === 'doorClosing' ? 'Doors operating' : l.onboard.length ? `${l.onboard.length} passenger${l.onboard.length === 1 ? '' : 's'} onboard` : 'Idle'; $(`track${letter}`).style.width = `${l.floor / (FLOORS - 1) * 100}%`; $(`legend${letter}`).textContent = `${floorName(l.floor)} · ${l.state.toUpperCase()}`; }
  $('servedMetric').textContent = state.served; $('avgWaitMetric').textContent = state.waits.length ? (state.waits.reduce((a, b) => a + b, 0) / state.waits.length).toFixed(1) : '0.0'; $('longWaitMetric').textContent = state.longest.toFixed(1); $('waitingMetric').textContent = state.waiting.length;
  floorButtons.forEach(btn => { const f = +btn.dataset.floor, dir = +btn.dataset.dir; const waiting = state.waiting.some(p => p.floor === f && p.dir === dir); btn.classList.toggle('active', waiting); btn.disabled = (dir === 1 && f === FLOORS - 1) || (dir === -1 && f === 0) || state.emergency; });
  destinationButtons.forEach(b => { const f = +b.dataset.floor, l = state.lifts[+$('carSelect').value]; b.classList.toggle('active', l.floor === f && l.state !== 'moving'); b.disabled = state.emergency || l.emergency; }); $('capacityLabel').textContent = state.capacity ? `${CAPACITY} people` : 'Unlimited'; $('autoBadge').textContent = state.auto ? 'RUNNING' : 'PAUSED'; $('autoBadge').classList.toggle('running', state.auto); $('rushBtn').classList.toggle('active', state.rush); $('rushBtn').textContent = state.rush ? '■ Stop morning rush' : '⚡ Start morning rush';
}
function autoTick(dt) { if (!state.auto || state.emergency) return; state.lastAuto += dt; const rate = state.rush ? Math.max(state.arrivalRate, 7) : state.arrivalRate; const interval = 60 / rate; if (state.lastAuto >= interval) { state.lastAuto = 0; const floor = Math.floor(Math.random() * FLOORS); let dir = Math.random() < .5 ? -1 : 1; if (floor === 0) dir = 1; if (floor === FLOORS - 1) dir = -1; callFloor(floor, dir, true); if (Math.random() < .22) { let f2 = Math.floor(Math.random() * FLOORS); let d2 = f2 === 0 ? 1 : f2 === FLOORS - 1 ? -1 : (Math.random() < .5 ? -1 : 1); callFloor(f2, d2, true); } } }
function animate() { requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), .05); state.simTime += dt; autoTick(dt); updateTraffic(dt); for (const l of state.lifts) updateLift(l, dt); updateAnimatedPeople(dt); controls.update(); renderer.render(scene, camera); updateUI(); $('clock').textContent = `${String(Math.floor(state.simTime / 60)).padStart(2, '0')}:${String(Math.floor(state.simTime % 60)).padStart(2, '0')}`; }
function emergencyRecall() { if (state.emergency) { toast('Emergency recall is already active.'); return; } state.emergency = true; state.auto = false; state.rush = false; state.waiting = []; for (const l of state.lifts) { l.emergency = true; l.assigned = []; l.onboard = []; l.stops = [0]; if (l.floor !== 0) { l.target = 0; l.direction = -1; l.state = 'moving'; l.moveProgress = 0; } else { l.state = 'doors'; l.doorTarget = 1; l.doorTimer = 2; } } log('EMERGENCY: passenger requests cleared; both cars returning to Ground.', 'warn'); toast('Emergency recall started.'); updateUI(); }
function resetSimulation() { for (const a of animatedPeople) { scene.remove(a.mesh); a.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } animatedPeople = []; state.waiting = []; state.served = 0; state.waits = []; state.longest = 0; state.nextId = 1; state.simTime = 0; state.auto = false; state.rush = false; state.emergency = false; state.lastAuto = 0; state.logs = []; for (const l of state.lifts) { l.floor = 0; l.target = 0; l.root.position.y = floorY(0); l.state = 'idle'; l.direction = 0; l.stops = []; l.assigned = []; l.onboard = []; l.doorOpen = 0; l.doorTarget = 0; l.doorTimer = 0; l.leftDoor.position.x = -l.doorBase; l.rightDoor.position.x = l.doorBase; l.emergency = false; syncPassengerMeshes(l); setSpriteText(l.display, 'G', '#ffffff'); } log('Simulation reset. All elevators are at Ground.', 'good'); updateUI(); toast('Simulation reset.'); }
function bindEvents() { $('viewOrbit').addEventListener('click', () => setView('orbit')); $('viewFront').addEventListener('click', () => setView('front')); $('viewTop').addEventListener('click', () => setView('top')); $('resetBtn').addEventListener('click', resetSimulation); $('emergencyBtn').addEventListener('click', emergencyRecall); $('carSelect').addEventListener('change', updateUI); $('capacityToggle').addEventListener('change', e => { state.capacity = e.target.checked; updateUI(); log(`Capacity limit ${state.capacity ? 'enabled (6 people)' : 'disabled'}.`); }); $('autoToggle').addEventListener('change', e => { state.auto = e.target.checked; if (state.auto) { state.lastAuto = 0; log('Automatic passenger generation started.', 'good'); } else log('Automatic passenger generation paused.'); updateUI(); }); $('rateSlider').addEventListener('input', e => { state.arrivalRate = +e.target.value; $('rateValue').innerHTML = `${state.arrivalRate.toFixed(1)} <small>passengers/min</small>`; }); $('rushBtn').addEventListener('click', () => { state.rush = !state.rush; if (state.rush) { state.auto = true; $('autoToggle').checked = true; state.arrivalRate = Math.max(state.arrivalRate, 7); $('rateSlider').value = state.arrivalRate; $('rateValue').innerHTML = `${state.arrivalRate.toFixed(1)} <small>passengers/min</small>`; log('Morning rush mode enabled. High passenger traffic is active.', 'warn'); toast('Morning rush started.'); } else { log('Morning rush mode stopped.'); toast('Morning rush stopped.'); } updateUI(); }); $('clearLog').addEventListener('click', () => { state.logs = []; renderLog(); }); document.querySelectorAll('.algo-btn').forEach(b => b.addEventListener('click', () => { state.algo = b.dataset.algo; document.querySelectorAll('.algo-btn').forEach(x => x.classList.toggle('active', x === b)); $('algoHelp').textContent = state.algo === 'nearest' ? 'Assigns each new call to the closest available elevator.' : 'Balances distance, onboard load, direction and existing stops.'; log(`Dispatch algorithm changed to ${state.algo === 'nearest' ? 'Nearest car' : 'Smart dispatch'}.`); })); }

buildUI(); bindEvents();
try { init3D(); log('3D building loaded. Ready for passenger calls.', 'good'); updateUI(); } catch (err) { console.error(err); $('loading').innerHTML = '<strong>3D scene could not start.</strong><span>Check your internet connection and reload; Three.js loads from a CDN.</span>'; }
