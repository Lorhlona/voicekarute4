# Voice Karte 4 (React + TS + Express)

音声の文字起こしと、それに基づいたテキスト生成（カルテ作成など）を行う Web アプリケーションです。

## 機能

*   **音声入力:**
    *   マイクからのリアルタイム録音
    *   音声ファイルのアップロード
*   **文字起こし:** Google Gemini API を使用して音声をテキストに変換
*   **追加情報入力:** 文字起こし結果に加えて、問診票などの補足情報をテキストで入力可能
*   **テキスト生成:**
    *   文字起こし結果と追加情報を基に、Gemini API を使用してテキストを生成
    *   複数の生成モード（初診カルテ、再診カルテ、紹介状、診断書など）を選択可能
    *   各モードの指示（システムプロンプト）を編集・保存可能 (ブラウザの localStorage に保存)
*   **API キー管理:**
    *   UI 上で Gemini API キーを設定
    *   設定したキーはブラウザの localStorage に保存され、次回起動時に自動読み込み
    *   キーの変更・クリアが可能
*   **データ管理:**
    *   アップロードされた音声ファイルはサーバーの `uploads` ディレクトリに保存
    *   生成された文字起こしテキストはサーバーの `transcripts` ディレクトリに保存
    *   UI から保存された音声・文字起こしデータを一括削除可能

## 技術スタック

*   **フロントエンド:** React, TypeScript, Vite
*   **バックエンド:** Node.js, Express
*   **API:** Google Gemini API (`@google/generative-ai`)
*   **その他:** Multer (ファイルアップロード), concurrently (開発サーバー同時起動), nodemon (バックエンド自動再起動)

## セットアップと実行方法

### 1. 前提条件

*   **Node.js と npm:** [Node.js](https://nodejs.org/) (v18 以上推奨) と npm (通常 Node.js に同梱) がインストールされていること。
*   **Google アカウント:** Google Gemini API を利用するために必要です。
*   **Gemini API キー:** [Google AI Studio](https://aistudio.google.com/) に Google アカウントでログインし、「Get API key」からキーを生成・取得してください。

### 2. セットアップ

#### A) Git リポジトリからクローンする場合 (推奨)

1.  リポジトリをクローンします:
    ```bash
    git clone https://github.com/Lorhlona/voicekarute4.git
    cd voicekarute4
    ```
2.  依存関係をインストールします:
    ```bash
    npm install
    ```

#### B) ZIP ファイルから展開する場合

1.  ダウンロードした ZIP ファイルを展開します。
2.  展開したフォルダにターミナル (コマンドプロンプト, PowerShell, Terminal など) で移動します。
3.  依存関係をインストールします:
    ```bash
    npm install
    ```

### 3. 開発モードでの実行

プロジェクトディレクトリで以下のコマンドを実行し、依存関係をインストールします。

```bash
npm install
```

### 3. 開発モードでの実行

以下のコマンドを実行すると、フロントエンド開発サーバー (Vite) とバックエンド API サーバー (Express + nodemon) が同時に起動します。

```bash
npm run dev
```

ターミナルに表示される Vite のローカルアドレス (通常 `http://localhost:5173/`) をブラウザで開きます。
**注意:** 以前のバージョンとは異なり、`http://localhost:3000/` ではありません。`3000` 番ポートはバックエンド API サーバーが使用します。

### 4. API キーの設定

初めてアプリケーションを開いた際、または API キーがクリアされた場合は、UI 上で Gemini API キーを入力し、「APIキーを設定」ボタンをクリックしてください。キーはブラウザの localStorage に保存されます。

### 5. 使用方法

1.  API キーを設定します。
2.  **音声入力:**
    *   「録音開始」ボタンでマイク録音を開始し、「録音停止」で終了します。録音停止後、自動で文字起こしが実行されます。
    *   または、「ファイルを選択」ボタンで音声ファイルをアップロードし、「ファイルを文字起こし」ボタンをクリックします。
3.  **文字起こし結果確認:** セクション 2 に結果が表示されます。
4.  **(任意) 追加情報入力:** セクション 3 のテキストエリアに、問診票などの補足情報を入力します。
5.  **モード選択・設定:** セクション 4 で、生成したいテキストの種類に応じたモードを選択します。必要であれば、「設定」ボタンからモード名やシステムプロンプトを編集し、「保存」をクリックします。
6.  **テキスト生成:** 「(選択モード名)モードでカルテ生成」ボタンをクリックします。
7.  **生成結果確認:** セクション 4 の下部に結果が表示されます。
8.  **コピー:** 各結果エリアの「全文コピー」ボタンで内容をクリップボードにコピーできます。
9.  **データクリア:**
    *   「APIキーをクリア」ボタンで localStorage とサーバーから API キーを削除します。
    *   「保存データクリア」ボタンでサーバー上の `uploads` および `transcripts` ディレクトリ内の全ファイルを削除します（確認ダイアログが表示されます）。

## 注意点

*   API キーはブラウザの localStorage に保存されるため、共有 PC などでの利用には注意してください。
*   非常に長い音声ファイルの処理は、API やブラウザ/サーバーの制限により失敗する可能性があります。
*   バックエンドサーバーはデフォルトでポート 3000 を使用します。もしポートが競合する場合は、`server.js` 内の `port` 定数を変更するか、環境変数 `PORT` を設定してください。
