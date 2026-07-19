/* =============================================================
   管理画面: ギャラリー（gallery/pieces/*.md + gallery/images/）
   - 一覧・編集（タイトル/コマ数/fps/倍率/キャプション）・公開切替
   - 新規追加はスマホから画像（PNG/GIF）を選ぶだけ。アップロード前に
     Image で実寸を読み、幅がコマ数で割り切れるかを検証して
     Actions のビルド失敗を未然に防ぐ
   - 保存すると main へコミット → blog.yml が gallery/index.html を再生成
   - admin.js から NH.adminGallery.load() / clear() で呼ばれる
   ============================================================= */
window.NH = window.NH || {};

NH.adminGallery = (function () {
    "use strict";

    var gh = NH.adminGh;
    var fm = NH.frontmatter;
    var PIECES_DIR = "gallery/pieces";
    var IMAGES_DIR = "gallery/images";
    var $ = function (id) { return document.getElementById(id); };
    var pieces = [];   // { path, sha, meta, body, dirty }

    // 発信元 "gallery" として共有ステータス行へ
    function status(msg, isError) { gh.status("gallery", msg, isError); }

    // ---- 一覧の読み込み ----
    function load() {
        gh.api(gh.contents(PIECES_DIR)).then(function (list) {
            var mds = list.filter(function (f) { return f.name.endsWith(".md"); });
            return Promise.all(mds.map(function (f) {
                return gh.api(gh.contents(f.path)).then(function (file) {
                    var parsed = fm.parse(gh.b64decode(file.content));
                    return { path: f.path, sha: file.sha, meta: parsed.meta, body: parsed.body, dirty: false };
                });
            }));
        }).then(function (loaded) {
            pieces = loaded.sort(function (a, b) { return (a.meta.date < b.meta.date) ? 1 : -1; });
            render();
        }).catch(function (e) {
            // ディレクトリ未作成なら空一覧（作品を追加すると自動で作られる）
            if (/404/.test(e.message)) { pieces = []; render(); return; }
            status(e.message, true);
        });
    }

    function clear() {
        pieces = [];
        $("pieces").replaceChildren();
        status("");
    }

    // 1作品ぶんの行
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
        date.textContent = (p.meta.date || "") + "・" + (p.meta.file || "");
        var badge = document.createElement("span");
        badge.className = "admin-badge" + (fm.isDraft(p.meta.draft) ? " admin-badge--draft" : "");
        badge.textContent = fm.isDraft(p.meta.draft) ? "非公開" : "公開中";
        head.appendChild(title); head.appendChild(date); head.appendChild(badge);

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
        var titleIn = input(p.meta.title || "", "作品タイトル", "作品タイトル", "", function (v) { p.meta.title = v; });
        var framesIn = input(p.meta.frames || "", "コマ数", "コマ数（スプライトシートのみ）", "admin-input--order", function (v) { p.meta.frames = v.trim(); });
        framesIn.inputMode = "numeric";
        var fpsIn = input(p.meta.fps || "", "fps", "コマ送り速度（fps）", "admin-input--order", function (v) { p.meta.fps = v.trim(); });
        fpsIn.inputMode = "numeric";
        var scaleIn = input(p.meta.scale || "", "倍率", "表示倍率", "admin-input--order", function (v) { p.meta.scale = v.trim(); });
        scaleIn.inputMode = "numeric";

        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "admin-btn";
        toggle.textContent = fm.isDraft(p.meta.draft) ? "公開する" : "非公開にする";
        toggle.addEventListener("click", function () {
            if (fm.isDraft(p.meta.draft)) delete p.meta.draft; else p.meta.draft = "true";
            markDirty(idx, true);
            render();
        });

        var save = document.createElement("button");
        save.type = "button";
        save.className = "admin-btn admin-btn--save";
        save.textContent = "保存";
        save.disabled = !p.dirty;
        save.addEventListener("click", function () { savePiece(idx, save); });

        var cap = document.createElement("textarea");
        cap.className = "admin-textarea";
        cap.rows = 3;
        cap.value = p.body;
        cap.setAttribute("aria-label", "キャプション");
        cap.placeholder = "キャプション（任意・1段落）";
        cap.addEventListener("input", function () { p.body = cap.value; markDirty(idx, true); });

        controls.appendChild(titleIn); controls.appendChild(framesIn);
        controls.appendChild(fpsIn); controls.appendChild(scaleIn);
        controls.appendChild(toggle); controls.appendChild(save);
        row.appendChild(head); row.appendChild(controls); row.appendChild(cap);
        return row;
    }

    function render() {
        var root = $("pieces");
        root.replaceChildren();
        pieces.forEach(function (p, idx) { root.appendChild(buildRow(p, idx)); });
    }

    function markDirty(idx, dirty) {
        pieces[idx].dirty = dirty;
        var saves = document.querySelectorAll("#pieces .admin-btn--save");
        if (saves[idx]) saves[idx].disabled = !dirty;
    }

    function savePiece(idx, btn) {
        var p = pieces[idx];
        if (!p.meta.title) { status("作品タイトルは必須です", true); return; }
        var frames = parseInt(p.meta.frames, 10);
        if (p.meta.frames && (!isFinite(frames) || frames < 1)) { status("コマ数は1以上の整数で入力してください", true); return; }
        btn.disabled = true;
        btn.textContent = "保存中…";
        var body = p.body;
        if (body && !body.endsWith("\n")) body += "\n";
        gh.api(gh.contents(p.path), {
            method: "PUT",
            body: JSON.stringify({
                message: "gallery(admin): " + p.meta.title + " を更新",
                content: gh.b64encode(fm.serialize(p.meta, body, fm.GALLERY_KEYS)),
                sha: p.sha
            })
        }).then(function (res) {
            p.sha = res.content.sha;
            p.body = body;
            p.dirty = false;
            btn.textContent = "保存";
            render();
            status("保存しました。Actions がギャラリーを再生成します（1〜2分で反映）");
        }).catch(function (e) {
            btn.disabled = false;
            btn.textContent = "保存";
            status(e.message, true);
        });
    }

    // ---- 新規追加 ----
    function localDate() {
        var d = new Date();
        return [d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0")].join("-");
    }

    // 画像ファイル → { base64, width, height }（dataURL 経由。実寸は Image で読む）
    function readImage(file) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onerror = function () { reject(new Error("画像の読み込みに失敗しました")); };
            r.onload = function () {
                var dataUrl = r.result;
                var img = new Image();
                img.onload = function () { resolve({ base64: dataUrl.split(",")[1], width: img.naturalWidth, height: img.naturalHeight }); };
                img.onerror = function () { reject(new Error("画像として読み込めませんでした")); };
                img.src = dataUrl;
            };
            r.readAsDataURL(file);
        });
    }

    function create() {
        var title = $("new-piece-title").value.trim();
        var fileInput = $("new-piece-image");
        var file = fileInput.files && fileInput.files[0];
        if (!title || !file) { status("作品タイトルと画像を指定してください", true); return; }
        if (!/\.(png|gif)$/i.test(file.name)) { status("画像は PNG / GIF のみ対応です", true); return; }
        var frames = Math.max(1, parseInt($("new-piece-frames").value, 10) || 1);

        // 画像名は小文字化して安全な文字だけに（md の slug にも流用する）
        var imgName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
        var base = imgName.replace(/\.(png|gif)$/i, "");
        var date = localDate();
        var mdPath = PIECES_DIR + "/" + date + "-" + base + ".md";
        var imgPath = IMAGES_DIR + "/" + imgName;

        var btn = document.querySelector("#new-piece-form .admin-btn--save");
        btn.disabled = true;
        status("画像を確認中…");
        readImage(file).then(function (img) {
            // ジェネレータと同じ検証を手元で先にやる（push 後のビルド失敗を防ぐ）
            if (img.width % frames !== 0) {
                throw new Error("画像幅 " + img.width + "px がコマ数 " + frames + " で割り切れません");
            }
            status("画像をアップロード中…");
            return gh.api(gh.contents(imgPath), {
                method: "PUT",
                body: JSON.stringify({ message: "gallery(admin): 画像を追加 " + imgName, content: img.base64 })
            });
        }).then(function () {
            var meta = { title: title, date: date, file: "images/" + imgName };
            if (frames > 1) {
                meta.frames = String(frames);
                meta.fps = String(Math.max(1, parseFloat($("new-piece-fps").value) || 8));
            }
            var scale = parseInt($("new-piece-scale").value, 10);
            if (isFinite(scale) && scale >= 1) meta.scale = String(scale);
            if ($("new-piece-draft").checked) meta.draft = "true";
            var body = $("new-piece-caption").value.trim();
            if (body) body += "\n";
            return gh.api(gh.contents(mdPath), {
                method: "PUT",
                body: JSON.stringify({
                    message: "gallery(admin): 「" + title + "」を展示",
                    content: gh.b64encode(fm.serialize(meta, body, fm.GALLERY_KEYS))
                })
            }).then(function () { return meta; });
        }).then(function (meta) {
            btn.disabled = false;
            $("new-piece-form").reset();
            status("展示しました" + (meta.draft ? "（非公開）" : "。Actions がギャラリーを再生成します（1〜2分）"));
            load();
        }).catch(function (e) {
            btn.disabled = false;
            // 同名ファイルが既にあると sha 無しの PUT は 422 で失敗する
            status(/422/.test(e.message) ? "同じ名前の画像または作品が既にあります（ファイル名を変えてください）" : e.message, true);
        });
    }

    function init() {
        var form = $("new-piece-form");
        if (form) form.addEventListener("submit", function (e) { e.preventDefault(); create(); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    return { load: load, clear: clear };
})();
