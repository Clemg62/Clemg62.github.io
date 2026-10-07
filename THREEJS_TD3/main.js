import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const info = document.getElementById('info');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

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

  info.textContent = `Ma position : ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

let pulsingHalo = null;

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

async function addCountries() {
  const response = await fetch(COUNTRIES_URL);
  const countries = await response.json();

  for (const country of countries) {
    if (!country.latlng || country.latlng.length < 2) continue;
    const [lat, lon] = country.latlng;
    const code = country.cca2.toLowerCase();

    const flagTexture = textureLoader.load(`https://flagcdn.com/w80/${code}.png`);
    flagTexture.colorSpace = THREE.SRGBColorSpace;

    const flag = new THREE.Mesh(
      flagGeometry,
      new THREE.MeshBasicMaterial({ map: flagTexture, side: THREE.DoubleSide })
    );
    flag.position.copy(latLonToVector3(lat, lon, EARTH_RADIUS + 0.005));
    flag.lookAt(latLonToVector3(lat, lon, 2));
    flag.name = country.translations?.fra?.common ?? country.name.common;
    globe.add(flag);
  }
  console.log(`${countries.length} pays chargés`);
}

addCountries().catch((err) => console.error('Erreur chargement pays :', err));

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
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
