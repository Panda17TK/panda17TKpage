/* =============================================================
   管理画面の Markdown エディタ支援（NH.adminEditor）
   - 書式ツールバー / プレビュー / リスト自動継続 / 画像挿入
   - アップロードや状態表示はコールバックで受け取り、
     GitHub API 層（admin-github.js）には依存しない
   使い方: NH.adminEditor.enhance(textarea, { status, uploadImage })
     uploadImage(base64, name) は保存先パスを resolve する Promise
   ============================================================= */
window.NH = window.NH || {};

NH.adminEditor = (function () {
    "use strict";

    var IMG_MAX_DIM = 1600;   // 画像長辺の上限(px)。スマホ写真をブログ向けに縮小
    var IMG_QUALITY = 0.85;   // JPEG 品質

    function fireInput(ta) { ta.dispatchEvent(new Event("input")); }

    // スマホで打ちにくい記号（# ` ** など）をタップで挿入できるようにする
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

    // 画像をブラウザ内で縮小して JPEG の base64 にする
    function processImageFile(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                var scale = Math.min(1, IMG_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
                var w = Math.max(1, Math.round(img.naturalWidth * scale));
                var h = Math.max(1, Math.round(img.naturalHeight * scale));
                var cv = document.createElement("canvas");
                cv.width = w; cv.height = h;
                cv.getContext("2d").drawImage(img, 0, 0, w, h);
                cv.toBlob(function (blob) {
                    if (!blob) { reject(new Error("画像の変換に失敗しました")); return; }
                    blob.arrayBuffer().then(function (buf) {
                        var bytes = new Uint8Array(buf), bin = "";
                        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                        resolve(btoa(bin));
                    });
                }, "image/jpeg", IMG_QUALITY);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("この画像は読み込めませんでした"));
            };
            img.src = url;
        });
    }

    function insertImage(ta, file, sizeClass, opts) {
        opts.status("画像を圧縮中…");
        processImageFile(file).then(function (base64) {
            var name = Date.now().toString(36) + ".jpg";
            opts.status("画像をアップロード中…");
            return opts.uploadImage(base64, name).then(function (path) {
                // カーソル位置にサイズクラス付きで挿入（Markdown 内の生 HTML は marked が素通しする）
                var tag = "\n<img src=\"/" + path + "\" alt=\"\" class=\"" + sizeClass + "\">\n";
                ta.setRangeText(tag, ta.selectionStart, ta.selectionEnd, "end");
                ta.focus();
                fireInput(ta);
                opts.status("画像を挿入しました（alt=\"\" に説明を書くのがおすすめ）");
            });
        }).catch(function (e) { opts.status(e.message, true); });
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
    function enhance(ta, opts) {
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

        // 画像挿入（サイズ選択 → 写真を選ぶと縮小してアップロード後、カーソル位置に挿入）
        var sizeSel = document.createElement("select");
        sizeSel.className = "admin-mdbar__select";
        sizeSel.setAttribute("aria-label", "挿入する画像のサイズ");
        [["img-m", "中 66%"], ["img-s", "小 33%"], ["img-l", "大 100%"]].forEach(function (o) {
            var op = document.createElement("option");
            op.value = o[0]; op.textContent = o[1];
            sizeSel.appendChild(op);
        });
        var fileIn = document.createElement("input");
        fileIn.type = "file";
        fileIn.accept = "image/*";
        fileIn.hidden = true;
        fileIn.addEventListener("change", function () {
            if (fileIn.files && fileIn.files[0]) insertImage(ta, fileIn.files[0], sizeSel.value, opts);
            fileIn.value = "";
        });
        var imgBtn = document.createElement("button");
        imgBtn.type = "button";
        imgBtn.className = "admin-mdbar__btn";
        imgBtn.textContent = "画像";
        imgBtn.title = "写真を選んで挿入（自動で縮小・サイズは左の選択）";
        imgBtn.setAttribute("aria-label", "画像を挿入");
        imgBtn.addEventListener("click", function () { fileIn.click(); });
        bar.appendChild(sizeSel);
        bar.appendChild(imgBtn);
        bar.appendChild(fileIn);

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
                // 自分が書いた Markdown を自分のブラウザで描画するだけ（ビルドと同じ marked）。
                // 連続画像のギャラリー化もビルドと同じ変換を通して見た目を一致させる
                var html = window.marked ? window.marked.parse(ta.value) : "";
                prev.innerHTML = NH.groupImages ? NH.groupImages(html) : html;
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

    return { enhance: enhance };
})();
