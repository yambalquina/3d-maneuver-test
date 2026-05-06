import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const uiLoading = document.getElementById('loading');
const uiError = document.getElementById('error-log');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8DB2D6);
scene.fog = new THREE.FogExp2(0x8DB2D6, 0.003); // フォグを少し薄くして遠くを見やすく

// 視野角を広め(80)にしてスピード感を強調
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 2000);
let cameraAngleX = 0; // カメラの横回転（十字キー左右）
let cameraAngleY = 0; // カメラの縦回転（十字キー上下）

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
scene.add(dirLight);

let playerModel, mixer;
const actions = {};
let currentAction = null;
const clock = new THREE.Clock();

// UI入力状態の管理
const input = { up: false, down: false, left: false, right: false, a: false, b: false };
let playerState = 'ground'; // 'ground', 'air', 'swinging'

// 物理演算用のパラメータ
const velocity = new THREE.Vector3();
const gravity = -20.0; // 落下速度（少し強め）
const reelAcceleration = 80.0; // Aボタン押しっぱなし時の巻き取り加速力

const buildings = [];
let grapplePoint = null;
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);

// ==========================================
// スマホUIのタッチイベント設定
// ==========================================
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

// ★追加：画面のどこかをタップ（クリック）でアンカー射出
const canvasContainer = document.getElementById('canvas-container');
canvasContainer.addEventListener('mousedown', shootAnchor);
canvasContainer.addEventListener('touchstart', (e) => {
    // UIボタン上のタッチと区別するため、画面自体のタッチのみを拾う
    if(e.target.tagName === 'CANVAS') shootAnchor();
}, { passive: true });

function shootAnchor() {
    if (playerState === 'swinging' || buildings.length === 0) return;
    
    raycaster.setFromCamera(centerScreen, camera);
    const intersects = raycaster.intersectObjects(buildings, true);
    
    if (intersects.length > 0) {
        grapplePoint = intersects[0].point;
        playerState = 'swinging';
        fadeToAction('Shoot', 0.1);
    }
}

// エラー表示用
function showError(msg) {
    if (uiError) uiError.innerText += msg + "\n";
    console.error(msg);
}

// ==========================================
// モデルの読み込み
// ==========================================
const loader = new GLTFLoader();
let loadedCount = 0;

function checkLoadComplete() {
    loadedCount++;
    if (loadedCount >= 2 && uiLoading) {
        uiLoading.style.display = 'none';
    }
}

function fadeToAction(name, duration = 0.2) {
    if (!actions[name] || currentAction === actions[name]) return;
    const previousAction = currentAction;
    currentAction = actions[name];
    if (previousAction) previousAction.fadeOut(duration);
    currentAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
}

// ① キャラクター
loader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    playerModel.scale.set(1, 1, 1);
    playerModel.position.set(0, 0, 0);
    playerModel.traverse((child) => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    scene.add(playerModel);

    mixer = new THREE.AnimationMixer(playerModel);
    gltf.animations.forEach((clip) => {
        actions[clip.name] = mixer.clipAction(clip);
    });

    if (actions['mixamo.com']) {
        actions['Idle'] = actions['mixamo.com'];
    } else if (gltf.animations.length > 0) {
        actions['Idle'] = actions[gltf.animations[0].name];
    }

    fadeToAction('Idle');
    checkLoadComplete();
}, undefined, (error) => {
    showError("キャラモデルの読み込みに失敗しました。");
});

// ② テスト用の的（ビル群）の自動生成
const geometry = new THREE.BoxGeometry(10, 80, 10);
const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
for (let i = 0; i < 20; i++) {
    const building = new THREE.Mesh(geometry, material);
    building.position.set((Math.random() - 0.5) * 150, 40, (Math.random() - 0.5) * 150 - 30);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    buildings.push(building);
}

const groundGeo = new THREE.PlaneGeometry(300, 300);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x556B2F });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
checkLoadComplete();

// ==========================================
// メインループ（物理演算とカメラ）
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (playerModel) {
        
        // --- 1. 十字キーによる視点（カメラ）の回転 ---
        const rotSpeed = 2.0 * delta;
        if (input.left) cameraAngleX -= rotSpeed;
        if (input.right) cameraAngleX += rotSpeed;
        if (input.up) cameraAngleY += rotSpeed;
        if (input.down) cameraAngleY -= rotSpeed;
        
        // 上下の首振りを制限（真上や真下を向きすぎないように）
        cameraAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraAngleY));

        // --- 2. 物理演算とワイヤーアクション ---
        velocity.y += gravity * delta; // 常に重力がかかる

        if (playerState === 'swinging' && grapplePoint) {
            // アンカーポイントへのベクトルと距離
            const toAnchor = new THREE.Vector3().subVectors(grapplePoint, playerModel.position);
            const distanceToAnchor = toAnchor.length();
            const direction = toAnchor.normalize();

            // Aボタンを押している間、ワイヤーを巻き取って猛加速
            if (input.a) {
                velocity.add(direction.multiplyScalar(reelAcceleration * delta));
                fadeToAction('Reel', 0.2);
            } else {
                // 押していない時は、振り子のように遠心力を抑えるテンションをかける
                const dot = velocity.dot(direction);
                if (dot < 0) {
                    velocity.sub(direction.multiplyScalar(dot));
                }
                fadeToAction('Fall', 0.2);
            }

            // キャラクターをアンカーポイントに向かせる
            playerModel.lookAt(grapplePoint);

            // Bボタンでアンカーパージ（解放して空へ飛ぶ）
            if (input.b) {
                grapplePoint = null;
                playerState = 'air';
                input.b = false;
            }

            // ビルに激突する寸前で自動的にワイヤーを外す
            if (distanceToAnchor < 2.5) {
                grapplePoint = null;
                playerState = 'air';
            }
            
        } else if (playerState === 'air') {
            // 空中での空気抵抗（これがないと永遠に加速し続けてしまうため）
            velocity.x *= 0.99;
            velocity.z *= 0.99;
            fadeToAction('Fall', 0.2);
            
            // 空中ではカメラの向いている方向を向かせる
            const camDir = new THREE.Vector3().subVectors(playerModel.position, camera.position);
            camDir.y = 0;
            playerModel.lookAt(playerModel.position.clone().add(camDir.normalize()));
        }

        // 座標の更新
        playerModel.position.addScaledVector(velocity, delta);

        // --- 3. 地面との衝突判定 ---
        if (playerModel.position.y <= 0) {
            playerModel.position.y = 0;
            velocity.x *= 0.8; // 着地時の摩擦
            velocity.z *= 0.8;
            if (Math.abs(velocity.y) < 1) velocity.y = 0;

            if (playerState !== 'ground') {
                playerState = 'ground';
                grapplePoint = null;
                fadeToAction('Idle', 0.2);
            }
        }

        // --- 4. TPSカメラの座標更新 ---
        const distance = 8; // カメラとキャラの距離
        const heightOffset = 2;
        
        // 回転角からカメラの相対位置を計算
        const offsetX = distance * Math.sin(cameraAngleX) * Math.cos(cameraAngleY);
        const offsetY = distance * Math.sin(cameraAngleY) + heightOffset;
        const offsetZ = distance * Math.cos(cameraAngleX) * Math.cos(cameraAngleY);

        const targetCameraPos = playerModel.position.clone().add(new THREE.Vector3(offsetX, offsetY, offsetZ));
        
        // 滑らかに追従
        camera.position.lerp(targetCameraPos, 0.2);
        
        // 常にキャラクターの少し上を見つめる
        const lookTarget = playerModel.position.clone().add(new THREE.Vector3(0, 2, 0));
        camera.lookAt(lookTarget);
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
