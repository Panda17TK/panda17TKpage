/* =============================================================
   エントリポイント：シーンと UI を起動
   ============================================================= */
(function () {
    "use strict";

    // 低性能端末向けの品質ティア：描画解像度・雲のオクターブ・灯数を下げて軽量化。
    // ?hq を付けると無効化（高品質を強制）。?dev のチューニングより前に適用する。
    // タッチ主体（≒モバイル）か、低コアかつ低メモリのときだけ「非力」とみなす。
    // （旧実装の「狭幅 or 低コア」のOR結合は 1366×768 のノートPC等を誤爆していた。
    //   取りこぼしはシーン側の実測FPSによる自動段階ダウンが拾う）
    function tuneForDevice(cfg) {
        if (/[?&]hq\b/.test(location.search)) return;
        var nav = typeof navigator !== "undefined" ? navigator : {};
        var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var fewCores = nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4;
        var lowMem = nav.deviceMemory > 0 && nav.deviceMemory <= 4;   // GiB（対応ブラウザのみ）
        if (coarse || (fewCores && lowMem)) {
            cfg.pixelRows = Math.max(180, Math.round(cfg.pixelRows * 0.66));
            cfg.cloudOctaves = Math.min(cfg.cloudOctaves, 2);
            cfg.lampCount = Math.min(cfg.lampCount, 12);
        }
    }

    // 「今日のドライブ」：日付シードで天気（濡れ・霧・雲）を日替わりにし、
    // 月は実際の月齢どおりに満ち欠けさせる。訪れる日によって夜の表情が変わる。
    function applyDailyWeather(cfg) {
        var d = new Date();
        var s = (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) >>> 0;
        function rnd() {   // xorshift32：日付から決定的に同じ列を返す
            s ^= s << 13; s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5; s >>>= 0;
            return s / 4294967296;
        }
        rnd(); rnd();   // 日付シードの偏りを捨てるウォームアップ
        cfg.wetness      = 0.08 + rnd() * 0.50;    // 乾いた夜〜雨上がり
        cfg.fogDensity   = 0.007 + rnd() * 0.011;  // 澄んだ夜〜靄の夜
        cfg.cloudOpacity = 0.10 + rnd() * 0.32;
        cfg.cloudCover   = 0.42 + rnd() * 0.28;

        // 月齢（朔望月 29.53日）→ 影円のオフセット。0=新月, ±2.2=満月
        var SYNODIC = 29.53058867;
        var days = (Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;  // 2000-01-06 は新月
        var phase = ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
        var illum = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
        cfg.moonShadowX = (phase < 0.5 ? -1 : 1) * 2.2 * illum;   // 満ちる間は左側から明るく
    }

    // オドメーター：走行距離を localStorage に累積し、フッターに km 表示する
    function initOdometer(scene) {
        var wrap = document.getElementById("odo");
        var el = document.getElementById("odometer");
        if (!wrap || !el) return;
        var base = 0;
        try { base = parseFloat(localStorage.getItem("nh-odometer-m")) || 0; } catch (e) { /* 参照不可なら 0 から */ }
        function total() { return base + scene.distance(); }
        function show() { el.textContent = (total() / 1000).toFixed(1); }
        function persist() {
            try { localStorage.setItem("nh-odometer-m", String(total())); } catch (e) { /* 保存不可は無視 */ }
        }
        show();
        wrap.hidden = false;
        setInterval(show, 1000);
        setInterval(persist, 10000);
        window.addEventListener("pagehide", persist);
    }

    var canvas = document.getElementById("bg");
    if (canvas && window.NH && NH.createScene) {
        tuneForDevice(NH.config);
        applyDailyWeather(NH.config);
        var scene = NH.createScene(canvas, NH.config);
        if (scene) {
            scene.applyConfig();
            scene.resize();
            scene.start();
            initOdometer(scene);
            // パッシング：リンク等の操作以外の場所をクリックしたらハイビーム
            document.addEventListener("click", function (e) {
                if (e.target.closest && e.target.closest("a, button, input, select, textarea, label")) return;
                scene.flash();
            });
            // ?dev のときだけ調整パネルを動的ロード（通常表示では一切読み込まない）
            if (/[?&]dev\b/.test(location.search)) {
                var s = document.createElement("script");
                // ドキュメント相対だと /blog/ 配下で 404 になるため、
                // 読み込み済みの app.js の URL から兄弟ファイルとして解決する
                var appScript = document.querySelector('script[src$="app.js"]');
                s.src = appScript
                    ? appScript.src.replace(/app\.js$/, "devpanel.js")
                    : "js/devpanel.js";
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
