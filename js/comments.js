"use strict";

(() => {
    const root = document.querySelector("[data-comments]");

    if (!root || !window.NH_COMMENTS) {
        return;
    }

    const config = window.NH_COMMENTS;
    const postId = root.dataset.postId;

    const list = root.querySelector("[data-comments-list]");
    const form = root.querySelector("[data-comments-form]");
    const message = root.querySelector("[data-comments-message]");
    const count = root.querySelector("[data-comments-count]");
    const turnstileHost = root.querySelector("[data-turnstile]");
    const charCount = root.querySelector("[data-comments-char-count]");

    const bodyInput = form.elements.namedItem("body");
    const submitButton = form.querySelector(".comments__submit");
    const submitLabel = form.querySelector(".comments__submit-label");

    let turnstileId = null;
    let turnstileToken = "";

    function setMessage(text, isError = false) {
        message.textContent = text;
        message.dataset.error = isError ? "true" : "false";
    }

    function setCount(value) {
        count.textContent =
            Number.isInteger(value)
                ? `${value}件`
                : "…";
    }

    function setSubmitting(submitting) {
        submitButton.disabled = submitting;
        submitButton.classList.toggle("is-loading", submitting);
        submitButton.setAttribute(
            "aria-busy",
            submitting ? "true" : "false"
        );

        submitLabel.textContent =
            submitting
                ? "送信中…"
                : "コメントする";
    }

    function updateCharCount() {
        const length = bodyInput.value.length;

        charCount.textContent = `${length} / 3000`;
        charCount.dataset.nearLimit =
            length >= 2700 ? "true" : "false";
    }

    function makeLoadingSkeleton() {
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < 3; i += 1) {
            const skeleton = document.createElement("div");
            skeleton.className = "comments__skeleton";

            const head = document.createElement("span");
            const body = document.createElement("span");

            skeleton.append(head, body);
            fragment.append(skeleton);
        }

        return fragment;
    }

    function renderEmpty() {
        const empty = document.createElement("div");
        empty.className = "comments__empty";

        const mark = document.createElement("span");
        mark.className = "comments__empty-mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "＊";

        const copy = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent =
            "まだ誰も言葉を残していません。";

        const description = document.createElement("p");
        description.textContent =
            "この記事を読んで残ったことがあれば、最初の一言をどうぞ。";

        copy.append(title, description);
        empty.append(mark, copy);

        return empty;
    }

    function renderError(text) {
        const error = document.createElement("div");
        error.className = "comments__error";
        error.textContent = text;

        return error;
    }

    function renderComment(comment, index) {
        const article = document.createElement("article");
        article.className = "comment";
        article.style.setProperty(
            "--comment-index",
            String(index)
        );

        const header = document.createElement("header");
        header.className = "comment__header";

        const identity = document.createElement("div");
        identity.className = "comment__identity";

        const avatar = document.createElement("span");
        avatar.className = "comment__avatar";
        avatar.setAttribute("aria-hidden", "true");

        const authorName =
            String(comment.author || "匿名").trim() || "匿名";

        avatar.textContent =
            Array.from(authorName)[0] || "・";

        const author = document.createElement("strong");
        author.className = "comment__author";
        author.textContent = authorName;

        identity.append(avatar, author);

        const meta = document.createElement("div");
        meta.className = "comment__meta";

        const number = document.createElement("span");
        number.className = "comment__number";
        number.textContent =
            `#${String(index + 1).padStart(2, "0")}`;

        const time = document.createElement("time");
        time.className = "comment__time";

        const date = new Date(comment.created_at);

        if (!Number.isNaN(date.getTime())) {
            time.dateTime = comment.created_at;
            time.textContent = new Intl.DateTimeFormat(
                "ja-JP",
                {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                }
            ).format(date);
        }

        meta.append(number, time);
        header.append(identity, meta);

        const body = document.createElement("p");
        body.className = "comment__body";

        // ユーザー入力はHTMLとして解釈しない
        body.textContent = comment.body;

        article.append(header, body);

        return article;
    }

    async function loadComments({ fresh = false } = {}) {
        list.setAttribute("aria-busy", "true");
        list.replaceChildren(makeLoadingSkeleton());
        setCount(null);

        try {
            const response = await fetch(
                `${config.apiBase}/api/comments?post_id=${encodeURIComponent(postId)}`
            );

            if (!response.ok) {
                throw new Error(
                    "コメントを取得できませんでした。"
                );
            }

            const data = await response.json();
            const comments = Array.isArray(data.comments)
                ? data.comments
                : [];

            list.replaceChildren();
            setCount(comments.length);

            if (comments.length === 0) {
                list.append(renderEmpty());
                return;
            }

            comments.forEach((comment, index) => {
                list.append(
                    renderComment(comment, index)
                );
            });

            if (fresh && list.lastElementChild) {
                list.lastElementChild.classList.add(
                    "comment--fresh"
                );
            }
        } catch (error) {
            setCount(null);
            list.replaceChildren(
                renderError(error.message)
            );
        } finally {
            list.setAttribute("aria-busy", "false");
        }
    }

    function initTurnstile() {
        if (!window.turnstile) {
            setTimeout(initTurnstile, 100);
            return;
        }

        turnstileId = window.turnstile.render(
            turnstileHost,
            {
                sitekey: config.turnstileSiteKey,
                theme: "dark",
                appearance: "interaction-only",
                action: "comment",

                callback(token) {
                    turnstileToken = token;
                    setMessage("");
                },

                "expired-callback"() {
                    turnstileToken = "";
                },

                "error-callback"() {
                    turnstileToken = "";

                    setMessage(
                        "bot確認の読み込みに失敗しました。",
                        true
                    );
                },
            }
        );
    }

    bodyInput.addEventListener(
        "input",
        updateCharCount
    );

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!turnstileToken) {
            setMessage(
                "bot確認を完了してください。",
                true
            );

            turnstileHost.closest(
                ".comments__turnstile"
            )?.classList.add("is-required");

            setTimeout(() => {
                turnstileHost.closest(
                    ".comments__turnstile"
                )?.classList.remove("is-required");
            }, 500);

            return;
        }

        const data = new FormData(form);

        const payload = {
            post_id: postId,
            author: String(data.get("author") || ""),
            body: String(data.get("body") || ""),
            website: String(data.get("website") || ""),
            turnstile_token: turnstileToken,
        };

        setSubmitting(true);
        setMessage("送信しています…");

        try {
            const response = await fetch(
                `${config.apiBase}/api/comments`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "コメントを送信できませんでした。"
                );
            }

            form.reset();
            updateCharCount();

            turnstileToken = "";

            if (
                turnstileId !== null &&
                window.turnstile
            ) {
                window.turnstile.reset(turnstileId);
            }

            await loadComments({
                fresh: true,
            });

            setMessage(
                "コメントを投稿しました。"
            );
        } catch (error) {
            setMessage(
                error.message,
                true
            );
        } finally {
            setSubmitting(false);
        }
    });

    updateCharCount();
    loadComments();
    initTurnstile();
})();
