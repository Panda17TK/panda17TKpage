---
title: 雑記はじめました
date: 2026-07-12
description: 笹ノ葉製作所の雑記を開設しました。記事の追加はMarkdownを1枚置くだけ。
tags: お知らせ, サイト
---

夜の高速道路を走るこのサイトに、雑記を併設しました。

## しくみ

記事は Markdown で書いて、リポジトリの `blog/posts/` に置くだけです。
push すると GitHub Actions が HTML を自動生成して公開してくれます。

```bash
# 雛形をつくって記事を書く
npm run new:post -- new-article "新しい記事" --tags "開発"
vim blog/posts/2026-07-14-new-article.md

# あとは push するだけ（HTML 生成は Actions におまかせ）
git add -A && git commit -m "blog: 新しい記事" && git push
```

ファイルの先頭にタイトルと日付、タグを書いておくと、一覧ページに
自動で並び、タグで絞り込めるようになります。

## これから書くこと

- Rust / Python / JavaScript の小道具づくりの記録
- 自宅サーバーやネットワークの実験メモ
- ドット絵とWebGLの描画実験

のんびり更新していきます。
