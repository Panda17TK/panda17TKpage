/* =============================================================
   Headless render smoke test
   - shaders/config をブラウザ外で読み込み、実際に GLSL をコンパイル/リンク
   - 横長(96x64)と縦長(64x96)の両アスペクトで1フレーム描画
   - 「真っ黒でない」「十分に点灯している」「明るいハイライトがある」をアサート
   過去の「背景が描画されない」「縦長で黒画面」リグレッションを CI で検知する。
   ============================================================= */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");

// ブラウザ用スクリプトを window シム上で評価
var sandbox = { Math: Math, console: console, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, Array: Array, Object: Object };
sandbox.window = sandbox;
vm.createContext(sandbox);
["js/config.js", "js/shaders.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
});
var NH = sandbox.window.NH;

function fail(msg) { console.error("FAIL: " + msg); process.exit(1); }

if (!NH || !NH.PARAMS || !NH.config || !NH.VERT || !NH.buildFragment) fail("NH not initialized from browser scripts");

var createGL;
try { createGL = require("gl"); } catch (e) { fail("headless-gl ('gl') not installed: " + e.message); }

function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        fail("shader compile error:\n" + gl.getShaderInfoLog(s) + "\n--- source ---\n" + src);
    }
    return s;
}

function buildProgram(gl, useDeriv) {
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, NH.VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, NH.buildFragment({ derivatives: useDeriv, params: NH.PARAMS })));
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) fail("program link error:\n" + gl.getProgramInfoLog(prog));
    return prog;
}

function setUniforms(gl, prog, W, H) {
    function loc(n) { return gl.getUniformLocation(prog, n); }
    gl.uniform2f(loc("u_res"), W, H);
    gl.uniform1f(loc("u_scroll"), 12.0);
    gl.uniform1f(loc("u_sway"), 0.4);        // 進路のカーブを踏む
    gl.uniform1f(loc("u_cityPhase"), 0.5);   // 都市の揺れ
    gl.uniform1f(loc("u_cityScroll"), 2.0);  // 都市の前進平行移動
    gl.uniform1f(loc("u_time"), 3.0);        // 窓の瞬き・障害灯点滅の時間依存パスを踏む
    NH.PARAMS.forEach(function (p) {
        if (!p.uniform) return;
        var l = loc(p.uniform);
        if (l == null) return;
        var v = NH.config[p.key];
        if (p.map) v = p.map(v);
        if (p.type === "color") gl.uniform3fv(l, v);
        else if (p.type === "int") gl.uniform1i(l, v | 0);
        else if (p.type === "bool") gl.uniform1f(l, v ? 1 : 0);
        else gl.uniform1f(l, v);
    });
}

// 1アスペクトを描画して輝度統計を返す。deriv 拡張があれば使用、無ければ false でコンパイル検証も兼ねる。
function render(W, H) {
    var gl = createGL(W, H, { preserveDrawingBuffer: true });
    if (!gl) fail("could not create headless GL context " + W + "x" + H);
    var deriv = !!gl.getExtension("OES_standard_derivatives");

    // 派生拡張あり/なし両方がコンパイル/リンクできることを検証
    buildProgram(gl, false);
    var prog = deriv ? buildProgram(gl, true) : buildProgram(gl, false);

    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    setUniforms(gl, prog, W, H);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    var err = gl.getError();
    if (err !== gl.NO_ERROR) fail("gl error after draw (" + W + "x" + H + "): 0x" + err.toString(16));

    var px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var maxv = 0, lit = 0, total = W * H;
    for (var i = 0; i < px.length; i += 4) {
        var m = Math.max(px[i], px[i + 1], px[i + 2]);
        if (m > maxv) maxv = m;
        if (m > 8) lit++;
    }
    return { W: W, H: H, deriv: deriv, maxv: maxv, lit: lit, total: total };
}

function check(r, requireBrightHighlight) {
    if (r.maxv < 5) fail(r.W + "x" + r.H + ": frame is essentially black (maxChannel=" + r.maxv + ")");
    if (r.lit < r.total * 0.2) fail(r.W + "x" + r.H + ": too few lit pixels (" + r.lit + "/" + r.total + ") — scene may be failing to render");
    if (requireBrightHighlight && r.maxv < 100) fail(r.W + "x" + r.H + ": no bright highlight (maxChannel=" + r.maxv + ") — tonemap/light pipeline may be broken");
    console.log("OK: " + r.W + "x" + r.H + " maxChannel=" + r.maxv + " litPixels=" + r.lit + "/" + r.total + " derivatives=" + r.deriv);
}

check(render(96, 64), true);   // 横長：明るいハイライト必須（ライト/トーンマップの回帰防止）
check(render(64, 96), false);  // 縦長：黒画面リグレッション防止

console.log("render-smoke passed");
process.exit(0);
