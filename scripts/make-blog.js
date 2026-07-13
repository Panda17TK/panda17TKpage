/* =============================================================
   雑記生成スクリプト
   - blog/posts/*.md（先頭に --- title/date/description --- の
     フロントマター）を読み、blog/<slug>.html と blog/index.html を生成
   - 記事の追加手順: md を置いて `npm run make:blog` → コミット
   - tags: カンマ区切り（例 "tags: 開発, お知らせ"）。一覧にタグ
     絞り込みボタンが出る（選んだタグの記事のみ表示・再クリックで解除）
   - draft: true で記事を非公開（HTML生成・一覧掲載をスキップ）
   - テンプレートは index.html と同じ骨格（背景キャンバス/ナビ/フッター）
     を持ち、既存の style.css と js/ をそのまま共有する
   ============================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "blog", "posts");
const OUT_DIR = path.join(ROOT, "blog");
const SITE = "笹ノ葉製作所";
const ORIGIN = "https://sasanoha-tk.github.io";

function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// 先頭の --- key: value --- ブロックを取り出す（YAMLサブセット）
function parseFrontMatter(src) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
    if (!m) { return { meta: {}, body: src }; }
    const meta = {};
    for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(":");
        if (i > 0) { meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    }
    return { meta, body: src.slice(m[0].length) };
}

// "tags: a, b" → ["a", "b"]（重複・空要素は除去）
function parseTags(s) {
    return [...new Set(String(s || "").split(",").map((t) => t.trim()).filter(Boolean))];
}

function tagChips(tags) {
    return tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("");
}

// 全ページ共通の骨格。rel はサイトルートへの相対パス（雑記配下は "../"）
function pageShell({ title, description, canonicalPath, bodyHtml, extraScripts = "" }) {
    const rel = "../";
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${esc(description)}">
    <meta name="theme-color" content="#05060a">
    <title>${esc(title)} | ${SITE}</title>
    <link rel="icon" type="image/svg+xml" href="${rel}favicon.svg">
    <link rel="icon" type="image/png" sizes="64x64" href="${rel}favicon.png">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${esc(title)} | ${SITE}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${ORIGIN}${canonicalPath}">
    <meta property="og:image" content="${ORIGIN}/og-image.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">
    <link rel="stylesheet" href="${rel}style.css">
</head>
<body>

    <canvas id="bg" aria-hidden="true"></canvas>

    <a class="skip-link" href="#content">本文へ移動</a>

    <header>
        <nav class="nav" aria-label="メインナビゲーション">
            <a class="nav__brand" href="${rel}">${SITE}</a>
            <button class="nav__toggle" aria-label="メニューを開閉" aria-expanded="false" aria-controls="nav-links">
                <span></span><span></span><span></span>
            </button>
            <ul class="nav__links" id="nav-links">
                <li><a href="${rel}#top">ホーム</a></li>
                <li><a href="${rel}#works">作品</a></li>
                <li><a href="${rel}#contact">連絡先</a></li>
                <li><a href="./" aria-current="page">雑記</a></li>
                <li><a href="https://github.com/sasanoha-tk" target="_blank" rel="noopener noreferrer">GitHub</a></li>
            </ul>
        </nav>
    </header>

    <main id="content">
        <section class="section section--blog">
            <div class="section__inner section__inner--narrow">
${bodyHtml}
            </div>
        </section>
    </main>

    <footer class="footer">
        <span>&copy; <span id="year">2025</span> ${SITE}</span>
        <span class="footer__odo" id="odo" hidden>総走行距離 <span id="odometer">0.0</span> km</span>
    </footer>

    <script defer src="${rel}js/config.js"></script>
    <script defer src="${rel}js/shaders.js"></script>
    <script defer src="${rel}js/ui.js"></script>
    <script defer src="${rel}js/scene.js"></script>
    <script defer src="${rel}js/app.js"></script>
${extraScripts}</body>
</html>
`;
}

function buildPost(post) {
    const body = `                <article class="post">
                    <h1 class="post__title">${esc(post.title)}</h1>
                    <p class="post__meta"><time datetime="${esc(post.date)}">${esc(post.date)}</time>${post.tags.length ? ` <span class="post__tags">${tagChips(post.tags)}</span>` : ""}</p>
                    <div class="post__body">
${post.html}
                    </div>
                    <p class="post__back"><a href="./">← 雑記一覧へ</a></p>
                </article>`;
    return pageShell({
        title: post.title,
        description: post.description || `${SITE}の雑記記事`,
        canonicalPath: `/blog/${post.slug}.html`,
        bodyHtml: body
    });
}

function buildIndex(posts) {
    const items = posts.map((p) => `                    <li class="post-list__item" data-tags="${esc(p.tags.join(","))}">
                        <a class="post-list__link" href="${esc(p.slug)}.html">
                            <time class="post-list__date" datetime="${esc(p.date)}">${esc(p.date)}</time>
                            <span class="post-list__title">${esc(p.title)}</span>
                            ${p.description ? `<span class="post-list__desc">${esc(p.description)}</span>` : ""}
                            ${p.tags.length ? `<span class="post-list__tags">${tagChips(p.tags)}</span>` : ""}
                        </a>
                    </li>`).join("\n");

    // 全記事のタグを集めて絞り込みバーを作る（タグが無ければ出さない）
    const allTags = [...new Set(posts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, "ja"));
    const filter = allTags.length ? `                <div class="tag-filter" role="group" aria-label="タグで絞り込み">
${allTags.map((t) => `                    <button class="tag-filter__btn" type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join("\n")}
                    <button class="tag-filter__reset" type="button" hidden>すべて表示</button>
                </div>
` : "";

    const body = `                <h1 class="section__title">雑記</h1>
                <p class="section__lead">開発の記録や日々の覚え書き。</p>
${filter}                <ul class="post-list">
${items}
                </ul>
                <p class="post-list__empty" hidden>該当する記事がありません。</p>`;
    return pageShell({
        title: "雑記",
        description: `${SITE}の雑記。開発の記録や日々の覚え書き。`,
        canonicalPath: "/blog/",
        bodyHtml: body,
        extraScripts: allTags.length ? `    <script defer src="../js/blog.js"></script>\n` : ""
    });
}

function main() {
    if (!fs.existsSync(POSTS_DIR)) {
        console.error(`make-blog: ${POSTS_DIR} がありません`);
        process.exit(1);
    }
    const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md")).sort();
    const posts = [];
    for (const file of files) {
        const src = fs.readFileSync(path.join(POSTS_DIR, file), "utf8");
        const { meta, body } = parseFrontMatter(src);
        if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date || "")) {
            console.error(`make-blog: ${file} のフロントマターに title / date(YYYY-MM-DD) が必要です`);
            process.exit(1);
        }
        if (/^(true|yes)$/i.test(meta.draft || "")) {
            console.log(`make-blog: ${file} は draft のため非公開（スキップ）`);
            continue;
        }
        posts.push({
            slug: file.replace(/\.md$/, ""),
            title: meta.title,
            date: meta.date,
            description: meta.description || "",
            tags: parseTags(meta.tags),
            html: marked.parse(body)
        });
    }
    posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? 1 : -1));

    for (const post of posts) {
        fs.writeFileSync(path.join(OUT_DIR, `${post.slug}.html`), buildPost(post), "utf8");
    }
    fs.writeFileSync(path.join(OUT_DIR, "index.html"), buildIndex(posts), "utf8");

    // draft 化や md 削除で不要になった生成 HTML を掃除する
    const keep = new Set(["index.html", ...posts.map((p) => `${p.slug}.html`)]);
    for (const f of fs.readdirSync(OUT_DIR)) {
        if (f.endsWith(".html") && !keep.has(f)) {
            fs.unlinkSync(path.join(OUT_DIR, f));
            console.log(`make-blog: 不要な生成物 ${f} を削除しました`);
        }
    }
    console.log(`make-blog: ${posts.length}記事 + index を生成しました`);
}

main();
