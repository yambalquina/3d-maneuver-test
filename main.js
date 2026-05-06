import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// 1. 基本セットアップ (シーン、カメラ、レンダラー)
// ==========================================
const uiLoading = document.getElementById('loading');
const uiError = document.getElementById('error-log');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8DB2D6);
scene.fog = new THREE.FogExp2(0x8DB2D6, 0.005);

// カメラの設定（視野角を広げてスピード感を出す）
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 影を滑らかに
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ライティング
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
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

// スマホUIの入力状態
const input = { up: false, down: false, left: false, right: false, a: false, b: false };

let playerState = 'air'; // 'ground', 'air', 'swinging'
const velocity = new THREE.Vector3();
const gravity = -15.0; // 落下を少し速くしてスタイリッシュに

// 街の当たり判定用配列とRaycaster
const buildings = [];
let grapplePoint = null;
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0); // 画面中央（クロスヘアの位置）

// ==========================================
// 3. スマホUIのタッチイベント設定
// ==========================================
function setupTouchButton(id, key) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); input[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); input[key] = false; });
    // マウスでもテストできるように追加
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); input[key] = true; });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); input[key] = false; });
    btn.addEventListener('mouseleave', (e) => { e.preventDefault(); input[key] = false; });
}
setupTouchButton('btn-up', 'up');
setupTouchButton('btn-down', 'down');
setupTouchButton('btn-left', 'left');
setupTouchButton('btn-right', 'right');
setupTouchButton('btn-a', 'a');
setupTouchButton('btn-b', 'b');

// ==========================================
// 4. モデルの読み込みとエラーハンドリング
// ==========================================
const loader = new GLTFLoader();
let loadedCount = 0;

function checkLoadComplete() {
    loadedCount++;
    if (loadedCount >= 2 && uiLoading) {
        uiLoading.style.display = 'none'; // 両方読み込めたらローディング画面を消す
    }
}

function showError(msg) {
    if (uiError) uiError.innerText += msg + "\n";
    console.error(msg);
}

// アニメーションを滑らかに切り替える関数
function fadeToAction(name, duration = 0.2) {
    if (!actions[name] || currentAction === actions[name]) return;
    const previousAction = currentAction;
    currentAction = actions[name];
    if (previousAction) previousAction.fadeOut(duration);
    currentAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
}

// ① キャラクターの読み込み (Mixamoモデル対応)
loader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    
    // Mixamoのモデルは巨大だったり小さすぎたりするので、適度なサイズに調整
    playerModel.scale.set(0.02, 0.02, 0.02); // ★必要に応じて0.01〜1の間で調整してください
    playerModel.position.set(0, 10, 0);
    
    playerModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    scene.add(playerModel);

    // アニメーションのセットアップ
    mixer = new THREE.AnimationMixer(playerModel);
    
    console.log("=== モデル内のアニメーション一覧 ===");
    gltf.animations.forEach((clip) => {
        console.log("Found animation:", clip.name);
        actions[clip.name] = mixer.clipAction(clip);
    });

    // Mixamoのデフォルト名（'mixamo.com'）を待機モーションとして扱う
    if (actions['mixamo.com']) {
        actions['Idle'] = actions['mixamo.com']; // 別名をつけて扱いやすくする
    } else if (gltf.animations.length > 0) {
        actions['Idle'] = actions[gltf.animations[0].name]; // 見つからなければ最初のものをセット
    }

    fadeToAction('Idle');
    checkLoadComplete();
}, undefined, (error) => {
    showError("キャラモデル(peoplemodel.glb)の読み込みに失敗しました。");
});

// ② テスト用の「的（まと）」となる高い建物をプログラムで自動生成する
// （今回は街のモデルを使わず、確実にワイヤーが刺さる高層ビルを配置します）
function createTestBuildings() {
    const geometry = new THREE.BoxGeometry(10, 50, 10);
    const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // 茶色いビル

    for (let i = 0; i < 10; i++) {
        const building = new THREE.Mesh(geometry, material);
        // ランダムな位置に配置
        building.position.x = (Math.random() - 0.5) * 100;
        building.position.y = 25; // 高さが50なので、Yを25にすると地面に立つ
        building.position.z = (Math.random() - 0.5) * 100 - 30; // プレイヤーの前方中心
        
        building.castShadow = true;
        building.receiveShadow = true;
        
        scene.add(building);
        buildings.push(building); // 当たり判定に追加
    }
    
    // 平らな地面も追加
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x556B2F }); // 緑色の地面
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    checkLoadComplete(); // 街の代わりに建物を生成したのでカウントアップ
}

createTestBuildings();

// ==========================================
// 5. メインループ（移動・カメラ・ワイヤーアクション）
// ==========================================
let bButtonPressed = false; // Bボタンの連続入力を防ぐフラグ

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (playerModel) {
        
        // ----------------------------------------
        // スマホ入力によるアクション制御
        // ----------------------------------------
        
        // Aボタン（ジャンプ / ワイヤー解除）
        if (input.a) {
            if (playerState === 'ground') {
                velocity.y = 10; // ジャンプ力
                playerState = 'air';
            } else if (playerState === 'swinging') {
                grapplePoint = null;
                playerState = 'air';
            }
            input.a = false;
        }

        // Bボタン（照準に向かってワイヤー射出）
        if (input.b && !bButtonPressed) {
            bButtonPressed = true; // 押しっぱなし防止
            if (playerState !== 'swinging' && buildings.length > 0) {
                // カメラの中央（照準）からRayを飛ばす
                raycaster.setFromCamera(centerScreen, camera);
                const intersects = raycaster.intersectObjects(buildings, true);
                
                if (intersects.length > 0) {
                    grapplePoint = intersects[0].point; // 当たった座標を記録
                    playerState = 'swinging';
                }
            }
        } else if (!input.b) {
            bButtonPressed = false; // ボタンを離したらフラグ解除
        }

        // ----------------------------------------
        // 物理演算と移動
        // ----------------------------------------
        
        if (playerState === 'air' || playerState === 'ground') {
            // 十字キーによる空中/地上移動
            const moveSpeed = 15 * delta;
            
            // カメラが向いている方向を基準に移動方向を計算する
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; // 上下方向の移動は無視
            forward.normalize();
            
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0;
            right.normalize();

            if (input.up) playerModel.position.add(forward.multiplyScalar(moveSpeed));
            if (input.down) playerModel.position.add(forward.multiplyScalar(-moveSpeed));
            if (input.left) playerModel.position.add(right.multiplyScalar(-moveSpeed));
            if (input.right) playerModel.position.add(right.multiplyScalar(moveSpeed));

            // キャラクターを移動方向に向かせる
            if (input.up || input.down || input.left || input.right) {
                const targetPos = playerModel.position.clone().add(
                    forward.multiplyScalar(input.up ? 1 : input.down ? -1 : 0)
                ).add(
                    right.multiplyScalar(input.right ? 1 : input.left ? -1 : 0)
                );
                playerModel.lookAt(targetPos);
            }

            // 重力処理
            velocity.y += gravity * delta;
            playerModel.position.y += velocity.y * delta;

            // 地面との衝突
            if (playerModel.position.y <= 0) {
                playerModel.position.y = 0;
                velocity.y = 0;
                playerState = 'ground';
            }

        } else if (playerState === 'swinging' && grapplePoint) {
            // ★立体機動のコア：刺さったポイントに向かって巻き取り移動
            const direction = new THREE.Vector3().subVectors(grapplePoint, playerModel.position).normalize();
            const reelSpeed = 40.0; // 巻き取り速度（爽快感の要）
            
            playerModel.position.addScaledVector(direction, reelSpeed * delta);
            velocity.copy(direction.multiplyScalar(reelSpeed)); // 離した瞬間の慣性を保存
            
            // プレイヤーを刺さった方向に向かせる
            playerModel.lookAt(grapplePoint);

            // 建物に近づきすぎたら（衝突したら）ワイヤーを離す
            if (playerModel.position.distanceTo(grapplePoint) < 2.0) {
                grapplePoint = null;
                playerState = 'air';
            }
        }

        // ----------------------------------------
        // TPSカメラ（背中越し視点）の制御
        // ----------------------------------------
        // キャラクターの背後少し上（X: 0, Y: 3, Z: 8）をカメラの目標位置とする
        const cameraOffset = new THREE.Vector3(0, 3, 8);
        const targetCameraPos = playerModel.position.clone().add(
            cameraOffset.applyQuaternion(playerModel.quaternion)
        );

        // カメラを滑らかに追従させる
        camera.position.lerp(targetCameraPos, 0.1);
        
        // カメラの視線をキャラクターの少し上に固定
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
