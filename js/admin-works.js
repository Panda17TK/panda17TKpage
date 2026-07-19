/* =============================================================
   管理画面: つくったもの（works/*.md）の一覧・編集・新規追加
   - 1ファイル=1カード。フロントマターは title/url/tags/order/draft、
     本文がカードの説明文（プレーンテキスト）
   - 保存すると main へコミット → blog.yml が index.html を再生成
   - admin.js から NH.adminWorks.load() / clear() で呼ばれる
   ============================================================= */
window.NH = window.NH || {};

NH.adminWorks = (function () {
    "use strict";

    var gh = NH.adminGh;
    var fm = NH.frontmatter;
    var WORKS_DIR = "works";
    var $ = function (id) { return document.getElementById(id); };
    var works = [];   // { path, sha, meta, body, dirty }

    // 発信元 "works" として共有ステータス行へ（雑記側のメッセージと共存する）
    function status(msg, isError) { gh.status("works", msg, isError); }

    function orderOf(w) {
        var n = parseFloat(w.meta.order);
        return isFinite(n) ? n : 999;   // make-blog.js と同じ「未指定は末尾」
    }

    // ---- 一覧の読み込み ----
    function load() {
        gh.api(gh.contents(WORKS_DIR)).then(function (list) {
            var mds = list.filter(function (f) { return f.name.endsWith(".md"); });
            return Promise.all(mds.map(function (f) {
                return gh.api(gh.contents(f.path)).then(function (file) {
                    var parsed = fm.parse(gh.b64decode(file.content));
                    return { path: f.path, sha: file.sha, meta: parsed.meta, body: parsed.body, dirty: false };
                });
            }));
        }).then(function (loaded) {
            works = loaded.sort(function (a, b) {
                return orderOf(a) - orderOf(b) ||
                    String(a.meta.title).localeCompare(String(b.meta.title), "ja");
            });
            render();
        }).catch(function (e) {
            // works/ が未作成なら空一覧として扱う（作品を追加すると自動で作られる）
            if (/404/.test(e.message)) { works = []; render(); return; }
            status(e.message, true);
        });
    }

    function clear() {
        works = [];
        $("works").replaceChildren();
        status("");
    }

    // カードのリンク先は http(s) のみ（javascript: 等の混入をここで弾く。
    // ジェネレータ側 make-blog.js にも同じ検証がある）
    function validUrl(u) { return /^https?:\/\//.test(u); }

    // 1作品ぶんの行（作品名・URL・タグ・表示順・説明文・表示切替・保存）
    function buildRow(w, idx) {
        var row = document.createElement("div");
        row.className = "admin-post";

        var head = document.createElement("div");
        head.className = "admin-post__head";
        var title = document.createElement("span");
        title.className = "admin-post__title";
        title.textContent = w.meta.title || w.path;
        var order = document.createElement("span");
        order.className = "admin-post__date";
        order.textContent = "表示順: " + (w.meta.order || "末尾");
        var badge = document.createElement("span");
        badge.className = "admin-badge" + (fm.isDraft(w.meta.draft) ? " admin-badge--draft" : "");
        badge.textContent = fm.isDraft(w.meta.draft) ? "非表示" : "表示中";
        head.appendChild(title); head.appendChild(order); head.appendChild(badge);

        function input(value, placeholder, label, extraClass, onInput) {
            var el = document.createElement("input");
            el.type = "text";
            el.className = "admin-input" + (extraClass ? " " + extraClass : "");
            el.value = value;
            el.placeholder = placeholder;
            el.setAttribute("aria-label", label);
            el.addEventListener("input", function () { onInput(el.value); markDirty(idx, true); });
            return el;
        }

        var controls = document.createElement("div");
        controls.className = "admin-post__controls";
        var titleIn = input(w.meta.title || "", "作品名", "作品名", "", function (v) { w.meta.title = v; });
        var urlIn = input(w.meta.url || "", "リンク先 URL", "リンク先 URL", "", function (v) { w.meta.url = v; });
        var tagsIn = input(w.meta.tags || "", "タグ（カンマ区切り）", "タグ", "", function (v) { w.meta.tags = v; });
        var orderIn = input(w.meta.order || "", "表示順", "表示順（小さいほど先頭）", "admin-input--order", function (v) { w.meta.order = v.trim(); });
        orderIn.inputMode = "numeric";

        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "admin-btn";
        toggle.textContent = fm.isDraft(w.meta.draft) ? "表示する" : "非表示にする";
        toggle.addEventListener("click", function () {
            if (fm.isDraft(w.meta.draft)) delete w.meta.draft; else w.meta.draft = "true";
            markDirty(idx, true);
            render();   // バッジ/ラベルを更新（dirty 状態は works に保持済み）
        });

        var save = document.createElement("button");
        save.type = "button";
        save.className = "admin-btn admin-btn--save";
        save.textContent = "保存";
        save.disabled = !w.dirty;
        save.addEventListener("click", function () { saveWork(idx, save); });

        var desc = document.createElement("textarea");
        desc.className = "admin-textarea";
        desc.rows = 4;
        desc.value = w.body;
        desc.setAttribute("aria-label", "カードの説明文");
        desc.placeholder = "カードの説明文（1段落のプレーンテキスト）";
        desc.addEventListener("input", function () { w.body = desc.value; markDirty(idx, true); });

        controls.appendChild(titleIn); controls.appendChild(urlIn);
        controls.appendChild(tagsIn); controls.appendChild(orderIn);
        controls.appendChild(toggle); controls.appendChild(save);
        row.appendChild(head); row.appendChild(controls); row.appendChild(desc);
        return row;
    }

    function render() {
        var root = $("works");
        root.replaceChildren();
        works.forEach(function (w, idx) { root.appendChild(buildRow(w, idx)); });
    }

    function markDirty(idx, dirty) {
        works[idx].dirty = dirty;
        var saves = document.querySelectorAll("#works .admin-btn--save");
        if (saves[idx]) saves[idx].disabled = !dirty;
    }

    function saveWork(idx, btn) {
        var w = works[idx];
        if (!w.meta.title || !w.meta.url) { status("作品名とリンク先 URL は必須です", true); return; }
        if (!validUrl(w.meta.url)) { status("リンク先 URL は https:// で始めてください", true); return; }
        btn.disabled = true;
        btn.textContent = "保存中…";
        var body = w.body;
        if (body && !body.endsWith("\n")) body += "\n";
        gh.api(gh.contents(w.path), {
            method: "PUT",
            body: JSON.stringify({
                message: "works(admin): " + w.meta.title + " を更新",
                content: gh.b64encode(fm.serialize(w.meta, body, fm.WORK_KEYS)),
                sha: w.sha
            })
        }).then(function (res) {
            w.sha = res.content.sha;
            w.body = body;
            w.dirty = false;
            btn.textContent = "保存";
            render();
            status("保存しました。Actions がトップページを再生成します（1〜2分で反映）");
        }).catch(function (e) {
            btn.disabled = false;
            btn.textContent = "保存";
            status(e.message, true);
        });
    }

    // ---- 新規追加 ----
    function create() {
        var title = $("new-work-title").value.trim();
        var url = $("new-work-url").value.trim();
        var slug = $("new-work-slug").value.trim();
        if (!title || !url) { status("作品名とリンク先 URL を入力してください", true); return; }
        if (!validUrl(url)) { status("リンク先 URL は https:// で始めてください", true); return; }
        if (!slug) slug = "work-" + Date.now().toString(36);   // 空欄なら自動
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { status("ファイル名は半角英数小文字とハイフンのみです", true); return; }

        var meta = { title: title, url: url, tags: $("new-work-tags").value.trim(), order: $("new-work-order").value.trim() };
        if ($("new-work-draft").checked) meta.draft = "true";
        var body = $("new-work-desc").value.trim();
        if (body) body += "\n";
        var path = WORKS_DIR + "/" + slug + ".md";

        var btn = document.querySelector("#new-work-form .admin-btn--save");
        btn.disabled = true;
        status("作成中…");
        gh.api(gh.contents(path), {
            method: "PUT",
            body: JSON.stringify({
                message: "works(admin): 「" + title + "」を追加",
                content: gh.b64encode(fm.serialize(meta, body, fm.WORK_KEYS))
            })
        }).then(function () {
            btn.disabled = false;
            $("new-work-form").reset();
            status("作成しました" + (meta.draft ? "（非表示）" : "。Actions がトップページを再生成します（1〜2分）"));
            load();
        }).catch(function (e) {
            btn.disabled = false;
            // 同名ファイルが既にあると sha 無しの PUT は 422 で失敗する
            status(/422/.test(e.message) ? "同じファイル名の作品が既にあります: " + path : e.message, true);
        });
    }

    function init() {
        var form = $("new-work-form");
        if (form) form.addEventListener("submit", function (e) { e.preventDefault(); create(); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { load: load, clear: clear };
})();
