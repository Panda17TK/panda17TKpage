/* 64x64 の favicon.png を生成（夜の高速道路モチーフ。favicon.svg のラスタ版フォールバック）。
   使い方: node scripts/make-favicon.js  → リポジトリ直下に favicon.png を出力 */
"use strict";
var fs = require("fs"), path = require("path"), zlib = require("zlib");
var W = 64, H = 64;
var img = new Uint8Array(W * H * 4);

function set(x, y, r, g, b, a) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    x = Math.round(x); y = Math.round(y);
    var i = (y * W + x) * 4, ia = a == null ? 1 : a;
    img[i] = r * ia + img[i] * (1 - ia);
    img[i + 1] = g * ia + img[i + 1] * (1 - ia);
    img[i + 2] = b * ia + img[i + 2] * (1 - ia);
    img[i + 3] = 255;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function disc(cx, cy, rad, r, g, b, a) {
    for (var y = Math.floor(cy - rad); y <= cy + rad; y++)
        for (var x = Math.floor(cx - rad); x <= cx + rad; x++)
            if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) set(x, y, r, g, b, a);
}
function poly(pts, r, g, b) {
    var minY = H, maxY = 0; pts.forEach(function (p) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    for (var y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
        var xs = [];
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            var a = pts[i], c = pts[j];
            if ((a[1] > y) !== (c[1] > y)) xs.push(a[0] + (y - a[1]) / (c[1] - a[1]) * (c[0] - a[0]));
        }
        xs.sort(function (m, n) { return m - n; });
        for (var k = 0; k + 1 < xs.length; k += 2)
            for (var xx = Math.ceil(xs[k]); xx <= Math.floor(xs[k + 1]); xx++) set(xx, y, r, g, b, 1);
    }
}

// 夜空グラデーション
for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var t = y / H;
    set(x, y, lerp(6, 20, t), lerp(6, 10, t), lerp(14, 34, t), 1);
}
// 月
disc(45, 16, 7, 243, 239, 214, 1);
disc(42, 14, 6, 8, 8, 18, 1);   // 三日月にする欠け
// 道路
poly([[28, 30], [36, 30], [52, 64], [12, 64]], 32, 32, 42);
// 中央破線
[[31.5, 35, 3], [30.8, 43, 4], [30, 53, 5]].forEach(function (d) {
    for (var yy = d[1]; yy < d[1] + d[2]; yy++) { set(32, yy, 125, 230, 245, 1); set(31, yy, 125, 230, 245, 0.5); set(33, yy, 125, 230, 245, 0.5); }
});
// 照明灯
disc(22, 32, 2.4, 255, 184, 77, 1);
disc(42, 32, 2.4, 255, 184, 77, 1);

// ---- PNG エンコード（RGBA, filter 0）----
var T = (function () { var t = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++)c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc(buf) { var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++)c = T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(ty, d) { var l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); var bd = Buffer.concat([Buffer.from(ty), d]); var cc = Buffer.alloc(4); cc.writeUInt32BE(crc(bd), 0); return Buffer.concat([l, bd, cc]); }
var ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
var rowB = Buffer.alloc(H * (1 + W * 4));
for (var y2 = 0; y2 < H; y2++) { rowB[y2 * (1 + W * 4)] = 0; Buffer.from(img.buffer, y2 * W * 4, W * 4).copy(rowB, y2 * (1 + W * 4) + 1); }
var out = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(rowB, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, "..", "favicon.png"), out);
console.log("wrote favicon.png (" + out.length + " bytes)");
