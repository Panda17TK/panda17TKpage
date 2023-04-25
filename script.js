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

    addLight(0.08, 0.3, 0.9, 0, 0, -1000);

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
    controls.movementSpeed = 2500;
    // 横の速度
    controls.rollSpeed = Math.PI / 40;


    animate();

}

// マウス操作と連動するためのアニメーション
function animate() {
    requestAnimationFrame(animate);
    // フレーム毎の時間を取得
    const delta = clock.getDelta();
    // マウス操作を更新
    controls.update(delta);
    renderer.render(scene, camera);
}


