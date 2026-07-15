/* =============================================================
   HTML / リンク静的検証（依存なし・ネットワーク不要）
   - <a href> が空でない
   - 内部アンカー(#id)が実在する要素を指す
   - ローカル参照(href/src の相対・ルート絶対パス)のファイルが存在する
   - target="_blank" のリンクに rel="noopener" がある
   対象: index.html / 404.html / blog/*.html（生成物も含めて検査）
   過去にあった href="#"（先頭ジャンプ）や参照切れを CI で検知する。
   ============================================================= */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var problems = [];

function bad(file, msg) { problems.push(path.relative(ROOT, file) + ": " + msg); }

// ローカル参照を「そのファイルからの相対」または「サイトルート絶対(/...)」で解決
function resolveLocal(file, ref) {
    var p = ref.split("#")[0].split("?")[0];
    if (!p) { return null; } // 純アンカー等
    return p.charAt(0) === "/" ? path.join(ROOT, p) : path.join(path.dirname(file), p);
}

function checkFile(file) {
    var html = fs.readFileSync(file, "utf8");

    // id 一覧
    var ids = {};
    var idRe = /\bid\s*=\s*"([^"]+)"/g, m;
    while ((m = idRe.exec(html)) !== null) ids[m[1]] = true;

    // 各 <a ...> を検査
    var aRe = /<a\b([^>]*)>/gi, a;
    while ((a = aRe.exec(html)) !== null) {
        var attrs = a[1];
        var href = (attrs.match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1];
        if (href === undefined) { bad(file, "<a> without href: " + a[0]); continue; }
        if (href.trim() === "" || href.trim() === "#") { bad(file, "empty/placeholder href (\"" + href + "\"): " + a[0]); continue; }

        var blank = /\btarget\s*=\s*"_blank"/i.test(attrs);
        var rel = (attrs.match(/\brel\s*=\s*"([^"]*)"/i) || [])[1] || "";
        if (blank && !/\bnoopener\b/.test(rel)) bad(file, "target=_blank without rel=noopener: href=" + href);

        if (href.charAt(0) === "#") {
            if (!ids[href.slice(1)]) bad(file, "anchor target not found: " + href);
        } else if (!/^https?:|^mailto:|^tel:|^\/\//.test(href)) {
            var p = resolveLocal(file, href);
            if (p && !fs.existsSync(p)) bad(file, "local href file missing: " + href);
        }
    }

    // link/script/img/meta の src/href ローカル参照の存在確認
    var refRe = /(?:href|src|content)\s*=\s*"([^"]+\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|xml))"/gi, r;
    while ((r = refRe.exec(html)) !== null) {
        var ref = r[1];
        if (/^https?:|^\/\//.test(ref)) continue;
        var rp = resolveLocal(file, ref);
        if (rp && !fs.existsSync(rp)) bad(file, "local asset missing: " + ref);
    }
}

// 対象を収集: ルートの HTML + blog/ の生成 HTML
var targets = [path.join(ROOT, "index.html"), path.join(ROOT, "404.html"), path.join(ROOT, "admin.html")];
var blogDir = path.join(ROOT, "blog");
if (fs.existsSync(blogDir)) {
    for (var i = 0, files = fs.readdirSync(blogDir); i < files.length; i++) {
        if (files[i].endsWith(".html")) targets.push(path.join(blogDir, files[i]));
    }
}

targets.forEach(checkFile);

if (problems.length) {
    console.error("FAIL: HTML check found " + problems.length + " issue(s):");
    problems.forEach(function (p) { console.error("  - " + p); });
    process.exit(1);
}
console.log("check-html passed: " + targets.length + " file(s), links and local assets OK");
process.exit(0);
