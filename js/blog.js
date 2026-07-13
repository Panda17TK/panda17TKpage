/* =============================================================
   雑記一覧のタグ絞り込み（単一選択）
   - タグを押すとそのタグを持つ記事だけ表示。別のタグを押すと切替、
     同じタグをもう一度押すと解除（すべて表示）
   - 選択状態は URL の ?tag=xxx と同期（共有・リロード復元可）
   ============================================================= */
(function () {
    "use strict";

    function init() {
        var bar = document.querySelector(".tag-filter");
        if (!bar) { return; }
        var buttons = Array.prototype.slice.call(bar.querySelectorAll(".tag-filter__btn"));
        var reset = bar.querySelector(".tag-filter__reset");
        var items = Array.prototype.slice.call(document.querySelectorAll(".post-list__item"));
        var empty = document.querySelector(".post-list__empty");

        // 単一選択なので「選択中のタグ」は高々ひとつ
        function selectedTag() {
            var btn = buttons.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0];
            return btn ? btn.getAttribute("data-tag") : null;
        }

        function apply() {
            var tag = selectedTag();
            var shown = 0;
            items.forEach(function (item) {
                var tags = (item.getAttribute("data-tags") || "").split(",").filter(Boolean);
                var show = !tag || tags.indexOf(tag) !== -1;
                item.hidden = !show;
                if (show) { shown++; }
            });
            if (empty) { empty.hidden = shown > 0; }
            if (reset) { reset.hidden = !tag; }
            var url = new URL(window.location.href);
            if (tag) { url.searchParams.set("tag", tag); }
            else { url.searchParams.delete("tag"); }
            window.history.replaceState(null, "", url);
        }

        function select(tag) {
            buttons.forEach(function (btn) {
                btn.setAttribute("aria-pressed", btn.getAttribute("data-tag") === tag ? "true" : "false");
            });
            apply();
        }

        buttons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var on = btn.getAttribute("aria-pressed") === "true";
                select(on ? null : btn.getAttribute("data-tag"));
            });
        });

        if (reset) {
            reset.addEventListener("click", function () { select(null); });
        }

        // URL からの復元（?tag=xxx）
        var initial = new URL(window.location.href).searchParams.get("tag");
        if (initial) { select(initial); }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
