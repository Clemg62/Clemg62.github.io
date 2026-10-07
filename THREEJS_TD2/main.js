import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 10; 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(3, 5, 4);
scene.add(dirLight);


function createLensTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffd400';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const logo = new Image();
  logo.onload = () => {
    const height = 460;                               
    const width = height * (logo.width / logo.height); 
    ctx.drawImage(logo, (512 - width) / 2, (512 - height) / 2, width, height);
    texture.needsUpdate = true; 
  };
  logo.src = 'textures/rclens.png';

  return texture;
}

const geometry = new THREE.BoxGeometry(3, 3, 3);
const material = new THREE.MeshStandardMaterial({ map: createLensTexture() });
const cube = new THREE.Mesh(geometry, material);
cube.position.x = -3; // à gauche, pour laisser la place au canard
scene.add(cube);

let duck = null; 

const gltfLoader = new GLTFLoader();
gltfLoader.load(
  'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb',
  (gltf) => {
    duck = gltf.scene; // le modèle est un groupe d'objets

    const box = new THREE.Box3().setFromObject(duck);
    const size = box.getSize(new THREE.Vector3());
    duck.scale.setScalar(3 / size.y);

    const center = new THREE.Box3().setFromObject(duck).getCenter(new THREE.Vector3());
    duck.position.sub(center);
    duck.position.x += 3;
    duckBaseY = duck.position.y; 

    scene.add(duck);
  },
  undefined, 
  (error) => console.error('Erreur de chargement du modèle :', error)
);

// Inclinaison voulue pour le cube (en radians), modifiée par le téléphone ou la souris
const tilt = { x: 0, z: 0 };
let duckBaseY = 0;
let jumpStart = null; // moment où le saut a commencé (null = pas de saut en cours)

// DeviceOrientation : angles du téléphone en degrés
//   beta  = inclinaison avant/arrière (-180..180)
//   gamma = inclinaison gauche/droite (-90..90)
function onOrientation(event) {
  tilt.x = THREE.MathUtils.degToRad(event.beta ?? 0);
  tilt.z = -THREE.MathUtils.degToRad(event.gamma ?? 0);
}

// DeviceMotion : accélération en m/s² (sans la gravité)
// Si le téléphone est secoué assez fort, le canard saute
function onMotion(event) {
  const a = event.acceleration;
  if (!a) return;
  const force = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
  if (force > 12) jump();
}

function jump() {
  if (jumpStart === null) jumpStart = performance.now();
}

const sensorBtn = document.getElementById('sensorBtn');
sensorBtn.addEventListener('click', async () => {
  // Sur iPhone, il faut demander la permission (obligatoirement après un clic)
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    await DeviceOrientationEvent.requestPermission();
    await DeviceMotionEvent.requestPermission();
  }
  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);
  sensorBtn.remove();
});

// Sur PC (pas de capteurs) : la souris incline le cube, un clic fait sauter le canard
window.addEventListener('mousemove', (event) => {
  tilt.x = (event.clientY / window.innerHeight - 0.5) * Math.PI;
  tilt.z = -(event.clientX / window.innerWidth - 0.5) * Math.PI;
});
renderer.domElement.addEventListener('click', jump);

// ---------- Bonus : brouillard + pluie de confettis sang et or ----------
// Fog(couleur, début, fin) : les objets s'effacent dans le noir entre 8 et 25 unités de la caméra
scene.fog = new THREE.Fog(0x000000, 8, 25);

// Particules = un seul objet THREE.Points avec des milliers de sommets (beaucoup plus rapide que 2000 Mesh)
const confettiCount = 2000;
const positions = new Float32Array(confettiCount * 3); // x, y, z pour chaque confetti
const colors = new Float32Array(confettiCount * 3);    // r, g, b pour chaque confetti
const speeds = new Float32Array(confettiCount);        // vitesse de chute de chaque confetti

const red = new THREE.Color('#e30613');
const gold = new THREE.Color('#ffd400');

for (let i = 0; i < confettiCount; i++) {
  positions[i * 3]     = THREE.MathUtils.randFloat(-15, 15); // x
  positions[i * 3 + 1] = THREE.MathUtils.randFloat(-10, 10); // y
  positions[i * 3 + 2] = THREE.MathUtils.randFloat(-15, 5);  // z

  const color = Math.random() < 0.5 ? red : gold;
  colors[i * 3]     = color.r;
  colors[i * 3 + 1] = color.g;
  colors[i * 3 + 2] = color.b;

  speeds[i] = THREE.MathUtils.randFloat(0.02, 0.06);
}

const confettiGeometry = new THREE.BufferGeometry();
confettiGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
confettiGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const confettiMaterial = new THREE.PointsMaterial({ size: 0.15, vertexColors: true });
const confetti = new THREE.Points(confettiGeometry, confettiMaterial);
scene.add(confetti);

function updateConfetti() {
  for (let i = 0; i < confettiCount; i++) {
    positions[i * 3 + 1] -= speeds[i];                       // chute
    if (positions[i * 3 + 1] < -10) positions[i * 3 + 1] = 10; // arrivé en bas → on le remet en haut
  }
  confettiGeometry.attributes.position.needsUpdate = true; // renvoyer les positions à la carte graphique
}

function animate() {
  // Le cube suit l'inclinaison doucement (lerp = on avance de 10 % vers la cible à chaque image)
  cube.rotation.x = THREE.MathUtils.lerp(cube.rotation.x, tilt.x, 0.1);
  cube.rotation.z = THREE.MathUtils.lerp(cube.rotation.z, tilt.z, 0.1);

  if (duck) {
    duck.rotation.y += 0.01; // on ne le fait tourner qu'une fois chargé

    // Saut : une demi-sinusoïde de 0.6 s, hauteur max 2 unités
    if (jumpStart !== null) {
      const t = (performance.now() - jumpStart) / 600;
      if (t >= 1) {
        jumpStart = null;
        duck.position.y = duckBaseY;
      } else {
        duck.position.y = duckBaseY + Math.sin(t * Math.PI) * 2;
      }
    }
  }
  updateConfetti();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

