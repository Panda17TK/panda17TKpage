/* =============================================================
   夜の高速道路を走るドット絵風背景
   依存ライブラリなし・生WebGLで全画面フラグメントシェーダーを描画
   ============================================================= */
(function () {
    "use strict";

    var canvas = document.getElementById("bg");
    if (!canvas) return;

    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    // WebGLが無い環境ではCSSのフォールバック背景に任せる
    if (!gl) {
        console.warn("WebGL is not available; using CSS fallback background.");
        return;
    }

    // ---- 頂点シェーダー：画面を覆う巨大三角形 ----
    var VERT = [
        "attribute vec2 p;",
        "void main(){ gl_Position = vec4(p, 0.0, 1.0); }"
    ].join("\n");

    // ---- フラグメントシェーダー：夜の高速道路（擬似3D + ドット絵化）----
    var FRAG = [
        "precision highp float;",
        "uniform vec2  u_res;",
        "uniform float u_time;",

        "float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }",

        "void main(){",
        // --- ピクセル化：5px四方のブロックに量子化してドット感を出す ---
        "    float PX = max(floor(u_res.y / 240.0), 3.0);",
        "    vec2 fc = (floor(gl_FragCoord.xy / PX) + 0.5) * PX;",
        "    vec2 uv = fc / u_res;",                       // 0..1, y は上方向
        "    float aspect = u_res.x / u_res.y;",

        "    float horizon = 0.5;",
        "    vec3 col;",

        "    if (uv.y > horizon) {",
        // ===== 夜空 =====
        "        float t = (uv.y - horizon) / (1.0 - horizon);",
        "        col = mix(vec3(0.45, 0.10, 0.38), vec3(0.02, 0.01, 0.10), t);",  // 紫→暗
        // 星
        "        float s = hash(floor(fc / PX));",
        "        if (s > 0.985) { col += vec3(0.9) * (0.5 + 0.5 * sin(u_time * 3.0 + s * 50.0)); }",
        // 月＋ハロー
        "        vec2 mp = vec2((uv.x - 0.5) * aspect, uv.y);",
        "        float md = distance(mp, vec2(0.52 * aspect, 0.82));",
        "        col = mix(col, vec3(1.0, 0.96, 0.80), smoothstep(0.075, 0.0, md));",
        "        col += vec3(1.0, 0.9, 0.7) * smoothstep(0.16, 0.075, md) * 0.22;",
        "    } else {",
        // ===== 路面（擬似3Dパース）=====
        "        float road = horizon - uv.y;",            // 0(地平線)..0.5(手前)
        "        float z = 1.0 / max(road, 0.0001);",       // 奥ほど大きい深度
        "        float v = z * 1.3 + u_time * 3.0;",        // 手前に流れるスクロール量

        // ゆるいカーブ（遠方ほど横にずれる）
        "        float bend = sin(u_time * 0.25) * 0.35;",
        "        float center = bend * (z - 2.0) * 0.15;",
        "        float ax = (uv.x - 0.5) * aspect - center;",
        "        float adx = abs(ax);",
        "        float halfW = road * 1.35;",               // 道路の半幅（手前ほど広い）

        // 路肩（草地）
        "        col = vec3(0.05, 0.09, 0.06);",

        "        if (adx < halfW) {",
        // アスファルト
        "            col = vec3(0.09, 0.09, 0.12);",
        "            float lane = ax / halfW;",              // -1..1
        // 中央の黄色破線
        "            if (abs(lane) < 0.08 && fract(v) < 0.5) { col = vec3(1.0, 0.82, 0.15); }",
        // 両端の白線（実線）
        "            if (abs(abs(lane) - 0.9) < 0.06) { col = vec3(0.85, 0.9, 0.95); }",
        "        } else if (adx < halfW + road * 0.16) {",
        // 路肩の街灯（オレンジに点々と）
        "            if (fract(v * 0.5) < 0.12) { col = vec3(1.0, 0.6, 0.2); }",
        "        }",

        // 遠方を紫フォグでなじませる
        "        float fog = smoothstep(0.0, 0.42, road);",
        "        col = mix(vec3(0.28, 0.06, 0.24), col, fog);",
        "    }",

        // ドット絵風にパレットを段階化
        "    col = floor(col * 16.0 + 0.5) / 16.0;",
        "    gl_FragColor = vec4(col, 1.0);",
        "}"
    ].join("\n");

    function compile(type, src) {
        var sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(sh));
        }
        return sh;
    }

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("Program link error:", gl.getProgramInfoLog(prog));
        return;
    }
    gl.useProgram(prog);

    // 全画面三角形
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, "u_res");
    var uTime = gl.getUniformLocation(prog, "u_time");

    function resize() {
        // CSSピクセル基準で描画（ドット感を保ちつつ負荷も軽く）
        var w = canvas.clientWidth || window.innerWidth;
        var h = canvas.clientHeight || window.innerHeight;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    var start = performance.now();
    function frame() {
        resize();
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, (performance.now() - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(frame);
    }
    frame();
})();

/* ---------- UI: モバイルナビ & 年表示 ---------- */
(function () {
    var toggle = document.querySelector(".nav__toggle");
    var links = document.querySelector(".nav__links");
    if (toggle && links) {
        toggle.addEventListener("click", function () {
            var open = links.classList.toggle("is-open");
            toggle.setAttribute("aria-expanded", String(open));
        });
        links.addEventListener("click", function (e) {
            if (e.target.tagName === "A") {
                links.classList.remove("is-open");
                toggle.setAttribute("aria-expanded", "false");
            }
        });
    }

    var yearEl = document.getElementById("year");
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
})();
