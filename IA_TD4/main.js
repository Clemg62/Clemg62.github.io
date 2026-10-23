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
const LABEL_SPACING = 15;
const ROW_HEIGHT = 3.5;
const WIKI_RADIUS = 10000;
const WIKI_LIMIT = 500;
const WIKI_MAX_LABELS = 15;
const WIKI_EXCLUDED = /^(Unité urbaine|Aire urbaine|Aire d'attraction|Arrondissement|\d+e arrondissement|Canton|Circonscription|Métropole|Communauté|Liste|Quartier|Rue|Avenue|Boulevard|Montée|Impasse|Immeuble|Reconstruction)/;
const FAR_DISTANCE = 50;
const CLUSTER_DISTANCE = 40;

let target = BOLLAERT;
let userPos = null;
let heading = 0;
let pitch = 0;
let hasCompass = false;

const targetEl = document.getElementById('target');
const distanceEl = document.getElementById('distance');
const detailsEl = document.getElementById('details');
const wikiLinkEl = document.getElementById('wiki-link');

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
  ctx.fillStyle = isTarget ? 'rgba(227, 6, 19, 0.9)' : poi.wiki ? 'rgba(42, 122, 226, 0.75)' : 'rgba(0, 0, 0, 0.6)';
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

function angleGap(a, b) {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function removeLabel(label) {
  scene.remove(label.sprite);
  label.sprite.material.map.dispose();
  label.sprite.material.dispose();
  labels.splice(labels.indexOf(label), 1);
}

function placeLabels() {
  const origin = userPos ?? LENS_CENTER;
  const rows = [];
  const shownFar = [];
  const byDistance = [...labels].sort((a, b) => {
    if (a.poi === target) return -1;
    if (b.poi === target) return 1;
    return computeDistance(origin, a.poi) - computeDistance(origin, b.poi);
  });

  byDistance.forEach((label) => {
    if (computeDistance(origin, label.poi) > FAR_DISTANCE) {
      const hidden = shownFar.some((poi) => computeDistance(poi, label.poi) < CLUSTER_DISTANCE);
      label.sprite.visible = !hidden;
      if (hidden) return;
      shownFar.push(label.poi);
    } else {
      label.sprite.visible = true;
    }

    const bearingDeg = computeBearing(origin, label.poi);
    let row = rows.findIndex((bearings) => bearings.every((b) => angleGap(b, bearingDeg) >= LABEL_SPACING));
    if (row === -1) {
      rows.push([]);
      row = rows.length - 1;
    }
    rows[row].push(bearingDeg);

    const bearing = THREE.MathUtils.degToRad(bearingDeg);
    const height = -1 + row * ROW_HEIGHT;
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
  targetEl.textContent = `🎯 ${target.name}`;
  wikiLinkEl.hidden = !target.url;
  if (target.url) wikiLinkEl.href = target.url;
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

const wikiLayer = L.layerGroup().addTo(map);

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
    if (searchLabel) removeLabel(searchLabel);
    searchLabel = addLabel(poi);
  }
  placeLabels();
  updateInfo();
  updateMap(true);

  const info = document.getElementById('info');
  info.classList.remove('updated');
  void info.offsetWidth;
  info.classList.add('updated');
}

map.on('click', (e) => {
  setTarget({ name: `Point (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`, lat: e.latlng.lat, lng: e.latlng.lng });
});

// --- Recherche d'adresse avec suggestions (Photon / OpenStreetMap) ---

const searchInput = document.getElementById('search-input');
const suggestionsEl = document.getElementById('suggestions');
let suggestions = [];
let activeIndex = -1;
let searchTimer = null;
let lastQuery = '';

function featureToPoi(feature) {
  const p = feature.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const title = p.name ?? (street || p.city || 'Adresse');
  const subtitle = [p.name ? street : null, [p.postcode, p.city].filter(Boolean).join(' '), p.country]
    .filter((part) => part && part !== title)
    .join(', ');
  const [lng, lat] = feature.geometry.coordinates;
  const name = p.city && p.city !== title ? `${title}, ${p.city}` : title;
  return { name, subtitle, lat, lng };
}

async function fetchSuggestions(query) {
  const origin = userPos ?? LENS_CENTER;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=fr&lat=${origin.lat}&lon=${origin.lng}`;
  const data = await (await fetch(url)).json();
  return data.features.map(featureToPoi);
}

function renderSuggestions() {
  suggestionsEl.innerHTML = '';
  suggestions.forEach((poi, i) => {
    const li = document.createElement('li');
    li.className = i === activeIndex ? 'active' : '';
    li.textContent = poi.name.split(',')[0];
    if (poi.subtitle) {
      const small = document.createElement('small');
      small.textContent = poi.subtitle;
      li.appendChild(small);
    }
    li.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      chooseSuggestion(poi);
    });
    suggestionsEl.appendChild(li);
  });
}

function clearSuggestions() {
  suggestions = [];
  activeIndex = -1;
  renderSuggestions();
}

function chooseSuggestion(poi) {
  searchInput.value = poi.name;
  searchInput.blur();
  clearSuggestions();
  setTarget(poi);
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (query.length < 3) {
    clearSuggestions();
    return;
  }
  searchTimer = setTimeout(async () => {
    lastQuery = query;
    try {
      const results = await fetchSuggestions(query);
      if (query !== lastQuery) return;
      suggestions = results;
      activeIndex = -1;
      renderSuggestions();
    } catch (error) {
      console.error('Erreur de géocodage :', error);
    }
  }, 300);
});

searchInput.addEventListener('keydown', (e) => {
  if (suggestions.length === 0) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    activeIndex = (activeIndex + step + suggestions.length) % suggestions.length;
    renderSuggestions();
  } else if (e.key === 'Escape') {
    clearSuggestions();
  }
});

searchInput.addEventListener('blur', () => setTimeout(clearSuggestions, 150));

document.getElementById('search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  if (suggestions.length > 0) {
    chooseSuggestion(suggestions[Math.max(activeIndex, 0)]);
    return;
  }

  searchInput.blur();
  targetEl.textContent = 'Recherche…';
  try {
    const results = await fetchSuggestions(query);
    if (results.length === 0) {
      targetEl.textContent = `Aucun résultat pour « ${query} »`;
      return;
    }
    setTarget(results[0]);
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
  if (e.target !== renderer.domElement) return;
  dragStart = { x: e.clientX, heading, moved: false };
});

container.addEventListener('pointermove', (e) => {
  if (!dragStart || hasCompass) return;
  const dx = e.clientX - dragStart.x;
  if (Math.abs(dx) > 5) dragStart.moved = true;
  heading = (dragStart.heading - dx * 0.3 + 360) % 360;
});

container.addEventListener('pointerup', (e) => {
  if (!dragStart) return;
  const wasDrag = dragStart.moved;
  dragStart = null;
  if (wasDrag) {
    updateInfo();
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(labels.filter((label) => label.sprite.visible).map((label) => label.sprite))[0];
  if (hit) setTarget(hit.object.userData.poi);
});

// --- Lieux autour de moi (Wikipédia) ---

let wikiLabels = [];
let wikiOrigin = null;

async function loadNearbyPlaces(origin) {
  wikiOrigin = origin;
  const url = 'https://fr.wikipedia.org/w/api.php?action=query&list=geosearch&format=json&origin=*'
    + `&gscoord=${origin.lat}|${origin.lng}&gsradius=${WIKI_RADIUS}&gslimit=${WIKI_LIMIT}`;
  try {
    const data = await (await fetch(url)).json();
    const spotKey = (place) => `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
    const sameSpot = new Map();
    data.query.geosearch.forEach((place) => sameSpot.set(spotKey(place), (sameSpot.get(spotKey(place)) ?? 0) + 1));
    wikiLabels.forEach((label) => {
      if (label.poi !== target) removeLabel(label);
    });
    wikiLayer.clearLayers();

    wikiLabels = data.query.geosearch
      .filter((place) => !WIKI_EXCLUDED.test(place.title))
      .filter((place) => sameSpot.get(spotKey(place)) === 1)
      .filter((place) => !labels.some((label) => label.poi.name === place.title))
      .slice(0, WIKI_MAX_LABELS)
      .map((place) => {
        const poi = { name: place.title, lat: place.lat, lng: place.lon, wiki: true, url: `https://fr.wikipedia.org/?curid=${place.pageid}` };
        L.circleMarker([poi.lat, poi.lng], { radius: 5, color: '#fff', fillColor: '#2a7ae2', fillOpacity: 1 })
          .addTo(wikiLayer)
          .bindTooltip(poi.name)
          .on('click', () => setTarget(poi));
        return addLabel(poi);
      });
    placeLabels();
  } catch (error) {
    console.error('Erreur Wikipédia :', error);
  }
}

// --- Géolocalisation ---

let firstFix = true;
navigator.geolocation.watchPosition(
  (pos) => {
    userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!wikiOrigin || computeDistance(wikiOrigin, userPos) > 2) loadNearbyPlaces(userPos);
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
