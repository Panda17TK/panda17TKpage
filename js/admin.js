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
            if (res.status === 401) {
                throw new Error("認証エラー（401）。トークンが無効か期限切れです。発行し直してください");
            }
            if (res.status === 403) {
                throw new Error("権限エラー（403）。トークンの Permissions で「Contents: Read and write」を付与し、" +
                    "Repository access に sasanoha-tk.github.io を含めてください");
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

    // ---- Markdown エディタ支援（ツールバー / プレビュー / リスト自動継続）----
    // スマホで打ちにくい記号（# ` ** など）をタップで挿入できるようにする
    function fireInput(ta) { ta.dispatchEvent(new Event("input")); }

    function surroundSel(ta, before, after, placeholder) {
        var s = ta.selectionStart, e = ta.selectionEnd;
        var sel = ta.value.slice(s, e) || placeholder;
        ta.setRangeText(before + sel + after, s, e, "end");
        // 選択が無かった場合はプレースホルダを選択状態にして書き換えやすく
        if (s === e) ta.setSelectionRange(s + before.length, s + before.length + placeholder.length);
        ta.focus();
        fireInput(ta);
    }

    function prefixLine(ta, prefix) {
        var s = ta.selectionStart;
        var ls = ta.value.lastIndexOf("\n", s - 1) + 1;
        ta.setRangeText(prefix, ls, ls, "end");
        ta.setSelectionRange(s + prefix.length, s + prefix.length);
        ta.focus();
        fireInput(ta);
    }

    // リスト行で Enter → 次の行頭記号を自動挿入。空項目で Enter → リスト終了。
    // 日本語 IME の変換確定 Enter では発動しない（isComposing ガード）
    function autoList(ta, e) {
        if (e.key !== "Enter" || e.isComposing || e.shiftKey) return;
        var s = ta.selectionStart;
        if (s !== ta.selectionEnd) return;
        var ls = ta.value.lastIndexOf("\n", s - 1) + 1;
        var m = /^(\s*)([-*]|\d+\.)\s(.*)$/.exec(ta.value.slice(ls, s));
        if (!m) return;
        e.preventDefault();
        if (!m[3]) {
            ta.setRangeText("\n", ls, s, "end");      // 空項目 → 行頭記号を消して改行
        } else {
            var marker = /^\d+\.$/.test(m[2]) ? (parseInt(m[2], 10) + 1) + "." : m[2];
            ta.setRangeText("\n" + m[1] + marker + " ", s, s, "end");
        }
        fireInput(ta);
    }

    var TOOLBAR = [
        { label: "見出し", title: "見出し (##)", run: function (ta) { prefixLine(ta, "## "); } },
        { label: "太字",   title: "太字 (**)",  run: function (ta) { surroundSel(ta, "**", "**", "強調"); } },
        { label: "リスト", title: "箇条書き",   run: function (ta) { prefixLine(ta, "- "); } },
        { label: "1.",     title: "番号リスト", run: function (ta) { prefixLine(ta, "1. "); } },
        { label: "リンク", title: "リンク",     run: function (ta) { surroundSel(ta, "[", "](https://)", "リンク文字"); } },
        { label: "code",   title: "インラインコード", run: function (ta) { surroundSel(ta, "`", "`", "code"); } },
        { label: "```",    title: "コードブロック", run: function (ta) { surroundSel(ta, "\n```\n", "\n```\n", "コード"); } },
        { label: "引用",   title: "引用 (>)",   run: function (ta) { prefixLine(ta, "> "); } }
    ];

    // textarea をツールバー＋プレビュー付きエディタに拡張する
    function enhanceEditor(ta) {
        var bar = document.createElement("div");
        bar.className = "admin-mdbar";
        TOOLBAR.forEach(function (t) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "admin-mdbar__btn";
            b.textContent = t.label;
            b.title = t.title;
            b.setAttribute("aria-label", t.title);
            b.addEventListener("click", function () { t.run(ta); });
            bar.appendChild(b);
        });

        var prev = document.createElement("div");
        prev.className = "post__body admin-preview";
        prev.hidden = true;

        var pv = document.createElement("button");
        pv.type = "button";
        pv.className = "admin-mdbar__btn admin-mdbar__btn--preview";
        pv.textContent = "プレビュー";
        pv.setAttribute("aria-label", "プレビュー切替");
        pv.addEventListener("click", function () {
            var show = prev.hidden;
            if (show) {
                // 自分が書いた Markdown を自分のブラウザで描画するだけ（ビルドと同じ marked）
                prev.innerHTML = window.marked ? window.marked.parse(ta.value) : "";
            }
            prev.hidden = !show;
            ta.hidden = show;
            pv.textContent = show ? "編集へ戻る" : "プレビュー";
        });
        bar.appendChild(pv);

        ta.addEventListener("keydown", function (e) { autoList(ta, e); });
        ta.parentNode.insertBefore(bar, ta);
        ta.parentNode.insertBefore(prev, ta.nextSibling);
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
            enhanceEditor(body);
            editBtn.addEventListener("click", function () {
                editor.hidden = !editor.hidden;
                editBtn.textContent = editor.hidden ? "本文を編集" : "本文を閉じる";
            });

            controls.appendChild(tags); controls.appendChild(toggle);
            controls.appendChild(editBtn); controls.appendChild(save);
            row.appendChild(head); row.appendChild(controls); row.appendChild(editor);
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
        enhanceEditor($("new-body"));
        showApp(!!token());
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
