/* =============================================================
   フロントマター処理（ビルド make-blog.js / new-post.js と
   管理画面 admin.js で共有。YAML サブセット）
   - parse: 先頭の --- key: value --- ブロックを取り出す
   - serialize: 正規の並び（title/date/description/tags/draft）で書き戻す。
     変更が無ければバイト単位で同一になる（無駄な diff を作らない）
   - Node からは require、ブラウザでは NH.frontmatter として使える
   ============================================================= */
/* global module */
(function (root) {
    "use strict";

    var KNOWN = ["title", "date", "description", "tags", "draft"];

    function parse(src) {
        var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
        if (!m) return { meta: {}, body: src };
        var meta = {};
        m[1].split(/\r?\n/).forEach(function (line) {
            var i = line.indexOf(":");
            if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        });
        return { meta: meta, body: src.slice(m[0].length) };
    }

    function isDraft(v) { return /^(true|yes)$/i.test(v || ""); }

    function serialize(meta, body) {
        var lines = ["---",
            "title: " + (meta.title || ""),
            "date: " + (meta.date || ""),
            "description: " + (meta.description || ""),
            "tags: " + (meta.tags || "")];
        if (isDraft(meta.draft)) lines.push("draft: true");
        // 既知キー以外（将来の拡張フィールド）も失わず残す
        Object.keys(meta).forEach(function (k) {
            if (KNOWN.indexOf(k) < 0) lines.push(k + ": " + meta[k]);
        });
        lines.push("---", "");
        return lines.join("\n") + body;
    }

    // "tags: a, b" → ["a", "b"]（重複・空要素は除去）
    function parseTags(s) {
        var seen = {};
        return String(s || "").split(",").map(function (t) { return t.trim(); })
            .filter(function (t) { return t && !seen[t] && (seen[t] = true); });
    }

    var fm = { parse: parse, serialize: serialize, isDraft: isDraft, parseTags: parseTags };
    if (typeof module !== "undefined" && module.exports) module.exports = fm;
    else { root.NH = root.NH || {}; root.NH.frontmatter = fm; }
})(typeof window !== "undefined" ? window : this);
