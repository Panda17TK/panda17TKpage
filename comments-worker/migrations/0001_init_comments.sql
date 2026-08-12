CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '匿名',
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('published', 'hidden', 'deleted')),
    created_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ),
    updated_at TEXT
);

CREATE INDEX idx_comments_post_status_created
ON comments(post_id, status, created_at);

CREATE INDEX idx_comments_status_created
ON comments(status, created_at);
