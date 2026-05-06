import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const uiLoading = document.getElementById('loading');
const uiError = document.getElementById('error-log');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8DB2D6);
scene.fog = new THREE.FogExp2(0x8DB2D6, 0.005);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
dirLight.position.set(100, 200, 50);
scene.add(dirLight);

let playerModel, mixer;
const actions = {};
let currentAction = null;
const clock = new THREE.Clock();

// UI入力状態の管理
const input = { up: false, down: false, left: false, right: false, a: false, b: false };

let playerState = 'air'; // 'ground', 'air', 'swinging'
const velocity = new THREE.Vector3();
const buildings = [];
let grapplePoint = null;

// ==========================================
// スマホUIのタッチイベント設定
// ==========================================
function setupTouchButton(id, key) {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); input[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); input[key] = false; });
}
setupTouchButton('btn-up', 'up');
setupTouchButton('btn-down', 'down');
setupTouchButton('btn-left', 'left');
setupTouchButton('btn-right', 'right');
setupTouchButton('btn-a', 'a');
setupTouchButton('btn-b', 'b');

// ==========================================
// モデルの読み込み (エラーハンドリング強化)
// ==========================================
const loader = new GLTFLoader();
let loadedCount = 0;

function checkLoadComplete() {
    loadedCount++;
    if (loadedCount >= 2) {
        uiLoading.style.display = 'none'; // 両方読み込めたらローディング画面を消す
    }
}

function showError(msg) {
    uiError.innerText += msg + "\n";
}

// 1. キャラクター
loader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    playerModel.position.set(0, 5, 0);
    scene.add(playerModel);
    mixer = new THREE.AnimationMixer(playerModel);
    gltf.animations.forEach((clip) => { actions[clip.name] = mixer.clipAction(clip); });
    
    // とりあえず最初に見つかったアニメーションを再生しておく（エラー回避）
    if(gltf.animations.length > 0) {
        currentAction = actions[gltf.animations[0].name];
        currentAction.play();
    }
    checkLoadComplete();
}, undefined, (error) => {
    showError("キャラモデル(peoplemodel.glb)の読み込みに失敗しました。ファイル名を確認してください。");
});

// 2. 街並み
loader.load('medieval_town.glb', (gltf) => {
    const city = gltf.scene;
    // ★重要: 街のモデルが大きすぎる問題を強引に解決するために100分の1に縮小
    city.scale.set(0.01, 0.01, 0.01); 
    
    city.traverse((child) => {
        if (child.isMesh) buildings.push(child);
    });
    scene.add(city);
    checkLoadComplete();
}, undefined, (error) => {
    showError("街モデル(medieval_town.glb)の読み込みに失敗しました。ファイル名を確認してください。");
});

// ==========================================
// メインループ（移動とカメラ）
// ==========================================
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0); // 画面中央（クロスヘアの位置）

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (playerModel) {
        // --- Aボタン：ジャンプ / ワイヤー解除 ---
        if (input.a) {
            if (playerState === 'ground') {
                velocity.y = 5; // ジャンプ力
                playerState = 'air';
            } else if (playerState === 'swinging') {
                grapplePoint = null;
                playerState = 'air'; // ワイヤーを離す
            }
            input.a = false; // 押しっぱなし防止
        }

        // --- Bボタン：画面中央（照準）に向けてワイヤー発射 ---
        if (input.b && playerState !== 'swinging' && buildings.length > 0) {
            raycaster.setFromCamera(centerScreen, camera);
            const intersects = raycaster.intersectObjects(buildings, true);
            if (intersects.length > 0) {
                grapplePoint = intersects[0].point;
                playerState = 'swinging';
            }
            input.b = false;
        }

        // --- 十字キー：移動処理 ---
        const moveSpeed = 10 * delta;
        if (input.up) playerModel.position.z -= moveSpeed;
        if (input.down) playerModel.position.z += moveSpeed;
        if (input.left) playerModel.position.x -= moveSpeed;
        if (input.right) playerModel.position.x += moveSpeed;

        // --- 物理挙動（簡易） ---
        if (playerState === 'air') {
            velocity.y -= 9.8 * delta; // 重力
            playerModel.position.addScaledVector(velocity, delta);
            if (playerModel.position.y <= 0) {
                playerModel.position.y = 0;
                velocity.y = 0;
                playerState = 'ground';
            }
        } else if (playerState === 'swinging' && grapplePoint) {
            // フックポイントへ引っ張られる処理
            const direction = new THREE.Vector3().subVectors(grapplePoint, playerModel.position).normalize();
            playerModel.position.addScaledVector(direction, 20 * delta);
        }

        // カメラ追従
        const cameraOffset = new THREE.Vector3(0, 3, 8);
        const relativeCameraOffset = cameraOffset.applyMatrix4(playerModel.matrixWorld);
        camera.position.lerp(relativeCameraOffset, 0.1);
        camera.lookAt(playerModel.position.clone().add(new THREE.Vector3(0, 2, 0)));
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
