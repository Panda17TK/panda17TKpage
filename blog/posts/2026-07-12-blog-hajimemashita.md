---
title: 雑記はじめました
date: 2026-07-12
description: 笹ノ葉製作所の雑記を開設しました。記事の追加はMarkdownを1枚置くだけ。
tags: お知らせ, サイト
---

夜の高速道路を走るこのサイトに、雑記を併設しました。

## しくみ

記事は Markdown で書いて、リポジトリの `blog/posts/` に置くだけです。

```bash
# 記事を書く
vim blog/posts/2026-07-12-blog-hajimemashita.md

# HTML を生成してプッシュ
npm run make:blog
git add -A && git commit -m "blog: 新しい記事" && git push
```

ファイルの先頭にタイトルと日付を書いておくと、一覧ページにも自動で並びます。

## これから書くこと

- Rust / Python / JavaScript の小道具づくりの記録
- 自宅サーバーやネットワークの実験メモ
- ドット絵とWebGLの描画実験

のんびり更新していきます。
