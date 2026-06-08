/* =============================================================
   GLSL シェーダー（夜の高速道路・本物のピンホールカメラ投影）
   uniform 宣言は NH.PARAMS から自動生成（buildFragment）。
   ============================================================= */
window.NH = window.NH || {};

// 画面を覆う巨大三角形
NH.VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

// フラグメント本体（uniform 宣言は buildFragment が前置する）
NH.FRAG_BODY = `
// mediump でも破綻しにくいハッシュ（sin と巨大係数を排除：Dave Hoskins hash21）
float hash(vec2 p){
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

// 薄雲用の value noise と fbm
float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ if (i >= u_cloudOctaves) break; v += a * vnoise(p); p *= 2.0; a *= 0.5; }
    return v;
}

float curveAt(float z){ return u_sway * u_swayAmount * z; }

// ワールド相対座標 → 画面 uv（戻り値 .z は視空間Z。>0で前方）
vec3 project(vec3 rel, float cp, float sp, float tanX, float tanY){
    float vy = rel.y * cp - rel.z * sp;
    float vz = rel.y * sp + rel.z * cp;
    return vec3(vec2(rel.x / (vz * tanX), vy / (vz * tanY)) * 0.5 + 0.5, vz);
}

float segDist(vec2 p, vec2 a, vec2 b){
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_res;
    float aspect = u_res.x / u_res.y;
    float tanY = u_fovTan;
    float tanX = tanY * aspect;
    float cp = cos(u_pitch), sp = sin(u_pitch);

    // ピクセル → ワールド方向（ピッチで上に傾ける）
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 rd = normalize(vec3(ndc.x * tanX, ndc.y * tanY, 1.0));
    vec3 dir = vec3(rd.x, rd.y * cp + rd.z * sp, -rd.y * sp + rd.z * cp);

    vec3 col;
    vec3 light = vec3(0.0);   // 加算ライト：トーンマップ後に重ねる→コアが純白まで届き glowBright が実際に効く
    bool onRoad = false;
    bool onWall = false;      // 塀ピクセルでは灯のライトを抑える（塀越しの滲み低減）

    if (dir.y < -0.0008) {
        // ===== 道路面（y=0 相対）と、それより低い外の地面 =====
        float tR = -u_camHeight / dir.y;                  // 道路面との交点
        float Xr = u_camX + dir.x * tR;
        float Zr = dir.z * tR;
        float lane = (Xr - curveAt(Zr)) / u_roadHalfWidth;
        float laneAbs = abs(lane);
        float aa = max(AAW(lane), 0.004);
        float roadMask = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, laneAbs);
        onRoad = roadMask > 0.5;

        // 道路の色（破線は縦方向も AA、塗り割合は dashDuty）
        vec3 road = u_asphalt;
        float zc = (Zr + u_scroll) / u_dashLength;
        // 破線：派生拡張が無い環境でも縦方向のちらつきを抑えるため最小AA幅を確保
        float dw = max(AAW(zc), 0.02);
        float f = fract(zc);
        float dash = smoothstep(0.0, dw * 1.5, f) * (1.0 - smoothstep(u_dashDuty - dw * 1.5, u_dashDuty, f));
        // 破線の車線分離（内側を laneCount 等分）＋ 実線の外側エッジ＝多車線の高速道路
        float marks = 0.0;
        for (int j = 1; j < 8; j++) {
            if (j >= u_laneCount) break;
            float pos = -u_laneEdge + float(j) * (2.0 * u_laneEdge / float(u_laneCount));
            if (abs(pos) < 0.03) continue;   // 中央（分離帯）は破線でなくガードレール
            float dline = 1.0 - smoothstep(0.020, 0.020 + aa, abs(lane - pos));
            marks = max(marks, dline * dash);
        }
        float edge = 1.0 - smoothstep(0.025, 0.025 + aa, abs(laneAbs - u_laneEdge));
        marks = max(marks, edge);
        road = mix(road, u_laneCol, clamp(marks, 0.0, 1.0));
        road *= exp(-Zr * u_fogDensity);

        // 外の地面：道路より u_roadRaise だけ低い面に交差させる
        float tG = -(u_camHeight + u_roadRaise) / dir.y;
        float Zg = dir.z * tG;
        vec3 grnd = u_ground * exp(-Zg * u_fogDensity);

        col = mix(grnd, road, roadMask);
    } else {
        // ===== 夜空 =====
        float t = clamp(dir.y / u_skyCurve, 0.0, 1.0);
        col = mix(u_skyHorizon, u_skyTop, t);
        if (u_moon > 0.5) {
            float md = distance(vec2((uv.x - 0.5) * aspect, uv.y), vec2(u_moonX * aspect, u_moonY));
            col = mix(col, u_moonCol, smoothstep(u_moonSize, 0.0, md));
            col += u_moonCol * smoothstep(u_moonSize * 2.4, u_moonSize, md) * 0.18;
        }

        // ===== 薄雲（地平線〜中空に漂う。u_cityPhase でゆっくり横へ流れる）=====
        if (u_cloud > 0.5) {
            float sxc = (uv.x - 0.5) * aspect;
            // 横は低周波（広い）、縦は高周波（薄い層）→ 水平に伸びた薄雲。
            // u_cloudScroll で前進方向へ連続的に流れる（有界値で mediump 安全）。
            vec2 cuv = vec2(sxc * u_cloudScale + u_cloudScroll * u_cloudDrift,
                            dir.y * u_cloudScale * u_cloudStretch);
            float dens = smoothstep(u_cloudCover, 1.0, fbm(cuv + 4.0));
            // 地平線のすぐ上から立ち上がり、天頂に向けて薄れる帯
            float band = smoothstep(0.0, 0.16, dir.y) * (1.0 - smoothstep(0.32, 0.85, dir.y));
            col = mix(col, u_cloudCol, dens * u_cloudOpacity * band);
        }

        // ===== 遠くの都市のシルエット＋瞬く窓明かり（2層で奥行き）=====
        // 横位置はアスペクト補正済みの sx を使う（縦長/横長で伸縮しない）。
        // drift = 揺れ(u_cityPhase) ＋ 前進に伴う平行移動(u_cityScroll)。どちらも連続値。
        // ハッシュ入力は mod 256 で有界化し、mediump 環境でも破綻しないようにする。
        float sx = (uv.x - 0.5) * aspect;
        float horizonY = 0.5 - 0.5 * (sp / cp) / tanY;
        for (int L = 0; L < 2; L++) {
            float layer = float(L);
            float par = 1.0 + layer * 0.6;                                     // 近層ほど大きく動く
            float scale = u_cityCols * (1.0 + layer * 0.7);                    // 手前ほど大きいビル
            float drift = (u_cityPhase * u_cityParallax + u_cityScroll) * par; // 揺れ＋前進の平行移動
            float maxH = u_cityHeight * (0.55 + layer * 0.75);
            float baseY = horizonY - layer * 0.004;
            float gx = (sx + drift) * scale;
            float c = floor(gx);
            float ch = mod(c, 256.0);     // ハッシュ用の有界セル番号（パターンは256セル周期）
            float wx = fract(gx);
            float h = hash(vec2(ch * 1.7, 5.0 + layer * 11.0));
            float top = baseY + maxH * (0.2 + 0.8 * h);
            if (uv.y >= baseY && uv.y <= top) {
                col = mix(col, u_cityCol * (0.7 + 0.5 * layer), 0.9);   // シルエット
                if (wx > 0.16 && wx < 0.84) {                          // 建物の縁は窓なし
                    float winCols = 3.0 + layer * 2.0;
                    float cellH = 0.010;
                    float cwx = floor(wx * winCols);
                    float cwy = floor((uv.y - baseY) / cellH);
                    float wseed = hash(vec2(ch * 13.0 + cwx, cwy * 1.3 + layer * 51.0));
                    float inx = fract(wx * winCols);
                    float iny = fract((uv.y - baseY) / cellH);
                    if (wseed > (1.0 - u_windowDensity) && inx > 0.22 && inx < 0.78 && iny > 0.22 && iny < 0.78) {
                        float tw = 0.45 + 0.55 * sin(u_time * 1.7 + wseed * 30.0);   // 瞬き
                        col += u_windowCol * u_windowBright * tw;
                    }
                }
            }
            // 航空障害灯：一定以上の高さのビルのうち一部の屋上に小さく目立つ赤い点滅灯
            if (h > u_beaconMinH && hash(vec2(ch, 71.0 + layer * 17.0)) < u_beaconChance) {
                float sxc = (c + 0.5) / scale - drift;                  // ビル中心の横位置（アスペクト空間）
                vec2 bpos = vec2(sxc, top + 0.006);
                float bd = distance(vec2(sx, uv.y), bpos);
                float blink = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(u_time * 2.2 + h * 12.0), 2.0);
                col += u_beaconCol * exp(-(bd * bd) / (u_beaconSize * u_beaconSize)) * u_beaconBright * blink;
            }
        }
    }

    // 地平線の暖色かすみ（真の地平線 dir.y≈0 に沿う）
    col += u_hazeCol * exp(-(dir.y * dir.y) * u_hazeSharp) * u_hazeIntensity;

    // ===== 塀（左右の壁）＋ 中央分離帯のガードレール（垂直面 x=baseX と交差）=====
    if (u_wall > 0.5 && abs(dir.x) > 1e-4) {
        float wallBestT = 1e9;
        vec3 wallShade = vec3(0.0);
        bool wallHit = false;
        float tgRoad = (dir.y < -0.0008) ? (-u_camHeight / dir.y) : 1e9; // 道路面までの距離（手前遮蔽判定用）
        for (int s = 0; s < 3; s++) {
            // s=0:左壁  s=1:右壁  s=2:中央分離帯（低いガードレール）
            float baseX = (s == 0) ? -(u_roadHalfWidth + u_wallOffset)
                        : (s == 1) ?  (u_roadHalfWidth + u_wallOffset) : 0.0;
            float hgt = (s == 2) ? u_medianHeight : u_wallHeight;
            float t = (baseX - u_camX) / dir.x;
            if (t <= 0.0) continue;
            float zhit = t * dir.z;
            if (zhit <= 0.0) continue;
            // 道路のカーブに合わせて X 位置を補正して再交差
            float wx = baseX + curveAt(zhit);
            t = (wx - u_camX) / dir.x;
            if (t <= 0.0) continue;
            zhit = t * dir.z;
            if (zhit <= 0.0) continue;
            float yhit = u_camHeight + t * dir.y;
            if (yhit < 0.0 || yhit > hgt) continue;           // 壁の上下からはみ出したら背景
            if (t >= tgRoad) continue;                        // 道路面が手前にあるなら見えない
            if (t >= wallBestT) continue;
            wallBestT = t;
            wallHit = true;
            float fog = exp(-zhit * u_fogDensity);
            float yn = clamp(yhit / hgt, 0.0, 1.0);
            vec3 c = mix(u_wallCol * 0.6, u_wallCol, yn);                 // 下ほど暗い
            c = mix(c, u_wallTopCol, smoothstep(0.88, 1.0, yn));         // 笠木（上端）の明るい縁
            float fz = fract(zhit / 3.0);                                // 3m ごとのパネル継ぎ目
            float seam = smoothstep(0.0, 0.05, fz) * (1.0 - smoothstep(0.95, 1.0, fz));
            c *= mix(0.78, 1.0, seam);
            wallShade = c * fog;
        }
        if (wallHit) { col = wallShade; onRoad = false; onWall = true; }
    }

    // ===== 対向車（セダンの正面シルエット。反対車線。中央分離帯で下部が隠れる）=====
    for (int k = 0; k < 4; k++) {
        vec2 car = u_cars[k];
        float cz = car.y;
        if (cz <= 0.5) continue;
        float carX = car.x + curveAt(cz);                 // 車中心のワールドX
        vec3 bp = project(vec3(carX - u_camX, -u_camHeight, cz), cp, sp, tanX, tanY); // 足元（路面）
        if (bp.z <= 0.05) continue;
        float s = 0.5 / (bp.z * tanY);                    // アスペクト空間での 1m あたりのスクリーンスケール
        vec2 Bc = vec2(bp.x * aspect, bp.y);
        vec2 lp = (vec2(uv.x * aspect, uv.y) - Bc) / s;   // 車ローカル座標(m)：lp.x=横, lp.y=高さ
        if (abs(lp.x) > 1.0 || lp.y < 0.12 || lp.y > 1.55) continue;
        // 正面シルエット：下=ボディ(幅広)、上=キャビン(幅狭)
        float halfAt = (lp.y < 0.78) ? 0.92 : mix(0.92, 0.52, clamp((lp.y - 0.78) / 0.62, 0.0, 1.0));
        float aaC = 0.05;
        float m = smoothstep(halfAt, halfAt - aaC, abs(lp.x))
                * smoothstep(0.14, 0.14 + aaC, lp.y) * smoothstep(1.46, 1.46 - aaC, lp.y);
        if (m < 0.004) continue;
        // 中央分離帯による遮蔽：視線が x=0 を越える高さ < medianHeight なら隠れる
        float occ = 1.0;
        if (u_wall > 0.5) {
            float denom = (carX + lp.x) - u_camX;
            if (denom > 1e-3) {
                float tm = -u_camX / denom;
                if (tm > 0.0 && tm < 1.0) {
                    float yc = u_camHeight + tm * (lp.y - u_camHeight);
                    occ = smoothstep(u_medianHeight - 0.04, u_medianHeight + 0.04, yc);
                }
            }
        }
        if (occ < 0.004) continue;
        vec3 body = u_carCol[k] * u_carBodyBright;
        body += u_carCol[k] * 0.18 * smoothstep(0.7, 1.45, lp.y);       // 上部の僅かな照り
        float winw = mix(0.7, 0.46, clamp((lp.y - 0.84) / 0.5, 0.0, 1.0));
        if (lp.y > 0.86 && lp.y < 1.34 && abs(lp.x) < winw)             // フロントガラス（暗いガラス＋空の映り）
            body = mix(vec3(0.02, 0.03, 0.05), u_skyHorizon, 0.35);
        if (lp.y < 0.5) body *= 0.7;                                    // バンパー/グリルの陰
        vec2 hl = vec2(abs(lp.x) - u_carTrack, lp.y - u_carHeadH);      // ヘッドライトのレンズ
        if (dot(hl, hl) < 0.018) body = mix(body, vec3(1.0, 0.98, 0.9), 0.85);
        col = mix(col, body, m * occ);
    }

    // ===== 道路照明灯（ワールド座標を順投影）=====
    float kStart = floor(u_scroll / u_lampSpacing) + 1.0;
    for (int i = 0; i < 32; i++) {
        if (i >= u_lampCount) break;
        float Zrel = (kStart + float(i)) * u_lampSpacing - u_scroll;
        if (Zrel < 0.5) continue;
        float lf = 1.0 - smoothstep(u_lampFade, 1.0, float(i) / float(u_lampCount)); // 最遠をフェード
        float curv = curveAt(Zrel);
        for (int s = 0; s < 2; s++) {
            float sd = (s == 0) ? -1.0 : 1.0;
            float edgeX = sd * (u_roadHalfWidth + u_lampSide) + curv - u_camX;  // 支柱（道路端＝塀の位置）
            float headX = edgeX - sd * u_lampArm;                              // アームで車道側へ張り出した灯具
            vec3 hp = project(vec3(headX, u_poleHeight - u_camHeight, Zrel), cp, sp, tanX, tanY);  // 灯具(頭部)
            if (hp.z <= 0.05) continue;
            vec3 tp = project(vec3(edgeX, u_poleHeight - u_camHeight, Zrel), cp, sp, tanX, tanY);  // 支柱の頂部
            vec3 bp = project(vec3(edgeX, u_wallHeight - u_camHeight, Zrel), cp, sp, tanX, tanY);  // 塀上端＝支柱の根元
            vec3 ahp = project(vec3(sd * (u_roadHalfWidth + u_lampSide) - sd * u_lampArm + curveAt(Zrel * 1.4) - u_camX,
                                    u_poleHeight - u_camHeight, Zrel * 1.4), cp, sp, tanX, tanY);
            float pscale = clamp(1.0 / hp.z, 0.02, 2.5);
            float gscale = min(pscale, 1.6);   // 見た目サイズの上限（至近灯が巨大な白塊にならないように）

            vec2 Pa = vec2(uv.x * aspect, uv.y);
            vec2 Ha = vec2(hp.x * aspect, hp.y);
            vec2 Ta = vec2(tp.x * aspect, tp.y);
            vec2 Ba = vec2(bp.x * aspect, bp.y);
            vec2 Aa = vec2(ahp.x * aspect, ahp.y);

            // 縦スパン早期スキップ：支柱〜アーム〜頭部＋残光余白を含まなければ重い計算を省く
            float yPad = u_tail * gscale + 0.06;
            if (uv.y < min(min(Ba.y, Ta.y), Ha.y) - yPad || uv.y > max(max(Ba.y, Ta.y), Ha.y) + yPad) continue;

            // 残光：消失点方向（道路の縁に平行）に伸びる異方性グロー
            vec2 rel2 = Pa - Ha;
            vec2 edir = normalize((Aa - Ha) + vec2(1e-5));
            vec2 eperp = vec2(-edir.y, edir.x);
            float a = dot(rel2, edir);
            float b = dot(rel2, eperp);
            float tail = u_tail * gscale;
            float wid = u_glowSize * gscale + 0.0015;
            float aaT = (a > 0.0) ? a / tail : a / wid;
            float bbT = b / wid;
            float glow = exp(-(aaT * aaT + bbT * bbT));

            // 支柱（塀から立つ）＋アーム（車道側へ張り出す）：ライトより先に背景へ
            float pw = u_poleWidth * clamp(pscale, 0.3, 1.5);
            float structD = min(segDist(Pa, Ba, Ta), segDist(Pa, Ta, Ha));
            float paa = max(AAW(structD), 0.0015);
            col = mix(col, u_poleCol, (1.0 - smoothstep(pw, pw + paa, structD)) * 0.8 * lf);

            // グロー（残光）と頭部の白熱コアは light に加算（トーンマップ後に重ねる）
            light += u_lampCol * glow * clamp(u_glowBright * pscale, 0.08, u_glowBright) * lf;
            float coreR = u_glowSize * 0.7 * gscale + 0.001;
            float core = exp(-dot(rel2, rel2) / (coreR * coreR));
            light += mix(u_lampCol, vec3(1.0), 0.6) * core * u_lampCore * lf;

            // 路面の反射：灯具の真下（車道）に円状の明かり。路面は基本暗いまま
            if (onRoad) {
                vec3 pc = project(vec3(headX, -u_camHeight, Zrel), cp, sp, tanX, tanY);
                if (pc.z > 0.05) {
                    vec2 Pc = vec2(pc.x * aspect, pc.y);
                    float poolR = u_poolSize * gscale + 0.006;
                    float d = distance(Pa, Pc);
                    light += u_lampCol * exp(-(d * d) / (poolR * poolR)) * u_poolIntensity * clamp(pscale, 0.1, 1.6) * lf;
                }
            }
        }
    }

    // ===== 対向車のヘッドライト（反対車線。u_cars[k] = (laneX, Z)。Z<=0 は非アクティブ）=====
    for (int k = 0; k < 4; k++) {
        vec2 car = u_cars[k];
        float cz = car.y;
        if (cz <= 0.5) continue;
        float cxBase = car.x + curveAt(cz) - u_camX;
        for (int hl = 0; hl < 2; hl++) {
            float off = (hl == 0) ? -u_carTrack : u_carTrack;
            vec3 hp = project(vec3(cxBase + off, u_carHeadH - u_camHeight, cz), cp, sp, tanX, tanY);
            if (hp.z <= 0.05) continue;
            float ps = clamp(1.0 / hp.z, 0.05, 3.0);
            vec2 Hp = vec2(hp.x * aspect, hp.y);
            vec2 Pp = vec2(uv.x * aspect, uv.y);
            float r = u_carHeadSize * ps + 0.0025;   // 近いほど大きく
            float d = distance(Pp, Hp);
            float fade = exp(-cz * u_fogDensity);     // ヘッドライトは点光源：減衰は大気フェードのみ
            light += u_carHeadCol * exp(-(d * d) / (r * r)) * u_carHeadBright * fade;
        }
    }

    // 塀は不透明な手前の面なので、灯のライト（対向車含む）の滲みを抑える
    if (onWall) light *= u_wallLight;

    // 彩度を少し上げて全体を鮮明に（背景のみ）
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, u_saturation);
    // 露出補正＋Reinhard トーンマップ（背景のみ）
    col *= u_exposure;
    col = col / (1.0 + col);
    // 道路照明などのライトをトーンマップ後に重ねる：コアは純白(=眩しさ)まで届き、暖色の裾も残る
    col += light;
    col = min(col, vec3(1.0));
    // オーダードディザ（interleaved gradient noise）で量子化バンディングを緩和
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    col += (ign - 0.5) / u_paletteSteps;
    // ドット絵風にパレット段階化
    col = floor(col * u_paletteSteps + 0.5) / u_paletteSteps;
    gl_FragColor = vec4(col, 1.0);
}
`;

// NH.PARAMS から uniform 宣言を生成してヘッダを組み立てる
NH.buildFragment = function (opts) {
    opts = opts || {};
    var params = opts.params || NH.PARAMS;
    function glType(t) { return t === "color" ? "vec3" : (t === "int" ? "int" : "float"); }

    var head = "";
    if (opts.derivatives) head += "#extension GL_OES_standard_derivatives : enable\n";
    head += "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
    head += opts.derivatives ? "#define AAW(x) (fwidth(x))\n" : "#define AAW(x) (0.0)\n";

    // エンジン uniform ＋ PARAMS 由来 uniform
    var decls = "uniform vec2 u_res;\nuniform float u_scroll;\nuniform float u_sway;\nuniform float u_time;\nuniform float u_cityPhase;\nuniform float u_cityScroll;\nuniform float u_cloudScroll;\nuniform vec2 u_cars[4];\nuniform vec3 u_carCol[4];\n";
    for (var i = 0; i < params.length; i++) {
        var p = params[i];
        if (p.uniform) decls += "uniform " + glType(p.type) + " " + p.uniform + ";\n";
    }
    return head + decls + NH.FRAG_BODY;
};
