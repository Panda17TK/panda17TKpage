/* =============================================================
   コメント管理（/admin.html）
   - Cloudflare Worker の管理 API を利用
   - ADMIN_TOKEN は localStorage のみに保存
   - 公開 / 非表示 / 論理削除 / 復元 / 名前・本文編集
   ============================================================= */
window.NH = window.NH || {};

NH.adminComments = (function () {
    "use strict";

    var TOKEN_KEY = "nh-comments-admin-token";
    var comments = [];
    var filter = "all";
    var root = null;

    function $(id) {
        return document.getElementById(id);
    }

    function apiBase() {
        if (window.NH_COMMENTS && window.NH_COMMENTS.apiBase) {
            return String(window.NH_COMMENTS.apiBase).replace(/\/+$/, "");
        }

        if (
            location.hostname === "localhost" ||
            location.hostname === "127.0.0.1"
        ) {
            return "http://127.0.0.1:8787";
        }

        return "https://sasanoha-comments.sasanoha-tk.workers.dev";
    }

    function token() {
        try {
            return localStorage.getItem(TOKEN_KEY) || "";
        } catch (e) {
            return "";
        }
    }

    function setToken(value) {
        localStorage.setItem(TOKEN_KEY, value);
    }

    function clearToken() {
        try {
            localStorage.removeItem(TOKEN_KEY);
        } catch (e) {
            /* noop */
        }
    }

    function setStatus(message, isError) {
        var el = $("comments-admin-status");
        if (!el) return;
        el.textContent = message || "";
        el.className =
            "admin-comments__status" +
            (isError ? " admin-comments__status--error" : "");
    }

    async function api(path, options) {
        options = options || {};
        var headers = Object.assign(
            {
                "Accept": "application/json",
                "Authorization": "Bearer " + token()
            },
            options.headers || {}
        );

        var response = await fetch(apiBase() + path, {
            method: options.method || "GET",
            headers: headers,
            body: options.body
        });

        var data = {};
        try {
            data = await response.json();
        } catch (e) {
            data = {};
        }

        if (response.status === 401) {
            clearToken();
            showAuth(false);
            throw new Error("コメント管理トークンが無効か期限切れです。");
        }

        if (!response.ok) {
            throw new Error(
                data.error ||
                ("コメント管理 API エラー: " + response.status)
            );
        }

        return data;
    }

    function escapeSelectorValue(value) {
        return String(value).replace(/["\\]/g, "\\$&");
    }

    function formatDate(value) {
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return value || "";

        return new Intl.DateTimeFormat("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function statusLabel(value) {
        if (value === "published") return "公開中";
        if (value === "hidden") return "非表示";
        if (value === "deleted") return "削除済み";
        return value;
    }

    function statusClass(value) {
        if (value === "published") return " admin-comments__badge--published";
        if (value === "hidden") return " admin-comments__badge--hidden";
        if (value === "deleted") return " admin-comments__badge--deleted";
        return "";
    }

    function countBy(status) {
        if (status === "all") return comments.length;
        return comments.filter(function (c) {
            return c.status === status;
        }).length;
    }

    function renderFilters() {
        var wrap = $("comments-admin-filters");
        if (!wrap) return;

        var definitions = [
            ["all", "すべて"],
            ["published", "公開中"],
            ["hidden", "非表示"],
            ["deleted", "削除済み"]
        ];

        wrap.replaceChildren();

        definitions.forEach(function (definition) {
            var key = definition[0];
            var label = definition[1];
            var button = document.createElement("button");

            button.type = "button";
            button.className =
                "admin-comments__filter" +
                (filter === key ? " is-active" : "");
            button.dataset.status = key;
            button.textContent =
                label + " " + String(countBy(key));

            button.addEventListener("click", function () {
                filter = key;
                render();
            });

            wrap.appendChild(button);
        });
    }

    function setDirty(card, dirty) {
        card.dataset.dirty = dirty ? "true" : "false";
        var save = card.querySelector("[data-comment-save]");
        if (save) save.disabled = !dirty;
    }

    function makeActionButton(label, className, handler) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "admin-btn " + (className || "");
        button.textContent = label;
        button.addEventListener("click", handler);
        return button;
    }

    async function patchComment(comment, payload) {
        return api(
            "/api/admin/comments/" + encodeURIComponent(comment.id),
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            }
        );
    }

    async function saveEdit(comment, card, button) {
        var author = card.querySelector("[data-comment-author]");
        var body = card.querySelector("[data-comment-body]");

        var nextAuthor = author.value.trim();
        var nextBody = body.value.trim();

        if (!nextBody) {
            setStatus("コメント本文は空にできません。", true);
            body.focus();
            return;
        }

        if (nextAuthor.length > 40) {
            setStatus("名前は40文字以内です。", true);
            author.focus();
            return;
        }

        if (nextBody.length > 3000) {
            setStatus("コメントは3000文字以内です。", true);
            body.focus();
            return;
        }

        button.disabled = true;
        button.textContent = "保存中…";
        setStatus("コメントを保存しています…");

        try {
            await patchComment(comment, {
                author: nextAuthor,
                body: nextBody
            });

            comment.author = nextAuthor || "匿名";
            comment.body = nextBody;
            setDirty(card, false);
            button.textContent = "変更を保存";
            setStatus("コメントを更新しました。");
        } catch (error) {
            button.textContent = "変更を保存";
            setDirty(card, true);
            setStatus(error.message, true);
        }
    }

    async function changeStatus(comment, nextStatus, button) {
        if (nextStatus === "deleted") {
            if (!window.confirm("このコメントを削除済みにしますか？ 後から復元できます。")) {
                return;
            }
        }

        var oldLabel = button.textContent;
        button.disabled = true;
        button.textContent = "更新中…";
        setStatus("コメント状態を更新しています…");

        try {
            await patchComment(comment, {
                status: nextStatus
            });

            comment.status = nextStatus;
            render();
            setStatus(
                nextStatus === "published"
                    ? "コメントを公開しました。"
                    : nextStatus === "hidden"
                        ? "コメントを非表示にしました。"
                        : "コメントを削除済みにしました。"
            );
        } catch (error) {
            button.disabled = false;
            button.textContent = oldLabel;
            setStatus(error.message, true);
        }
    }

    function buildCard(comment) {
        var card = document.createElement("article");
        card.className = "admin-comments__card";
        card.dataset.commentId = String(comment.id);
        card.dataset.dirty = "false";

        var head = document.createElement("div");
        head.className = "admin-comments__card-head";

        var identity = document.createElement("div");
        identity.className = "admin-comments__identity";

        var badge = document.createElement("span");
        badge.className =
            "admin-comments__badge" +
            statusClass(comment.status);
        badge.textContent = statusLabel(comment.status);

        var id = document.createElement("span");
        id.className = "admin-comments__id";
        id.textContent = "#" + String(comment.id);

        var time = document.createElement("time");
        time.className = "admin-comments__time";
        time.dateTime = comment.created_at || "";
        time.textContent = formatDate(comment.created_at);

        identity.append(badge, id, time);

        var link = document.createElement("a");
        link.className = "admin-comments__post-link";
        link.href = comment.post_id;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = comment.post_id;

        head.append(identity, link);

        var fields = document.createElement("div");
        fields.className = "admin-comments__fields";

        var authorLabel = document.createElement("label");
        authorLabel.className = "admin-comments__field";
        var authorText = document.createElement("span");
        authorText.textContent = "名前";
        var author = document.createElement("input");
        author.className = "admin-input";
        author.type = "text";
        author.maxLength = 40;
        author.value = comment.author || "";
        author.dataset.commentAuthor = "";
        authorLabel.append(authorText, author);

        var bodyLabel = document.createElement("label");
        bodyLabel.className = "admin-comments__field";
        var bodyText = document.createElement("span");
        bodyText.textContent = "本文";
        var body = document.createElement("textarea");
        body.className = "admin-textarea admin-comments__body";
        body.rows = 5;
        body.maxLength = 3000;
        body.value = comment.body || "";
        body.dataset.commentBody = "";
        bodyLabel.append(bodyText, body);

        fields.append(authorLabel, bodyLabel);

        var actions = document.createElement("div");
        actions.className = "admin-comments__actions";

        var save = makeActionButton(
            "変更を保存",
            "admin-btn--save",
            function () {
                saveEdit(comment, card, save);
            }
        );
        save.dataset.commentSave = "";
        save.disabled = true;
        actions.appendChild(save);

        if (comment.status !== "published") {
            actions.appendChild(
                makeActionButton(
                    comment.status === "deleted" ? "公開に復元" : "公開",
                    "admin-comments__btn--publish",
                    function () {
                        changeStatus(comment, "published", this);
                    }
                )
            );
        }

        if (comment.status !== "hidden") {
            actions.appendChild(
                makeActionButton(
                    comment.status === "deleted" ? "非表示に復元" : "非表示",
                    "admin-comments__btn--hide",
                    function () {
                        changeStatus(comment, "hidden", this);
                    }
                )
            );
        }

        if (comment.status !== "deleted") {
            actions.appendChild(
                makeActionButton(
                    "削除",
                    "admin-comments__btn--delete",
                    function () {
                        changeStatus(comment, "deleted", this);
                    }
                )
            );
        }

        function updateDirty() {
            var dirty =
                author.value !== (comment.author || "") ||
                body.value !== (comment.body || "");
            setDirty(card, dirty);
        }

        author.addEventListener("input", updateDirty);
        body.addEventListener("input", updateDirty);

        card.append(head, fields, actions);
        return card;
    }

    function render() {
        renderFilters();

        var list = $("comments-admin-list");
        if (!list) return;
        list.replaceChildren();

        var visible = comments.filter(function (comment) {
            return filter === "all" || comment.status === filter;
        });

        if (visible.length === 0) {
            var empty = document.createElement("p");
            empty.className = "admin-comments__empty";
            empty.textContent = "該当するコメントはありません。";
            list.appendChild(empty);
            return;
        }

        visible.forEach(function (comment) {
            list.appendChild(buildCard(comment));
        });
    }

    async function load() {
        if (!token()) {
            showAuth(false);
            return;
        }

        setStatus("コメントを読み込み中…");

        var reload = $("comments-admin-reload");
        if (reload) reload.disabled = true;

        try {
            var data = await api("/api/admin/comments");
            comments = Array.isArray(data.comments)
                ? data.comments
                : [];
            showAuth(true);
            render();
            setStatus(comments.length + "件のコメントを読み込みました。");
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            if (reload) reload.disabled = false;
        }
    }

    function showAuth(hasToken) {
        var auth = $("comments-admin-auth");
        var app = $("comments-admin-app");
        if (!auth || !app) return;

        auth.hidden = hasToken;
        app.hidden = !hasToken;
    }

    function buildUi() {
        root = document.createElement("section");
        root.className = "admin-comments";
        root.setAttribute("aria-labelledby", "comments-admin-title");

        root.innerHTML = [
            '<div class="admin-comments__heading">',
            '  <div>',
            '    <p class="admin-comments__eyebrow">COMMENT MODERATION</p>',
            '    <h2 class="admin-h2 admin-comments__title" id="comments-admin-title">コメント</h2>',
            '  </div>',
            '  <p class="admin-comments__lead">公開・非表示・削除・編集を管理します。</p>',
            '</div>',
            '<div id="comments-admin-auth" class="admin-comments__auth">',
            '  <p>Cloudflare Worker の ADMIN_TOKEN を入力してください。トークンは localStorage のみに保存され、ブラウザを閉じると消えます。</p>',
            '  <form id="comments-admin-token-form" class="admin-form">',
            '    <input id="comments-admin-token" class="admin-input" type="password" autocomplete="off" placeholder="ADMIN_TOKEN" aria-label="コメント管理トークン">',
            '    <button class="admin-btn admin-btn--save" type="submit">コメント管理を開く</button>',
            '  </form>',
            '</div>',
            '<div id="comments-admin-app" hidden>',
            '  <div class="admin-comments__toolbar">',
            '    <div id="comments-admin-filters" class="admin-comments__filters" aria-label="コメント状態フィルター"></div>',
            '    <div class="admin-comments__toolbar-actions">',
            '      <button id="comments-admin-reload" type="button" class="admin-btn">再読み込み</button>',
            '      <button id="comments-admin-logout" type="button" class="admin-btn">コメント用トークンを消去</button>',
            '    </div>',
            '  </div>',
            '  <div id="comments-admin-list" class="admin-comments__list"></div>',
            '</div>',
            '<p id="comments-admin-status" class="admin-comments__status" role="status" aria-live="polite"></p>'
        ].join("");

        var globalStatus = document.getElementById("status");
        if (globalStatus && globalStatus.parentNode) {
            globalStatus.parentNode.insertBefore(root, globalStatus);
        } else {
            document.getElementById("content").appendChild(root);
        }

        $("comments-admin-token-form").addEventListener("submit", function (event) {
            event.preventDefault();
            var input = $("comments-admin-token");
            var value = input.value.trim();
            if (!value) return;

            try {
                setToken(value);
            } catch (error) {
                setStatus("localStorage を利用できません。", true);
                return;
            }

            input.value = "";
            load();
        });

        $("comments-admin-reload").addEventListener("click", load);

        $("comments-admin-logout").addEventListener("click", function () {
            clearToken();
            comments = [];
            $("comments-admin-list").replaceChildren();
            setStatus("");
            showAuth(false);
        });

        showAuth(!!token());
        if (token()) load();
    }

    function init() {
        if (document.querySelector(".admin-comments")) return;
        buildUi();
    }

    return {
        init: init,
        load: load,
        clear: function () {
            comments = [];
            if ($("comments-admin-list")) {
                $("comments-admin-list").replaceChildren();
            }
        }
    };
})();

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
        NH.adminComments.init();
    });
} else {
    NH.adminComments.init();
}
