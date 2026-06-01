/* =============================================================
   WebGL レンダラ / シーン制御
   - config を uniform に反映
   - 可視時のみ描画 / reduced-motion は静止
   - スクロール量は JS で計算しラップ（精度安定）
   - コンテキストロスト復帰対応
   ============================================================= */
window.NH = window.NH || {};

NH.createScene = function (canvas, config) {
    var gl = canvas.getContext("webgl", {
        alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance"
    }) || canvas.getContext("experimental-webgl");
    if (!gl) return null;

    var derivExt = gl.getExtension("OES_standard_derivatives");
    var prog, buf, U = {}, locReady = false;
    var raf = 0, running = false, lost = false;
    var lastT = 0, scrollDist = 0, animTime = 0, wrapMeters = 1.0;
    var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

    function gcd(a, b) { while (b > 1e-6) { var t = a % b; a = b; b = t; } return a; }
    function computeWrap() {
        var d = config.dashLength, l = config.lampSpacing;
        var g = gcd(Math.max(d, l), Math.min(d, l));
        wrapMeters = g > 1e-4 ? d * l / g : d * l;
        if (!isFinite(wrapMeters) || wrapMeters < 1) wrapMeters = Math.max(d, l, 1);
    }

    function compile(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:\n" + gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    function buildProgram() {
        var vs = compile(gl.VERTEX_SHADER, NH.VERT);
        var fs = compile(gl.FRAGMENT_SHADER, NH.buildFragment({ derivatives: !!derivExt }));
        if (!vs || !fs) return false;
        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.bindAttribLocation(prog, 0, "p");
        gl.linkProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("Program link error:\n" + gl.getProgramInfoLog(prog));
            return false;
        }
        gl.useProgram(prog);

        buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        var names = ["u_res", "u_scroll", "u_sway", "u_camHeight", "u_pitch", "u_fovTan", "u_camX",
            "u_roadHalfWidth", "u_dashLength", "u_laneEdge", "u_swayAmount", "u_lampSpacing",
            "u_lampSide", "u_poleHeight", "u_glowSize", "u_tail", "u_glowBright", "u_poleWidth",
            "u_poolIntensity", "u_lampCount", "u_paletteSteps", "u_hazeIntensity", "u_moon",
            "u_skyTop", "u_skyHorizon", "u_ground", "u_asphalt", "u_laneCol", "u_lampCol",
            "u_hazeCol", "u_moonCol"];
        U = {};
        for (var i = 0; i < names.length; i++) U[names[i]] = gl.getUniformLocation(prog, names[i]);
        locReady = true;
        return true;
    }

    function applyConfig() {
        if (!locReady) return;
        gl.useProgram(prog);
        computeWrap();
        gl.uniform1f(U.u_camHeight, config.camHeight);
        gl.uniform1f(U.u_pitch, config.pitchDeg * Math.PI / 180);
        gl.uniform1f(U.u_fovTan, Math.tan(config.fovDeg * Math.PI / 360));
        gl.uniform1f(U.u_camX, config.laneOffset);
        gl.uniform1f(U.u_roadHalfWidth, config.roadHalfWidth);
        gl.uniform1f(U.u_dashLength, config.dashLength);
        gl.uniform1f(U.u_laneEdge, config.laneEdge);
        gl.uniform1f(U.u_swayAmount, config.swayAmount);
        gl.uniform1f(U.u_lampSpacing, config.lampSpacing);
        gl.uniform1f(U.u_lampSide, config.lampSide);
        gl.uniform1f(U.u_poleHeight, config.poleHeight);
        gl.uniform1f(U.u_glowSize, config.glowSize);
        gl.uniform1f(U.u_tail, config.tail);
        gl.uniform1f(U.u_glowBright, config.glowBright);
        gl.uniform1f(U.u_poleWidth, config.poleWidth);
        gl.uniform1f(U.u_poolIntensity, config.poolIntensity);
        gl.uniform1i(U.u_lampCount, config.lampCount | 0);
        gl.uniform1f(U.u_paletteSteps, config.paletteSteps);
        gl.uniform1f(U.u_hazeIntensity, config.hazeIntensity);
        gl.uniform1f(U.u_moon, config.moon ? 1.0 : 0.0);
        gl.uniform3fv(U.u_skyTop, config.skyTop);
        gl.uniform3fv(U.u_skyHorizon, config.skyHorizon);
        gl.uniform3fv(U.u_ground, config.ground);
        gl.uniform3fv(U.u_asphalt, config.asphalt);
        gl.uniform3fv(U.u_laneCol, config.laneCol);
        gl.uniform3fv(U.u_lampCol, config.lampCol);
        gl.uniform3fv(U.u_hazeCol, config.hazeCol);
        gl.uniform3fv(U.u_moonCol, config.moonCol);
        render();
    }

    function resize() {
        var cw = canvas.clientWidth || window.innerWidth;
        var ch = canvas.clientHeight || window.innerHeight;
        var rows = Math.max(40, config.pixelRows | 0);
        var w = Math.max(1, Math.round(rows * (cw / ch)));
        // 低解像度バッファ＋CSSの image-rendering:pixelated でドット絵化＆軽量化
        if (canvas.width !== w || canvas.height !== rows) {
            canvas.width = w;
            canvas.height = rows;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        render();
    }

    function render() {
        if (lost || !locReady) return;
        gl.useProgram(prog);
        gl.uniform2f(U.u_res, canvas.width, canvas.height);
        gl.uniform1f(U.u_scroll, scrollDist % wrapMeters);
        gl.uniform1f(U.u_sway, Math.sin(animTime * config.swaySpeed));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function loop(now) {
        if (!running) return;
        var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
        lastT = now;
        if (!reduceMQ.matches) {
            scrollDist += dt * config.speed;
            animTime += dt;
            if (animTime > 1e4) animTime -= 1e4;
        }
        render();
        raf = requestAnimationFrame(loop);
    }

    function start() {
        if (running || lost) return;
        if (reduceMQ.matches) { render(); return; } // 静止フレームのみ
        running = true;
        lastT = 0;
        raf = requestAnimationFrame(loop);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop(); else start();
    });
    if (reduceMQ.addEventListener) {
        reduceMQ.addEventListener("change", function () { stop(); start(); });
    }
    if (window.ResizeObserver) {
        new ResizeObserver(resize).observe(canvas);
    } else {
        window.addEventListener("resize", resize);
    }
    canvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault(); lost = true; stop();
    }, false);
    canvas.addEventListener("webglcontextrestored", function () {
        lost = false; locReady = false;
        if (buildProgram()) { applyConfig(); resize(); start(); }
    }, false);

    if (!buildProgram()) return null;

    return {
        applyConfig: applyConfig,
        resize: resize,
        start: start,
        stop: stop
    };
};
