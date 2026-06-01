/* =============================================================
   夜の高速道路シェーダー背景 — 調整可能パラメータ
   ここの値を変えるだけで見た目を調整できます（再コンパイル不要）。
   ?dev を URL に付けると画面上のパネルからリアルタイム調整できます。
   ============================================================= */
window.NH = window.NH || {};

NH.config = {
    // --- 動き（ワールド単位 ≒ メートル）---
    speed: 16.0,          // 前進スピード (m/s 相当)
    swaySpeed: 0.25,      // 道路の揺れの速さ
    swayAmount: 0.0,      // 道路のカーブ量（0 = 直線。写真は直線）

    // --- カメラ ---
    camHeight: 1.4,       // 路面からの目線の高さ
    pitchDeg: 2.0,        // 見上げ角（+で上を見る＝地平線は下がる）
    fovDeg: 55.0,         // 垂直視野角

    // --- 道路 ---
    roadHalfWidth: 8.0,   // 路肩までの半幅
    dashLength: 6.0,      // 中央破線の周期
    laneEdge: 0.93,       // 両端白線の位置（半幅に対する割合）

    // --- 道路照明灯 ---
    lampSpacing: 30.0,    // 照明灯の間隔
    lampSide: 2.0,        // 路肩からの張り出し
    poleHeight: 10.0,     // ポールの高さ
    lampCount: 16,        // 描画する灯数（手前から）
    glowSize: 0.012,      // 残光の太さ
    tail: 0.16,           // 残光の長さ（消失点方向）
    glowBright: 2.0,      // 発光の明るさ
    poleWidth: 0.0030,    // ポールの太さ
    poolIntensity: 0.02,  // 路面に映る光量

    // --- 見た目 ---
    pixelRows: 240,       // ドット絵バッファの縦解像度（小さいほど粗い）
    paletteSteps: 16,     // 色の段階数
    hazeIntensity: 0.45,  // 地平線の暖色かすみ
    moon: true,

    // --- 色（0..1 RGB）---
    skyTop:     [0.005, 0.005, 0.03],
    skyHorizon: [0.05, 0.06, 0.12],
    ground:     [0.05, 0.07, 0.06],
    asphalt:    [0.13, 0.13, 0.16],
    laneCol:    [0.90, 0.92, 0.97],
    lampCol:    [1.00, 0.72, 0.36],
    hazeCol:    [0.22, 0.13, 0.06],
    moonCol:    [0.95, 0.95, 0.85]
};

// ?dev パネルのスライダー定義
NH.schema = [
    { key: "speed", min: 0, max: 60, step: 0.5 },
    { key: "pitchDeg", min: -10, max: 20, step: 0.5 },
    { key: "fovDeg", min: 30, max: 90, step: 1 },
    { key: "camHeight", min: 0.2, max: 10, step: 0.1 },
    { key: "roadHalfWidth", min: 2, max: 20, step: 0.5 },
    { key: "dashLength", min: 1, max: 20, step: 0.5 },
    { key: "laneEdge", min: 0.5, max: 1.0, step: 0.01 },
    { key: "lampSpacing", min: 5, max: 80, step: 1 },
    { key: "lampSide", min: 0, max: 10, step: 0.25 },
    { key: "poleHeight", min: 2, max: 20, step: 0.5 },
    { key: "lampCount", min: 1, max: 32, step: 1 },
    { key: "glowSize", min: 0.002, max: 0.05, step: 0.001 },
    { key: "tail", min: 0.0, max: 0.6, step: 0.01 },
    { key: "glowBright", min: 0.2, max: 5, step: 0.1 },
    { key: "poleWidth", min: 0.001, max: 0.02, step: 0.0005 },
    { key: "poolIntensity", min: 0, max: 1, step: 0.01 },
    { key: "swayAmount", min: 0, max: 0.02, step: 0.001 },
    { key: "swaySpeed", min: 0, max: 1, step: 0.05 },
    { key: "pixelRows", min: 80, max: 600, step: 10 },
    { key: "paletteSteps", min: 2, max: 64, step: 1 },
    { key: "hazeIntensity", min: 0, max: 1.5, step: 0.05 },
    { key: "skyTop", color: true },
    { key: "skyHorizon", color: true },
    { key: "ground", color: true },
    { key: "asphalt", color: true },
    { key: "laneCol", color: true },
    { key: "lampCol", color: true },
    { key: "hazeCol", color: true },
    { key: "moonCol", color: true }
];
