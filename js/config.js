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
    { key: "cityFlowRate",  def: 0.3,   ui: { min: 0, max: 1, step: 0.05 } },  // 都市の揺れ速度（swaySpeed に対する倍率。JS で u_cityPhase を生成）
    { key: "citySpeed",     def: 0.015, ui: { min: 0, max: 0.2, step: 0.005 } }, // 前進に伴う遠景都市の平行移動速度（アスペクトX/秒。JS で u_cityScroll を生成）

    // --- 対向車（JS専用：たまに反対車線を走る）---
    { key: "carMinGap",     def: 40.0,  ui: { min: 5, max: 120, step: 1 } },   // 出現間隔の最小(秒)
    { key: "carMaxGap",     def: 120.0, ui: { min: 10, max: 300, step: 5 } },  // 出現間隔の最大(秒)
    { key: "carSpeed",      def: 42.0,  ui: { min: 10, max: 90, step: 1 } },   // 相対接近速度(m/s)
    { key: "carSpawnDist",  def: 235.0, ui: { min: 60, max: 400, step: 5 } },  // 出現距離(m)

    // --- カメラ ---
    { key: "camHeight",     def: 1.4,   uniform: "u_camHeight",     type: "float", ui: { min: 0.2, max: 10, step: 0.1 } },
    { key: "pitchDeg",      def: 2.0,   uniform: "u_pitch",         type: "float", map: function (v) { return v * D2R; }, ui: { min: -10, max: 20, step: 0.5 } },
    { key: "fovDeg",        def: 55.0,  uniform: "u_fovTan",        type: "float", map: function (v) { return Math.tan(v * D2R * 0.5); }, ui: { min: 30, max: 90, step: 1 } },
    { key: "laneOffset",    def: -7.0,  uniform: "u_camX",          type: "float", ui: { min: -12, max: 12, step: 0.5 } }, // 一番左の車線

    // --- 道路 ---
    { key: "roadHalfWidth", def: 10.0,  uniform: "u_roadHalfWidth", type: "float", ui: { min: 2, max: 20, step: 0.5 } },
    { key: "lanes",         def: 4,     uniform: "u_laneCount",     type: "int",   ui: { min: 1, max: 8, step: 1 } },   // 車線数（2+2を中央分離帯で区切る）
    { key: "roadRaise",     def: 0.25,  uniform: "u_roadRaise",     type: "float", ui: { min: 0, max: 2, step: 0.05 } },  // 外の地面より道路を高く
    { key: "dashLength",    def: 14.0,  uniform: "u_dashLength",    type: "float", ui: { min: 1, max: 30, step: 0.5 } },
    { key: "dashDuty",      def: 0.32,  uniform: "u_dashDuty",      type: "float", ui: { min: 0.1, max: 0.9, step: 0.02 } }, // 塗り割合（小さいほど隙間が長い）
    { key: "laneEdge",      def: 0.93,  uniform: "u_laneEdge",      type: "float", ui: { min: 0.5, max: 1.0, step: 0.01 } },
    { key: "swayAmount",    def: 0.006, uniform: "u_swayAmount",    type: "float", ui: { min: 0, max: 0.02, step: 0.001 } },  // 進路の緩やかなカーブ（0で直線）

    // --- 道路脇の塀（左右の垂直な壁）---
    { key: "wall",          def: true,  uniform: "u_wall",          type: "bool",  ui: { bool: true } },
    { key: "wallHeight",    def: 1.6,   uniform: "u_wallHeight",    type: "float", ui: { min: 0.2, max: 4, step: 0.1 } },   // 塀の高さ(m)
    { key: "wallOffset",    def: 0.5,   uniform: "u_wallOffset",    type: "float", ui: { min: 0, max: 4, step: 0.1 } },     // 路端から塀までの距離(m)
    { key: "wallLight",     def: 0.3,   uniform: "u_wallLight",     type: "float", ui: { min: 0, max: 1, step: 0.05 } },   // 塀ピクセルでの灯ライトの残し量（小さいほど塀越しの滲みが減る）
    { key: "medianHeight",  def: 0.9,   uniform: "u_medianHeight",  type: "float", ui: { min: 0, max: 2, step: 0.05 } },  // 中央分離帯ガードレールの高さ(m)
    { key: "reflectorBright", def: 1.5, uniform: "u_reflectorBright", type: "float", ui: { min: 0, max: 4, step: 0.1 } }, // 塀の反射板（デリニエータ）の明るさ

    // --- 対向車（セダン）---
    { key: "carHeadH",      def: 0.62,  uniform: "u_carHeadH",      type: "float", ui: { min: 0.2, max: 1.5, step: 0.05 } }, // ヘッドライトの高さ(m)
    { key: "carTrack",      def: 0.66,  uniform: "u_carTrack",      type: "float", ui: { min: 0.3, max: 1.5, step: 0.05 } }, // 左右ライトの間隔(半幅, m)
    { key: "carHeadSize",   def: 0.014, uniform: "u_carHeadSize",   type: "float", ui: { min: 0.005, max: 0.06, step: 0.001 } },
    { key: "carHeadBright", def: 3.0,   uniform: "u_carHeadBright", type: "float", ui: { min: 0.5, max: 8, step: 0.1 } },
    { key: "carBodyBright", def: 0.42,  uniform: "u_carBodyBright", type: "float", ui: { min: 0, max: 1.5, step: 0.02 } },   // 夜間のボディの明るさ

    // --- 道路照明灯 ---
    { key: "lampSpacing",   def: 30.0,  uniform: "u_lampSpacing",   type: "float", ui: { min: 5, max: 80, step: 1 } },
    { key: "lampSide",      def: 0.5,   uniform: "u_lampSide",      type: "float", ui: { min: 0, max: 10, step: 0.25 } }, // 路端からの支柱位置（塀と同じ＝0.5）
    { key: "lampArm",       def: 2.6,   uniform: "u_lampArm",       type: "float", ui: { min: 0, max: 8, step: 0.2 } },  // アームで車道側へ張り出す長さ(m)
    { key: "poleHeight",    def: 10.0,  uniform: "u_poleHeight",    type: "float", ui: { min: 2, max: 20, step: 0.5 } },
    { key: "lampCount",     def: 16,    uniform: "u_lampCount",     type: "int",   ui: { min: 1, max: 32, step: 1 } },
    { key: "lampFade",      def: 0.80,  uniform: "u_lampFade",      type: "float", ui: { min: 0, max: 1, step: 0.01 } }, // 最遠の灯をフェードし始める割合
    { key: "lampCore",      def: 5.2,   uniform: "u_lampCore",      type: "float", ui: { min: 0, max: 8, step: 0.1 } },  // ランプ頭部の白熱コア（明かり）
    { key: "glowSize",      def: 0.012, uniform: "u_glowSize",      type: "float", ui: { min: 0.002, max: 0.05, step: 0.001 } },
    { key: "tail",          def: 0.22,  uniform: "u_tail",          type: "float", ui: { min: 0.0, max: 0.6, step: 0.01 } },
    { key: "glowBright",    def: 6.6,   uniform: "u_glowBright",    type: "float", ui: { min: 0.2, max: 12, step: 0.1 } },
    { key: "poleWidth",     def: 0.0030, uniform: "u_poleWidth",    type: "float", ui: { min: 0.001, max: 0.02, step: 0.0005 } },
    { key: "poolIntensity", def: 0.34,  uniform: "u_poolIntensity", type: "float", ui: { min: 0, max: 1, step: 0.01 } },  // 照明灯の真下の円状の明かり
    { key: "poolSize",      def: 0.12,  uniform: "u_poolSize",      type: "float", ui: { min: 0.02, max: 0.4, step: 0.01 } }, // その円の大きさ

    // --- 大気 / 見た目（旧ハードコード値を config 化）---
    { key: "fogDensity",    def: 0.012, uniform: "u_fogDensity",    type: "float", ui: { min: 0, max: 0.05, step: 0.001 } },
    { key: "wetness",       def: 0.34,  uniform: "u_wetness",       type: "float", ui: { min: 0, max: 1, step: 0.02 } },  // 路面の濡れ反射の強さ
    { key: "hazeSharp",     def: 220.0, uniform: "u_hazeSharp",     type: "float", ui: { min: 20, max: 600, step: 10 } },
    { key: "hazeIntensity", def: 0.45,  uniform: "u_hazeIntensity", type: "float", ui: { min: 0, max: 1.5, step: 0.05 } },
    { key: "skyCurve",      def: 0.60,  uniform: "u_skyCurve",      type: "float", ui: { min: 0.2, max: 1.5, step: 0.05 } },
    { key: "pixelRows",     def: 440,   ui: { min: 80, max: 700, step: 10 } },     // JS専用（描画解像度。大きいほど鮮明）
    { key: "paletteSteps",  def: 26,    uniform: "u_paletteSteps",  type: "float", ui: { min: 2, max: 64, step: 1 } },
    { key: "exposure",      def: 1.45,  uniform: "u_exposure",      type: "float", ui: { min: 0.3, max: 3, step: 0.05 } },  // 背景の露出（ライトはトーンマップ後に加算）
    { key: "saturation",    def: 1.18,  uniform: "u_saturation",    type: "float", ui: { min: 0, max: 2, step: 0.02 } },  // 彩度（鮮明さ）

    // --- 月 ---
    { key: "moon",          def: true,  uniform: "u_moon",          type: "bool",  ui: { bool: true } },
    { key: "moonX",         def: 0.30,  uniform: "u_moonX",         type: "float", ui: { min: 0, max: 1, step: 0.01 } },
    { key: "moonY",         def: 0.82,  uniform: "u_moonY",         type: "float", ui: { min: 0.3, max: 1, step: 0.01 } },
    { key: "moonSize",      def: 0.06,  uniform: "u_moonSize",      type: "float", ui: { min: 0.01, max: 0.2, step: 0.005 } },

    // --- 遠くの都市 ---
    { key: "cityHeight",    def: 0.10,  uniform: "u_cityHeight",    type: "float", ui: { min: 0, max: 0.3, step: 0.005 } },
    { key: "cityCols",      def: 26.0,  uniform: "u_cityCols",      type: "float", ui: { min: 6, max: 80, step: 1 } },
    { key: "cityParallax",  def: 0.12,  uniform: "u_cityParallax",  type: "float", ui: { min: 0, max: 0.5, step: 0.01 } }, // 都市の流れ幅（位相 u_cityPhase に乗る視差）
    { key: "windowBright",  def: 0.55,  uniform: "u_windowBright",  type: "float", ui: { min: 0, max: 2, step: 0.05 } },
    { key: "windowDensity", def: 0.35,  uniform: "u_windowDensity", type: "float", ui: { min: 0, max: 1, step: 0.02 } },
    { key: "beaconMinH",    def: 0.70,  uniform: "u_beaconMinH",    type: "float", ui: { min: 0.3, max: 1.0, step: 0.02 } }, // 航空障害灯がつく高さの閾値
    { key: "beaconChance",  def: 0.6,   uniform: "u_beaconChance",  type: "float", ui: { min: 0, max: 1, step: 0.05 } }, // 高ビルのうち灯がつく割合
    { key: "beaconSize",    def: 0.006, uniform: "u_beaconSize",    type: "float", ui: { min: 0.002, max: 0.02, step: 0.001 } },
    { key: "beaconBright",  def: 1.7,   uniform: "u_beaconBright",  type: "float", ui: { min: 0, max: 4, step: 0.1 } },

    // --- 薄雲 ---
    { key: "cloud",         def: true,  uniform: "u_cloud",         type: "bool",  ui: { bool: true } },
    { key: "cloudOpacity",  def: 0.26,  uniform: "u_cloudOpacity",  type: "float", ui: { min: 0, max: 1, step: 0.02 } },   // 雲の濃さ
    { key: "cloudCover",    def: 0.52,  uniform: "u_cloudCover",    type: "float", ui: { min: 0.2, max: 0.95, step: 0.02 } }, // 雲量の閾値（大きいほど少なく薄く）
    { key: "cloudScale",    def: 1.7,   uniform: "u_cloudScale",    type: "float", ui: { min: 0.4, max: 5, step: 0.1 } },    // 雲のディテールの細かさ
    { key: "cloudStretch",  def: 3.6,   uniform: "u_cloudStretch",  type: "float", ui: { min: 1, max: 8, step: 0.2 } },     // 縦の層の細かさ（大きいほど薄い層が増える）
    { key: "cloudDrift",    def: 0.10,  uniform: "u_cloudDrift",    type: "float", ui: { min: 0, max: 1, step: 0.02 } },    // u_cloudScroll に対する横流れ量
    { key: "cloudSpeed",    def: 0.5,   ui: { min: 0, max: 3, step: 0.1 } },                                                 // 雲の流れ速度（JS で u_cloudScroll を生成）
    { key: "cloudOctaves",  def: 4,     uniform: "u_cloudOctaves",  type: "int",   ui: { min: 1, max: 4, step: 1 } },       // fbm のオクターブ数（モバイルで下げて軽量化）

    // --- 色 ---
    { key: "skyTop",     def: [0.005, 0.005, 0.03], uniform: "u_skyTop",     type: "color", ui: { color: true } },
    { key: "skyHorizon", def: [0.05, 0.06, 0.12],   uniform: "u_skyHorizon", type: "color", ui: { color: true } },
    { key: "cloudCol",   def: [0.26, 0.28, 0.36],   uniform: "u_cloudCol",   type: "color", ui: { color: true } },
    { key: "ground",     def: [0.05, 0.07, 0.06],   uniform: "u_ground",     type: "color", ui: { color: true } },
    { key: "asphalt",    def: [0.11, 0.11, 0.14],   uniform: "u_asphalt",    type: "color", ui: { color: true } },
    { key: "wallCol",    def: [0.12, 0.12, 0.15],   uniform: "u_wallCol",    type: "color", ui: { color: true } },
    { key: "wallTopCol", def: [0.30, 0.31, 0.38],   uniform: "u_wallTopCol", type: "color", ui: { color: true } },
    { key: "reflectorCol", def: [1.00, 0.62, 0.18], uniform: "u_reflectorCol", type: "color", ui: { color: true } },
    { key: "laneCol",    def: [0.90, 0.92, 0.97],   uniform: "u_laneCol",    type: "color", ui: { color: true } },
    { key: "lampCol",    def: [1.00, 0.72, 0.36],   uniform: "u_lampCol",    type: "color", ui: { color: true } },
    { key: "hazeCol",    def: [0.22, 0.13, 0.06],   uniform: "u_hazeCol",    type: "color", ui: { color: true } },
    { key: "moonCol",    def: [0.95, 0.95, 0.85],   uniform: "u_moonCol",    type: "color", ui: { color: true } },
    { key: "poleCol",    def: [0.04, 0.04, 0.05],   uniform: "u_poleCol",    type: "color", ui: { color: true } },
    { key: "cityCol",    def: [0.02, 0.025, 0.05],  uniform: "u_cityCol",    type: "color", ui: { color: true } },
    { key: "windowCol",  def: [1.00, 0.85, 0.50],   uniform: "u_windowCol",  type: "color", ui: { color: true } },
    { key: "beaconCol",  def: [1.00, 0.06, 0.03],   uniform: "u_beaconCol",  type: "color", ui: { color: true } },
    { key: "carHeadCol", def: [0.85, 0.92, 1.00],   uniform: "u_carHeadCol", type: "color", ui: { color: true } }
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
