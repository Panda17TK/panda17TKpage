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
    const turnstileHost = root.querySelector("[data-turnstile]");

    let turnstileId = null;
    let turnstileToken = "";

    function setMessage(text, isError = false) {
        message.textContent = text;
        message.dataset.error = isError ? "true" : "false";
    }

    function renderComment(comment) {
        const article = document.createElement("article");
        article.className = "comment";

        const header = document.createElement("div");
        header.className = "comment__header";

        const author = document.createElement("strong");
        author.className = "comment__author";
        author.textContent = comment.author || "匿名";

        const time = document.createElement("time");
        time.className = "comment__time";

        const date = new Date(comment.created_at);

        if (!Number.isNaN(date.getTime())) {
            time.dateTime = comment.created_at;
            time.textContent = new Intl.DateTimeFormat("ja-JP", {
                dateStyle: "medium",
                timeStyle: "short",
            }).format(date);
        }

        const body = document.createElement("p");
        body.className = "comment__body";

        // XSS対策: innerHTMLを使わない
        body.textContent = comment.body;

        header.append(author, time);
        article.append(header, body);

        return article;
    }

    async function loadComments() {
        list.textContent = "";

        try {
            const response = await fetch(
                `${config.apiBase}/api/comments?post_id=${encodeURIComponent(postId)}`
            );

            if (!response.ok) {
                throw new Error("コメントを取得できませんでした");
            }

            const data = await response.json();
            const comments = data.comments || [];

            if (!comments.length) {
                const empty = document.createElement("p");
                empty.className = "comments__empty";
                empty.textContent = "まだコメントはありません。";
                list.append(empty);
                return;
            }

            for (const comment of comments) {
                list.append(renderComment(comment));
            }
        } catch (error) {
            const p = document.createElement("p");
            p.className = "comments__error";
            p.textContent = error.message;
            list.append(p);
        }
    }

    function initTurnstile() {
        if (!window.turnstile) {
            setTimeout(initTurnstile, 100);
            return;
        }

        turnstileId = window.turnstile.render(turnstileHost, {
            sitekey: config.turnstileSiteKey,
            theme: "dark",
            action: "comment",

            callback(token) {
                turnstileToken = token;
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
        });
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!turnstileToken) {
            setMessage("bot確認を完了してください。", true);
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

        const button = form.querySelector("button[type=submit]");

        button.disabled = true;
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
                    result.error || "コメントを送信できませんでした"
                );
            }

            form.reset();
            turnstileToken = "";

            if (
                turnstileId !== null &&
                window.turnstile
            ) {
                window.turnstile.reset(turnstileId);
            }

            setMessage("コメントを投稿しました。");

            await loadComments();
        } catch (error) {
            setMessage(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    loadComments();
    initTurnstile();
})();
