import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 初期設定 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ed0ff);
scene.fog = new THREE.Fog(0xbfe6ff, 500, 3000);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(100, 500, 100);
sun.castShadow = true;
scene.add(sun);

// --- 変数管理 ---
let playerModel, mixer;
const actions = {};
let currentAction = null;
const clock = new THREE.Clock();

const input = { up: false, down: false, left: false, right: false, a: false, b: false };
const player = {
    pos: new THREE.Vector3(0, 50, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0,   // 左右視点
    pitch: 0, // 上下視点
    state: 'air',
    grapplePoint: null
};

const buildings = [];
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);

// ワイヤーの可視化
const wireGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const wireLine = new THREE.Line(wireGeom, new THREE.LineBasicMaterial({ color: 0x333333 }));
wireLine.visible = false;
scene.add(wireLine);

// --- 入力イベント ---
function bind(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); input[key] = true; });
    el.addEventListener('touchend', (e) => { e.preventDefault(); input[key] = false; });
    el.addEventListener('mousedown', () => input[key] = true);
    el.addEventListener('mouseup', () => input[key] = false);
}
['up','down','left','right','btn-a','btn-b'].forEach(id => {
    const key = id.replace('btn-', '');
    bind(id, key);
});

// 画面中央をタップで射出
document.getElementById('canvas-container').addEventListener('touchstart', (e) => {
    if (e.target.tagName === 'CANVAS') shootWire();
});
document.getElementById('canvas-container').addEventListener('mousedown', shootWire);

function shootWire() {
    if (player.state === 'swinging') return;
    raycaster.setFromCamera(centerScreen, camera);
    const hits = raycaster.intersectObjects(buildings, true);
    if (hits.length > 0) {
        player.grapplePoint = hits[0].point;
        player.state = 'swinging';
        wireLine.visible = true;
    }
}

// --- モデル読み込み ---
const loader = new GLTFLoader();
loader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    playerModel.scale.set(1, 1, 1);
    scene.add(playerModel);
    mixer = new THREE.AnimationMixer(playerModel);
    gltf.animations.forEach(clip => {
        // 名前が不明な場合はインデックス等で判別
        actions[clip.name] = mixer.clipAction(clip);
    });
    document.getElementById('loading').style.display = 'none';
});

// テスト用：地面と高い塔の生成
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({color: 0x556b2f}));
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

for(let i=0; i<15; i++) {
    const h = 50 + Math.random() * 100;
    const box = new THREE.Mesh(new THREE.BoxGeometry(20, h, 20), new THREE.MeshStandardMaterial({color: 0x8b4513}));
    box.position.set((Math.random()-0.5)*400, h/2, (Math.random()-0.5)*400);
    scene.add(box);
    buildings.push(box);
}

// --- メインループ ---
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.03);

    if (playerModel) {
        // 1. 視点操作（十字キー）
        const rotSpeed = 2.0 * dt;
        if (input.left) player.yaw += rotSpeed;
        if (input.right) player.yaw -= rotSpeed;
        if (input.up) player.pitch += rotSpeed;
        if (input.down) player.pitch -= rotSpeed;
        player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));

        // 2. 物理演算
        player.vel.y -= 15.0 * dt; // 重力

        if (player.state === 'swinging' && player.grapplePoint) {
            const toAnchor = new THREE.Vector3().subVectors(player.grapplePoint, player.pos);
            const dist = toAnchor.length();
            const dir = toAnchor.normalize();

            // Aボタンで巻き取り加速
            if (input.a) {
                player.vel.add(dir.multiplyScalar(80 * dt));
            }
            
            // Bボタンで解放
            if (input.b) {
                player.state = 'air';
                player.grapplePoint = null;
                wireLine.visible = false;
            }

            // ワイヤー描画
            wireGeom.setFromPoints([player.pos.clone().add(new THREE.Vector3(0,1,0)), player.grapplePoint]);
        }

        player.pos.addScaledVector(player.vel, dt);
        if (player.pos.y < 0) {
            player.pos.y = 0;
            player.vel.set(0,0,0);
            player.state = 'ground';
            player.grapplePoint = null;
            wireLine.visible = false;
        }

        // 3. モデル同期
        playerModel.position.copy(player.pos);
        playerModel.rotation.y = player.yaw;

        // 4. カメラ制御 (TPS)
        const camDist = 10;
        const targetCamPos = new THREE.Vector3(
            player.pos.x + Math.sin(player.yaw) * camDist,
            player.pos.y + 4 + Math.sin(player.pitch) * 5,
            player.pos.z + Math.cos(player.yaw) * camDist
        );
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(player.pos.clone().add(new THREE.Vector3(0, 2, 0)));
        
        // HUD更新
        document.getElementById('hud').innerHTML = `H: ${Math.floor(player.pos.y)}<br>S: ${Math.floor(player.vel.length()*10)}<br>WIRE: ${player.state === 'swinging' ? 'ON' : 'OFF'}`;
    }

    if (mixer) mixer.update(dt);
    renderer.render(scene, camera);
}

animate();
