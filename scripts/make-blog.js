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
const groupImages = require("../js/gallery-transform.js");
const fm = require("../js/frontmatter.js");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "blog", "posts");
const WORKS_DIR = path.join(ROOT, "works");
const OUT_DIR = path.join(ROOT, "blog");
const SITE = "笹ノ葉製作所";
const ORIGIN = "https://sasanoha-tk.github.io";

// giscus（GitHub Discussions ベースのリアクション/コメント）。
// 記事ページにのみ埋め込む。ID は `gh api` で取得した固定値
const GISCUS = {
    repo: "sasanoha-tk/sasanoha-tk.github.io",
    repoId: "R_kgDOJVR21w",
    category: "Announcements",
    categoryId: "DIC_kwDOJVR2184DBQMt"
};

function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function tagChips(tags) {
    return tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("");
}

// 全ページ共通の骨格。rel はサイトルートへの相対パス（雑記配下は "../"）
// ogType: 一覧は website / 記事は article。headExtra は記事メタ等の追加行
function pageShell({ title, description, canonicalPath, bodyHtml, extraScripts = "", ogType = "website", headExtra = "" }) {
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
    <link rel="canonical" href="${ORIGIN}${canonicalPath}">
    <link rel="alternate" type="application/atom+xml" title="${SITE} 雑記" href="${ORIGIN}/blog/feed.xml">
    <meta property="og:type" content="${ogType}">
    <meta property="og:site_name" content="${SITE}">
    <meta property="og:title" content="${esc(title)} | ${SITE}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${ORIGIN}${canonicalPath}">
    <meta property="og:image" content="${ORIGIN}/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)} | ${SITE}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${ORIGIN}/og-image.png">
${headExtra}    <link rel="preconnect" href="https://fonts.googleapis.com">
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
    // 記事固有のメタ: article:* と検索エンジン向け JSON-LD（BlogPosting）
    const jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        datePublished: post.date,
        description: post.description || `${SITE}の雑記記事`,
        url: `${ORIGIN}/blog/${post.slug}.html`,
        author: { "@type": "Person", name: SITE },
        keywords: post.tags.join(", ")
    }).replace(/</g, "\\u003c"); // "</script>" 混入対策
    const headExtra = [
        `    <meta property="article:published_time" content="${esc(post.date)}">`,
        ...post.tags.map((t) => `    <meta property="article:tag" content="${esc(t)}">`),
        `    <script type="application/ld+json">${jsonLd}</script>`
    ].join("\n") + "\n";
    const body = `                <article class="post">
                    <h1 class="post__title">${esc(post.title)}</h1>
                    <p class="post__meta"><time datetime="${esc(post.date)}">${esc(post.date)}</time>${post.tags.length ? ` <span class="post__tags">${tagChips(post.tags)}</span>` : ""}</p>
                    <div class="post__body">
${post.html}
                    </div>
                    <section class="post__reactions" aria-label="リアクションとコメント">
                        <script src="https://giscus.app/client.js"
                                data-repo="${GISCUS.repo}"
                                data-repo-id="${GISCUS.repoId}"
                                data-category="${GISCUS.category}"
                                data-category-id="${GISCUS.categoryId}"
                                data-mapping="pathname"
                                data-strict="0"
                                data-reactions-enabled="1"
                                data-emit-metadata="0"
                                data-input-position="bottom"
                                data-theme="transparent_dark"
                                data-lang="ja"
                                data-loading="lazy"
                                crossorigin="anonymous"
                                async>
                        </script>
                    </section>
                    <p class="post__back"><a href="./">← 雑記一覧へ</a></p>
                </article>`;
    return pageShell({
        title: post.title,
        description: post.description || `${SITE}の雑記記事`,
        canonicalPath: `/blog/${post.slug}.html`,
        bodyHtml: body,
        ogType: "article",
        headExtra
    });
}

// Atom フィード（RSSリーダー購読用）。posts は新しい順で渡される前提
function buildFeed(posts) {
    const updated = posts.length ? `${posts[0].date}T00:00:00Z` : "1970-01-01T00:00:00Z";
    const entries = posts.map((p) => `    <entry>
        <title>${esc(p.title)}</title>
        <link href="${ORIGIN}/blog/${esc(p.slug)}.html"/>
        <id>${ORIGIN}/blog/${esc(p.slug)}.html</id>
        <updated>${esc(p.date)}T00:00:00Z</updated>
        <summary>${esc(p.description || p.title)}</summary>
${p.tags.map((t) => `        <category term="${esc(t)}"/>`).join("\n")}
    </entry>`).join("\n");
    return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <title>${SITE} 雑記</title>
    <link href="${ORIGIN}/blog/"/>
    <link rel="self" href="${ORIGIN}/blog/feed.xml"/>
    <id>${ORIGIN}/blog/</id>
    <updated>${updated}</updated>
    <author><name>${SITE}</name></author>
${entries}
</feed>
`;
}

// sitemap.xml（トップ・一覧・各記事）。lastmod は記事の date を使う
function buildSitemap(posts) {
    const latest = posts.length ? posts[0].date : null;
    const urls = [
        { loc: `${ORIGIN}/`, lastmod: latest },
        { loc: `${ORIGIN}/blog/`, lastmod: latest },
        ...posts.map((p) => ({ loc: `${ORIGIN}/blog/${p.slug}.html`, lastmod: p.date }))
    ];
    const body = urls.map((u) => `    <url>
        <loc>${esc(u.loc)}</loc>${u.lastmod ? `
        <lastmod>${esc(u.lastmod)}</lastmod>` : ""}
    </url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
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

// トップページのお知らせ欄（ヒーローのタイトル直下）を
// タグ「お知らせ」の最新記事で更新する。posts は新しい順で渡される前提
function updateIndexNews(posts) {
    const file = path.join(ROOT, "index.html");
    const src = fs.readFileSync(file, "utf8");
    if (!/<!-- NEWS:START -->/.test(src)) {
        console.warn("make-blog: index.html に NEWS マーカーが無いためお知らせ欄をスキップ");
        return;
    }
    const news = posts.filter((p) => p.tags.includes("お知らせ")).slice(0, 2);
    const cards = news.map((p) => `            <a class="news-card" href="/blog/${esc(p.slug)}.html">
                <span class="news-card__label">お知らせ</span>
                <time class="news-card__date" datetime="${esc(p.date)}">${esc(p.date)}</time>
                <span class="news-card__title">${esc(p.title)}</span>
            </a>`).join("\n");
    const block = news.length ? `\n            <div class="hero__news">\n${cards}\n            </div>\n            ` : "\n            ";
    const out = src.replace(/(<!-- NEWS:START -->)[\s\S]*?(<!-- NEWS:END -->)/, `$1${block}$2`);
    if (out !== src) {
        fs.writeFileSync(file, out, "utf8");
        console.log(`make-blog: index.html のお知らせ欄を更新しました（${news.length}件）`);
    }
}

// トップページの「つくったもの」を works/*.md から生成する。
// 記事と同じフロントマター形式（title / url / tags / order / draft）で、
// 本文がカードの説明文になる（1段落のプレーンテキスト。改行は空白に畳まれる）
function loadWorks() {
    if (!fs.existsSync(WORKS_DIR)) return null;   // ディレクトリごと無ければ手書き HTML のまま
    const works = [];
    for (const file of fs.readdirSync(WORKS_DIR).filter((f) => f.endsWith(".md")).sort()) {
        const { meta, body } = fm.parse(fs.readFileSync(path.join(WORKS_DIR, file), "utf8"));
        if (!meta.title || !meta.url) {
            console.error(`make-blog: works/${file} のフロントマターに title / url が必要です`);
            process.exit(1);
        }
        if (fm.isDraft(meta.draft)) {
            console.log(`make-blog: works/${file} は draft のため非公開（スキップ）`);
            continue;
        }
        const order = parseFloat(meta.order);
        works.push({
            title: meta.title,
            url: meta.url,
            tags: fm.parseTags(meta.tags),
            order: Number.isFinite(order) ? order : 999,   // order 未指定は末尾
            desc: body.trim().replace(/\s*\n\s*/g, " ")
        });
    }
    works.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ja"));
    return works;
}

function updateIndexWorks() {
    const works = loadWorks();
    if (works === null) return;
    const file = path.join(ROOT, "index.html");
    const src = fs.readFileSync(file, "utf8");
    if (!/<!-- WORKS:START -->/.test(src)) {
        console.warn("make-blog: index.html に WORKS マーカーが無いため作品欄をスキップ");
        return;
    }
    const cards = works.map((w) => {
        const tags = w.tags.map((t) => `                                <span class="card__tag">${esc(t)}</span>`).join("\n");
        const cta = /github\.com/.test(w.url) ? "GitHub で見る →" : "見に行く →";
        return `                    <li class="card">
                        <a class="card__link" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">
                            <span class="card__tags">
${tags}
                            </span>
                            <h3 class="card__title">${esc(w.title)}</h3>
                            <p class="card__desc">${esc(w.desc)}</p>
                            <span class="card__cta" aria-hidden="true">${cta}</span>
                        </a>
                    </li>`;
    }).join("\n");
    const block = works.length ? `
                <ul class="works" tabindex="0" aria-label="作品一覧（横にスクロールできます）">
${cards}
                </ul>
                ` : "\n                ";
    const out = src.replace(/(<!-- WORKS:START -->)[\s\S]*?(<!-- WORKS:END -->)/, `$1${block}$2`);
    if (out !== src) {
        fs.writeFileSync(file, out, "utf8");
        console.log(`make-blog: index.html の作品欄を更新しました（${works.length}件）`);
    }
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
        const { meta, body } = fm.parse(src);
        if (!meta.title || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date || "")) {
            console.error(`make-blog: ${file} のフロントマターに title / date(YYYY-MM-DD) が必要です`);
            process.exit(1);
        }
        // 形式だけでなく実在する日付か（2026-02-30 等を弾く）
        const parsed = new Date(`${meta.date}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== meta.date) {
            console.error(`make-blog: ${file} の date "${meta.date}" は実在しない日付です`);
            process.exit(1);
        }
        // slug "index" は一覧ページ blog/index.html を上書きしてしまうため予約語
        if (file.replace(/\.md$/, "") === "index") {
            console.error(`make-blog: ${file} — slug "index" は使えません（一覧ページと衝突）`);
            process.exit(1);
        }
        if (fm.isDraft(meta.draft)) {
            console.log(`make-blog: ${file} は draft のため非公開（スキップ）`);
            continue;
        }
        posts.push({
            slug: file.replace(/\.md$/, ""),
            title: meta.title,
            date: meta.date,
            description: meta.description || "",
            tags: fm.parseTags(meta.tags),
            // 連続した画像を自動でギャラリー（グリッド整列）にまとめる
            html: groupImages(marked.parse(body))
        });
    }
    posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? 1 : -1));

    for (const post of posts) {
        fs.writeFileSync(path.join(OUT_DIR, `${post.slug}.html`), buildPost(post), "utf8");
    }
    fs.writeFileSync(path.join(OUT_DIR, "index.html"), buildIndex(posts), "utf8");
    fs.writeFileSync(path.join(OUT_DIR, "feed.xml"), buildFeed(posts), "utf8");
    fs.writeFileSync(path.join(ROOT, "sitemap.xml"), buildSitemap(posts), "utf8");
    updateIndexNews(posts);
    updateIndexWorks();

    // draft 化や md 削除で不要になった生成 HTML を掃除する
    const keep = new Set(["index.html", ...posts.map((p) => `${p.slug}.html`)]);
    for (const f of fs.readdirSync(OUT_DIR)) {
        if (f.endsWith(".html") && !keep.has(f)) {
            fs.unlinkSync(path.join(OUT_DIR, f));
            console.log(`make-blog: 不要な生成物 ${f} を削除しました`);
        }
    }
    console.log(`make-blog: ${posts.length}記事 + index / feed.xml / sitemap.xml を生成しました`);
}

main();
