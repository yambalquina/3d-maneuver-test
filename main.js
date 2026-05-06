import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 設定値 ---
const CONFIG = {
    GRAVITY: -18.0,
    REEL_POWER: 110.0,    // Aボタンの引き寄せ力
    AIR_RESISTANCE: 0.98, // 空中摩擦
    CAM_DIST: 8,          // カメラの距離
    CAM_HEIGHT: 2.5       // カメラの高さ
};

// --- 変数管理 ---
let playerModel, mixer;
let currentAction = null;
const actions = {};
const clock = new THREE.Clock();
const input = { up: false, down: false, left: false, right: false, a: false, b: false };
const player = {
    pos: new THREE.Vector3(0, 20, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0, 
    pitch: 0,
    state: 'air',
    grapplePoint: null
};

const buildings = [];
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);

// --- 初期化 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 200, 1000);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(50, 200, 100);
sun.castShadow = true;
scene.add(sun);

// ワイヤー描画用
const wireGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const wireLine = new THREE.Line(wireGeom, new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 2 }));
wireLine.visible = false;
scene.add(wireLine);

// --- 入力制御 ---
function bind(id, key) {
    const el = document.getElementById(id);
    const on = (e) => { e.preventDefault(); input[key] = true; };
    const off = (e) => { e.preventDefault(); input[key] = false; };
    el.addEventListener('touchstart', on); el.addEventListener('touchend', off);
    el.addEventListener('mousedown', on);  el.addEventListener('mouseup', off);
}
['up','down','left','right'].forEach(dir => bind(`ctrl-${dir}`, dir));
bind('btn-a', 'a'); bind('btn-b', 'b');

// 画面中央以外をタップでワイヤー射出
document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.touch-btn') || e.target.closest('.btn-small')) return;
    shootWire();
});

function shootWire() {
    if (player.state === 'swinging') return;
    raycaster.setFromCamera(centerScreen, camera);
    const hits = raycaster.intersectObjects(buildings, true);
    if (hits.length > 0) {
        player.grapplePoint = hits[0].point;
        player.state = 'swinging';
        wireLine.visible = true;
        playAnim('Shoot'); // 射出ポーズ
    }
}

function releaseWire() {
    player.grapplePoint = null;
    player.state = 'air';
    wireLine.visible = false;
    playAnim('Fall'); // 落下ポーズ
}

document.getElementById('btn-reset').onclick = () => {
    player.pos.set(0, 50, 0);
    player.vel.set(0, 0, 0);
    releaseWire();
};

// --- モデル読み込み ---
const gltfLoader = new GLTFLoader();

// 1. キャラクター
gltfLoader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    playerModel.scale.set(1.5, 1.5, 1.5); // 画像に合わせて少し大きめに
    scene.add(playerModel);
    mixer = new THREE.AnimationMixer(playerModel);
    gltf.animations.forEach(clip => {
        // Mixamoの命名規則などに対応
        let name = clip.name;
        if(name.includes('idle')) name = 'Idle';
        if(name.includes('run')) name = 'Sprint';
        if(name.includes('falling')) name = 'Fall';
        actions[name] = mixer.clipAction(clip);
    });
    playAnim('Idle');
    document.getElementById('loading').style.display = 'none';
});

// 2. 街（なければダミー生成）
gltfLoader.load('medieval_town.glb', (gltf) => {
    const m = gltf.scene;
    m.scale.set(0.5, 0.5, 0.5); // 街のスケール調整
    scene.add(m);
    m.traverse(c => { if(c.isMesh) buildings.push(c); });
}, undefined, () => {
    // 街がない場合のバックアップ：巨大な柱を立てる
    const geo = new THREE.BoxGeometry(10, 100, 10);
    const mat = new THREE.MeshStandardMaterial({color: 0x8b4513});
    for(let i=0; i<30; i++){
        const b = new THREE.Mesh(geo, mat);
        b.position.set((Math.random()-0.5)*400, 50, (Math.random()-0.5)*400);
        scene.add(b);
        buildings.push(b);
    }
});

function playAnim(name) {
    if (!actions[name] || currentAction === actions[name]) return;
    if (currentAction) currentAction.fadeOut(0.2);
    currentAction = actions[name];
    currentAction.reset().fadeIn(0.2).play();
}

// --- メインループ ---
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (playerModel) {
        // 1. 視点操作
        const rotSpd = 1.5 * dt;
        if (input.left) player.yaw += rotSpd;
        if (input.right) player.yaw -= rotSpd;
        if (input.up) player.pitch += rotSpd;
        if (input.down) player.pitch -= rotSpd;
        player.pitch = THREE.MathUtils.clamp(player.pitch, -1, 1);

        // 2. 物理演算
        player.vel.y += CONFIG.GRAVITY * dt;

        if (player.state === 'swinging' && player.grapplePoint) {
            const toHook = new THREE.Vector3().subVectors(player.grapplePoint, player.pos);
            const dir = toHook.clone().normalize();
            
            // Aボタンで巻き取り（加速）
            if (input.a) {
                player.vel.add(dir.multiplyScalar(CONFIG.REEL_POWER * dt));
                playAnim('Reel'); 
            }
            
            // Bボタンで解除
            if (input.b) releaseWire();

            // ワイヤー描画更新（腰の位置から）
            wireLine.visible = true;
            const waist = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
            wireLine.geometry.setFromPoints([waist, player.grapplePoint]);
            
            playerModel.lookAt(player.grapplePoint.x, player.pos.y, player.grapplePoint.z);
        } else {
            player.vel.x *= CONFIG.AIR_RESISTANCE;
            player.vel.z *= CONFIG.AIR_RESISTANCE;
            if (player.state === 'air') playAnim('Fall');
        }

        player.pos.addScaledVector(player.vel, dt);
        
        // 接地判定
        if (player.pos.y < 0) {
            player.pos.y = 0;
            player.vel.set(0, 0, 0);
            player.state = 'ground';
            playAnim('Idle');
        }

        // 3. モデルとカメラの同期
        playerModel.position.copy(player.pos);
        playerModel.rotation.y = player.yaw;

        // TPSカメラ：キャラの後ろ側に回り込む
        const camDir = new THREE.Vector3(
            Math.sin(player.yaw) * CONFIG.CAM_DIST,
            CONFIG.CAM_HEIGHT + Math.sin(player.pitch) * 5,
            Math.cos(player.yaw) * CONFIG.CAM_DIST
        );
        const targetCamPos = player.pos.clone().add(camDir);
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(player.pos.clone().add(new THREE.Vector3(0, 2, 0)));

        // HUD更新
        document.getElementById('hud').innerHTML = `ALT: ${Math.floor(player.pos.y)}<br>SPD: ${Math.floor(player.vel.length()*10)}`;
    }

    if (mixer) mixer.update(dt);
    renderer.render(scene, camera);
}
