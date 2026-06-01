import * as THREE from "./build/three.module.js";
import { FlyControls } from "./jsm/controls/FlyControls.js";
import {Lensflare, LensflareElement} from "./jsm/objects/Lensflare.js";

let camera, scene, renderer;
let controls;

const clock = new THREE.Clock();

init();

// 初期化
function init() {
    //camera
    camera = new THREE.PerspectiveCamera(40,
        window.innerWidth / window.innerHeight,
        1,
        15000
        );
    camera.position.z = 250;

    //scene
    scene = new THREE.Scene();

    //geometry
    const size = 250;
    // box
    const geometry = new THREE.BoxGeometry(size, size, size);
    // color etc...
    const material = new THREE.MeshPhongMaterial({
        // 色
        color: 0xffffff, // white
        // 鏡面反射
        specular: 0xffffff, // white
        // 輝度
        shininess: 50,
    });

    for(let i = 0; i < 2500; i++) {
        //geometryにmaterialを貼り付ける
        const mesh = new THREE.Mesh(geometry, material);
        // 位置
        mesh.position.x = 8000 * (2.0 * Math.random() - 1.0);
        mesh.position.y = 8000 * (2.0 * Math.random() - 1.0);
        mesh.position.z = 8000 * (2.0 * Math.random() - 1.0);

        //回転度合いをランダムに
        mesh.rotation.x = Math.random() * Math.PI;
        mesh.rotation.y = Math.random() * Math.PI;
        // メッシュを張ったらシーンに追加
        scene.add(mesh);
    }

    //　平行光源
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.03); // white, 光量: 0.03
    scene.add(dirLight);

    // レンズフレアの追加
    const textureLoader = new THREE.TextureLoader();
    const textureFlare = textureLoader.load("textures/lensflare/lensflare0.png");

    // 複数のカラー光源で奥行きと彩りを出す (cyan / purple / warm)
    addLight(0.52, 0.9, 0.7, 0, 0, -1000);   // cyan
    addLight(0.74, 0.8, 0.7, -2500, 1500, -2500); // purple
    addLight(0.95, 0.7, 0.6, 2500, -1200, -1800); // magenta/warm

    // ポイント光源を追加
    function addLight(h, s, l, x, y, z) {
        // h色相s彩度l輝度で色を指定
        // xyzで位置を指定
        const light = new THREE.PointLight(0xffffff, 1.5, 2000); // white, 光量: 1.5, 距離: 2000
        light.color.setHSL(h, s, l);
        light.position.set(x, y, z);
        scene.add(light);

        // レンズフレアを追加(lightを使うため)
        const lensflare = new Lensflare();
        lensflare.addElement(
            new LensflareElement(textureFlare, 700, 0, light.color)
            );

        scene.add(lensflare)
    }

    // renderer
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);

    renderer.render(scene, camera);

    // マウス操作を行うためのコントローラー
    controls = new FlyControls(camera, renderer.domElement);

    // 前後ろの速度
    controls.movementSpeed = 1500;
    // 横の速度
    controls.rollSpeed = Math.PI / 60;

    // リサイズ対応
    window.addEventListener("resize", onWindowResize);

    animate();

}

// 画面リサイズに合わせてカメラとレンダラーを更新
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// マウス操作と連動するためのアニメーション
function animate() {
    requestAnimationFrame(animate);
    // フレーム毎の時間を取得
    const delta = clock.getDelta();
    // 操作していないときもゆっくり漂うようにシーン全体を自動回転
    // (カメラ操作と競合しないよう、カメラではなくシーンを回す)
    scene.rotation.y += delta * 0.01;
    scene.rotation.x += delta * 0.004;
    // マウス操作を更新
    controls.update(delta);
    renderer.render(scene, camera);
}

// ---------- UI: モバイルナビ & 年表示 ----------
const toggle = document.querySelector(".nav__toggle");
const links = document.querySelector(".nav__links");
if (toggle && links) {
    toggle.addEventListener("click", () => {
        const open = links.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", (e) => {
        if (e.target.tagName === "A") {
            links.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
        }
    });
}

const yearEl = document.getElementById("year");
if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
}

