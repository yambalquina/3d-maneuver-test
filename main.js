import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// シーンと背景色の設定（真っ暗を回避）
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8DB2D6); // 空の色を追加
scene.fog = new THREE.FogExp2(0x8DB2D6, 0.005);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.5);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
scene.add(dirLight);

let playerModel, mixer;
const actions = {};
let currentAction = null;
const clock = new THREE.Clock();

const ANIM = {
    IDLE: 'Idle',
    FALL: 'Fall',
    SHOOT: 'Shoot',
    REEL: 'Reel'
};

let playerState = 'air';
const velocity = new THREE.Vector3();
const gravity = -9.8;
const buildings = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const loader = new GLTFLoader();

// ① キャラクターの読み込み（エラー回避版）
loader.load('peoplemodel.glb', (gltf) => {
    playerModel = gltf.scene;
    playerModel.position.set(0, 10, 0);
    scene.add(playerModel);

    mixer = new THREE.AnimationMixer(playerModel);
    
    // モデルに入っているアニメーション名をコンソールにすべて表示する
    console.log("=== このモデルで使えるアニメーション名 ===");
    gltf.animations.forEach((clip) => {
        console.log(clip.name);
        actions[clip.name] = mixer.clipAction(clip);
    });
    console.log("========================================");

    fadeToAction(ANIM.FALL, 0.2);
});

// ② 街並みの読み込み（スケール調整付き）
loader.load('medieval_town.glb', (gltf) => {
    const city = gltf.scene;
    
    // もし街が巨大すぎたら、ここの数値を 0.1 や 0.01 に変えて縮小できます
    // city.scale.set(0.1, 0.1, 0.1); 
    
    city.traverse((child) => {
        if (child.isMesh) {
            child.receiveShadow = true;
            child.castShadow = true;
            buildings.push(child);
        }
    });
    scene.add(city);
});

// エラーで止まらない安全なアニメーション切り替え関数
function fadeToAction(name, duration) {
    if (!actions[name]) {
        console.warn(`「${name}」というアニメーションが見つかりません。コンソールのアニメーション一覧を確認してください。`);
        return;
    }
    
    if (currentAction === actions[name]) return;
    
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

let grapplePoint = null;

window.addEventListener('mousedown', (event) => {
    if (!playerModel || buildings.length === 0) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(buildings, true);

    if (intersects.length > 0) {
        grapplePoint = intersects[0].point;
        playerState = 'swinging';
        fadeToAction(ANIM.SHOOT, 0.1);

        setTimeout(() => {
            if (playerState === 'swinging') fadeToAction(ANIM.REEL, 0.3);
        }, 300);
    }
});

window.addEventListener('mouseup', () => {
    if (playerState === 'swinging') {
        grapplePoint = null;
        playerState = 'air';
        fadeToAction(ANIM.FALL, 0.4);
    }
});

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (playerModel) {
        if (playerState === 'air') {
            velocity.y += gravity * delta;
            playerModel.position.addScaledVector(velocity, delta);

            if (playerModel.position.y <= 0) {
                playerModel.position.y = 0;
                velocity.y = 0;
                playerState = 'ground';
                fadeToAction(ANIM.IDLE, 0.2);
            }
        } else if (playerState === 'swinging' && grapplePoint) {
            const direction = new THREE.Vector3().subVectors(grapplePoint, playerModel.position).normalize();
            const reelSpeed = 30.0;
            
            playerModel.position.addScaledVector(direction, reelSpeed * delta);
            velocity.copy(direction.multiplyScalar(reelSpeed));
            playerModel.lookAt(grapplePoint);
        }

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
