import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const uiLoading = document.getElementById('loading');
const uiError = document.getElementById('error-log');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8DB2D6);
scene.fog = new THREE.FogExp2(0x8DB2D6, 0.003); 

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 2000);
let cameraAngleX = 0; 
let cameraAngleY = 0; 

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

const input = { up: false, down: false, left: false, right: false, a: false, b: false };
let playerState = 'ground'; 

const velocity = new THREE.Vector3();
const gravity = -20.0; 
const reelAcceleration = 80.0; 

const buildings = [];
let grapplePoint = null;
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);

// ==========================================
// ★追加：ワイヤーとアンカーのグラフィック設定
// ==========================================
// ワイヤー（線）の作成
const wireMaterial = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 2 });
const wireGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const wire = new THREE.Line(wireGeometry, wireMaterial);
wire.visible = false; // 最初は非表示
scene.add(wire);

// アンカー（金属の杭）の作成
const anchorGeometry = new THREE.ConeGeometry(0.3, 1.0, 8);
const anchorMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
const anchor = new THREE.Mesh(anchorGeometry, anchorMaterial);
anchor.rotation.x = Math.PI / 2; // 先端を前へ向ける
anchor.visible = false; // 最初は非表示
scene.add(anchor);

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

const canvasContainer = document.getElementById('canvas-container');
canvasContainer.addEventListener('mousedown', shootAnchor);
canvasContainer.addEventListener('touchstart', (e) => {
    if(e.target.tagName === 'CANVAS') shootAnchor();
}, { passive: true });

function shootAnchor() {
    if (playerState === 'swinging' || buildings.length === 0 || !playerModel) return;
    
    raycaster.setFromCamera(centerScreen, camera);
    const intersects = raycaster.intersectObjects(buildings, true);
    
    if (intersects.length > 0) {
        grapplePoint = intersects[0].point;
        playerState = 'swinging';
        
        // ★アンカーの表示と配置
        anchor.position.copy(grapplePoint);
        // アンカーを壁の法線（垂直）方向に刺さるように向ける
        if(intersects[0].face) {
            const normal = intersects[0].face.normal.clone().transformDirection(intersects[0].object.matrixWorld);
            const lookTarget = grapplePoint.clone().add(normal);
            anchor.lookAt(lookTarget);
        }
        anchor.visible = true;
        wire.visible = true;

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

loader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    
    // ★キャラクターを元のサイズ（1倍）で読み込む
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

// ワイヤーを解除する処理
function detachWire() {
    grapplePoint = null;
    playerState = 'air';
    wire.visible = false;
    anchor.visible = false;
}

// ==========================================
// メインループ（物理演算とカメラ）
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (playerModel) {
        
        const rotSpeed = 2.0 * delta;
        if (input.left) cameraAngleX -= rotSpeed;
        if (input.right) cameraAngleX += rotSpeed;
        if (input.up) cameraAngleY += rotSpeed;
        if (input.down) cameraAngleY -= rotSpeed;
        
        cameraAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraAngleY));

        velocity.y += gravity * delta; 

        if (playerState === 'swinging' && grapplePoint) {
            const toAnchor = new THREE.Vector3().subVectors(grapplePoint, playerModel.position);
            const distanceToAnchor = toAnchor.length();
            const direction = toAnchor.normalize();

            // Aボタンで巻き取り
            if (input.a) {
                velocity.add(direction.multiplyScalar(reelAcceleration * delta));
                fadeToAction('Reel', 0.2);
            } else {
                const dot = velocity.dot(direction);
                if (dot < 0) {
                    velocity.sub(direction.multiplyScalar(dot));
                }
                fadeToAction('Fall', 0.2);
            }

            playerModel.lookAt(grapplePoint);

            // ★追加：ワイヤーの描画更新
            // キャラクターの腰付近（Y軸+1.0の高さ）からアンカーまで線を引く
            const waistPosition = playerModel.position.clone().add(new THREE.Vector3(0, 1.0, 0));
            wireGeometry.setFromPoints([waistPosition, grapplePoint]);

            // Bボタンでパージ
            if (input.b) {
                detachWire();
                input.b = false;
            }

            // 近づきすぎたらパージ
            if (distanceToAnchor < 2.5) {
                detachWire();
            }
            
        } else if (playerState === 'air') {
            velocity.x *= 0.99;
            velocity.z *= 0.99;
            fadeToAction('Fall', 0.2);
            
            const camDir = new THREE.Vector3().subVectors(playerModel.position, camera.position);
            camDir.y = 0;
            playerModel.lookAt(playerModel.position.clone().add(camDir.normalize()));
        }

        playerModel.position.addScaledVector(velocity, delta);

        if (playerModel.position.y <= 0) {
            playerModel.position.y = 0;
            velocity.x *= 0.8; 
            velocity.z *= 0.8;
            if (Math.abs(velocity.y) < 1) velocity.y = 0;

            if (playerState !== 'ground') {
                playerState = 'ground';
                detachWire();
                fadeToAction('Idle', 0.2);
            }
        }

        // --- TPSカメラの座標更新 ---
        const distance = 8; 
        const heightOffset = 2;
        
        const offsetX = distance * Math.sin(cameraAngleX) * Math.cos(cameraAngleY);
        const offsetY = distance * Math.sin(cameraAngleY) + heightOffset;
        const offsetZ = distance * Math.cos(cameraAngleX) * Math.cos(cameraAngleY);

        const targetCameraPos = playerModel.position.clone().add(new THREE.Vector3(offsetX, offsetY, offsetZ));
        
        camera.position.lerp(targetCameraPos, 0.2);
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
