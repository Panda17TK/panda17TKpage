"use strict";

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function allowedOrigins(env) {
    return new Set(
        String(env.ALLOWED_ORIGINS || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    );
}

function corsHeaders(request, env) {
    const origin = request.headers.get("Origin");

    if (!origin || !allowedOrigins(env).has(origin)) {
        return {};
    }

    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
}

function json(request, env, value, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            ...corsHeaders(request, env),
        },
    });
}

function requirePublicOrigin(request, env) {
    const origin = request.headers.get("Origin");

    if (!origin || !allowedOrigins(env).has(origin)) {
        throw new ApiError(403, "Origin not allowed");
    }
}

function requireAdmin(request, env) {
    const auth = request.headers.get("Authorization");

    if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        throw new ApiError(401, "Unauthorized");
    }
}

async function parseJson(request) {
    const type = request.headers.get("Content-Type") || "";

    if (!type.includes("application/json")) {
        throw new ApiError(415, "application/json required");
    }

    try {
        return await request.json();
    } catch {
        throw new ApiError(400, "Invalid JSON");
    }
}

function normalizePostId(value) {
    const postId = String(value || "").trim();

    if (!postId || postId.length > 200) {
        throw new ApiError(400, "Invalid post_id");
    }

    if (!postId.startsWith("/blog/")) {
        throw new ApiError(400, "Invalid post_id");
    }

    return postId;
}

async function verifyTurnstile(request, env, token) {
    if (!token) {
        throw new ApiError(400, "Turnstile token required");
    }

    const body = new FormData();
    body.append("secret", env.TURNSTILE_SECRET);
    body.append("response", token);

    const ip = request.headers.get("CF-Connecting-IP");

    if (ip) {
        body.append("remoteip", ip);
    }

    const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
            method: "POST",
            body,
        }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new ApiError(403, "Turnstile validation failed");
    }

    if (result.action !== "comment") {
        throw new ApiError(403, "Invalid Turnstile action");
    }

    const hosts = new Set(
        String(env.TURNSTILE_ALLOWED_HOSTNAMES || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    );

    if (!hosts.has(result.hostname)) {
        throw new ApiError(403, "Invalid Turnstile hostname");
    }
}

async function listComments(request, env, url) {
    const postId = normalizePostId(url.searchParams.get("post_id"));

    const result = await env.DB.prepare(`
        SELECT
            id,
            post_id,
            author,
            body,
            created_at
        FROM comments
        WHERE post_id = ?
          AND status = 'published'
        ORDER BY created_at ASC, id ASC
        LIMIT 500
    `)
        .bind(postId)
        .all();

    return json(request, env, {
        comments: result.results || [],
    });
}

async function createComment(request, env) {
    requirePublicOrigin(request, env);

    const data = await parseJson(request);

    if (data.website) {
        throw new ApiError(400, "Invalid submission");
    }

    const postId = normalizePostId(data.post_id);

    let author = String(data.author || "").trim();
    let body = String(data.body || "").trim();

    if (!author) {
        author = "匿名";
    }

    if (author.length > 40) {
        throw new ApiError(400, "名前は40文字以内です");
    }

    if (!body || body.length > 3000) {
        throw new ApiError(400, "コメントは1〜3000文字です");
    }

    await verifyTurnstile(
        request,
        env,
        String(data.turnstile_token || "")
    );

    const result = await env.DB.prepare(`
        INSERT INTO comments (
            post_id,
            author,
            body,
            status
        )
        VALUES (?, ?, ?, 'published')
    `)
        .bind(postId, author, body)
        .run();

    return json(
        request,
        env,
        {
            ok: true,
            id: result.meta?.last_row_id ?? null,
        },
        201
    );
}

async function listAdminComments(request, env, url) {
    requireAdmin(request, env);

    const status = url.searchParams.get("status");

    let query = `
        SELECT
            id,
            post_id,
            author,
            body,
            status,
            created_at,
            updated_at
        FROM comments
    `;

    const bindings = [];

    if (status) {
        if (!["published", "hidden", "deleted"].includes(status)) {
            throw new ApiError(400, "Invalid status");
        }

        query += " WHERE status = ?";
        bindings.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT 1000";

    const statement = env.DB.prepare(query);

    const result = bindings.length
        ? await statement.bind(...bindings).all()
        : await statement.all();

    return json(request, env, {
        comments: result.results || [],
    });
}

async function updateAdminComment(request, env, id) {
    requireAdmin(request, env);

    const data = await parseJson(request);
    const fields = [];
    const bindings = [];

    if (Object.prototype.hasOwnProperty.call(data, "status")) {
        const status = String(data.status || "");

        if (!["published", "hidden", "deleted"].includes(status)) {
            throw new ApiError(400, "Invalid status");
        }

        fields.push("status = ?");
        bindings.push(status);
    }

    if (Object.prototype.hasOwnProperty.call(data, "author")) {
        let author = String(data.author || "").trim();

        if (!author) {
            author = "\u533F\u540D";
        }

        if (author.length > 40) {
            throw new ApiError(400, "Author must be 40 characters or fewer");
        }

        fields.push("author = ?");
        bindings.push(author);
    }

    if (Object.prototype.hasOwnProperty.call(data, "body")) {
        const body = String(data.body || "").trim();

        if (!body || body.length > 3000) {
            throw new ApiError(400, "Comment must be 1 to 3000 characters");
        }

        fields.push("body = ?");
        bindings.push(body);
    }

    if (!fields.length) {
        throw new ApiError(400, "No changes supplied");
    }

    fields.push(
        "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
    );
    bindings.push(id);

    const result = await env.DB.prepare(`
        UPDATE comments
        SET ${fields.join(", ")}
        WHERE id = ?
    `)
        .bind(...bindings)
        .run();

    if (!result.meta?.changes) {
        throw new ApiError(404, "Comment not found");
    }

    return json(request, env, { ok: true });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        try {
            if (request.method === "OPTIONS") {
                requirePublicOrigin(request, env);

                return new Response(null, {
                    status: 204,
                    headers: corsHeaders(request, env),
                });
            }

            if (url.pathname === "/health") {
                return json(request, env, { ok: true });
            }

            if (url.pathname === "/api/comments") {
                if (request.method === "GET") {
                    return await listComments(request, env, url);
                }

                if (request.method === "POST") {
                    return await createComment(request, env);
                }
            }

            if (
                url.pathname === "/api/admin/comments" &&
                request.method === "GET"
            ) {
                return await listAdminComments(request, env, url);
            }

            const match = url.pathname.match(
                /^\/api\/admin\/comments\/(\d+)$/
            );

            if (match && request.method === "PATCH") {
                return await updateAdminComment(
                    request,
                    env,
                    Number(match[1])
                );
            }

            throw new ApiError(404, "Not found");
        } catch (error) {
            if (error instanceof ApiError) {
                return json(request, env, {
                    error: error.message,
                }, error.status);
            }

            console.error(error);

            return json(request, env, {
                error: "Internal server error",
            }, 500);
        }
    },
};
