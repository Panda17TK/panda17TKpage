/* =============================================================
   エントリポイント：シーンと UI を起動
   ============================================================= */
(function () {
    "use strict";

    // 低性能端末向けの品質ティア：描画解像度・雲のオクターブ・灯数を下げて軽量化。
    // ?hq を付けると無効化（高品質を強制）。?dev のチューニングより前に適用する。
    function tuneForDevice(cfg) {
        if (/[?&]hq\b/.test(location.search)) return;
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var narrow = Math.min(window.innerWidth, window.innerHeight) <= 768;
        var fewCores = typeof navigator !== "undefined" && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
        if (coarse || narrow || fewCores) {
            cfg.pixelRows = Math.max(180, Math.round(cfg.pixelRows * 0.66));
            cfg.cloudOctaves = Math.min(cfg.cloudOctaves, 2);
            cfg.lampCount = Math.min(cfg.lampCount, 12);
        }
    }

    var canvas = document.getElementById("bg");
    if (canvas && window.NH && NH.createScene) {
        tuneForDevice(NH.config);
        var scene = NH.createScene(canvas, NH.config);
        if (scene) {
            scene.applyConfig();
            scene.resize();
            scene.start();
            // ?dev でパラメータ調整パネルを表示
            if (/[?&]dev\b/.test(location.search) && NH.createDevPanel) {
                NH.createDevPanel(NH.config, scene, NH.PARAMS);
            }
        } else {
            // WebGL 不可 → CSS のフォールバック背景に任せる
            console.warn("WebGL unavailable; using CSS fallback background.");
        }
    }

    if (window.NH && NH.initUI) NH.initUI();
})();
