import * as THREE from "./build/three.module.js";

// ============================================================
//  夜の高速道路を走るドット絵風シェーダー背景
//  フルスクリーンの板ポリゴンにフラグメントシェーダーを描画
// ============================================================

let camera, scene, renderer, material;
const clock = new THREE.Clock();

init();

function init() {
    renderer = new THREE.WebGLRenderer({ antialias: false });
    // ドット感を出したいので解像度はCSSピクセル基準（等倍）に固定
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    // 画面いっぱいに板を出すための正射影カメラ
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    material = new THREE.ShaderMaterial({
        uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector2() },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
    });

    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    onWindowResize();
    window.addEventListener("resize", onWindowResize);

    animate();
}

function onWindowResize() {
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    material.uniforms.iTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
}

// ---------- シェーダー ----------
const VERT = /* glsl */ `
    void main() {
        gl_Position = vec4(position, 1.0);
    }
`;

const FRAG = /* glsl */ `
    precision highp float;

    uniform float iTime;
    uniform vec2  iResolution;

    // 乱数（星のきらめき用）
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // 限定パレットに丸めてドット絵風に
    vec3 quantize(vec3 c, float steps) {
        return floor(c * steps + 0.5) / steps;
    }

    void main() {
        // --- ピクセル化：内部解像度を縦220ドット相当に落とす ---
        float pixels = 220.0;
        float px = max(iResolution.y / pixels, 1.0);
        vec2 fragCoord = floor(gl_FragCoord.xy / px) * px;

        vec2 uv = fragCoord / iResolution.xy;     // 0..1
        float aspect = iResolution.x / iResolution.y;
        float x = (uv.x - 0.5) * aspect;          // 中央0の横座標
        float y = uv.y;                           // 下0 上1

        float horizon = 0.55;
        float speed   = iTime * 2.2;              // 走行スピード
        vec3 col;

        if (y > horizon) {
            // ===== 空（シンセウェーブな夜空）=====
            float t = (y - horizon) / (1.0 - horizon);
            vec3 skyTop    = vec3(0.03, 0.02, 0.12);
            vec3 skyBottom = vec3(0.45, 0.10, 0.38);
            col = mix(skyBottom, skyTop, t);

            // 星
            vec2 cell = floor(fragCoord / px);
            float s = hash(cell);
            float twinkle = 0.5 + 0.5 * sin(iTime * 3.0 + s * 30.0);
            if (s > 0.987 && y > horizon + 0.04) {
                col += vec3(0.9) * twinkle;
            }

            // 月
            vec2 moon = vec2(0.55 * aspect, 0.86);
            float md = distance(vec2(x, y), moon);
            col = mix(col, vec3(1.0, 0.95, 0.78), smoothstep(0.075, 0.0, md));
            col += vec3(0.9, 0.85, 0.6) * smoothstep(0.16, 0.075, md) * 0.25; // ハロー

            // 地平線の街明かり
            col += vec3(0.55, 0.12, 0.40) * pow(1.0 - t, 5.0);
        } else {
            // ===== 地面と道路（擬似3D）=====
            float z = 1.0 / (horizon - y);        // 遠いほど大きい
            float scroll = z + speed;             // 手前に流れる

            // ゆるいカーブ（遠方ほど横にずれる）
            float bend = sin(iTime * 0.25);
            float roadCenter = clamp(bend * 0.18 * (z - 1.8), -1.4, 1.4);

            float roadHalfWorld = 0.95;
            float halfW = roadHalfWorld / z;       // 遠いほど細い
            float dx = x - roadCenter;

            // 草地（チェッカーで流れを表現）
            float chk = mod(floor(scroll * 1.5) + floor((x + 4.0) * 3.0), 2.0);
            vec3 grass = mix(vec3(0.04, 0.10, 0.07), vec3(0.06, 0.16, 0.10), chk);
            col = grass;

            if (abs(dx) < halfW) {
                // アスファルト
                col = vec3(0.07, 0.07, 0.10);
                float ln = dx / halfW;            // 道路内 -1..1

                // 中央の黄色破線
                float dash = step(0.5, fract(scroll * 0.5));
                if (abs(ln) < 0.07 && dash > 0.5) {
                    col = vec3(0.98, 0.82, 0.18);
                }
                // 両端の白線
                if (abs(abs(ln) - 0.92) < 0.05) {
                    col = vec3(0.85, 0.88, 0.95);
                }
            } else {
                // 路肩の街灯（オレンジに点々と光る）
                float lamp = fract(scroll * 0.5);
                float edge = halfW + 0.05;
                if (abs(abs(dx) - edge) < 0.025 && lamp < 0.12) {
                    col = vec3(1.0, 0.6, 0.2);
                    col += vec3(1.0, 0.5, 0.15) * 0.5;
                }
            }

            // 遠方を紫のフォグでなじませる
            float fog = clamp(y / horizon, 0.0, 1.0);
            col = mix(vec3(0.30, 0.06, 0.26), col, fog);
        }

        // ドット絵風にパレットを段階化
        col = quantize(col, 14.0);

        gl_FragColor = vec4(col, 1.0);
    }
`;

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
