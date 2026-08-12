const fs = require("fs");

const file = "scripts/make-blog.js";
const backup = "scripts/make-blog.js.bak";

let s = fs.readFileSync(file, "utf8");

// バックアップがなければ作成
if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup);
    console.log(`OK: backup created -> ${backup}`);
} else {
    console.log(`INFO: backup already exists -> ${backup}`);
}


// ============================================================
// 1. GISCUS 設定を削除
// ============================================================

const giscusConfigPattern =
    /\/\/ giscus[\s\S]*?const GISCUS\s*=\s*\{[\s\S]*?\};\s*/;

if (giscusConfigPattern.test(s)) {
    s = s.replace(giscusConfigPattern, "");
    console.log("OK: removed GISCUS config");
} else {
    console.log("INFO: GISCUS config already absent");
}


// ============================================================
// 2. Giscus section を特定して置換
// ============================================================

const marker = "https://giscus.app/client.js";
const markerPos = s.indexOf(marker);

if (markerPos !== -1) {
    const sectionStart = s.lastIndexOf("<section", markerPos);
    const sectionEndStart = s.indexOf("</section>", markerPos);

    if (sectionStart === -1 || sectionEndStart === -1) {
        console.error("ERROR: could not determine Giscus section");
        process.exit(1);
    }

    const sectionEnd = sectionEndStart + "</section>".length;

    const newComments = `                    <section
                        class="post__comments comments"
                        data-comments
                        data-post-id="/blog/\${esc(post.slug)}.html"
                        aria-label="コメント"
                    >
                        <h2 class="comments__title">コメント</h2>

                        <div
                            class="comments__list"
                            data-comments-list
                            aria-live="polite"
                        ></div>

                        <form
                            class="comments__form"
                            data-comments-form
                        >
                            <label>
                                <span>名前</span>
                                <input
                                    type="text"
                                    name="author"
                                    maxlength="40"
                                    autocomplete="nickname"
                                    placeholder="匿名"
                                >
                            </label>

                            <label>
                                <span>コメント</span>
                                <textarea
                                    name="body"
                                    maxlength="3000"
                                    required
                                    rows="5"
                                ></textarea>
                            </label>

                            <input
                                class="comments__honeypot"
                                type="text"
                                name="website"
                                tabindex="-1"
                                autocomplete="off"
                                aria-hidden="true"
                            >

                            <div data-turnstile></div>

                            <button type="submit">
                                コメントする
                            </button>

                            <p
                                class="comments__message"
                                data-comments-message
                                aria-live="polite"
                            ></p>
                        </form>
                    </section>`;

    s =
        s.slice(0, sectionStart) +
        newComments +
        s.slice(sectionEnd);

    console.log("OK: replaced Giscus section");
} else if (s.includes("data-comments")) {
    console.log("INFO: Cloudflare comment UI already present");
} else {
    console.error("ERROR: neither Giscus nor Cloudflare comment UI found");
    process.exit(1);
}


// ============================================================
// 3. buildPost() の範囲だけ取得
// ============================================================

const buildPostStart = s.indexOf("function buildPost(post)");

if (buildPostStart === -1) {
    console.error("ERROR: function buildPost(post) not found");
    process.exit(1);
}

// 次の関数までを buildPost とみなす
const nextFunction = s.indexOf(
    "\nfunction ",
    buildPostStart + "function buildPost(post)".length
);

const buildPostEnd =
    nextFunction === -1 ? s.length : nextFunction;

let buildPost = s.slice(buildPostStart, buildPostEnd);


// ============================================================
// 4. extraScripts を追加
// ============================================================

if (buildPost.includes("../js/comments-config.js")) {
    console.log("INFO: comment scripts already present");
} else {
    const headExtraPattern =
        /(\s+headExtra)(\s*\r?\n\s*}\);)/;

    if (!headExtraPattern.test(buildPost)) {
        console.error("ERROR: headExtra/pageShell ending not found");

        console.error("");
        console.error("buildPost tail:");
        console.error(
            buildPost.slice(-500)
        );

        process.exit(1);
    }

    buildPost = buildPost.replace(
        headExtraPattern,
        `$1,
        extraScripts: \`    <script defer src="../js/comments-config.js"></script>
    <script defer src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
    <script defer src="../js/comments.js"></script>
\`$2`
    );

    console.log("OK: added comment scripts");
}


// ============================================================
// 5. buildPost を元のソースへ戻す
// ============================================================

s =
    s.slice(0, buildPostStart) +
    buildPost +
    s.slice(buildPostEnd);


// ============================================================
// 6. 最終検証
// ============================================================

if (s.includes("giscus.app/client.js")) {
    console.error("ERROR: giscus.app/client.js still remains");
    process.exit(1);
}

if (/const GISCUS\s*=/.test(s)) {
    console.error("ERROR: GISCUS config still remains");
    process.exit(1);
}

if (!s.includes("data-comments")) {
    console.error("ERROR: data-comments missing");
    process.exit(1);
}

if (!s.includes("../js/comments-config.js")) {
    console.error("ERROR: comments-config.js missing");
    process.exit(1);
}

if (!s.includes("../js/comments.js")) {
    console.error("ERROR: comments.js missing");
    process.exit(1);
}


// ============================================================
// 7. 保存
// ============================================================

fs.writeFileSync(file, s, "utf8");

console.log("");
console.log("SUCCESS: Giscus -> Cloudflare comments");
console.log(`Backup: ${backup}`);
