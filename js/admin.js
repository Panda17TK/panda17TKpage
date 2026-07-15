/* =============================================================
   雑記の管理画面（/admin.html）
   - GitHub Contents API で blog/posts/*.md のフロントマターを編集
   - 認証は Fine-grained PAT（このブラウザの localStorage にのみ保存。
     リポジトリには一切秘密情報を置かない）
   - 保存すると main へコミット → blog.yml が自動で HTML を再生成
   ============================================================= */
(function () {
    "use strict";

    var OWNER = "sasanoha-tk";
    var REPO = "sasanoha-tk.github.io";
    var DIR = "blog/posts";
    var API = "https://api.github.com";
    var TOKEN_KEY = "nh-admin-token";

    var $ = function (id) { return document.getElementById(id); };
    var posts = [];   // { path, sha, meta, body, dirty }

    // ---- UTF-8 対応 base64（GitHub Contents API は base64 本文）----
    function b64decode(b64) {
        var bin = atob(b64.replace(/\n/g, ""));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    function b64encode(str) {
        var bytes = new TextEncoder().encode(str);
        var bin = "";
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    // ---- フロントマター（make-blog.js と同じ YAML サブセット）----
    function parseFrontMatter(src) {
        var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
        if (!m) return { meta: {}, body: src };
        var meta = {};
        m[1].split(/\r?\n/).forEach(function (line) {
            var i = line.indexOf(":");
            if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        });
        return { meta: meta, body: src.slice(m[0].length) };
    }
    function serialize(meta, body) {
        var lines = ["---",
            "title: " + (meta.title || ""),
            "date: " + (meta.date || ""),
            "description: " + (meta.description || ""),
            "tags: " + (meta.tags || "")];
        if (/^(true|yes)$/i.test(meta.draft || "")) lines.push("draft: true");
        // 既知キー以外（将来の拡張フィールド）も失わず残す
        Object.keys(meta).forEach(function (k) {
            if (["title", "date", "description", "tags", "draft"].indexOf(k) < 0) {
                lines.push(k + ": " + meta[k]);
            }
        });
        lines.push("---", "");
        return lines.join("\n") + body;
    }

    function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }

    function api(path, opts) {
        opts = opts || {};
        opts.headers = {
            "Authorization": "Bearer " + token(),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        };
        return fetch(API + path, opts).then(function (res) {
            if (res.status === 401 || res.status === 403) {
                throw new Error("認証エラー（" + res.status + "）。トークンの権限・有効期限を確認してください");
            }
            if (!res.ok) throw new Error("GitHub API エラー: " + res.status + " " + path);
            return res.json();
        });
    }

    function status(msg, isError) {
        var el = $("status");
        el.textContent = msg;
        el.className = "admin-status" + (isError ? " admin-status--error" : "");
    }

    // ---- 一覧の読み込み ----
    function loadPosts() {
        status("読み込み中…");
        api("/repos/" + OWNER + "/" + REPO + "/contents/" + DIR).then(function (list) {
            var mds = list.filter(function (f) { return f.name.endsWith(".md"); });
            return Promise.all(mds.map(function (f) {
                return api("/repos/" + OWNER + "/" + REPO + "/contents/" + f.path).then(function (file) {
                    var parsed = parseFrontMatter(b64decode(file.content));
                    return { path: f.path, sha: file.sha, meta: parsed.meta, body: parsed.body, dirty: false };
                });
            }));
        }).then(function (loaded) {
            posts = loaded.sort(function (a, b) { return (a.meta.date < b.meta.date) ? 1 : -1; });
            renderPosts();
            status(posts.length + "記事を読み込みました");
        }).catch(function (e) { status(e.message, true); });
    }

    function isDraft(p) { return /^(true|yes)$/i.test(p.meta.draft || ""); }

    function renderPosts() {
        var root = $("posts");
        root.replaceChildren();
        posts.forEach(function (p, idx) {
            var row = document.createElement("div");
            row.className = "admin-post";

            var head = document.createElement("div");
            head.className = "admin-post__head";
            var title = document.createElement("span");
            title.className = "admin-post__title";
            title.textContent = p.meta.title || p.path;
            var date = document.createElement("span");
            date.className = "admin-post__date";
            date.textContent = p.meta.date || "";
            var badge = document.createElement("span");
            badge.className = "admin-badge" + (isDraft(p) ? " admin-badge--draft" : "");
            badge.textContent = isDraft(p) ? "非公開" : "公開中";
            head.appendChild(title); head.appendChild(date); head.appendChild(badge);

            var controls = document.createElement("div");
            controls.className = "admin-post__controls";
            var tags = document.createElement("input");
            tags.type = "text";
            tags.className = "admin-input admin-input--tags";
            tags.value = p.meta.tags || "";
            tags.placeholder = "タグ（カンマ区切り）";
            tags.setAttribute("aria-label", "タグ");
            tags.addEventListener("input", function () {
                p.meta.tags = tags.value;
                markDirty(idx, true);
            });

            var toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "admin-btn";
            toggle.textContent = isDraft(p) ? "公開にする" : "非公開にする";
            toggle.addEventListener("click", function () {
                if (isDraft(p)) delete p.meta.draft; else p.meta.draft = "true";
                markDirty(idx, true);
                renderPosts();   // バッジ/ラベルを更新（dirty 状態は posts に保持済み）
            });

            var save = document.createElement("button");
            save.type = "button";
            save.className = "admin-btn admin-btn--save";
            save.textContent = "保存";
            save.disabled = !p.dirty;
            save.addEventListener("click", function () { savePost(idx, save); });

            // 本文編集（スマホからの追記用）。開いたときだけ textarea を出す
            var editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "admin-btn";
            editBtn.textContent = "本文を編集";
            var body = document.createElement("textarea");
            body.className = "admin-textarea";
            body.rows = 12;
            body.hidden = true;
            body.value = p.body;
            body.setAttribute("aria-label", "本文（Markdown）");
            body.addEventListener("input", function () {
                p.body = body.value;
                markDirty(idx, true);
            });
            editBtn.addEventListener("click", function () {
                body.hidden = !body.hidden;
                editBtn.textContent = body.hidden ? "本文を編集" : "本文を閉じる";
            });

            controls.appendChild(tags); controls.appendChild(toggle);
            controls.appendChild(editBtn); controls.appendChild(save);
            row.appendChild(head); row.appendChild(controls); row.appendChild(body);
            root.appendChild(row);
        });
    }

    function markDirty(idx, dirty) {
        posts[idx].dirty = dirty;
        var saves = document.querySelectorAll(".admin-btn--save");
        if (saves[idx]) saves[idx].disabled = !dirty;
    }

    function savePost(idx, btn) {
        var p = posts[idx];
        btn.disabled = true;
        btn.textContent = "保存中…";
        var label = isDraft(p) ? "非公開化/タグ更新" : "公開/タグ更新";
        api("/repos/" + OWNER + "/" + REPO + "/contents/" + p.path, {
            method: "PUT",
            body: JSON.stringify({
                message: "blog(admin): " + (p.meta.title || p.path) + " の" + label,
                content: b64encode(serialize(p.meta, p.body)),
                sha: p.sha
            })
        }).then(function (res) {
            p.sha = res.content.sha;
            p.dirty = false;
            btn.textContent = "保存";
            renderPosts();
            status("保存しました。Actions が HTML を再生成します（1〜2分で反映）");
        }).catch(function (e) {
            btn.disabled = false;
            btn.textContent = "保存";
            status(e.message, true);
        });
    }

    // ---- 新規下書きの作成 ----
    function localDate() {
        var d = new Date();
        return [d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0")].join("-");
    }

    function createPost() {
        var title = $("new-title").value.trim();
        var slug = $("new-slug").value.trim();
        if (!title) { status("タイトルを入力してください", true); return; }
        if (!slug) {
            // 空欄なら自動 slug（note-<base36時刻>）。後でリネームしたければ GitHub 上で
            slug = "note-" + Date.now().toString(36);
        }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { status("slug は半角英数小文字とハイフンのみです", true); return; }
        if (slug === "index") { status('slug "index" は一覧ページと衝突するため使えません', true); return; }

        var date = localDate();
        var meta = { title: title, date: date, description: "", tags: $("new-tags").value.trim() };
        if ($("new-draft").checked) meta.draft = "true";
        var body = $("new-body").value;
        if (body && !body.endsWith("\n")) body += "\n";
        var path = DIR + "/" + date + "-" + slug + ".md";

        var btn = document.querySelector("#new-form .admin-btn--save");
        btn.disabled = true;
        status("作成中…");
        api("/repos/" + OWNER + "/" + REPO + "/contents/" + path, {
            method: "PUT",
            body: JSON.stringify({
                message: "blog(admin): 下書き「" + title + "」を追加",
                content: b64encode(serialize(meta, body))
            })
        }).then(function () {
            btn.disabled = false;
            $("new-form").reset();
            $("new-draft").checked = true;
            status("作成しました" + (meta.draft ? "（下書き・非公開）" : "。Actions が公開処理をします（1〜2分）"));
            loadPosts();
        }).catch(function (e) {
            btn.disabled = false;
            // 同名ファイルが既にあると sha 無しの PUT は 422 で失敗する
            status(/422/.test(e.message) ? "同じ日付+slug のファイルが既にあります: " + path : e.message, true);
        });
    }

    // ---- トークンの出し入れ ----
    function showApp(hasToken) {
        $("auth").hidden = hasToken;
        $("app").hidden = !hasToken;
        if (hasToken) loadPosts();
    }

    function init() {
        $("token-form").addEventListener("submit", function (e) {
            e.preventDefault();
            var v = $("token-input").value.trim();
            if (!v) return;
            try { localStorage.setItem(TOKEN_KEY, v); } catch (err) { status("localStorage が使えません", true); return; }
            $("token-input").value = "";
            showApp(true);
        });
        $("logout").addEventListener("click", function () {
            try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* noop */ }
            posts = [];
            $("posts").replaceChildren();
            status("");
            showApp(false);
        });
        $("reload").addEventListener("click", loadPosts);
        $("new-form").addEventListener("submit", function (e) {
            e.preventDefault();
            createPost();
        });
        showApp(!!token());
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
