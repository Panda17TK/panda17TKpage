/* =============================================================
   雑記の雛形生成スクリプト
   使い方: npm run new:post -- <slug> "タイトル" [--tags "a,b"] [--draft]
   例:     npm run new:post -- webgl-tips "WebGLの小ネタ" --tags "開発,WebGL"
   - blog/posts/YYYY-MM-DD-<slug>.md をフロントマター付きで作成
   - slug は URL になるので半角英数とハイフンのみ
   ============================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const fm = require("../js/frontmatter.js");

const POSTS_DIR = path.join(__dirname, "..", "blog", "posts");

function fail(msg) {
    console.error(`new-post: ${msg}`);
    console.error('使い方: npm run new:post -- <slug> "タイトル" [--tags "a,b"] [--draft]');
    process.exit(1);
}

const args = process.argv.slice(2);
const flags = { tags: "", draft: false };
const positional = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tags") { flags.tags = args[++i] || ""; }
    else if (args[i] === "--draft") { flags.draft = true; }
    else { positional.push(args[i]); }
}

const [slug, title] = positional;
if (!slug || !title) { fail("slug とタイトルを指定してください"); }
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { fail(`slug は半角英数小文字とハイフンのみ: "${slug}"`); }
if (slug === "index") { fail('slug "index" は一覧ページと衝突するため使えません'); }

// toISOString() は UTC になり日本時間と日付がずれるため、ローカル日付で組む
const now = new Date();
const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
].join("-");
const file = path.join(POSTS_DIR, `${date}-${slug}.md`);
if (fs.existsSync(file)) { fail(`${file} は既にあります`); }

const meta = { title: title, date: date, description: "", tags: flags.tags };
if (flags.draft) { meta.draft = "true"; }
fs.writeFileSync(file, fm.serialize(meta, "ここに本文を書く。\n"), "utf8");
console.log(`new-post: ${path.relative(process.cwd(), file)} を作成しました`);
console.log("  1. 本文を書く（description / tags も埋める）");
console.log("  2. コミットして push すれば GitHub Actions が自動でHTML生成・公開");
console.log("     （手元で確認したい場合は npm run make:blog && npm run serve）");
