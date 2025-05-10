# Obsidian LINE Plugin

LINEのメッセージをObsidianのノートとして保存するためのプラグイン

## 機能
同期ボタンでLINEのメッセージをObsidianのノートとして保存

## 使い方
.obsidian/plugins配下に配置後、設定

endpointは[これ](https://github.com/ujiuji1259/obsidian-line-worker)でデプロイしたメッセージ取得エンドポイントを使用する

## メッセージの保存形式

メッセージは以下の形式で保存

```markdown
---
source: LINE
date: [メッセージのタイムスタンプ]
messageId: [メッセージID]
---
