/* =============================================================
   夜の高速道路シェーダー背景 — パラメータの単一ソース
   -------------------------------------------------------------
   NH.PARAMS が唯一の定義表。ここに1項目足すだけで
     - シェーダーの uniform 宣言
     - uniform への値設定
     - ?dev パネルのコントロール
   がすべて自動生成される（追記箇所はシェーダー本文での使用のみ）。

   各 descriptor:
     key      : NH.config 上のキー（JS からも参照可）
     def      : 既定値
     uniform  : 対応する GLSL uniform 名（省略時は JS 専用パラメータ）
     type     : 'float' | 'int' | 'bool' | 'color'
     map      : config値 → uniform値 への変換関数（任意）
     ui       : ?dev パネル用 { min,max,step } / { color:true } / { bool:true }

   調整値を残したいときは下の NH.OVERRIDES に貼り戻す
   （?dev パネルの "Copy config JSON" が出力する）。
   ============================================================= */
window.NH = window.NH || {};

var D2R = Math.PI / 180;

NH.PARAMS = [
    // --- 動き（JS専用：uniform 無し）---
    { key: "speed",         def: 16.0,  ui: { min: 0, max: 60, step: 0.5 } },
    { key: "swaySpeed",     def: 0.25,  ui: { min: 0, max: 1, step: 0.05 } },

    // --- カメラ ---
    { key: "camHeight",     def: 1.4,   uniform: "u_camHeight",     type: "float", ui: { min: 0.2, max: 10, step: 0.1 } },
    { key: "pitchDeg",      def: 2.0,   uniform: "u_pitch",         type: "float", map: function (v) { return v * D2R; }, ui: { min: -10, max: 20, step: 0.5 } },
    { key: "fovDeg",        def: 55.0,  uniform: "u_fovTan",        type: "float", map: function (v) { return Math.tan(v * D2R * 0.5); }, ui: { min: 30, max: 90, step: 1 } },
    { key: "laneOffset",    def: -4.0,  uniform: "u_camX",          type: "float", ui: { min: -12, max: 12, step: 0.5 } },

    // --- 道路 ---
    { key: "roadHalfWidth", def: 8.0,   uniform: "u_roadHalfWidth", type: "float", ui: { min: 2, max: 20, step: 0.5 } },
    { key: "dashLength",    def: 6.0,   uniform: "u_dashLength",    type: "float", ui: { min: 1, max: 20, step: 0.5 } },
    { key: "laneEdge",      def: 0.93,  uniform: "u_laneEdge",      type: "float", ui: { min: 0.5, max: 1.0, step: 0.01 } },
    { key: "swayAmount",    def: 0.0,   uniform: "u_swayAmount",    type: "float", ui: { min: 0, max: 0.02, step: 0.001 } },

    // --- 道路照明灯 ---
    { key: "lampSpacing",   def: 30.0,  uniform: "u_lampSpacing",   type: "float", ui: { min: 5, max: 80, step: 1 } },
    { key: "lampSide",      def: 2.0,   uniform: "u_lampSide",      type: "float", ui: { min: 0, max: 10, step: 0.25 } },
    { key: "poleHeight",    def: 10.0,  uniform: "u_poleHeight",    type: "float", ui: { min: 2, max: 20, step: 0.5 } },
    { key: "lampCount",     def: 16,    uniform: "u_lampCount",     type: "int",   ui: { min: 1, max: 32, step: 1 } },
    { key: "lampFade",      def: 0.80,  uniform: "u_lampFade",      type: "float", ui: { min: 0, max: 1, step: 0.01 } }, // 最遠の灯をフェードし始める割合
    { key: "glowSize",      def: 0.012, uniform: "u_glowSize",      type: "float", ui: { min: 0.002, max: 0.05, step: 0.001 } },
    { key: "tail",          def: 0.16,  uniform: "u_tail",          type: "float", ui: { min: 0.0, max: 0.6, step: 0.01 } },
    { key: "glowBright",    def: 2.0,   uniform: "u_glowBright",    type: "float", ui: { min: 0.2, max: 5, step: 0.1 } },
    { key: "poleWidth",     def: 0.0030, uniform: "u_poleWidth",    type: "float", ui: { min: 0.001, max: 0.02, step: 0.0005 } },
    { key: "poolIntensity", def: 0.02,  uniform: "u_poolIntensity", type: "float", ui: { min: 0, max: 1, step: 0.01 } },

    // --- 大気 / 見た目（旧ハードコード値を config 化）---
    { key: "fogDensity",    def: 0.012, uniform: "u_fogDensity",    type: "float", ui: { min: 0, max: 0.05, step: 0.001 } },
    { key: "hazeSharp",     def: 220.0, uniform: "u_hazeSharp",     type: "float", ui: { min: 20, max: 600, step: 10 } },
    { key: "hazeIntensity", def: 0.45,  uniform: "u_hazeIntensity", type: "float", ui: { min: 0, max: 1.5, step: 0.05 } },
    { key: "skyCurve",      def: 0.60,  uniform: "u_skyCurve",      type: "float", ui: { min: 0.2, max: 1.5, step: 0.05 } },
    { key: "pixelRows",     def: 340,   ui: { min: 80, max: 600, step: 10 } },     // JS専用（描画解像度）
    { key: "paletteSteps",  def: 22,    uniform: "u_paletteSteps",  type: "float", ui: { min: 2, max: 64, step: 1 } },

    // --- 月 ---
    { key: "moon",          def: true,  uniform: "u_moon",          type: "bool",  ui: { bool: true } },
    { key: "moonX",         def: 0.30,  uniform: "u_moonX",         type: "float", ui: { min: 0, max: 1, step: 0.01 } },
    { key: "moonY",         def: 0.82,  uniform: "u_moonY",         type: "float", ui: { min: 0.3, max: 1, step: 0.01 } },
    { key: "moonSize",      def: 0.06,  uniform: "u_moonSize",      type: "float", ui: { min: 0.01, max: 0.2, step: 0.005 } },

    // --- 色 ---
    { key: "skyTop",     def: [0.005, 0.005, 0.03], uniform: "u_skyTop",     type: "color", ui: { color: true } },
    { key: "skyHorizon", def: [0.05, 0.06, 0.12],   uniform: "u_skyHorizon", type: "color", ui: { color: true } },
    { key: "ground",     def: [0.05, 0.07, 0.06],   uniform: "u_ground",     type: "color", ui: { color: true } },
    { key: "asphalt",    def: [0.13, 0.13, 0.16],   uniform: "u_asphalt",    type: "color", ui: { color: true } },
    { key: "laneCol",    def: [0.90, 0.92, 0.97],   uniform: "u_laneCol",    type: "color", ui: { color: true } },
    { key: "lampCol",    def: [1.00, 0.72, 0.36],   uniform: "u_lampCol",    type: "color", ui: { color: true } },
    { key: "hazeCol",    def: [0.22, 0.13, 0.06],   uniform: "u_hazeCol",    type: "color", ui: { color: true } },
    { key: "moonCol",    def: [0.95, 0.95, 0.85],   uniform: "u_moonCol",    type: "color", ui: { color: true } },
    { key: "poleCol",    def: [0.04, 0.04, 0.05],   uniform: "u_poleCol",    type: "color", ui: { color: true } }
];

// 調整済みの値を残すならここに（"Copy config JSON" の出力を貼る）
NH.OVERRIDES = {};

// PARAMS + OVERRIDES から検証済みの flat config を生成
NH.buildConfig = function (params, overrides) {
    overrides = overrides || {};

    function num(v, def, ui) {
        if (typeof v !== "number" || !isFinite(v)) v = def;
        if (ui && typeof ui.min === "number") v = Math.max(ui.min, Math.min(ui.max, v));
        return v;
    }
    function color(v, def) {
        if (!Array.isArray(v) || v.length < 3) return def.slice();
        var out = [];
        for (var i = 0; i < 3; i++) {
            var n = v[i];
            out[i] = (typeof n === "number" && isFinite(n)) ? Math.max(0, Math.min(1, n)) : def[i];
        }
        return out;
    }

    var cfg = {};
    for (var i = 0; i < params.length; i++) {
        var p = params[i];
        var raw = Object.prototype.hasOwnProperty.call(overrides, p.key) ? overrides[p.key] : p.def;
        if (p.type === "color") cfg[p.key] = color(raw, p.def);
        else if (p.type === "bool") cfg[p.key] = !!raw;
        else if (p.type === "int") cfg[p.key] = Math.round(num(raw, p.def, p.ui));
        else cfg[p.key] = num(raw, p.def, p.ui);
    }
    return cfg;
};

NH.config = NH.buildConfig(NH.PARAMS, NH.OVERRIDES);
