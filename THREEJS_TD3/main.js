import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const info = document.getElementById('info');
const container = document.getElementById('globe');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1));
const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.position.set(1, 1, 0);
camera.add(sunLight);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1.3;
controls.maxDistance = 10;

const EARTH_RADIUS = 1;

const globe = new THREE.Group();
scene.add(globe);

const earthTexture = new THREE.TextureLoader().load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
earthTexture.colorSpace = THREE.SRGBColorSpace;

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
  new THREE.MeshStandardMaterial({ map: earthTexture })
);
globe.add(earth);

function latLonToVector3(lat, lon, radius = EARTH_RADIUS) {
  const theta = THREE.MathUtils.degToRad(90 - lat);
  const phi = THREE.MathUtils.degToRad(lon + 180);

  return new THREE.Vector3(
    -radius * Math.sin(theta) * Math.cos(phi),
    radius * Math.cos(theta),
    radius * Math.sin(theta) * Math.sin(phi)
  );
}

function vector3ToLatLon(point) {
  const r = point.length();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(point.y / r));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(point.z, -point.x)) - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

let cameraTarget = null;

function flyGlobeTo(lat, lon) {
  cameraTarget = latLonToVector3(lat, lon, 1).normalize();
}

controls.addEventListener('start', () => { cameraTarget = null; });

function updateCameraFlight() {
  if (!cameraTarget) return;
  const distance = camera.position.length();
  const direction = camera.position.clone().normalize();
  direction.lerp(cameraTarget, 0.08).normalize();
  camera.position.copy(direction.multiplyScalar(distance));
  if (direction.angleTo(cameraTarget) < 0.001) cameraTarget = null;
}

let selectedFlag = null;

function selectCountry(flag) {
  if (selectedFlag) selectedFlag.scale.setScalar(1);
  selectedFlag = flag;
  flag.scale.setScalar(2.5);
  info.textContent = flag.userData.name;
}

map.on('click', (event) => {
  const { lat, lng } = event.latlng;
  const lon = L.Util.wrapNum(lng, [-180, 180], true);
  flyGlobeTo(lat, lon);
  info.textContent = `Carte : ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
});

let pulsingHalo = null;

function addMyPosition(lat, lon) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  marker.position.copy(latLonToVector3(lat, lon, EARTH_RADIUS + 0.01));
  globe.add(marker);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.045, 32),
    new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true })
  );
  halo.position.copy(latLonToVector3(lat, lon, EARTH_RADIUS + 0.012));
  halo.lookAt(latLonToVector3(lat, lon, 2));
  globe.add(halo);
  pulsingHalo = halo;

  camera.position.copy(latLonToVector3(lat, lon, 3.5));
  controls.update();

  L.circleMarker([lat, lon], { radius: 8, color: '#ff0000', fillOpacity: 0.8 })
    .addTo(map)
    .bindPopup('Ma position')
    .on('click', () => flyGlobeTo(lat, lon));
  map.setView([lat, lon], 5);

  info.textContent = `Ma position : ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    (pos) => addMyPosition(pos.coords.latitude, pos.coords.longitude),
    (err) => { info.textContent = `Géolocalisation refusée (${err.message})`; }
  );
} else {
  info.textContent = 'Géolocalisation non disponible';
}

const COUNTRIES_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const textureLoader = new THREE.TextureLoader();
const flagGeometry = new THREE.PlaneGeometry(0.045, 0.03);
const flags = [];

async function addCountries() {
  const response = await fetch(COUNTRIES_URL);
  const countries = await response.json();

  for (const country of countries) {
    if (!country.latlng || country.latlng.length < 2) continue;
    const [lat, lon] = country.latlng;
    const code = country.cca2.toLowerCase();
    const name = country.translations?.fra?.common ?? country.name.common;
    const flagUrl = `https://flagcdn.com/w80/${code}.png`;

    const flagTexture = textureLoader.load(flagUrl);
    flagTexture.colorSpace = THREE.SRGBColorSpace;

    const flag = new THREE.Mesh(
      flagGeometry,
      new THREE.MeshBasicMaterial({ map: flagTexture, side: THREE.DoubleSide })
    );
    flag.position.copy(latLonToVector3(lat, lon, EARTH_RADIUS + 0.005));
    flag.lookAt(latLonToVector3(lat, lon, 2));
    flag.userData = { name, lat, lon };
    globe.add(flag);
    flags.push(flag);

    const icon = L.icon({ iconUrl: flagUrl, iconSize: [24, 16] });
    L.marker([lat, lon], { icon, title: name })
      .addTo(map)
      .bindPopup(name)
      .on('click', () => {
        selectCountry(flag);
        flyGlobeTo(lat, lon);
      });
  }
  console.log(`${flags.length} pays chargés`);
}

addCountries().catch((err) => console.error('Erreur chargement pays :', err));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerDown) return;
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (moved > 5) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hit = raycaster.intersectObjects([earth, ...flags])[0];
  if (!hit) return;

  if (hit.object !== earth) {
    const { lat, lon } = hit.object.userData;
    selectCountry(hit.object);
    map.flyTo([lat, lon], 5);
    return;
  }

  const { lat, lon } = vector3ToLatLon(hit.point);
  map.flyTo([lat, lon], 5);
  info.textContent = `Globe : ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
});

const starPositions = new Float32Array(3000 * 3);
for (let i = 0; i < 3000; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(50);
  starPositions.set([v.x, v.y, v.z], i * 3);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 })));

function animate() {
  if (pulsingHalo) {
    const s = 1 + 0.4 * Math.sin(performance.now() / 300);
    pulsingHalo.scale.set(s, s, s);
  }
  updateCameraFlight();
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  map.invalidateSize();
});
