# RSVP Reader

日本語の文章を文節ごとに区切り、RSVP (Rapid Serial Visual Presentation) で 1 つずつ表示する Web アプリです。

## 使い方

`index.html` をブラウザで開きます。ビルドは不要です。

1. テキストを貼り付けるか、`.txt` / `.md` ファイルを読み込む
2. 「読み始める」 (⌘/Ctrl+Enter) を押す
3. 再生中は次のキーで操作する

| キー | 操作 |
| --- | --- |
| Space | 再生 / 一時停止 |
| ← / → | 前 / 次の文へ移動 |
| ↑ / ↓ | 速度を上げる / 下げる |
| Esc | 編集画面に戻る |

テキスト、速度、読んでいた位置、テーマはブラウザの localStorage に保存します。テキストを外部に送信することはありません。

## 文節分割

文節への分割には [BudouX](https://github.com/google/budoux) を使っています。モデルは、文節単位で注釈された KNBC コーパスで学習した `ja_knbc` です。BudouX を読み込めなかったときは、ブラウザ標準の `Intl.Segmenter` で単語に区切り、ヒューリスティックで文節にまとめます。編集画面の文節数の横に、どちらで分割したかを表示します。

BudouX の前後で `segment.js` が次の処理をします。

- URL、インラインコード、`v1.2.3` のような識別子は分割しない
- 区切りの後に単独で残った助詞や句読点は、直前の文節に付ける
- Markdown の装飾を取り除き、コードブロックは「〔コード省略〕」の 1 文節にまとめる (設定でオフにできる)

表示時間は文節の長さで変わります。`、` の後は 1.5 倍、`。` の後は 2 倍、段落や見出しの終わりは 3 倍止まります。

## 依存

- DaisyUI 5 と Tailwind CSS 4 (browser 版) は、jsDelivr の CDN から読み込みます。オフラインで使う場合は、これらのファイルをローカルに置いて参照先を書き換えてください。
- BudouX 0.10.0 (Apache-2.0) の Parser と `ja_knbc` モデルは、`vendor/budoux-ja.js` に同梱しています。npm パッケージを展開したディレクトリから、次のコマンドで生成します。

```sh
npm pack budoux@0.10.0
tar -xzf budoux-0.10.0.tgz
node scripts/vendor-budoux.js ./package
```
