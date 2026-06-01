/* =============================================================
   夜の高速道路を走るドット絵風背景
   依存ライブラリなし・生WebGL
   - 視点は車の高さ（正面を見た目線）
   - 道路両脇に一定間隔の道路照明灯
   - 蓄積バッファによる光の残像（自然な残光）
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

    // 全画面を覆う巨大三角形
    var VERT = [
        "attribute vec2 p;",
        "void main(){ gl_Position = vec4(p, 0.0, 1.0); }"
    ].join("\n");

    // 夜の高速道路 + 照明灯 + 残像
    var FRAG_SCENE = [
        "#ifdef GL_FRAGMENT_PRECISION_HIGH",
        "  precision highp float;",
        "#else",
        "  precision mediump float;",
        "#endif",
        "uniform vec2  u_res;",
        "uniform float u_time;",
        "uniform sampler2D u_prev;",   // 前フレーム（残像用）
        "uniform float u_decay;",      // 残像の減衰

        "float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }",

        "const float HORIZON = 0.5;",  // 地平線＝車の目線（正面）
        "const float SPEED   = 2.5;",  // 走行スピード
        "const float LSP     = 1.4;",  // 照明灯の間隔（ワールド単位）

        "void main(){",
        // ピクセル化
        "    float PX = max(floor(u_res.y / 240.0), 3.0);",
        "    vec2 fc = (floor(gl_FragCoord.xy / PX) + 0.5) * PX;",
        "    vec2 uv = fc / u_res;",
        "    float aspect = u_res.x / u_res.y;",
        "    vec2 P = vec2((uv.x - 0.5) * aspect, uv.y);",  // aspect補正済み座標

        "    vec3 col;",
        "    bool  onRoad = false;",
        "    float laneAbs = 100.0;",

        // ===== 基本シーン（空 or 路面）=====
        "    if (uv.y > HORIZON) {",
        "        float t = (uv.y - HORIZON) / (1.0 - HORIZON);",
        "        col = mix(vec3(0.50, 0.12, 0.42), vec3(0.02, 0.01, 0.10), t);",
        "        float s = hash(floor(fc / PX));",
        "        if (s > 0.984) { col += vec3(0.9) * (0.5 + 0.5 * sin(u_time * 3.0 + s * 50.0)); }",
        "        float md = distance(P, vec2(0.30 * aspect, 0.86));",
        "        col = mix(col, vec3(1.0, 0.96, 0.80), smoothstep(0.06, 0.0, md));",
        "        col += vec3(1.0, 0.9, 0.7) * smoothstep(0.14, 0.06, md) * 0.25;",
        "    } else {",
        "        float hy = HORIZON - uv.y;",
        "        float persp = hy / HORIZON;",
        "        float z = 1.0 / max(hy, 0.0008);",
        "        float v = z * 0.9 + u_time * SPEED;",
        "        float curve = sin(u_time * 0.3) * 0.18 * (1.0 - persp);",
        "        float cx = (uv.x - 0.5) - curve;",
        "        float halfW = persp * 0.52 + 0.012;",
        "        float adx = abs(cx);",
        "        col = mix(vec3(0.12, 0.05, 0.18), vec3(0.04, 0.09, 0.06), persp);",
        "        if (adx < halfW) {",
        "            onRoad = true;",
        "            col = mix(vec3(0.17, 0.11, 0.21), vec3(0.13, 0.13, 0.16), persp);",
        "            float lane = cx / halfW; laneAbs = abs(lane);",
        "            if (laneAbs < 0.06 && fract(v) < 0.5) { col = vec3(1.0, 0.85, 0.2); }",
        "            if (abs(laneAbs - 0.92) < 0.06) { col = vec3(0.9, 0.93, 0.98); }",
        "        }",
        "    }",

        // ===== 道路照明灯（両脇・一定間隔）=====
        "    vec3 lampCol = vec3(1.0, 0.72, 0.36);",     // ナトリウム灯っぽい暖色
        "    float kStart = floor(u_time * SPEED / LSP) + 1.0;",
        "    for (int i = 0; i < 14; i++) {",
        "        float k  = kStart + float(i);",
        "        float wk = k * LSP;",
        "        float zk = (wk - u_time * SPEED) / 0.9;",       // 灯の深度
        "        if (zk <= 0.03) { continue; }",
        "        float hyk = 1.0 / zk;",
        "        if (hyk >= HORIZON) { continue; }",             // 遠すぎ（地平線の先）
        "        float yk = HORIZON - hyk;",                     // 路面接地点の画面Y
        "        float perspk = hyk / HORIZON;",
        "        float curvek = sin(u_time * 0.3) * 0.18 * (1.0 - perspk);",
        "        float halfWk = perspk * 0.52 + 0.012;",
        "        float headH  = 0.05 + 0.17 * perspk;",          // ポールの高さ（手前ほど高い）
        "        float bright = perspk * 1.3 + 0.25;",           // 手前ほど明るい
        "        for (int s = 0; s < 2; s++) {",
        "            float sd = (s == 0) ? -1.0 : 1.0;",
        "            float baseX = 0.5 + curvek + sd * (halfWk + 0.015);",
        "            vec2 basePt = vec2((baseX - 0.5) * aspect, yk);",
        "            vec2 headPt = vec2((baseX - 0.5) * aspect, yk + headH);",
        // ランプ（光源）の発光＋ハロー
        "            float dh = distance(P, headPt);",
        "            float bulb = exp(-dh * dh * 900.0) * 1.2 + exp(-dh * dh * 70.0) * 0.35;",
        "            col += lampCol * bulb * bright;",
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
        "                col += lampCol * along * lat * 0.45 * bright;",
        "            }",
        "        }",
        "    }",

        // ===== 残像（前フレームを減衰させて最大値合成＝燐光のように自然減衰）=====
        "    vec3 prev = texture2D(u_prev, uv).rgb;",
        "    col = max(col, prev * u_decay);",

        // ドット絵風にパレット段階化
        "    col = floor(col * 16.0 + 0.5) / 16.0;",
        "    gl_FragColor = vec4(col, 1.0);",
        "}"
    ].join("\n");

    // 蓄積結果を画面へコピー
    var FRAG_COPY = [
        "precision mediump float;",
        "uniform sampler2D u_tex;",
        "uniform vec2 u_res;",
        "void main(){ gl_FragColor = texture2D(u_tex, gl_FragCoord.xy / u_res); }"
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

    function makeProgram(fragSrc) {
        var pr = gl.createProgram();
        gl.attachShader(pr, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fragSrc));
        gl.bindAttribLocation(pr, 0, "p");   // 両プログラムで attrib 0 に固定
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(pr));
        }
        return pr;
    }

    var sceneProg = makeProgram(FRAG_SCENE);
    var copyProg = makeProgram(FRAG_COPY);

    // 全画面三角形バッファ（attrib 0）
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // uniform ロケーション
    var sU = {
        res: gl.getUniformLocation(sceneProg, "u_res"),
        time: gl.getUniformLocation(sceneProg, "u_time"),
        prev: gl.getUniformLocation(sceneProg, "u_prev"),
        decay: gl.getUniformLocation(sceneProg, "u_decay")
    };
    var cU = {
        tex: gl.getUniformLocation(copyProg, "u_tex"),
        res: gl.getUniformLocation(copyProg, "u_res")
    };

    // ---- ping-pong テクスチャ & FBO ----
    var texW = 0, texH = 0;
    var texA, texB, fboA, fboB;

    function makeTarget(w, h) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // ドット感維持のためNEAREST
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return { tex: tex, fbo: fbo };
    }

    function ensureTargets(w, h) {
        if (w === texW && h === texH && texA) return;
        texW = w; texH = h;
        var a = makeTarget(w, h);
        var b = makeTarget(w, h);
        texA = a.tex; fboA = a.fbo;
        texB = b.tex; fboB = b.fbo;
    }

    function resize() {
        var w = canvas.clientWidth || window.innerWidth;
        var h = canvas.clientHeight || window.innerHeight;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        ensureTargets(canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    var start = performance.now();
    function frame() {
        resize();
        var w = canvas.width, h = canvas.height;
        var time = (performance.now() - start) / 1000;

        // 1) シーン+残像を fboB に描画（前フレーム texA を読む）
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
        gl.viewport(0, 0, w, h);
        gl.useProgram(sceneProg);
        gl.uniform2f(sU.res, w, h);
        gl.uniform1f(sU.time, time);
        gl.uniform1f(sU.decay, 0.82);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texA);
        gl.uniform1i(sU.prev, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 2) fboB の結果を画面へコピー
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.useProgram(copyProg);
        gl.uniform2f(cU.res, w, h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texB);
        gl.uniform1i(cU.tex, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 3) ping-pong スワップ
        var tt = texA; texA = texB; texB = tt;
        var tf = fboA; fboA = fboB; fboB = tf;

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
