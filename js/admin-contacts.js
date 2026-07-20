/* =============================================================
   管理画面: 連絡先（contacts/*.md）の一覧・編集・新規追加
   - 1ファイル=1カード。フロントマターは title/url 必須、
     handle（@名前 やメールアドレスの表示用）/order/draft 任意
   - url は https:// のほか mailto: も可
   - 保存すると main へコミット → blog.yml がトップページを再生成
   - admin.js から NH.adminContacts.load() / clear() で呼ばれる
   ============================================================= */
window.NH = window.NH || {};

NH.adminContacts = (function () {
    "use strict";

    var gh = NH.adminGh;
    var fm = NH.frontmatter;
    var CONTACTS_DIR = "contacts";
    var $ = function (id) { return document.getElementById(id); };
    var contacts = [];   // { path, sha, meta, body, dirty }

    // 発信元 "contacts" として共有ステータス行へ
    function status(msg, isError) { gh.status("contacts", msg, isError); }

    // カードのリンク先は https か mailto のみ（ジェネレータ側と同じ基準）
    function validUrl(u) { return /^(https?:\/\/|mailto:)/.test(u); }

    function orderOf(c) {
        var n = parseFloat(c.meta.order);
        return isFinite(n) ? n : 999;
    }

    // ---- 一覧の読み込み ----
    function load() {
        gh.api(gh.contents(CONTACTS_DIR)).then(function (list) {
            var mds = list.filter(function (f) { return f.name.endsWith(".md"); });
            return Promise.all(mds.map(function (f) {
                return gh.api(gh.contents(f.path)).then(function (file) {
                    var parsed = fm.parse(gh.b64decode(file.content));
                    return { path: f.path, sha: file.sha, meta: parsed.meta, body: parsed.body, dirty: false };
                });
            }));
        }).then(function (loaded) {
            contacts = loaded.sort(function (a, b) {
                return orderOf(a) - orderOf(b) ||
                    String(a.meta.title).localeCompare(String(b.meta.title), "ja");
            });
            render();
        }).catch(function (e) {
            if (/404/.test(e.message)) { contacts = []; render(); return; }
            status(e.message, true);
        });
    }

    function clear() {
        contacts = [];
        $("contacts-list").replaceChildren();
        status("");
    }

    function buildRow(c, idx) {
        var row = document.createElement("div");
        row.className = "admin-post";

        var head = document.createElement("div");
        head.className = "admin-post__head";
        var title = document.createElement("span");
        title.className = "admin-post__title";
        title.textContent = c.meta.title || c.path;
        var order = document.createElement("span");
        order.className = "admin-post__date";
        order.textContent = "表示順: " + (c.meta.order || "末尾");
        var badge = document.createElement("span");
        badge.className = "admin-badge" + (fm.isDraft(c.meta.draft) ? " admin-badge--draft" : "");
        badge.textContent = fm.isDraft(c.meta.draft) ? "非公開" : "公開中";
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
        var titleIn = input(c.meta.title || "", "名前（GitHub / メール 等）", "連絡先の名前", "", function (v) { c.meta.title = v; });
        var urlIn = input(c.meta.url || "", "リンク先（https:// か mailto:）", "リンク先", "", function (v) { c.meta.url = v; });
        var handleIn = input(c.meta.handle || "", "表示用ハンドル（@名前 等・任意）", "表示用ハンドル", "", function (v) { c.meta.handle = v.trim(); });
        var orderIn = input(c.meta.order || "", "表示順", "表示順（小さいほど先頭）", "admin-input--order", function (v) { c.meta.order = v.trim(); });
        orderIn.inputMode = "numeric";

        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "admin-btn";
        toggle.textContent = fm.isDraft(c.meta.draft) ? "公開する" : "非公開にする";
        toggle.addEventListener("click", function () {
            if (fm.isDraft(c.meta.draft)) delete c.meta.draft; else c.meta.draft = "true";
            markDirty(idx, true);
            render();
        });

        var save = document.createElement("button");
        save.type = "button";
        save.className = "admin-btn admin-btn--save";
        save.textContent = "保存";
        save.disabled = !c.dirty;
        save.addEventListener("click", function () { saveContact(idx, save); });

        controls.appendChild(titleIn); controls.appendChild(urlIn);
        controls.appendChild(handleIn); controls.appendChild(orderIn);
        controls.appendChild(toggle); controls.appendChild(save);
        row.appendChild(head); row.appendChild(controls);
        return row;
    }

    function render() {
        var root = $("contacts-list");
        root.replaceChildren();
        contacts.forEach(function (c, idx) { root.appendChild(buildRow(c, idx)); });
    }

    function markDirty(idx, dirty) {
        contacts[idx].dirty = dirty;
        var saves = document.querySelectorAll("#contacts-list .admin-btn--save");
        if (saves[idx]) saves[idx].disabled = !dirty;
    }

    function saveContact(idx, btn) {
        var c = contacts[idx];
        if (!c.meta.title || !c.meta.url) { status("名前とリンク先は必須です", true); return; }
        if (!validUrl(c.meta.url)) { status("リンク先は https:// か mailto: で始めてください", true); return; }
        btn.disabled = true;
        btn.textContent = "保存中…";
        gh.api(gh.contents(c.path), {
            method: "PUT",
            body: JSON.stringify({
                message: "contacts(admin): " + c.meta.title + " を更新",
                content: gh.b64encode(fm.serialize(c.meta, c.body, fm.CONTACT_KEYS)),
                sha: c.sha
            })
        }).then(function (res) {
            c.sha = res.content.sha;
            c.dirty = false;
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
        var title = $("new-contact-title").value.trim();
        var url = $("new-contact-url").value.trim();
        var slug = $("new-contact-slug").value.trim();
        if (!title || !url) { status("名前とリンク先を入力してください", true); return; }
        if (!validUrl(url)) { status("リンク先は https:// か mailto: で始めてください", true); return; }
        if (!slug) slug = "contact-" + Date.now().toString(36);   // 空欄なら自動
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { status("ファイル名は半角英数小文字とハイフンのみです", true); return; }

        var meta = { title: title, url: url, handle: $("new-contact-handle").value.trim(), order: $("new-contact-order").value.trim() };
        if ($("new-contact-draft").checked) meta.draft = "true";
        var path = CONTACTS_DIR + "/" + slug + ".md";

        var btn = document.querySelector("#new-contact-form .admin-btn--save");
        btn.disabled = true;
        status("作成中…");
        gh.api(gh.contents(path), {
            method: "PUT",
            body: JSON.stringify({
                message: "contacts(admin): 「" + title + "」を追加",
                content: gh.b64encode(fm.serialize(meta, "", fm.CONTACT_KEYS))
            })
        }).then(function () {
            btn.disabled = false;
            $("new-contact-form").reset();
            status("追加しました" + (meta.draft ? "（非公開）" : "。Actions がトップページを再生成します（1〜2分）"));
            load();
        }).catch(function (e) {
            btn.disabled = false;
            status(/422/.test(e.message) ? "同じファイル名の連絡先が既にあります: " + path : e.message, true);
        });
    }

    function init() {
        var form = $("new-contact-form");
        if (form) form.addEventListener("submit", function (e) { e.preventDefault(); create(); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { load: load, clear: clear };
})();
