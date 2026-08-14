const fs = require("fs");

function rep(src, oldText, newText, label) {
  if (src.includes(newText)) return src;
  if (!src.includes(oldText)) throw new Error("Could not patch: " + label);
  return src.replace(oldText, newText);
}

// admin-editor.js
{
  const f = "js/admin-editor.js";
  let s = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
  s = rep(
    s,
    '    return { enhance: enhance };\n})();',
    '    return { enhance: enhance, processImageFile: processImageFile };\n})();',
    "admin-editor export"
  );
  fs.writeFileSync(f, s, "utf8");
}

// admin.html
{
  const f = "admin.html";
  let s = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
  s = rep(
    s,
    '                            <input id="new-tags" class="admin-input" type="text" placeholder="タグ（カンマ区切り・任意）" aria-label="タグ">\n                            <textarea id="new-body" class="admin-textarea" rows="10"',
    '                            <input id="new-tags" class="admin-input" type="text" placeholder="タグ（カンマ区切り・任意）" aria-label="タグ">\n                            <label class="admin-ogp-new">\n                                <span class="admin-ogp-new__label">OGP画像（X / SNSカード）</span>\n                                <input id="new-image" class="admin-input" type="file" accept="image/*" aria-label="OGP画像">\n                                <small>未指定なら共通の og-image.png を使用します。</small>\n                            </label>\n                            <textarea id="new-body" class="admin-textarea" rows="10"',
    "new OGP field"
  );
  fs.writeFileSync(f, s, "utf8");
}

// admin.js
{
  const f = "js/admin.js";
  let s = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");

  s = rep(
    s,
    '    function enhance(ta) { NH.adminEditor.enhance(ta, { status: status, uploadImage: uploadImage }); }',
    `    function uploadOgImage(file) {
        if (!file) return Promise.resolve("");
        status("OGP画像を圧縮中…");
        return NH.adminEditor.processImageFile(file).then(function (base64) {
            var name = Date.now().toString(36) + "-og.jpg";
            status("OGP画像をアップロード中…");
            return uploadImage(base64, name);
        }).then(function (path) {
            return "/" + path.replace(/^\\/+/, "");
        });
    }

    function enhance(ta) { NH.adminEditor.enhance(ta, { status: status, uploadImage: uploadImage }); }`,
    "uploadOgImage"
  );

  s = rep(
    s,
    `        tags.addEventListener("input", function () {
            p.meta.tags = tags.value;
            markDirty(idx, true);
        });

        var toggle = document.createElement("button");`,
    `        tags.addEventListener("input", function () {
            p.meta.tags = tags.value;
            markDirty(idx, true);
        });

        var ogp = document.createElement("div");
        ogp.className = "admin-ogp";

        var ogpPreview = document.createElement("div");
        ogpPreview.className = "admin-ogp__preview";

        var ogpImg = document.createElement("img");
        ogpImg.alt = "";
        ogpImg.loading = "lazy";
        ogpPreview.appendChild(ogpImg);

        function refreshOgpPreview() {
            var value = String(p.meta.image || "").trim();
            ogpImg.hidden = !value;
            if (value) ogpImg.src = value;
        }

        var imagePath = document.createElement("input");
        imagePath.type = "text";
        imagePath.className = "admin-input admin-ogp__path";
        imagePath.value = p.meta.image || "";
        imagePath.placeholder = "OGP画像（未指定なら共通画像）";
        imagePath.setAttribute("aria-label", "OGP画像パス");
        imagePath.addEventListener("input", function () {
            var value = imagePath.value.trim();
            if (value) p.meta.image = value;
            else delete p.meta.image;
            refreshOgpPreview();
            markDirty(idx, true);
        });

        var imageFile = document.createElement("input");
        imageFile.type = "file";
        imageFile.accept = "image/*";
        imageFile.hidden = true;

        var imageButton = document.createElement("button");
        imageButton.type = "button";
        imageButton.className = "admin-btn";
        imageButton.textContent = "OGP画像を選ぶ";
        imageButton.addEventListener("click", function () { imageFile.click(); });

        imageFile.addEventListener("change", function () {
            var file = imageFile.files && imageFile.files[0];
            if (!file) return;
            imageButton.disabled = true;
            imageButton.textContent = "アップロード中…";

            uploadOgImage(file).then(function (path) {
                p.meta.image = path;
                imagePath.value = path;
                refreshOgpPreview();
                markDirty(idx, true);
                status("OGP画像をアップロードしました。記事の「保存」を押してください");
            }).catch(function (e) {
                status(e.message, true);
            }).finally(function () {
                imageFile.value = "";
                imageButton.disabled = false;
                imageButton.textContent = "OGP画像を選ぶ";
            });
        });

        refreshOgpPreview();
        ogp.appendChild(ogpPreview);
        ogp.appendChild(imagePath);
        ogp.appendChild(imageButton);
        ogp.appendChild(imageFile);

        var toggle = document.createElement("button");`,
    "existing OGP control"
  );

  s = rep(
    s,
    `        controls.appendChild(tags); controls.appendChild(toggle);
        controls.appendChild(editBtn); controls.appendChild(save);`,
    `        controls.appendChild(tags);
        controls.appendChild(ogp);
        controls.appendChild(toggle);
        controls.appendChild(editBtn);
        controls.appendChild(save);`,
    "append OGP control"
  );

  s = rep(
    s,
    `        var meta = { title: title, date: date, description: "", tags: $("new-tags").value.trim() };
        if ($("new-draft").checked) meta.draft = "true";`,
    `        var meta = { title: title, date: date, description: "", tags: $("new-tags").value.trim() };
        if ($("new-draft").checked) meta.draft = "true";
        var newImageFile = $("new-image").files && $("new-image").files[0];`,
    "new image variable"
  );

  s = rep(
    s,
    `        btn.disabled = true;
        status("作成中…");
        gh.api(gh.contents(path), {
            method: "PUT",
            body: JSON.stringify({
                message: "blog(admin): 下書き「" + title + "」を追加",
                content: gh.b64encode(fm.serialize(meta, body))
            })
        }).then(function () {`,
    `        btn.disabled = true;
        status(newImageFile ? "OGP画像を準備中…" : "作成中…");

        var imageReady = newImageFile
            ? uploadOgImage(newImageFile)
            : Promise.resolve("");

        imageReady.then(function (imagePath) {
            if (imagePath) meta.image = imagePath;
            status("作成中…");
            return gh.api(gh.contents(path), {
                method: "PUT",
                body: JSON.stringify({
                    message: "blog(admin): 下書き「" + title + "」を追加",
                    content: gh.b64encode(fm.serialize(meta, body))
                })
            });
        }).then(function () {`,
    "new OGP upload flow"
  );

  fs.writeFileSync(f, s, "utf8");
}

// admin.css
{
  const f = "admin.css";
  let s = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
  const start = "/* ADMIN OGP IMAGE:START */";
  const end = "/* ADMIN OGP IMAGE:END */";
  const block = `${start}
.admin-ogp {
    flex: 1 1 100%;
    display: grid;
    grid-template-columns: 5rem minmax(12rem, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem;
    border: 1px solid rgba(255, 215, 106, 0.14);
    border-radius: 4px;
    background: rgba(8, 10, 18, 0.28);
}

.admin-ogp__preview {
    width: 5rem;
    aspect-ratio: 1200 / 630;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    border-radius: 3px;
    background: rgba(5, 6, 10, 0.7);
}

.admin-ogp__preview img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
}

.admin-ogp__preview img[hidden] { display: none; }
.admin-ogp__path { min-width: 0; }

.admin-ogp-new {
    display: grid;
    gap: 0.4rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid rgba(255, 215, 106, 0.14);
    border-radius: 4px;
    background: rgba(8, 10, 18, 0.28);
}

.admin-ogp-new__label {
    color: rgba(248, 244, 238, 0.78);
    font-size: 0.8rem;
    letter-spacing: 0.04em;
}

.admin-ogp-new small {
    color: var(--muted);
    font-size: 0.7rem;
}

@media (max-width: 680px) {
    .admin-ogp { grid-template-columns: 4.5rem minmax(0, 1fr); }
    .admin-ogp__preview { width: 4.5rem; }
    .admin-ogp > .admin-btn { grid-column: 1 / -1; }
}
${end}`;

  const a = s.indexOf(start);
  if (a >= 0) {
    const b0 = s.indexOf(end, a);
    if (b0 < 0) throw new Error("OGP CSS end marker missing");
    s = s.slice(0, a).trimEnd() + "\n\n" + block + "\n" + s.slice(b0 + end.length).trimStart();
  } else {
    s = s.trimEnd() + "\n\n" + block + "\n";
  }
  fs.writeFileSync(f, s, "utf8");
}

console.log("OK: admin OGP image controls added");

// Cross-platform verification.
{
  const cp = require("child_process");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";

  function run(cmd, args) {
    console.log("$ " + [cmd].concat(args).join(" "));
    const r = cp.spawnSync(cmd, args, { stdio: "inherit" });
    if (r.status !== 0) {
      throw new Error("Command failed: " + cmd + " " + args.join(" "));
    }
  }

  run(process.execPath, ["--check", "scripts/make-blog.js"]);
  run(process.execPath, ["--check", "js/admin-editor.js"]);
  run(process.execPath, ["--check", "js/admin.js"]);
  run(npm, ["run", "make:blog"]);
  run(npm, ["run", "test:html"]);
  run("git", ["diff", "--check"]);
}

console.log("");
console.log("OK: per-post OGP + admin image upload enabled");
console.log("Next: git status --short");

