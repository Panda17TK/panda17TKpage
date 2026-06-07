/* =============================================================
   OG 画像生成スクリプト（1200x630 PNG）
   - 実際の夜の高速道路シェーダーを headless-gl で描画
   - 依存追加なし：PNG は node 標準の zlib で自前エンコード
   使い方: node scripts/make-og.js  → リポジトリ直下に og-image.png を出力
   ============================================================= */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var zlib = require("zlib");

var ROOT = path.join(__dirname, "..");

function die(msg) { console.error(msg); process.exit(1); }

// ブラウザ用スクリプトを window シム上で評価
var sandbox = { Math: Math, console: console, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, Array: Array, Object: Object };
sandbox.window = sandbox;
vm.createContext(sandbox);
["js/config.js", "js/shaders.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
});
var NH = sandbox.window.NH;
if (!NH || !NH.buildFragment) die("NH not initialized");

var createGL;
try { createGL = require("gl"); } catch (e) { die("headless-gl ('gl') not installed: " + e.message); }

var W = 1200, H = 630;
var gl = createGL(W, H, { preserveDrawingBuffer: true });
if (!gl) die("could not create headless GL context");
var deriv = !!gl.getExtension("OES_standard_derivatives");

function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) die("compile error:\n" + gl.getShaderInfoLog(s));
    return s;
}
var prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, NH.VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, NH.buildFragment({ derivatives: deriv, params: NH.PARAMS })));
gl.bindAttribLocation(prog, 0, "p");
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) die("link error:\n" + gl.getProgramInfoLog(prog));
gl.useProgram(prog);

var buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function loc(n) { return gl.getUniformLocation(prog, n); }
gl.uniform2f(loc("u_res"), W, H);
gl.uniform1f(loc("u_scroll"), 6.0);       // 灯が手前に来る構図
gl.uniform1f(loc("u_sway"), 0.35);
gl.uniform1f(loc("u_cityPhase"), 0.4);
gl.uniform1f(loc("u_cityScroll"), 1.5);
gl.uniform1f(loc("u_cloudScroll"), 1.2);
gl.uniform1f(loc("u_time"), 2.0);
gl.uniform2fv(loc("u_cars[0]"), new Float32Array([2.5, 22, 7.5, 95, 0, -1, 0, -1])); // 対向車2台（手前/奥）
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
if (err !== gl.NO_ERROR) die("gl error: 0x" + err.toString(16));

var px = new Uint8Array(W * H * 4);
gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);

// ---- 最小 PNG エンコーダ（RGBA, filter 0, zlib deflate）----
var CRC_TABLE = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    var len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    var typeBuf = Buffer.from(type, "ascii");
    var body = Buffer.concat([typeBuf, data]);
    var crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

var ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0;  // compression
ihdr[11] = 0;  // filter
ihdr[12] = 0;  // interlace

// readPixels は下が原点。PNG は上が原点なので行を反転しつつ filter byte 0 を前置
var raw = Buffer.alloc(H * (1 + W * 4));
for (var y = 0; y < H; y++) {
    var srcRow = (H - 1 - y) * W * 4;
    var dstRow = y * (1 + W * 4);
    raw[dstRow] = 0; // filter type none
    px.subarray ? raw.set(px.subarray(srcRow, srcRow + W * 4), dstRow + 1)
                : Buffer.from(px.slice(srcRow, srcRow + W * 4)).copy(raw, dstRow + 1);
}
var idat = zlib.deflateSync(raw, { level: 9 });

var SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var png = Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
]);

var out = path.join(ROOT, "og-image.png");
fs.writeFileSync(out, png);
console.log("wrote " + out + " (" + W + "x" + H + ", " + png.length + " bytes)");
