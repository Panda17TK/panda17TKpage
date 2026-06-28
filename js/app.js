/* =============================================================
   エントリポイント：シーンと UI を起動
   ============================================================= */
(function () {
    "use strict";

    // 低性能端末向けの品質ティア：描画解像度・雲のオクターブ・灯数を下げて軽量化。
    // ?hq を付けると無効化（高品質を強制）。?dev のチューニングより前に適用する。
    // 単一の指標では誤判定しやすいので、タッチ主体・狭幅・低コア・低メモリの
    // いずれかに当てはまれば「非力」とみなす（GPU性能の近似シグナルを複数併用）。
    function tuneForDevice(cfg) {
        if (/[?&]hq\b/.test(location.search)) return;
        var nav = typeof navigator !== "undefined" ? navigator : {};
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var narrow = Math.min(window.innerWidth, window.innerHeight) <= 768;
        var fewCores = nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4;
        var lowMem = nav.deviceMemory > 0 && nav.deviceMemory <= 4;   // GiB（対応ブラウザのみ）
        if (coarse || narrow || fewCores || lowMem) {
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
            // ?dev のときだけ調整パネルを動的ロード（通常表示では一切読み込まない）
            if (/[?&]dev\b/.test(location.search)) {
                var s = document.createElement("script");
                s.src = "js/devpanel.js";
                s.onload = function () {
                    if (NH.createDevPanel) NH.createDevPanel(NH.config, scene, NH.PARAMS);
                };
                document.head.appendChild(s);
            }
        } else {
            // WebGL 不可 → CSS のフォールバック背景に任せる
            console.warn("WebGL unavailable; using CSS fallback background.");
        }
    }

    if (window.NH && NH.initUI) NH.initUI();
})();
