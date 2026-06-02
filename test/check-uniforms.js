/* =============================================================
   uniform 整合性の静的チェック（GL不要・高速）
   - NH.PARAMS が宣言する uniform と、FRAG_BODY が実際に使う uniform を突き合わせる
   - 「使っているのに未宣言」→ コンパイルエラーの原因（過去 PR #16 のリグレッション）
   - 「宣言したのに未使用」→ デッドな uniform（設定の肥大化）
   どちらも FAIL にして、実描画前に原因を即特定できるようにする。
   ============================================================= */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");

var sandbox = { Math: Math, console: console, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, Array: Array, Object: Object };
sandbox.window = sandbox;
vm.createContext(sandbox);
["js/config.js", "js/shaders.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
});
var NH = sandbox.window.NH;

function fail(msg) { console.error("FAIL: " + msg); process.exit(1); }

if (!NH || !NH.PARAMS || !NH.FRAG_BODY) fail("NH not initialized from browser scripts");

// エンジン uniform（buildFragment が常に前置する）＋ PARAMS 由来の uniform
var ENGINE = ["u_res", "u_scroll", "u_sway", "u_time", "u_cityPhase", "u_cityScroll"];
var declared = {};
ENGINE.forEach(function (u) { declared[u] = true; });
NH.PARAMS.forEach(function (p) { if (p.uniform) declared[p.uniform] = true; });

// FRAG_BODY 中で実際に参照されている u_* トークンを収集
var used = {};
var m, re = /\bu_[A-Za-z_][A-Za-z0-9_]*\b/g;
while ((m = re.exec(NH.FRAG_BODY)) !== null) used[m[0]] = true;

var usedNotDeclared = Object.keys(used).filter(function (u) { return !declared[u]; });
var declaredNotUsed = Object.keys(declared).filter(function (u) { return !used[u]; });

if (usedNotDeclared.length) fail("FRAG_BODY が未宣言の uniform を使用: " + usedNotDeclared.join(", "));
if (declaredNotUsed.length) fail("宣言済みだが FRAG_BODY で未使用の uniform: " + declaredNotUsed.join(", "));

console.log("check-uniforms passed: " + Object.keys(declared).length + " uniforms declared & all used");
process.exit(0);
