/* =============================================================
   HTML / リンク静的検証（依存なし・ネットワーク不要）
   - <a href> が空でない
   - 内部アンカー(#id)が実在する要素を指す
   - ローカル参照(href/src の相対パス)のファイルが存在する
   - target="_blank" のリンクに rel="noopener" がある
   過去にあった href="#"（先頭ジャンプ）や参照切れを CI で検知する。
   ============================================================= */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var HTML = path.join(ROOT, "index.html");
var html = fs.readFileSync(HTML, "utf8");

var problems = [];
function bad(msg) { problems.push(msg); }

// id 一覧
var ids = {};
var idRe = /\bid\s*=\s*"([^"]+)"/g, m;
while ((m = idRe.exec(html)) !== null) ids[m[1]] = true;

// 各 <a ...> を検査
var aRe = /<a\b([^>]*)>/gi, a;
while ((a = aRe.exec(html)) !== null) {
    var attrs = a[1];
    var href = (attrs.match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1];
    if (href === undefined) { bad("<a> without href: " + a[0]); continue; }
    if (href.trim() === "" || href.trim() === "#") { bad("empty/placeholder href (\"" + href + "\"): " + a[0]); continue; }

    var blank = /\btarget\s*=\s*"_blank"/i.test(attrs);
    var rel = (attrs.match(/\brel\s*=\s*"([^"]*)"/i) || [])[1] || "";
    if (blank && !/\bnoopener\b/.test(rel)) bad("target=_blank without rel=noopener: href=" + href);

    if (href.charAt(0) === "#") {
        if (!ids[href.slice(1)]) bad("anchor target not found: " + href);
    } else if (!/^https?:|^mailto:|^tel:|^\/\//.test(href)) {
        // ローカル参照（クエリ/ハッシュ除去して存在確認）
        var p = href.split("#")[0].split("?")[0];
        if (p && !fs.existsSync(path.join(ROOT, p))) bad("local href file missing: " + href);
    }
}

// link/script/img/meta の src/href ローカル参照の存在確認
var refRe = /(?:href|src|content)\s*=\s*"([^"]+\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico))"/gi, r;
while ((r = refRe.exec(html)) !== null) {
    var ref = r[1];
    if (/^https?:|^\/\//.test(ref)) continue;
    var rp = ref.split("#")[0].split("?")[0];
    if (!fs.existsSync(path.join(ROOT, rp))) bad("local asset missing: " + ref);
}

if (problems.length) {
    console.error("FAIL: HTML check found " + problems.length + " issue(s):");
    problems.forEach(function (p) { console.error("  - " + p); });
    process.exit(1);
}
console.log("check-html passed: links and local assets OK");
process.exit(0);
