/* =============================================================
   雑記の管理画面（/admin.html）のアプリ層
   - 一覧表示 / 公開・非公開 / タグ・本文編集 / 新規下書き / 画像挿入
   - GitHub API は admin-github.js（NH.adminGh）、
     エディタ支援は admin-editor.js（NH.adminEditor）、
     フロントマターは frontmatter.js（NH.frontmatter）に分離
   - 保存すると main へコミット → blog.yml が自動で HTML を再生成
   ============================================================= */
(function () {
    "use strict";

    var gh = NH.adminGh;
    var fm = NH.frontmatter;
    var $ = function (id) { return document.getElementById(id); };
    var posts = [];   // { path, sha, meta, body, dirty }

    function status(msg, isError) {
        var el = $("status");
        el.textContent = msg;
        el.className = "admin-status" + (isError ? " admin-status--error" : "");
    }

    // 画像アップロード（admin-editor.js から使われる）。保存先パスを返す
    function uploadImage(base64, name) {
        var d = new Date();
        var dir = "blog/images/" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        var path = dir + "/" + name;
        return gh.api(gh.contents(path), {
            method: "PUT",
            body: JSON.stringify({ message: "blog(admin): 画像を追加 " + name, content: base64 })
        }).then(function () { return path; });
    }

    function enhance(ta) { NH.adminEditor.enhance(ta, { status: status, uploadImage: uploadImage }); }

    // ---- 一覧の読み込み ----
    function loadPosts() {
        status("読み込み中…");
        gh.api(gh.contents(gh.POSTS_DIR)).then(function (list) {
            var mds = list.filter(function (f) { return f.name.endsWith(".md"); });
            return Promise.all(mds.map(function (f) {
                return gh.api(gh.contents(f.path)).then(function (file) {
                    var parsed = fm.parse(gh.b64decode(file.content));
                    return { path: f.path, sha: file.sha, meta: parsed.meta, body: parsed.body, dirty: false };
                });
            }));
        }).then(function (loaded) {
            posts = loaded.sort(function (a, b) { return (a.meta.date < b.meta.date) ? 1 : -1; });
            renderPosts();
            status(posts.length + "記事を読み込みました");
        }).catch(function (e) { status(e.message, true); });
    }

    // 1記事ぶんの行（見出し・バッジ・タグ・公開切替・本文エディタ・保存）を組み立てる
    function buildRow(p, idx) {
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
        badge.className = "admin-badge" + (fm.isDraft(p.meta.draft) ? " admin-badge--draft" : "");
        badge.textContent = fm.isDraft(p.meta.draft) ? "非公開" : "公開中";
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
        toggle.textContent = fm.isDraft(p.meta.draft) ? "公開にする" : "非公開にする";
        toggle.addEventListener("click", function () {
            if (fm.isDraft(p.meta.draft)) delete p.meta.draft; else p.meta.draft = "true";
            markDirty(idx, true);
            renderPosts();   // バッジ/ラベルを更新（dirty 状態は posts に保持済み）
        });

        var save = document.createElement("button");
        save.type = "button";
        save.className = "admin-btn admin-btn--save";
        save.textContent = "保存";
        save.disabled = !p.dirty;
        save.addEventListener("click", function () { savePost(idx, save); });

        // 本文編集（スマホからの追記用）。開いたときだけエディタ一式を出す
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "admin-btn";
        editBtn.textContent = "本文を編集";
        var editor = document.createElement("div");
        editor.className = "admin-editor";
        editor.hidden = true;
        var body = document.createElement("textarea");
        body.className = "admin-textarea";
        body.rows = 12;
        body.value = p.body;
        body.setAttribute("aria-label", "本文（Markdown）");
        body.addEventListener("input", function () {
            p.body = body.value;
            markDirty(idx, true);
        });
        editor.appendChild(body);
        enhance(body);
        editBtn.addEventListener("click", function () {
            editor.hidden = !editor.hidden;
            editBtn.textContent = editor.hidden ? "本文を編集" : "本文を閉じる";
        });

        controls.appendChild(tags); controls.appendChild(toggle);
        controls.appendChild(editBtn); controls.appendChild(save);
        row.appendChild(head); row.appendChild(controls); row.appendChild(editor);
        return row;
    }

    function renderPosts() {
        var root = $("posts");
        root.replaceChildren();
        posts.forEach(function (p, idx) { root.appendChild(buildRow(p, idx)); });
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
        var label = fm.isDraft(p.meta.draft) ? "非公開化/タグ更新" : "公開/タグ更新";
        gh.api(gh.contents(p.path), {
            method: "PUT",
            body: JSON.stringify({
                message: "blog(admin): " + (p.meta.title || p.path) + " の" + label,
                content: gh.b64encode(fm.serialize(p.meta, p.body)),
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
        var path = gh.POSTS_DIR + "/" + date + "-" + slug + ".md";

        var btn = document.querySelector("#new-form .admin-btn--save");
        btn.disabled = true;
        status("作成中…");
        gh.api(gh.contents(path), {
            method: "PUT",
            body: JSON.stringify({
                message: "blog(admin): 下書き「" + title + "」を追加",
                content: gh.b64encode(fm.serialize(meta, body))
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
            try { gh.setToken(v); } catch (err) { status("localStorage が使えません", true); return; }
            $("token-input").value = "";
            showApp(true);
        });
        $("logout").addEventListener("click", function () {
            gh.clearToken();
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
        enhance($("new-body"));
        showApp(!!gh.token());
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
