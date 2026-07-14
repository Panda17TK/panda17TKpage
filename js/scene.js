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
    var lastT = 0, scrollDist = 0, wrapMeters = 1.0, cityScroll = 0, cloudScroll = 0;
    var TAU = Math.PI * 2;
    // 位相アキュムレータ：sin に渡す位相そのものを 2π でラップし、
    // 時間の有界化（旧 animTime % 1e4 / u_time % 100）で起きていた位相ジャンプを根絶する
    var swayPhase = 0, cityPhaseV = 0, blinkTime = 0;
    var C = NH.CONSTS;                                    // GLSL 側と共有の周期定数（shaders.js が #define 注入）
    var fpsAcc = 0, fpsN = 0;                             // 実測FPSによる品質自動ダウン用
    var flashT = -1, flashHasCar = false;                 // パッシング（クリックのハイビーム）
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
        // 塀の継ぎ目(3m)/反射板(6m)も u_scroll 基準で流れるため、6 の倍数にも揃える
        // （既定値 210 は 6 の倍数なので変化なし。揃わない場合のみ拡張）
        var g6 = gcd(Math.max(wrapMeters, 6.0), Math.min(wrapMeters, 6.0));
        if (g6 > 1e-4) {
            var w6 = wrapMeters * 6.0 / g6;
            if (isFinite(w6) && w6 <= CAP) wrapMeters = w6;
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
            u_groundScroll: gl.getUniformLocation(prog, "u_groundScroll"),
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
        resize();   // pixelRows の変更も即時反映（サイズ不変なら viewport 設定＋再描画のみ）
    }

    function resize() {
        var cw = canvas.clientWidth || window.innerWidth;
        var ch = canvas.clientHeight || window.innerHeight;
        // レイアウト前・非表示時はサイズ0 → 0/0=NaN で canvas.width が壊れるため見送る
        // （表示されたら ResizeObserver / resize イベントが改めて呼ぶ）
        if (cw < 1 || ch < 1) return;
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
        gl.uniform1f(U.u_sway, Math.sin(swayPhase));
        // 都市は道路の揺れと切り離し、cityFlowRate 倍のゆっくりした位相で流す
        gl.uniform1f(U.u_cityPhase, Math.sin(cityPhaseV));
        // 前進に伴う遠景都市の平行移動。両層のセルパターンが CITY_CELLS セル周期で継ぎ目なく
        // 繰り返すよう CITY_CELLS/cityCols でラップ（近層は par×scale 積が整数になる係数を採用）
        gl.uniform1f(U.u_cityScroll, cityScroll % (C.CITY_CELLS / Math.max(1, config.cityCols)));
        // 薄雲：drift 乗算後の値を NOISE_PERIOD（周期ノイズの周期）でラップ → ラップ時も模様が連続
        gl.uniform1f(U.u_cloudScroll, (cloudScroll * config.cloudDrift) % C.NOISE_PERIOD);
        // 路肩ノイズ：係数乗算後の値を NOISE_PERIOD でラップ（係数は GLSL 側 #define と共有）
        gl.uniform1f(U.u_groundScroll, (scrollDist * C.GROUND_NOISE_SCALE) % C.NOISE_PERIOD);
        gl.uniform1f(U.u_time, blinkTime);   // 窓の瞬き用（TIME_WRAP 秒でラップ。瞬き周波数は 2π/TIME_WRAP の整数倍）
        // パッシング：クリック起因のハイビーム2連発と、対向車の応答2連発
        if (U.u_egoBright != null) {
            var eb = 1.0, cb = 1.0;
            if (flashT >= 0) {
                eb += 2.4 * (flashPulse(flashT, 0.0) + flashPulse(flashT, 0.28));
                if (flashHasCar) cb += 1.8 * (flashPulse(flashT, 0.75) + flashPulse(flashT, 1.0));
            }
            gl.uniform1f(U.u_egoBright, config.egoBright * eb);
            if (U.u_carHeadBright != null) gl.uniform1f(U.u_carHeadBright, config.carHeadBright * cb);
        }
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
                // 反対車線(x>0)の2車線中心。シェーダーの車線分離線（破線 ±laneEdge*0.5、
                // 外側エッジ ±laneEdge）に合わせ、内側=laneEdge*0.25 / 外側=laneEdge*0.75。
                var laneC = (Math.random() < 0.5 ? 0.25 : 0.75) * config.laneEdge * hw;
                var x = laneC + (Math.random() - 0.5) * hw * 0.10;        // 車線内の微小ばらつき
                var sp = config.carSpeed * (0.85 + Math.random() * 0.3);  // 速度ばらつき
                var col = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
                cars.push({ x: x, z: config.carSpawnDist, speed: sp, col: col });
            }
        }
    }

    // パッシングの明滅エンベロープ（t0 を中心とした短いガウシアンパルス）
    function flashPulse(t, t0) {
        var x = (t - t0) / 0.11;
        return Math.exp(-x * x);
    }

    // クリックでハイビーム（対向車がいれば少し遅れて応答が返る）
    function flash() {
        if (reduceMQ.matches || lost || disposed || !running) return;
        flashT = 0;
        flashHasCar = cars.length > 0;
    }

    // 実測FPSが低いままなら描画解像度を段階的に下げる（デバイス推定の誤判定への保険）。
    // タブ切替やGC等の一時的なスパイクで恒久劣化しないよう2窓連続の低FPSでのみ下げ、
    // 余裕が戻ったら（>55fps相当）元の解像度を上限に段階回復する
    var tuneBadWindows = 0;
    var tuneBaseRows = 0;
    function autoTune() {
        if (fpsN < 120) return;
        if (!tuneBaseRows) tuneBaseRows = config.pixelRows;
        var avg = fpsAcc / fpsN;
        fpsAcc = 0; fpsN = 0;
        if (avg > 1 / 40) {
            tuneBadWindows++;
            if (tuneBadWindows >= 2 && config.pixelRows > 190) {
                config.pixelRows = Math.max(180, Math.round(config.pixelRows * 0.75));
                resize();
                tuneBadWindows = 0;
            }
        } else {
            tuneBadWindows = 0;
            if (avg < 1 / 55 && config.pixelRows < tuneBaseRows) {
                config.pixelRows = Math.min(tuneBaseRows, Math.round(config.pixelRows * 1.15));
                resize();
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
            swayPhase = (swayPhase + dt * config.swaySpeed) % TAU;
            cityPhaseV = (cityPhaseV + dt * config.swaySpeed * config.cityFlowRate) % TAU;
            blinkTime = (blinkTime + dt) % C.TIME_WRAP;
            if (flashT >= 0 && (flashT += dt) > 1.6) flashT = -1;
            updateCars(dt);
            fpsAcc += dt; fpsN++;
            autoTune();
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
        // 拡張オブジェクトはコンテキストロストで無効化される。再取得しないと
        // #extension GL_OES_standard_derivatives のコンパイルが失敗する
        derivExt = gl.getExtension("OES_standard_derivatives");
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
        dispose: dispose,
        flash: flash                                        // パッシング（クリックのハイビーム）
    };
};
