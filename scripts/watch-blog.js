/* =============================================================
   雑記の監視ビルド（依存なし）
   - blog/posts/ を fs.watch で監視し、md の変更を検知したら
     make-blog.js を再実行する（500ms デバウンス）
   - Live Server と併用すると「md 保存 → 自動生成 → 自動リロード」
   使い方: npm run watch:blog（Ctrl+C で終了）
   ============================================================= */
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const POSTS_DIR = path.join(__dirname, "..", "blog", "posts");
const WORKS_DIR = path.join(__dirname, "..", "works");
const MAKE_BLOG = path.join(__dirname, "make-blog.js");
const DEBOUNCE_MS = 500;

let timer = null;
let running = false;
let queued = false;

function build(reason) {
    if (running) { queued = true; return; }
    running = true;
    console.log(`watch-blog: ${reason} → 再生成します`);
    const child = spawn(process.execPath, [MAKE_BLOG], { stdio: "inherit" });
    child.on("exit", (code) => {
        running = false;
        if (code !== 0) { console.error(`watch-blog: make-blog が異常終了 (code=${code})。監視は継続します`); }
        // ビルド中に来た変更をまとめて拾い直す
        if (queued) { queued = false; build("ビルド中の変更"); }
    });
}

build("起動時");

function watchDir(dir) {
    if (!fs.existsSync(dir)) { return; }
    fs.watch(dir, (eventType, filename) => {
        if (!filename || !filename.endsWith(".md")) { return; }
        clearTimeout(timer);
        timer = setTimeout(() => build(`${filename} の変更`), DEBOUNCE_MS);
    });
    console.log(`watch-blog: ${dir} を監視中（Ctrl+C で終了）`);
}

watchDir(POSTS_DIR);
watchDir(WORKS_DIR);   // 作品カード（works/*.md）も同じビルドで index.html に反映される
