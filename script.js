/* =============================================================
   夜の高速道路を走るドット絵風背景
   依存ライブラリなし・生WebGL
   - 視点は車の高さ（正面を見た目線）
   - 道路両脇に一定間隔の道路照明灯
   - 各照明の残光は道路の縁（消失点方向）に平行に流れ、遠いほど小さい
   ============================================================= */
(function () {
    "use strict";

    var canvas = document.getElementById("bg");
    if (!canvas) return;

    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
        console.warn("WebGL is not available; using CSS fallback background.");
        return;
    }

    var VERT = [
        "attribute vec2 p;",
        "void main(){ gl_Position = vec4(p, 0.0, 1.0); }"
    ].join("\n");

    var FRAG = [
        "#ifdef GL_FRAGMENT_PRECISION_HIGH",
        "  precision highp float;",
        "#else",
        "  precision mediump float;",
        "#endif",
        "uniform vec2  u_res;",
        "uniform float u_time;",

        "float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }",

        "const float HORIZON = 0.5;",  // 地平線＝車の目線
        "const float SPEED   = 2.5;",  // 走行スピード
        "const float LSP     = 1.4;",  // 照明灯の間隔（ワールド単位）

        "void main(){",
        // ピクセル化
        "    float PX = max(floor(u_res.y / 240.0), 3.0);",
        "    vec2 fc = (floor(gl_FragCoord.xy / PX) + 0.5) * PX;",
        "    vec2 uv = fc / u_res;",
        "    float aspect = u_res.x / u_res.y;",
        "    vec2 P = vec2((uv.x - 0.5) * aspect, uv.y);",

        "    vec3 col;",
        "    bool  onRoad = false;",
        "    float laneAbs = 100.0;",

        // ===== 基本シーン =====
        "    if (uv.y > HORIZON) {",
        // 夜空（ネオンなし・濃紺→ほぼ黒）
        "        float t = (uv.y - HORIZON) / (1.0 - HORIZON);",
        "        col = mix(vec3(0.05, 0.06, 0.12), vec3(0.005, 0.005, 0.03), t);",
        // 星
        "        float s = hash(floor(fc / PX));",
        "        if (s > 0.984) { col += vec3(0.9) * (0.5 + 0.5 * sin(u_time * 3.0 + s * 50.0)); }",
        // 月＋ハロー
        "        float md = distance(P, vec2(0.30 * aspect, 0.86));",
        "        col = mix(col, vec3(0.95, 0.95, 0.85), smoothstep(0.06, 0.0, md));",
        "        col += vec3(0.7, 0.72, 0.6) * smoothstep(0.14, 0.06, md) * 0.18;",
        "    } else {",
        "        float hy = HORIZON - uv.y;",
        "        float persp = hy / HORIZON;",
        "        float z = 1.0 / max(hy, 0.0008);",
        "        float v = z * 0.9 + u_time * SPEED;",
        "        float curve = sin(u_time * 0.3) * 0.18 * (1.0 - persp);",
        "        float cx = (uv.x - 0.5) - curve;",
        "        float halfW = persp * 0.52 + 0.012;",
        "        float adx = abs(cx);",
        // 地面（ニュートラルな暗色。紫を排除）
        "        col = mix(vec3(0.06, 0.06, 0.10), vec3(0.04, 0.08, 0.06), persp);",
        "        if (adx < halfW) {",
        "            onRoad = true;",
        "            col = mix(vec3(0.12, 0.12, 0.15), vec3(0.14, 0.14, 0.16), persp);",
        "            float lane = cx / halfW; laneAbs = abs(lane);",
        "            if (laneAbs < 0.06 && fract(v) < 0.5) { col = vec3(1.0, 0.85, 0.2); }",
        "            if (abs(laneAbs - 0.92) < 0.06) { col = vec3(0.9, 0.93, 0.98); }",
        "        }",
        "    }",

        // ===== 道路照明灯（両脇・一定間隔）+ 道路の縁に平行な残光 =====
        "    vec3 lampCol = vec3(1.0, 0.72, 0.36);",
        "    float curveTop = sin(u_time * 0.3) * 0.18;",          // 消失点の横ずれ
        "    vec2  vpPt = vec2(curveTop * aspect, HORIZON);",      // 消失点（画面）
        "    float kStart = floor(u_time * SPEED / LSP) + 1.0;",
        "    for (int i = 0; i < 14; i++) {",
        "        float k  = kStart + float(i);",
        "        float wk = k * LSP;",
        "        float zk = (wk - u_time * SPEED) / 0.9;",
        "        if (zk <= 0.03) { continue; }",
        "        float hyk = 1.0 / zk;",
        "        if (hyk >= HORIZON) { continue; }",
        "        float yk = HORIZON - hyk;",
        "        float perspk = hyk / HORIZON;",
        "        float scl = pow(perspk, 1.4);",                   // 遠いほど一気に小さく
        "        float curvek = sin(u_time * 0.3) * 0.18 * (1.0 - perspk);",
        "        float halfWk = perspk * 0.52 + 0.012;",
        "        float headH  = 0.05 + 0.17 * perspk;",
        "        float bright = perspk * 1.4 + 0.12;",
        "        for (int sgn = 0; sgn < 2; sgn++) {",
        "            float sd = (sgn == 0) ? -1.0 : 1.0;",
        "            float baseX = 0.5 + curvek + sd * (halfWk + 0.015);",
        "            vec2 basePt = vec2((baseX - 0.5) * aspect, yk);",
        "            vec2 headPt = vec2((baseX - 0.5) * aspect, yk + headH);",
        // 残光：消失点方向（＝道路の縁に平行）に伸びる異方性グロー
        "            vec2 rel = P - headPt;",
        "            vec2 dir = normalize(vpPt - headPt);",        // 道路の縁に沿う向き
        "            vec2 perp = vec2(-dir.y, dir.x);",
        "            float a = dot(rel, dir);",                    // +で消失点側（残光が伸びる側）
        "            float b = dot(rel, perp);",
        "            float tail = 0.20 * scl;",                    // 尾の長さ（遠いほど短い）
        "            float wid  = 0.012 * scl + 0.0015;",          // 太さ
        "            float aa = (a > 0.0) ? (a / tail) : (a / wid);",
        "            float bb = b / wid;",
        "            float glow = exp(-(aa * aa + bb * bb));",
        "            col += lampCol * glow * bright;",
        // 支柱（細い暗いポール）
        "            float pdx = abs(P.x - basePt.x);",
        "            if (pdx < 0.004 && uv.y > yk && uv.y < yk + headH) {",
        "                col = mix(col, vec3(0.04, 0.04, 0.05), 0.8);",
        "            }",
        // 路面を照らす光のプール
        "            if (onRoad) {",
        "                float dy = (uv.y - yk);",
        "                float along = exp(-dy * dy * 150.0 / (perspk + 0.25));",
        "                float lat = smoothstep(1.15, 0.0, laneAbs);",
        "                col += lampCol * along * lat * 0.4 * bright;",
        "            }",
        "        }",
        "    }",

        // ドット絵風にパレット段階化
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

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, "u_res");
    var uTime = gl.getUniformLocation(prog, "u_time");

    function resize() {
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
