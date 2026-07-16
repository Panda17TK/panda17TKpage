/* =============================================================
   管理画面の GitHub Contents API 層（NH.adminGh）
   - 認証は Fine-grained PAT（このブラウザの localStorage にのみ保存。
     リポジトリには一切秘密情報を置かない）
   - UTF-8 対応 base64（Contents API は base64 本文）もここに置く
   ============================================================= */
window.NH = window.NH || {};

NH.adminGh = (function () {
    "use strict";

    var OWNER = "sasanoha-tk";
    var REPO = "sasanoha-tk.github.io";
    var API = "https://api.github.com";
    var TOKEN_KEY = "nh-admin-token";

    function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
    function setToken(v) { localStorage.setItem(TOKEN_KEY, v); }
    function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* noop */ } }

    function b64decode(b64) {
        var bin = atob(b64.replace(/\n/g, ""));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }
    function b64encode(str) {
        var bytes = new TextEncoder().encode(str);
        var bin = "";
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function api(path, opts) {
        opts = opts || {};
        opts.headers = {
            "Authorization": "Bearer " + token(),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        };
        return fetch(API + path, opts).then(function (res) {
            if (res.status === 401) {
                throw new Error("認証エラー（401）。トークンが無効か期限切れです。発行し直してください");
            }
            if (res.status === 403) {
                throw new Error("権限エラー（403）。トークンの Permissions で「Contents: Read and write」を付与し、" +
                    "Repository access に " + REPO + " を含めてください");
            }
            if (!res.ok) throw new Error("GitHub API エラー: " + res.status + " " + path);
            return res.json();
        });
    }

    // リポジトリ内パス → Contents API のエンドポイント
    function contents(path) { return "/repos/" + OWNER + "/" + REPO + "/contents/" + path; }

    return {
        POSTS_DIR: "blog/posts",
        token: token,
        setToken: setToken,
        clearToken: clearToken,
        b64decode: b64decode,
        b64encode: b64encode,
        api: api,
        contents: contents
    };
})();
