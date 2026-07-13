/* =============================================================
   雑記一覧のタグ絞り込み
   - .tag-filter__btn を押すとタグの ON/OFF を切替（aria-pressed）
   - 選択タグのいずれかを持つ記事だけ表示（OR 条件）
   - 選択状態は URL の ?tags=a,b と同期（共有・リロード復元可）
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

        function activeTags() {
            return buttons
                .filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })
                .map(function (b) { return b.getAttribute("data-tag"); });
        }

        function apply() {
            var active = activeTags();
            var shown = 0;
            items.forEach(function (item) {
                var tags = (item.getAttribute("data-tags") || "").split(",").filter(Boolean);
                var show = active.length === 0 || active.some(function (t) { return tags.indexOf(t) !== -1; });
                item.hidden = !show;
                if (show) { shown++; }
            });
            if (empty) { empty.hidden = shown > 0; }
            if (reset) { reset.hidden = active.length === 0; }
            var url = new URL(window.location.href);
            if (active.length) { url.searchParams.set("tags", active.join(",")); }
            else { url.searchParams.delete("tags"); }
            window.history.replaceState(null, "", url);
        }

        buttons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var on = btn.getAttribute("aria-pressed") === "true";
                btn.setAttribute("aria-pressed", on ? "false" : "true");
                apply();
            });
        });

        if (reset) {
            reset.addEventListener("click", function () {
                buttons.forEach(function (btn) { btn.setAttribute("aria-pressed", "false"); });
                apply();
            });
        }

        // URL からの復元（?tags=a,b）
        var initial = new URL(window.location.href).searchParams.get("tags");
        if (initial) {
            var want = initial.split(",");
            buttons.forEach(function (btn) {
                if (want.indexOf(btn.getAttribute("data-tag")) !== -1) {
                    btn.setAttribute("aria-pressed", "true");
                }
            });
            apply();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
