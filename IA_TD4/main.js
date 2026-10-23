import * as THREE from 'three';

const BOLLAERT = { name: 'Stade Bollaert-Delelis', lat: 50.43278, lng: 2.81500 };

const POIS = [
  BOLLAERT,
  { name: 'Louvre-Lens', lat: 50.4310, lng: 2.8040 },
  { name: 'Gare de Lens', lat: 50.4275, lng: 2.8278 },
  { name: 'Terrils du 11/19', lat: 50.4575, lng: 2.7905 },
  { name: 'Notre-Dame-de-Lorette', lat: 50.4012, lng: 2.7203 },
  { name: 'Stade Pierre-Mauroy (Lille)', lat: 50.6119, lng: 3.1305 },
  { name: 'Stade de France', lat: 48.9245, lng: 2.3602 },
  { name: 'Parc des Princes', lat: 48.8414, lng: 2.2530 },
  { name: 'Groupama Stadium (Lyon)', lat: 45.7653, lng: 4.9822 },
  { name: 'Vélodrome (Marseille)', lat: 43.2698, lng: 5.3959 }
];

const LENS_CENTER = { lat: 50.4290, lng: 2.8320 };
const LABEL_RADIUS = 50;

let target = BOLLAERT;
let userPos = null;
let heading = 0;
let pitch = 0;
let hasCompass = false;

const targetEl = document.getElementById('target');
const distanceEl = document.getElementById('distance');
const detailsEl = document.getElementById('details');

// --- Scène 3D (transparente, par-dessus la vidéo) ---

const container = document.getElementById('scene');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(2, 4, 3);
camera.add(dirLight);

function resize() {
  const { clientWidth, clientHeight } = container;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Boussole 3D (accrochée en bas de l'écran) ---

function createRoseTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffd400';
  ctx.beginPath();
  ctx.arc(256, 256, 256, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#e30613';
  for (let deg = 0; deg < 360; deg += 10) {
    const a = THREE.MathUtils.degToRad(deg);
    const inner = deg % 90 === 0 ? 200 : 225;
    ctx.lineWidth = deg % 90 === 0 ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(256 + Math.sin(a) * inner, 256 - Math.cos(a) * inner);
    ctx.lineTo(256 + Math.sin(a) * 245, 256 - Math.cos(a) * 245);
    ctx.stroke();
  }

  ctx.fillStyle = '#e30613';
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 256, 150);
  ctx.fillText('E', 362, 256);
  ctx.fillText('S', 256, 362);
  ctx.fillText('O', 150, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const hud = new THREE.Group();
hud.position.set(0, -2, -7);
hud.rotation.x = 0.9;
hud.scale.setScalar(0.4);
camera.add(hud);

const compass = new THREE.Group();
hud.add(compass);

const rose = new THREE.Mesh(
  new THREE.CircleGeometry(3, 64),
  new THREE.MeshStandardMaterial({ map: createRoseTexture(), transparent: true, opacity: 0.9 })
);
rose.rotation.x = -Math.PI / 2;
compass.add(rose);

const rim = new THREE.Mesh(
  new THREE.TorusGeometry(3, 0.12, 16, 64),
  new THREE.MeshStandardMaterial({ color: 0xe30613 })
);
rim.rotation.x = Math.PI / 2;
compass.add(rim);

const arrow = new THREE.Group();
const arrowMaterial = new THREE.MeshStandardMaterial({ color: 0xe30613 });
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 16), arrowMaterial);
shaft.rotation.x = Math.PI / 2;
shaft.position.z = -0.6;
arrow.add(shaft);
const head = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 24), arrowMaterial);
head.rotation.x = -Math.PI / 2;
head.position.z = -2.6;
arrow.add(head);
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff })
);
ball.position.z = 1.1;
arrow.add(ball);
arrow.position.y = 0.4;
compass.add(arrow);

// --- Points géolocalisés (étiquettes dans la vue caméra) ---

function drawLabel(label) {
  const { canvas, poi } = label;
  const ctx = canvas.getContext('2d');
  const isTarget = poi === target;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = isTarget ? 'rgba(227, 6, 19, 0.9)' : 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 24);
  ctx.fill();
  ctx.strokeStyle = '#ffd400';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Arial';
  ctx.fillText(poi.name, canvas.width / 2, 58, canvas.width - 40);
  ctx.fillStyle = '#ffd400';
  ctx.font = 'bold 36px Arial';
  ctx.fillText(userPos ? formatDistance(computeDistance(userPos, poi)) : '…', canvas.width / 2, 104);

  label.sprite.material.map.needsUpdate = true;
}

const labels = [];

function addLabel(poi) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(12, 3, 1);
  sprite.userData.poi = poi;
  scene.add(sprite);

  const label = { poi, canvas, sprite };
  labels.push(label);
  return label;
}

function placeLabels() {
  const origin = userPos ?? LENS_CENTER;
  const sorted = [...labels].sort((a, b) => computeBearing(origin, a.poi) - computeBearing(origin, b.poi));
  sorted.forEach((label, i) => {
    const bearing = THREE.MathUtils.degToRad(computeBearing(origin, label.poi));
    const height = -2 + (i % 4) * 3.5;
    label.sprite.position.set(Math.sin(bearing) * LABEL_RADIUS, height, -Math.cos(bearing) * LABEL_RADIUS);
    label.sprite.renderOrder = label.poi === target ? 1 : 0;
    drawLabel(label);
  });
}

POIS.forEach(addLabel);

// --- Animation ---

function lerpAngle(from, to, t) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * t;
}

renderer.setAnimationLoop((time) => {
  const bearing = userPos ? computeBearing(userPos, target) : 0;
  const headingRad = THREE.MathUtils.degToRad(heading);

  camera.rotation.y = lerpAngle(camera.rotation.y, -headingRad, 0.15);
  camera.rotation.x += (THREE.MathUtils.degToRad(pitch) - camera.rotation.x) * 0.15;

  compass.rotation.y = lerpAngle(compass.rotation.y, headingRad, 0.15);
  arrow.rotation.y = lerpAngle(arrow.rotation.y, -THREE.MathUtils.degToRad(bearing), 0.15);
  arrow.position.y = 0.4 + Math.abs(Math.sin(time / 300)) * 0.3;

  renderer.render(scene, camera);
});

// --- Calculs géographiques ---

function computeBearing(from, to) {
  const φ1 = THREE.MathUtils.degToRad(from.lat);
  const φ2 = THREE.MathUtils.degToRad(to.lat);
  const Δλ = THREE.MathUtils.degToRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (THREE.MathUtils.radToDeg(Math.atan2(y, x)) + 360) % 360;
}

function computeDistance(from, to) {
  const R = 6371;
  const φ1 = THREE.MathUtils.degToRad(from.lat);
  const φ2 = THREE.MathUtils.degToRad(to.lat);
  const Δφ = φ2 - φ1;
  const Δλ = THREE.MathUtils.degToRad(to.lng - from.lng);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function cardinal(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return names[Math.round(deg / 45) % 8];
}

function updateInfo() {
  targetEl.textContent = target.name;
  if (!userPos) return;

  const bearing = computeBearing(userPos, target);
  distanceEl.textContent = formatDistance(computeDistance(userPos, target));
  detailsEl.textContent = `Direction : ${Math.round(bearing)}° (${cardinal(bearing)})`
    + (hasCompass ? ` · Cap : ${Math.round(heading)}°` : ' · Boussole inactive (glisser pour tourner)');
}

// --- Carte Leaflet ---

const map = L.map('map').setView([target.lat, target.lng], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

POIS.forEach((poi) => {
  L.circleMarker([poi.lat, poi.lng], { radius: 6, color: '#e30613', fillColor: '#ffd400', fillOpacity: 1 })
    .addTo(map)
    .bindTooltip(poi.name)
    .on('click', () => setTarget(poi));
});

const targetMarker = L.marker([target.lat, target.lng]).addTo(map).bindPopup(target.name);
const userMarker = L.circleMarker([0, 0], { radius: 8, color: '#fff', fillColor: '#2a7ae2', fillOpacity: 1 });
const line = L.polyline([], { color: '#e30613', dashArray: '8 8' }).addTo(map);

function updateMap(fit) {
  targetMarker.setLatLng([target.lat, target.lng]).setPopupContent(target.name);
  if (!userPos) {
    if (fit) map.setView([target.lat, target.lng], 13);
    return;
  }
  userMarker.setLatLng([userPos.lat, userPos.lng]).addTo(map);
  line.setLatLngs([[userPos.lat, userPos.lng], [target.lat, target.lng]]);
  if (fit) map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 15 });
}

let searchLabel = null;

function setTarget(poi) {
  target = poi;
  if (!labels.some((label) => label.poi === poi)) {
    if (searchLabel) {
      scene.remove(searchLabel.sprite);
      labels.splice(labels.indexOf(searchLabel), 1);
    }
    searchLabel = addLabel(poi);
  }
  placeLabels();
  updateInfo();
  updateMap(true);
}

map.on('click', (e) => {
  setTarget({ name: `Point (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`, lat: e.latlng.lat, lng: e.latlng.lng });
});

// --- Recherche d'adresse (Nominatim) ---

document.getElementById('search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  document.getElementById('search-input').blur();
  targetEl.textContent = 'Recherche…';
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const results = await (await fetch(url)).json();
    if (results.length === 0) {
      targetEl.textContent = `Aucun résultat pour « ${query} »`;
      return;
    }
    const { display_name, lat, lon } = results[0];
    setTarget({ name: display_name.split(',').slice(0, 2).join(','), lat: parseFloat(lat), lng: parseFloat(lon) });
  } catch (error) {
    console.error('Erreur de géocodage :', error);
    targetEl.textContent = 'Erreur pendant la recherche';
  }
});

document.getElementById('lensBtn').addEventListener('click', () => setTarget(BOLLAERT));

// --- Clic sur une étiquette = nouvelle cible ---

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragStart = null;

container.addEventListener('pointerdown', (e) => {
  dragStart = { x: e.clientX, heading, moved: false };
});

container.addEventListener('pointermove', (e) => {
  if (!dragStart || hasCompass) return;
  const dx = e.clientX - dragStart.x;
  if (Math.abs(dx) > 5) dragStart.moved = true;
  heading = (dragStart.heading - dx * 0.3 + 360) % 360;
});

container.addEventListener('pointerup', (e) => {
  const wasDrag = dragStart?.moved;
  dragStart = null;
  if (wasDrag) {
    updateInfo();
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(labels.map((label) => label.sprite))[0];
  if (hit) setTarget(hit.object.userData.poi);
});

// --- Géolocalisation ---

let firstFix = true;
navigator.geolocation.watchPosition(
  (pos) => {
    userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    placeLabels();
    updateInfo();
    updateMap(firstFix);
    firstFix = false;
  },
  (error) => {
    detailsEl.textContent = `Géolocalisation impossible : ${error.message}`;
  },
  { enableHighAccuracy: true }
);

// --- Caméra arrière + orientation du téléphone ---

function onOrientation(event) {
  let value = null;
  if (typeof event.webkitCompassHeading === 'number') {
    value = event.webkitCompassHeading;
  } else if (event.absolute && event.alpha !== null) {
    value = 360 - event.alpha;
  }
  if (value === null) return;

  heading = (value + (screen.orientation?.angle ?? 0) + 360) % 360;
  pitch = THREE.MathUtils.clamp((event.beta ?? 90) - 90, -60, 60);
  hasCompass = true;
  updateInfo();
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    document.getElementById('video').srcObject = stream;
  } catch (error) {
    console.error('Caméra indisponible :', error);
  }
}

document.getElementById('sensorBtn').addEventListener('click', async () => {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    await DeviceOrientationEvent.requestPermission();
  }
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', onOrientation);
  } else {
    window.addEventListener('deviceorientation', onOrientation);
  }
  await startCamera();
  document.getElementById('sensorBtn').style.display = 'none';
});

placeLabels();
updateInfo();
