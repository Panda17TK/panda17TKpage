/* =============================================================
   Headless render smoke test
   - shaders/config をブラウザ外で読み込み
   - 実際に GLSL をコンパイル/リンク（コンパイルエラーを検知）
   - 1 フレーム描画して「真っ黒でない」ことをアサート
   過去に起きた「背景が描画されない」リグレッションを CI で検知する。
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

var W = 96, H = 64;
var gl = createGL(W, H, { preserveDrawingBuffer: true });
if (!gl) fail("could not create headless GL context");

var deriv = !!gl.getExtension("OES_standard_derivatives");

function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        fail("shader compile error:\n" + gl.getShaderInfoLog(s) + "\n--- source ---\n" + src);
    }
    return s;
}

// 派生拡張あり/なし両方のフラグメントをコンパイル検証
[false, deriv].forEach(function (useDeriv, idx) {
    if (idx === 1 && !deriv) return; // 拡張が無ければ2回目はスキップ
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, NH.VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, NH.buildFragment({ derivatives: useDeriv, params: NH.PARAMS })));
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) fail("program link error:\n" + gl.getProgramInfoLog(prog));

    if (idx === (deriv ? 1 : 0)) {
        // 最後の有効なプログラムで実描画
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // uniform を config から設定（scene.js のロジックを最小再現）
        function loc(n) { return gl.getUniformLocation(prog, n); }
        gl.uniform2f(loc("u_res"), W, H);
        gl.uniform1f(loc("u_scroll"), 12.0);
        gl.uniform1f(loc("u_sway"), 0.4);   // 進路の揺れ＝都市の視差/カーブを踏む
        gl.uniform1f(loc("u_time"), 3.0);   // 窓の瞬き・障害灯点滅の時間依存パスを踏む
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

        gl.viewport(0, 0, W, H);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        var err = gl.getError();
        if (err !== gl.NO_ERROR) fail("gl error after draw: 0x" + err.toString(16));

        var px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        var maxv = 0, lit = 0;
        for (var i = 0; i < px.length; i += 4) {
            var m = Math.max(px[i], px[i + 1], px[i + 2]);
            if (m > maxv) maxv = m;
            if (m > 4) lit++;
        }
        if (maxv < 5) fail("frame is essentially black (max channel=" + maxv + ")");
        console.log("OK: rendered " + W + "x" + H + ", maxChannel=" + maxv + ", litPixels=" + lit + ", derivatives=" + deriv);
    }
});

console.log("render-smoke passed");
process.exit(0);
