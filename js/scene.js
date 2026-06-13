/* =============================================================
   WebGL レンダラ / シーン制御
   - NH.PARAMS から uniform を自動設定（単一ソース）
   - 可視時のみ描画 / reduced-motion は静止
   - スクロール量は JS で計算しラップ（精度安定）
   - コンテキストロスト復帰・dispose 対応
   ============================================================= */
window.NH = window.NH || {};

NH.createScene = function (canvas, config) {
    var ctxAttrs = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" };
    var gl = canvas.getContext("webgl", ctxAttrs) || canvas.getContext("experimental-webgl", ctxAttrs);
    if (!gl) return null;

    var params = NH.PARAMS;
    var derivExt = gl.getExtension("OES_standard_derivatives");
    var prog = null, buf = null, U = {}, locReady = false;
    var raf = 0, running = false, lost = false, disposed = false;
    var lastT = 0, scrollDist = 0, animTime = 0, wrapMeters = 1.0, cityScroll = 0, cloudScroll = 0;
    var cars = [], carTimer = 6 + Math.random() * 24;     // 対向車（最大4台）＋次の出現までの秒数
    var carData = new Float32Array(8);                    // u_cars[4] = (laneX, Z)
    var carColData = new Float32Array(12);                // u_carCol[4] = body color
    // セダンのボディ色：白 / 黒 / 青 / シルバー
    var CAR_COLORS = [[0.90, 0.91, 0.93], [0.05, 0.05, 0.06], [0.10, 0.20, 0.52], [0.58, 0.60, 0.64]];
    var ro = null;
    var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

    function gcd(a, b) { var n = 0; while (b > 1e-6 && n++ < 1000) { var t = a % b; a = b; b = t; } return a; }
    function computeWrap() {
        var d = config.dashLength, l = config.lampSpacing;
        var g = gcd(Math.max(d, l), Math.min(d, l));
        wrapMeters = g > 1e-4 ? d * l / g : d * l;
        // 非整数間隔だと gcd が極小になり wrap が巨大化（実質ラップしない／精度劣化）。
        // 上限を超える場合は dashLength を内包する lampSpacing の整数倍へフォールバックして
        // 灯の連続性（lampSpacing の倍数）を保ちつつ周期を実用的に保つ。
        var CAP = 1e4;
        if (!isFinite(wrapMeters) || wrapMeters < 1 || wrapMeters > CAP) {
            wrapMeters = l * Math.max(1, Math.ceil(d / l));
        }
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
        if (prog) { gl.deleteProgram(prog); prog = null; }
        if (buf) { gl.deleteBuffer(buf); buf = null; }
        locReady = false;

        var vs = compile(gl.VERTEX_SHADER, NH.VERT);
        var fs = compile(gl.FRAGMENT_SHADER, NH.buildFragment({ derivatives: !!derivExt, params: params }));
        if (!vs || !fs) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); return false; }

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

        // uniform ロケーション（エンジン + PARAMS）
        U = {
            u_res: gl.getUniformLocation(prog, "u_res"),
            u_scroll: gl.getUniformLocation(prog, "u_scroll"),
            u_sway: gl.getUniformLocation(prog, "u_sway"),
            u_time: gl.getUniformLocation(prog, "u_time"),
            u_cityPhase: gl.getUniformLocation(prog, "u_cityPhase"),
            u_cityScroll: gl.getUniformLocation(prog, "u_cityScroll"),
            u_cloudScroll: gl.getUniformLocation(prog, "u_cloudScroll"),
            u_cars: gl.getUniformLocation(prog, "u_cars[0]"),
            u_carCol: gl.getUniformLocation(prog, "u_carCol[0]")
        };
        for (var i = 0; i < params.length; i++) {
            if (params[i].uniform) U[params[i].uniform] = gl.getUniformLocation(prog, params[i].uniform);
        }
        locReady = true;
        return true;
    }

    function setUniform(p) {
        var loc = U[p.uniform];
        if (loc == null) return;
        var v = config[p.key];
        if (p.map) v = p.map(v);
        if (p.type === "color") gl.uniform3fv(loc, v);
        else if (p.type === "int") gl.uniform1i(loc, v | 0);
        else if (p.type === "bool") gl.uniform1f(loc, v ? 1.0 : 0.0);
        else gl.uniform1f(loc, v);
    }

    function applyConfig() {
        if (!locReady) return;
        gl.useProgram(prog);
        computeWrap();
        for (var i = 0; i < params.length; i++) {
            if (params[i].uniform) setUniform(params[i]);
        }
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
        // 都市は道路の揺れと切り離し、cityFlowRate 倍のゆっくりした位相で流す
        gl.uniform1f(U.u_cityPhase, Math.sin(animTime * config.swaySpeed * config.cityFlowRate));
        // 前進に伴う遠景都市の平行移動。基層が256セル周期で継ぎ目なく繰り返すよう 256/cityCols でラップ
        gl.uniform1f(U.u_cityScroll, cityScroll % (256.0 / Math.max(1, config.cityCols)));
        // 薄雲の連続ドリフト。mediump 安全のため有界化
        gl.uniform1f(U.u_cloudScroll, cloudScroll % 100.0);
        gl.uniform1f(U.u_time, animTime % 100.0);   // 窓の瞬き用（有界）
        if (U.u_cars) {
            for (var ci = 0; ci < 4; ci++) {
                var car = cars[ci];
                carData[ci * 2] = car ? car.x : 0.0;
                carData[ci * 2 + 1] = car ? car.z : -1.0;   // Z<=0 は非アクティブ
                var cc = car ? car.col : CAR_COLORS[0];
                carColData[ci * 3] = cc[0]; carColData[ci * 3 + 1] = cc[1]; carColData[ci * 3 + 2] = cc[2];
            }
            gl.uniform2fv(U.u_cars, carData);
            if (U.u_carCol) gl.uniform3fv(U.u_carCol, carColData);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 対向車：反対車線(x>0)を手前へ走る。たまに(carMinGap〜carMaxGap秒)1台出現。
    function updateCars(dt) {
        for (var i = cars.length - 1; i >= 0; i--) {
            cars[i].z -= cars[i].speed * dt;       // 接近（Zが減る）
            if (cars[i].z < 2) cars.splice(i, 1);  // 至近でフェード済み→消す（巨大化前に除去）
        }
        carTimer -= dt;
        if (carTimer <= 0) {
            var gap = config.carMinGap + Math.random() * Math.max(0, config.carMaxGap - config.carMinGap);
            carTimer = gap;
            if (cars.length < 4) {
                var hw = config.roadHalfWidth;
                var laneC = (Math.random() < 0.5 ? 0.25 : 0.75) * hw;     // 反対側2車線のどちらか
                var x = laneC + (Math.random() - 0.5) * hw * 0.12;        // 車線内の微小ばらつき
                var sp = config.carSpeed * (0.85 + Math.random() * 0.3);  // 速度ばらつき
                var col = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
                cars.push({ x: x, z: config.carSpawnDist, speed: sp, col: col });
            }
        }
    }

    function loop(now) {
        if (!running) return;
        var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
        lastT = now;
        if (!reduceMQ.matches) {
            scrollDist += dt * config.speed;
            cityScroll += dt * config.citySpeed;
            cloudScroll += dt * config.cloudSpeed;
            animTime += dt;
            if (animTime > 1e4) animTime -= 1e4;
            updateCars(dt);
        }
        render();
        raf = requestAnimationFrame(loop);
    }

    function start() {
        if (running || lost || disposed) return;
        if (reduceMQ.matches) { render(); return; } // 静止フレームのみ
        running = true;
        lastT = 0;
        raf = requestAnimationFrame(loop);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    // ---- イベント（buildProgram 成功後にのみ登録）----
    function onVisibility() { if (document.hidden) stop(); else start(); }
    function onReduceChange() { stop(); start(); }
    function onContextLost(e) { e.preventDefault(); lost = true; stop(); }
    function onContextRestored() {
        lost = false;
        if (buildProgram()) { applyConfig(); resize(); start(); }
    }

    function attach() {
        document.addEventListener("visibilitychange", onVisibility);
        if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onReduceChange);
        if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(canvas); }
        else window.addEventListener("resize", resize);
        canvas.addEventListener("webglcontextlost", onContextLost, false);
        canvas.addEventListener("webglcontextrestored", onContextRestored, false);
    }

    function dispose() {
        disposed = true;
        stop();
        document.removeEventListener("visibilitychange", onVisibility);
        if (reduceMQ.removeEventListener) reduceMQ.removeEventListener("change", onReduceChange);
        if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
        canvas.removeEventListener("webglcontextlost", onContextLost, false);
        canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
        if (prog) { gl.deleteProgram(prog); prog = null; }
        if (buf) { gl.deleteBuffer(buf); buf = null; }
        locReady = false;
    }

    if (!buildProgram()) return null;   // 失敗時はリスナを登録しない
    attach();

    return {
        applyConfig: applyConfig,
        resize: resize,
        start: start,
        stop: stop,
        dispose: dispose
    };
};
