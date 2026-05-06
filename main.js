import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// 1. 基本セットアップ (シーン、カメラ、レンダラー)
// ==========================================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8DB2D6, 0.005); // 街並みに合わせた空気遠近法

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// ライティング
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.5);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
scene.add(dirLight);

// ==========================================
// 2. 変数定義 (プレイヤー状態、アニメーション、物理)
// ==========================================
let playerModel, mixer;
const actions = {};
let currentAction = null;
const clock = new THREE.Clock();

// 画像のアニメーション名に対応するキー（Blender等のアクション名に合わせる）
const ANIM = {
    IDLE: 'Idle',       // 待機（構え）
    SPRINT: 'Sprint',   // 高速移動
    FALL: 'Fall',       // 落下中
    SHOOT: 'Shoot',     // ワイヤー発射(右/左)
    REEL: 'Reel',       // 巻き取り移動
    RISE: 'Rise'        // 上昇中
};

let playerState = 'air'; // 'ground', 'air', 'swinging'
const velocity = new THREE.Vector3();
const gravity = -9.8;

// 街の当たり判定用配列とRaycaster
const buildings = []; 
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ==========================================
// 3. モデルの読み込み
// ==========================================
const loader = new GLTFLoader();

// ① キャラクターの読み込み
loader.load('character.glb', (gltf) => { // ※実際のファイルパスに変更してください
    playerModel = gltf.scene;
    playerModel.position.set(0, 10, 0); // 初期位置は少し空中
    scene.add(playerModel);

    mixer = new THREE.AnimationMixer(playerModel);
    gltf.animations.forEach((clip) => {
        actions[clip.name] = mixer.clipAction(clip);
    });

    // 初期ポーズを「落下中」に設定
    fadeToAction(ANIM.FALL, 0.2);
});

// ② 街並み（ヨーロッパ風）の読み込み
loader.load('medieval_town.glb', (gltf) => { // ※ダウンロードした街のファイルパスに変更
    const city = gltf.scene;
    city.traverse((child) => {
        if (child.isMesh) {
            child.receiveShadow = true;
            child.castShadow = true;
            buildings.push(child); // 当たり判定の対象として建物を登録
        }
    });
    scene.add(city);
});

// ==========================================
// 4. アニメーション制御ロジック
// ==========================================
function fadeToAction(name, duration) {
    if (!actions[name] || currentAction === actions[name]) return;
    
    const previousAction = currentAction;
    currentAction = actions[name];

    if (previousAction) {
        previousAction.fadeOut(duration);
    }

    currentAction
        .reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .fadeIn(duration)
        .play();
}

// ==========================================
// 5. 立体機動アクション（ワイヤー射出と巻き取り）
// ==========================================
let grapplePoint = null;

window.addEventListener('mousedown', (event) => {
    if (!playerModel || buildings.length === 0) return;

    // クリックした画面位置からRayを飛ばす
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 建物との衝突判定
    const intersects = raycaster.intersectObjects(buildings, true);

    if (intersects.length > 0) {
        // ワイヤーが刺さった！
        grapplePoint = intersects[0].point;
        playerState = 'swinging';
        
        // ① まず「ワイヤー発射」ポーズを取る
        fadeToAction(ANIM.SHOOT, 0.1);

        // ② 少し遅れて「巻き取り移動（または上昇中）」ポーズに移行する疑似タイマー
        setTimeout(() => {
            if (playerState === 'swinging') {
                // アンカーポイントが自分より上なら「上昇」、同等以下なら「巻き取り」など分岐も可能
                fadeToAction(ANIM.REEL, 0.3);
            }
        }, 300);

        // TODO: ここで実際にワイヤーの線（THREE.Line）を描画する処理を追加するとさらに良くなります
    }
});

window.addEventListener('mouseup', () => {
    if (playerState === 'swinging') {
        grapplePoint = null;
        playerState = 'air';
        // ワイヤーを離したら「落下中」ポーズへ
        fadeToAction(ANIM.FALL, 0.4);
    }
});

// ==========================================
// 6. メインループ（物理とカメラ追従）
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (playerModel) {
        // 簡易的な物理・移動ロジック
        if (playerState === 'air') {
            // 重力による落下
            velocity.y += gravity * delta;
            playerModel.position.addScaledVector(velocity, delta);

            // 地面（y=0）に到達したら「待機」または「高速移動」へ
            if (playerModel.position.y <= 0) {
                playerModel.position.y = 0;
                velocity.y = 0;
                playerState = 'ground';
                fadeToAction(ANIM.IDLE, 0.2);
            }
        } else if (playerState === 'swinging' && grapplePoint) {
            // ワイヤーの巻き取り移動（フックポイントに向かって引き寄せられる）
            const direction = new THREE.Vector3().subVectors(grapplePoint, playerModel.position).normalize();
            const reelSpeed = 30.0; // 巻き取り速度
            
            playerModel.position.addScaledVector(direction, reelSpeed * delta);
            velocity.copy(direction.multiplyScalar(reelSpeed)); // 離した時の慣性用

            // キャラクターを進行方向に向かせる
            playerModel.lookAt(grapplePoint);
        }

        // カメラをプレイヤーの背後に追従（ダイナミックなTPS視点）
        const cameraOffset = new THREE.Vector3(0, 2, -6); 
        const relativeCameraOffset = cameraOffset.applyMatrix4(playerModel.matrixWorld);
        camera.position.lerp(relativeCameraOffset, 0.1); 
        camera.lookAt(playerModel.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
