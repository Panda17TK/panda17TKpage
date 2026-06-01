/* =============================================================
   GLSL シェーダー（夜の高速道路・本物のピンホールカメラ投影）
   uniform 宣言は NH.PARAMS から自動生成（buildFragment）。
   ============================================================= */
window.NH = window.NH || {};

// 画面を覆う巨大三角形
NH.VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

// フラグメント本体（uniform 宣言は buildFragment が前置する）
NH.FRAG_BODY = `
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
    bool onRoad = false;

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
        float dw = max(AAW(zc), 1e-4);
        float f = fract(zc);
        float dash = smoothstep(0.0, dw * 1.5, f) * (1.0 - smoothstep(u_dashDuty - dw * 1.5, u_dashDuty, f));
        float center = (1.0 - smoothstep(0.035, 0.035 + aa, laneAbs)) * dash;
        float edge = 1.0 - smoothstep(0.025, 0.025 + aa, abs(laneAbs - u_laneEdge));
        road = mix(road, u_laneCol, clamp(max(center, edge), 0.0, 1.0));
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
    }

    // 地平線の暖色かすみ（真の地平線 dir.y≈0 に沿う）
    col += u_hazeCol * exp(-(dir.y * dir.y) * u_hazeSharp) * u_hazeIntensity;

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
            float Xl = sd * (u_roadHalfWidth + u_lampSide) + curv - u_camX;
            vec3 hp = project(vec3(Xl, u_poleHeight - u_camHeight, Zrel), cp, sp, tanX, tanY);
            if (hp.z <= 0.05) continue;
            vec3 bp = project(vec3(Xl, -(u_camHeight + u_roadRaise), Zrel), cp, sp, tanX, tanY);
            vec3 ahp = project(vec3(sd * (u_roadHalfWidth + u_lampSide) + curveAt(Zrel * 1.4) - u_camX,
                                    u_poleHeight - u_camHeight, Zrel * 1.4), cp, sp, tanX, tanY);
            float pscale = clamp(1.0 / hp.z, 0.02, 2.5);

            vec2 Pa = vec2(uv.x * aspect, uv.y);
            vec2 Ha = vec2(hp.x * aspect, hp.y);
            vec2 Ba = vec2(bp.x * aspect, bp.y);
            vec2 Aa = vec2(ahp.x * aspect, ahp.y);

            // 残光：消失点方向（道路の縁に平行）に伸びる異方性グロー
            vec2 rel2 = Pa - Ha;
            vec2 edir = normalize((Aa - Ha) + vec2(1e-5));
            vec2 eperp = vec2(-edir.y, edir.x);
            float a = dot(rel2, edir);
            float b = dot(rel2, eperp);
            float tail = u_tail * pscale;
            float wid = u_glowSize * pscale + 0.0015;
            float aaT = (a > 0.0) ? a / tail : a / wid;
            float bbT = b / wid;
            float glow = exp(-(aaT * aaT + bbT * bbT));
            col += u_lampCol * glow * clamp(u_glowBright * pscale, 0.08, u_glowBright) * lf;

            // ランプ頭部の白熱コア（明かりをともす）
            float coreR = u_glowSize * 0.7 * pscale + 0.001;
            float core = exp(-dot(rel2, rel2) / (coreR * coreR));
            col += mix(u_lampCol, vec3(1.0), 0.6) * core * u_lampCore * lf;

            // 支柱（AA 付き）
            float pw = u_poleWidth * clamp(pscale, 0.3, 1.5);
            float pd = segDist(Pa, Ba, Ha);
            float paa = max(AAW(pd), 0.0008);
            col = mix(col, u_poleCol, (1.0 - smoothstep(pw, pw + paa, pd)) * 0.8 * lf);

            // 路面に映る光
            if (onRoad) {
                float poolR = 0.16 * pscale + 0.01;
                float d = distance(Pa, Ba);
                col += u_lampCol * exp(-(d * d) / (poolR * poolR)) * u_poolIntensity * clamp(pscale, 0.1, 1.5) * lf;
            }
        }
    }

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
    var decls = "uniform vec2 u_res;\nuniform float u_scroll;\nuniform float u_sway;\n";
    for (var i = 0; i < params.length; i++) {
        var p = params[i];
        if (p.uniform) decls += "uniform " + glType(p.type) + " " + p.uniform + ";\n";
    }
    return head + decls + NH.FRAG_BODY;
};
