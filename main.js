import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const uiLoading = document.getElementById('loading');
const uiError = document.getElementById('error-log');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8DB2D6);
scene.fog = new THREE.FogExp2(0x8DB2D6, 0.005);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
// 初期カメラ位置（モデル読み込み前でもエラーにならないように設定）
camera.position.set(0, 3, 8); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
scene.add(dirLight);

let playerModel, mixer;
let currentAction = null;
const clock = new THREE.Clock();
const input = { up: false, down: false, left: false, right: false, a: false, b: false };
let playerState = 'ground';
const velocity = new THREE.Vector3();
const buildings = [];
let grapplePoint = null;
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);

// UIボタンの設定
function setupTouchButton(id, key) {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); input[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); input[key] = false; });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); input[key] = true; });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); input[key] = false; });
    btn.addEventListener('mouseleave', (e) => { e.preventDefault(); input[key] = false; });
}
['up','down','left','right','a','b'].forEach(key => setupTouchButton(`btn-${key}`, key));

// エラー表示用
function showError(msg) {
    if (uiError) uiError.innerText += msg + "\n";
    console.error(msg);
}

const loader = new GLTFLoader();

// ① キャラクターモデルの読み込み
loader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    
    // Mixamoモデルのスケールを安全な値（1/100）に設定
    playerModel.scale.set(0.01, 0.01, 0.01);
    
    // 最初は確実に地面(y=0)に立たせる
    playerModel.position.set(0, 0, 0);
    
    playerModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    scene.add(playerModel);

    // アニメーション再生
    mixer = new THREE.AnimationMixer(playerModel);
    if(gltf.animations && gltf.animations.length > 0) {
        currentAction = mixer.clipAction(gltf.animations[0]);
        currentAction.play();
    }
    
    if (uiLoading) uiLoading.style.display = 'none';
}, undefined, (error) => {
    showError("キャラクターモデルの読み込みに失敗しました。");
});

// ② テスト用の的（ビル群）の自動生成
const geometry = new THREE.BoxGeometry(10, 50, 10);
const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
for (let i = 0; i < 15; i++) {
    const building = new THREE.Mesh(geometry, material);
    building.position.set((Math.random() - 0.5) * 100, 25, (Math.random() - 0.5) * 100 - 30);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    buildings.push(building);
}

// 地面
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x556B2F });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// メインループ
let bButtonPressed = false;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (playerModel) {
        // --- アクション処理 ---
        if (input.a) {
            if (playerState === 'ground') {
                velocity.y = 10;
                playerState = 'air';
            } else if (playerState === 'swinging') {
                grapplePoint = null;
                playerState = 'air';
            }
            input.a = false;
        }

        if (input.b && !bButtonPressed) {
            bButtonPressed = true;
            if (playerState !== 'swinging' && buildings.length > 0) {
                raycaster.setFromCamera(centerScreen, camera);
                const intersects = raycaster.intersectObjects(buildings, true);
                if (intersects.length > 0) {
                    grapplePoint = intersects[0].point;
                    playerState = 'swinging';
                }
            }
        } else if (!input.b) {
            bButtonPressed = false;
        }

        // --- 移動処理 ---
        if (playerState === 'air' || playerState === 'ground') {
            const moveSpeed = 10 * delta;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0; right.normalize();

            if (input.up) playerModel.position.add(forward.multiplyScalar(moveSpeed));
            if (input.down) playerModel.position.add(forward.multiplyScalar(-moveSpeed));
            if (input.left) playerModel.position.add(right.multiplyScalar(-moveSpeed));
            if (input.right) playerModel.position.add(right.multiplyScalar(moveSpeed));

            if (input.up || input.down || input.left || input.right) {
                const targetPos = playerModel.position.clone().add(
                    forward.multiplyScalar(input.up ? 1 : input.down ? -1 : 0)
                ).add(
                    right.multiplyScalar(input.right ? 1 : input.left ? -1 : 0)
                );
                playerModel.lookAt(targetPos);
            }

            // 重力
            velocity.y -= 15.0 * delta;
            playerModel.position.y += velocity.y * delta;

            if (playerModel.position.y <= 0) {
                playerModel.position.y = 0;
                velocity.y = 0;
                playerState = 'ground';
            }
        } else if (playerState === 'swinging' && grapplePoint) {
            // ワイヤー巻き取り
            const direction = new THREE.Vector3().subVectors(grapplePoint, playerModel.position).normalize();
            const reelSpeed = 40.0;
            playerModel.position.addScaledVector(direction, reelSpeed * delta);
            velocity.copy(direction.multiplyScalar(reelSpeed));
            playerModel.lookAt(grapplePoint);

            if (playerModel.position.distanceTo(grapplePoint) < 2.0) {
                grapplePoint = null;
                playerState = 'air';
            }
        }

        // --- カメラ追従 (TPS視点) ---
        const cameraOffset = new THREE.Vector3(0, 3, 7);
        const targetCameraPos = playerModel.position.clone().add(
            cameraOffset.applyQuaternion(playerModel.quaternion)
        );
        camera.position.lerp(targetCameraPos, 0.1);
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
