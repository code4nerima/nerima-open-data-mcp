# nerima-open-data-mcp

東京都練馬区のオープンデータをAIクライアントから検索しやすくするMCPサーバーです。Claude、Cursor、ChatGPT系クライアントなどから、練馬区の公共施設、AED設置箇所、避難所・防災関連施設、公園を検索できるようにします。

## Tools

### `search_facilities`

練馬区内の施設を検索します。

引数:

- `keyword?: string`
- `category?: string`
- `area?: string`
- `limit?: number`

### `search_aed`

AED設置場所を検索します。

引数:

- `keyword?: string`
- `area?: string`
- `limit?: number`

### `search_shelters`

避難所・防災関連施設を検索します。

引数:

- `keyword?: string`
- `area?: string`
- `limit?: number`

### `search_parks`

公園を検索します。初期版では、公共施設一覧から公園相当データを抽出したJSONを使います。

引数:

- `keyword?: string`
- `area?: string`
- `limit?: number`

### `search_open_data`

練馬区オープンデータサイトから取り込んだ全CSVを横断検索します。

引数:

- `keyword?: string`
- `category?: string`
- `dataset?: string`
- `limit?: number`

## ローカル起動

`.env` を編集して、GCSを使う場合は `GCS_BUCKET` とGoogle Cloudのサービスアカウント認証情報を設定してください。GCS未設定の場合は、少数サンプルデータで起動します。

サービスアカウントJSONはBase64化して `GOOGLE_APPLICATION_CREDENTIALS_BASE64` に設定する方法を推奨します。

```bash
base64 -i service-account.json | tr -d '\n'
```

```bash
npm install
npm run build
npm run dev
```

ヘルスチェック:

```bash
curl http://localhost:3000/health
```

MCP endpoint:

```text
http://localhost:3000/mcp
```

キャッシュ状態:

```bash
curl http://localhost:3000/open-data/cache
```

## Herokuデプロイ

Herokuでは `Procfile` のWebプロセスが `npm start` を実行します。

```bash
npm run build
heroku create
git push heroku main
```

Heroku上のMCP endpoint:

```text
https://<your-app-name>.herokuapp.com/mcp
```

`PORT` はHerokuが設定するため、アプリケーション側では `process.env.PORT || 3000` をlistenします。

### Heroku Scheduler

Herokuのファイルシステムは永続ではないため、公式CSVから生成したキャッシュはGoogle Cloud Storageに保存します。SchedulerはWeb dynoの保護付きエンドポイントを呼び出し、公式CSVの再取得とGCSキャッシュ更新を行わせます。

設定する環境変数:

```bash
heroku config:set IMPORT_TOKEN=<long-random-token>
heroku config:set APP_BASE_URL=https://<your-app-name>.herokuapp.com
heroku config:set GCS_BUCKET=<bucket-name>
heroku config:set GCS_PREFIX=nerima-open-data/cache
heroku config:set GOOGLE_APPLICATION_CREDENTIALS_BASE64='<base64-encoded-service-account-json>'
```

`GOOGLE_APPLICATION_CREDENTIALS_JSON` も利用できますが、Heroku Config VarsではJSON内の改行やクォートが崩れやすいため、Base64形式を推奨します。両方を設定している場合は `GOOGLE_APPLICATION_CREDENTIALS_JSON` が優先されます。

Heroku Schedulerに登録するコマンド:

```bash
npm run scheduler:import
```

手元でGCSキャッシュを生成して動作確認する場合:

```bash
export GCS_BUCKET=<bucket-name>
export GCS_PREFIX=nerima-open-data/cache
export GOOGLE_APPLICATION_CREDENTIALS_BASE64='<base64-encoded-service-account-json>'
npm run build
npm run import:open-data
```

外部スケジューラーから直接呼ぶ場合:

```bash
curl -X POST \
  -H "Authorization: Bearer $IMPORT_TOKEN" \
  https://<your-app-name>.herokuapp.com/tasks/import-open-data
```

## データ

初期JSONの `data/*.json` はフォールバックです。通常はGoogle Cloud Storageに保存した公式CSVキャッシュを読み込みます。

公式CSVキャッシュは取得時点の生成物なので、Gitには含めません。Herokuのslugにも含めず、GCSに保存します。

インポート処理は、練馬区オープンデータサイトの「オープンデータ一覧（CSV）」を起点に、CSV形式の各データセットページを巡回してページ内のCSVリンクを取得します。取得したCSVはJSON化して、GCS上の `nerima-open-data/cache/datasets/*.json` に保存し、最後に `nerima-open-data/cache/catalog.json` を更新します。

現在のキャッシュ生成結果:

- データセット数: 34
- CSVファイル数: 531
- 行数: 84,802
- 生成JSONの合計サイズ目安: 約252MB

専用toolは公式CSVキャッシュを優先し、キャッシュがない場合のみ `data/*.json` の少数サンプルにフォールバックします。GCSキャッシュは全件を一括ロードせず、manifestを起点に必要なデータセットだけ遅延読み込みします。

Herokuで起動時にGCSキャッシュがない場合だけ公式CSVを取得するには、次を設定します。

```bash
heroku config:set AUTO_IMPORT_ON_START=true
```

起動時取得は公式サイトへのアクセスとCSVパース、GCSアップロードが発生するため、起動時間が長くなります。通常運用ではHeroku Schedulerまたは外部スケジューラーから `/tasks/import-open-data` を呼び出して更新してください。

GCSに置くオブジェクト:

```text
gs://<bucket>/nerima-open-data/cache/catalog.json
gs://<bucket>/nerima-open-data/cache/datasets/*.json
```

## 運用確認

本番MCP endpointはStreamable HTTPです。SSE方式の `/sse` は提供していません。

```text
https://<your-app-name>.herokuapp.com/mcp
```

疎通確認:

```bash
curl -X POST https://<your-app-name>.herokuapp.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

MCP tool実行時は、開始・完了・失敗と処理時間を標準出力へ出します。Herokuでは以下で確認できます。

```bash
heroku logs --tail
```

使用・参照する練馬区オープンデータ:

- 練馬区オープンデータサイト
- オープンデータ一覧
- 公共施設一覧
- AED設置箇所一覧
- 指定緊急避難場所一覧
- 避難拠点
- 公園トイレ一覧

## ライセンス・出典

本リポジトリの初期データは、練馬区オープンデータサイトで公開されているコンテンツを参考に、MCPサーバーの初期検証用に整形したものです。

出典:

- 練馬区オープンデータサイト、東京都練馬区、クリエイティブ・コモンズ・ライセンス表示4.0国際
- https://www.city.nerima.tokyo.jp/kusei/tokei/opendata/opendatasite/index.html
- https://creativecommons.org/licenses/by/4.0/deed.ja

練馬区オープンデータサイトで公開しているコンテンツは、特段の定めがあるものを除き、クリエイティブ・コモンズ・ライセンス表示4.0国際の下に提供されています。改変して利用する場合は、編集・加工等を行ったことを明記してください。

## 注意

AED・避難所・防災関連情報は命に関わる可能性があります。本サーバーの結果だけに依存せず、最新情報は必ず練馬区公式情報を確認してください。

初期版ではMCP endpointは認証なしで公開できますが、公開運用時はレート制限や監視を検討してください。キャッシュ更新エンドポイント `/tasks/import-open-data` は `IMPORT_TOKEN` が必要です。Herokuのファイルシステムは永続保存に使わないでください。
