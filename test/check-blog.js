/* =============================================================
   ブログ基盤の単体テスト（依存: marked のみ・ネットワーク不要）
   - frontmatter.js: parse/serialize の往復・draft・未知キー・タグ分解
   - gallery-transform.js: marked 実出力に対する連続画像のギャラリー化
   管理画面とビルドが共有するロジックの回帰を CI で検知する。
   ============================================================= */
"use strict";

var fm = require("../js/frontmatter.js");
var groupImages = require("../js/gallery-transform.js");
var marked = require("marked").marked;

var failed = 0;
function ok(name, cond) {
    if (cond) { console.log("  ok: " + name); }
    else { console.error("  FAIL: " + name); failed++; }
}

console.log("frontmatter:");
var md = "---\ntitle: テスト記事\ndate: 2026-07-12\ndescription: 説明文。\ntags: お知らせ, サイト\n---\n\n本文。\n\n## 見出し\n";
var r = fm.parse(md);
ok("parse meta", r.meta.title === "テスト記事" && r.meta.date === "2026-07-12");
ok("roundtrip byte-identical", fm.serialize(r.meta, r.body) === md);
r.meta.draft = "true";
var r2 = fm.parse(fm.serialize(r.meta, r.body));
ok("draft added", r2.meta.draft === "true" && r2.body === r.body);
delete r2.meta.draft;
ok("draft removed", !/draft/.test(fm.serialize(r2.meta, r2.body)));
r2.meta.custom = "keep-me";
ok("unknown key kept", fm.parse(fm.serialize(r2.meta, r2.body)).meta.custom === "keep-me");
ok("no frontmatter", fm.parse("プレーン本文").body === "プレーン本文");
ok("isDraft", fm.isDraft("true") && fm.isDraft("YES") && !fm.isDraft("") && !fm.isDraft("false"));
ok("parseTags", JSON.stringify(fm.parseTags(" a, b ,a,, ")) === JSON.stringify(["a", "b"]));

// 作品カード（works/*.md）スキーマ：WORK_KEYS の並びでラウンドトリップが崩れない
var wmd = "---\ntitle: TailKVM\nurl: https://github.com/sasanoha-tk/TailKVM\ntags: Rust, Tauri\norder: 1\n---\n説明文。\n";
var wr = fm.parse(wmd);
ok("work roundtrip byte-identical", fm.serialize(wr.meta, wr.body, fm.WORK_KEYS) === wmd);
wr.meta.draft = "true";
ok("work draft added", /\ndraft: true\n/.test(fm.serialize(wr.meta, wr.body, fm.WORK_KEYS)));

// ギャラリー（gallery/pieces/*.md）スキーマ：GALLERY_KEYS でも同様
var gmd = "---\ntitle: 夜のドライブ\ndate: 2026-07-19\nfile: images/night-drive.png\nframes: 6\nfps: 8\nscale: 4\n---\nキャプション。\n";
var gr = fm.parse(gmd);
ok("gallery roundtrip byte-identical", fm.serialize(gr.meta, gr.body, fm.GALLERY_KEYS) === gmd);

// 連絡先（contacts/*.md）スキーマ：CONTACT_KEYS でも同様
var cmd = "---\ntitle: GitHub\nurl: https://github.com/sasanoha-tk\nhandle: @sasanoha-tk\norder: 1\n---\n";
var cr = fm.parse(cmd);
ok("contact roundtrip byte-identical", fm.serialize(cr.meta, cr.body, fm.CONTACT_KEYS) === cmd);

console.log("gallery-transform:");
var raw3 = "本文。\n\n<img src=\"/a.jpg\" class=\"img-m\">\n\n<img src=\"/b.jpg\" class=\"img-m\">\n\n<img src=\"/c.jpg\" class=\"img-m\">\n\n締め。";
var h1 = groupImages(marked.parse(raw3));
ok("raw html x3 -> 1 gallery", (h1.match(/post-gallery/g) || []).length === 1
    && (h1.match(/<img/g) || []).length === 3 && h1.indexOf("本文。") >= 0);
ok("md syntax x2 -> gallery", groupImages(marked.parse("![a](/a.jpg)\n\n![b](/b.jpg)")).indexOf("post-gallery") >= 0);
ok("single raw kept", groupImages(marked.parse("<img src=\"/a.jpg\" class=\"img-l\">")).indexOf("post-gallery") < 0);
ok("single md kept", groupImages(marked.parse("![a](/a.jpg)")).indexOf("post-gallery") < 0);
ok("mixed paragraph kept", groupImages(marked.parse("説明 ![a](/a.jpg) 続き")).indexOf("post-gallery") < 0);

if (failed) { console.error("FAIL: check-blog " + failed + " assertion(s) failed"); process.exit(1); }
console.log("check-blog passed");
process.exit(0);
