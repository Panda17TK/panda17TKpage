/* =============================================================
   画像ギャラリー変換（ビルド make-blog.js と管理画面プレビューで共有）
   - marked が出力した HTML 中で「画像だけの段落」が連続する箇所を
     <div class="post-gallery"> にまとめ、CSS グリッドで自動整列させる
   - 1枚だけの画像は段落のまま（img-s/m/l のサイズ指定を尊重）
   - Node からは require、ブラウザでは NH.groupImages として使える
   ============================================================= */
/* global module */
(function (root) {
    "use strict";

    var IMG = "<img[^>]*>";

    function wrap(block) {
        var imgs = block.match(new RegExp(IMG, "g")) || [];
        return '<div class="post-gallery">\n' + imgs.join("\n") + "\n</div>\n";
    }

    function groupImages(html) {
        // 1) 画像のみの段落をほどいて素の <img> にする
        //    （Markdown 記法 ![](url) は <p> に包まれる。生 HTML の <img> は元から素）
        html = html.replace(
            new RegExp("<p>((?:\\s*" + IMG + ")+\\s*)</p>", "g"),
            "$1"
        );
        // 2) 空白のみを挟んで連続する <img> が2枚以上 → ギャラリーに整列
        html = html.replace(
            new RegExp("(?:" + IMG + "\\s*){2,}", "g"),
            wrap
        );
        return html;
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = groupImages;
    } else {
        root.NH = root.NH || {};
        root.NH.groupImages = groupImages;
    }
})(typeof window !== "undefined" ? window : this);
