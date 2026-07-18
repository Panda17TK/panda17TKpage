/* =============================================================
   UI: モバイルナビのトグル & フッターの年表示
   - 開いている間はメニュー内にフォーカストラップ、背後を inert 化
   - Esc / リンククリック / トグルで閉じ、フォーカスを戻す
   ============================================================= */
window.NH = window.NH || {};

NH.initUI = function () {
    var toggle = document.querySelector(".nav__toggle");
    var links = document.querySelector(".nav__links");
    if (toggle && links) {
        // メニュー以外の主要領域（開いている間は inert / aria-hidden）
        var others = [document.querySelector("main"), document.querySelector(".footer")].filter(Boolean);

        function focusables() {
            return Array.prototype.slice.call(
                links.querySelectorAll('a[href], button:not([disabled])')
            ).filter(function (el) { return el.offsetParent !== null || el.getClientRects().length; });
        }
        function setOthersInert(on) {
            others.forEach(function (el) {
                if (on) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); }
                else { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
            });
        }
        function isMobileNav() {
            // CSS で .nav__toggle が表示されている＝モバイル幅のときだけトラップする
            return getComputedStyle(toggle).display !== "none";
        }
        function open() {
            links.classList.add("is-open");
            toggle.setAttribute("aria-expanded", "true");
            if (isMobileNav()) {
                setOthersInert(true);
                var f = focusables();
                if (f.length) f[0].focus();
            }
        }
        function close(restoreFocus) {
            links.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
            setOthersInert(false);
            if (restoreFocus) toggle.focus();
        }

        toggle.addEventListener("click", function () {
            if (links.classList.contains("is-open")) close(false);
            else open();
        });
        links.addEventListener("click", function (e) {
            if (e.target.tagName === "A") close(false);
        });
        document.addEventListener("keydown", function (e) {
            if (!links.classList.contains("is-open")) return;
            if (e.key === "Escape") { close(true); return; }
            // フォーカストラップ（モバイルナビ表示時のみ）
            if (e.key === "Tab" && isMobileNav()) {
                var f = focusables();
                if (!f.length) return;
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
        // デスクトップ幅へリサイズしたらトラップ状態を解除
        // （getComputedStyle を伴うため rAF で1フレーム1回に間引く）
        var resizeRaf = 0;
        window.addEventListener("resize", function () {
            if (resizeRaf) return;
            resizeRaf = requestAnimationFrame(function () {
                resizeRaf = 0;
                if (!isMobileNav() && links.classList.contains("is-open")) close(false);
            });
        });
    }

    // 背景のみ表示：UI をフェードで隠して夜景だけを眺める（トップページのみ）。
    // 隠した要素は visibility:hidden になるためフォーカス不能＝inert 化は不要。
    // クリックでのパッシング（app.js）はモード中もそのまま効く
    var bgBtn = document.querySelector(".hero__bgonly");
    var bgExit = document.querySelector(".bgonly-exit");
    if (bgBtn && bgExit) {
        // opacity:0 だけでは Tab で透明な UI に入れてしまうため inert で塞ぐ
        var uiParts = [
            document.querySelector("header"),
            document.querySelector("main"),
            document.querySelector(".footer"),
            document.querySelector(".skip-link")
        ].filter(Boolean);
        var setBgOnly = function (on) {
            document.body.classList.toggle("bg-only", on);
            uiParts.forEach(function (el) {
                if (on) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); }
                else { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
            });
            bgExit.hidden = !on;
            // フォーカスを見えているボタンへ移す（キーボード操作者が迷子にならないように）
            if (on) bgExit.focus();
            else bgBtn.focus();
        };
        bgBtn.addEventListener("click", function () { setBgOnly(true); });
        bgExit.addEventListener("click", function () { setBgOnly(false); });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && document.body.classList.contains("bg-only")) setBgOnly(false);
        });
    }

    var yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
};
