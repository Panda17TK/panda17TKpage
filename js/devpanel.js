/* =============================================================
   開発用パラメータパネル（依存ライブラリなし）
   URL に ?dev を付けたときだけ表示。コントロールは NH.PARAMS の
   ui 定義から自動生成される（slider / color / checkbox）。
   "Copy config JSON" で現在値を NH.OVERRIDES に貼り戻せる。
   ============================================================= */
window.NH = window.NH || {};

NH.createDevPanel = function (config, scene, params) {
    function toHex(c) {
        function h(v) { return ("0" + Math.round(v * 255).toString(16)).slice(-2); }
        return "#" + h(c[0]) + h(c[1]) + h(c[2]);
    }
    function fromHex(hex) {
        return [parseInt(hex.substr(1, 2), 16) / 255,
                parseInt(hex.substr(3, 2), 16) / 255,
                parseInt(hex.substr(5, 2), 16) / 255];
    }

    var panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:10px;left:10px;z-index:9999;background:rgba(10,12,20,.86);" +
        "color:#dfe3ee;font:11px/1.5 monospace;padding:10px;border:1px solid rgba(255,255,255,.18);" +
        "border-radius:10px;max-height:90vh;overflow:auto;width:248px;backdrop-filter:blur(6px)";

    var title = document.createElement("div");
    title.textContent = "night-highway · dev";
    title.style.cssText = "font-weight:bold;margin-bottom:6px";
    panel.appendChild(title);

    params.forEach(function (p) {
        if (!p.ui) return;
        var row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;margin:3px 0";
        var name = document.createElement("span");
        name.textContent = p.key;
        name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis";
        row.appendChild(name);

        if (p.ui.color) {
            var ci = document.createElement("input");
            ci.type = "color";
            ci.value = toHex(config[p.key]);
            ci.addEventListener("input", function () { config[p.key] = fromHex(ci.value); scene.applyConfig(); });
            row.appendChild(ci);
        } else if (p.ui.bool) {
            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!config[p.key];
            cb.addEventListener("change", function () { config[p.key] = cb.checked; scene.applyConfig(); });
            row.appendChild(cb);
        } else {
            var val = document.createElement("span");
            val.textContent = String(config[p.key]);
            val.style.cssText = "width:48px;text-align:right";
            var r = document.createElement("input");
            r.type = "range";
            r.min = p.ui.min; r.max = p.ui.max; r.step = p.ui.step;
            r.value = config[p.key];
            r.style.width = "90px";
            r.addEventListener("input", function () {
                config[p.key] = parseFloat(r.value);
                val.textContent = r.value;
                scene.applyConfig();
            });
            row.appendChild(r);
            row.appendChild(val);
        }
        panel.appendChild(row);
    });

    var copy = document.createElement("button");
    copy.textContent = "Copy config JSON";
    copy.style.cssText = "margin-top:8px;width:100%;cursor:pointer";
    copy.addEventListener("click", function () {
        var out = JSON.stringify(config, null, 2);
        if (navigator.clipboard) navigator.clipboard.writeText(out);
        console.log(out);
        copy.textContent = "Copied! (paste into NH.OVERRIDES)";
        setTimeout(function () { copy.textContent = "Copy config JSON"; }, 1500);
    });
    panel.appendChild(copy);

    document.body.appendChild(panel);
};
