/* =============================================================
   開発用パラメータパネル（依存ライブラリなし）
   URL に ?dev を付けたときだけ表示される。
   スライダー / カラーで config を即時変更 → scene.applyConfig()。
   "Copy config JSON" で調整値を config.js に貼り戻せる。
   ============================================================= */
window.NH = window.NH || {};

NH.createDevPanel = function (config, scene, schema) {
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
        "border-radius:10px;max-height:90vh;overflow:auto;width:240px;backdrop-filter:blur(6px)";

    var title = document.createElement("div");
    title.textContent = "night-highway · dev";
    title.style.cssText = "font-weight:bold;margin-bottom:6px";
    panel.appendChild(title);

    schema.forEach(function (item) {
        var row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;margin:3px 0";
        var name = document.createElement("span");
        name.textContent = item.key;
        name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis";
        row.appendChild(name);

        if (item.color) {
            var ci = document.createElement("input");
            ci.type = "color";
            ci.value = toHex(config[item.key]);
            ci.addEventListener("input", function () {
                config[item.key] = fromHex(ci.value);
                scene.applyConfig();
            });
            row.appendChild(ci);
        } else {
            var val = document.createElement("span");
            val.textContent = String(config[item.key]);
            val.style.cssText = "width:46px;text-align:right";
            var r = document.createElement("input");
            r.type = "range";
            r.min = item.min; r.max = item.max; r.step = item.step;
            r.value = config[item.key];
            r.style.width = "92px";
            r.addEventListener("input", function () {
                config[item.key] = parseFloat(r.value);
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
        copy.textContent = "Copied!";
        setTimeout(function () { copy.textContent = "Copy config JSON"; }, 1200);
    });
    panel.appendChild(copy);

    document.body.appendChild(panel);
};
