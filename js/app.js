/* =============================================================
   エントリポイント：シーンと UI を起動
   ============================================================= */
(function () {
    "use strict";

    var canvas = document.getElementById("bg");
    if (canvas && window.NH && NH.createScene) {
        var scene = NH.createScene(canvas, NH.config);
        if (scene) {
            scene.applyConfig();
            scene.resize();
            scene.start();
            // ?dev でパラメータ調整パネルを表示
            if (/[?&]dev\b/.test(location.search) && NH.createDevPanel) {
                NH.createDevPanel(NH.config, scene, NH.schema);
            }
        } else {
            // WebGL 不可 → CSS のフォールバック背景に任せる
            console.warn("WebGL unavailable; using CSS fallback background.");
        }
    }

    if (window.NH && NH.initUI) NH.initUI();
})();
