# nerima-open-data-mcp

東京都練馬区のオープンデータをAIクライアントから検索しやすくするMCPサーバーです。Claude、Cursor、ChatGPT系クライアントなどから、練馬区の公共施設、AED設置箇所、避難所・防災関連施設、公園、行政手続情報、ごみ・資源収集曜日、新着情報を検索できるようにします。

## Tools

### `search_facilities`

練馬区オープンデータの「公共施設一覧」を検索します。区役所、図書館、地域集会所、区民館、体育館、文化施設、住所、電話番号、施設分類を調べる質問に向いています。

引数:

- `keyword?: string`
- `category?: string`
- `area?: string`
- `limit?: number`

### `search_aed`

練馬区オープンデータの「AED設置箇所一覧」を検索します。AED、救命設備、設置施設、住所、地域、公共施設内のAEDを探す質問に向いています。

引数:

- `keyword?: string`
- `area?: string`
- `limit?: number`

### `search_shelters`

練馬区オープンデータの「指定緊急避難場所一覧」「避難拠点」を検索します。避難所、避難場所、防災、地震、火災、洪水、災害時の行き先を探す質問に向いています。

引数:

- `keyword?: string`
- `area?: string`
- `limit?: number`

### `list_shelters`

避難所・防災関連施設を一覧表示します。収容人数順や名称順で並び替えできます。

引数:

- `area?: string`
- `disasterType?: string`
- `sortBy?: "name" | "capacity"`
- `sortOrder?: "asc" | "desc"`
- `limit?: number`

### `search_parks`

公園を検索します。初期版では、公共施設一覧から公園相当データを抽出したJSONを使います。

引数:

- `keyword?: string`
- `area?: string`
- `limit?: number`

### `search_open_data`

練馬区オープンデータサイトから取り込んだ全CSVを横断検索します。公共施設一覧、AED設置箇所一覧、行政手続情報、人口統計、文化財、防災、子育て、教育、産業、まちづくりなど、専用toolがないデータセットを広く調べる質問に向いています。

引数:

- `keyword?: string`
- `category?: string`
- `dataset?: string`
- `limit?: number`

### `search_news`

練馬区公式サイトの新着情報RSSを検索します。

引数:

- `keyword?: string`
- `category?: string`
- `from?: string`
- `to?: string`
- `limit?: number`

### `list_recent_news`

練馬区公式サイトの新着情報RSSを新しい順に一覧表示します。

引数:

- `category?: string`
- `from?: string`
- `to?: string`
- `limit?: number`

### `search_garbage_collection`

練馬区公式サイトの「地域別収集曜日一覧」を検索します。ごみの日、可燃ごみ、不燃ごみ、容器包装プラスチック、古紙、びん、缶、ペットボトル、町名、丁目、収集カレンダーPDFを調べる質問に向いています。

引数:

- `keyword?: string`
- `town?: string`
- `district?: string`
- `day?: string`
- `wasteType?: string`
- `limit?: number`

### `search_procedures`

練馬区オープンデータの「行政手続情報」を検索します。申請、届出、証明書、相談、必要書類、担当課、担当係、窓口、場所、電話番号、電子申請URLを調べる質問に向いています。

引数:

- `keyword?: string`
- `department?: string`
- `location?: string`
- `hasOnlineApplication?: boolean`
- `limit?: number`

### `search_service_counters`

練馬区オープンデータの「行政手続情報」から、場所・担当課・担当係・電話番号ごとに手続き窓口候補を検索します。どこで申請するか、証明書や相談の窓口、担当窓口、本庁舎や石神井庁舎の窓口を調べる質問に向いています。

引数:

- `keyword?: string`
- `department?: string`
- `location?: string`
- `limit?: number`

### `get_dataset_stats`

GCSキャッシュと主要データセットの統計情報を返します。避難所については、指定緊急避難場所と避難拠点を合算した総件数、収容人数ありの件数、最大収容人数、収容人数上位10件を返します。

引数はありません。

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

インポート処理は、練馬区オープンデータサイトの「オープンデータ一覧（CSV）」とカテゴリページを起点に、CSV形式で公開されている各データセットページを巡回してページ内のCSVリンクを取得します。取得したCSVはJSON化して、GCS上の `nerima-open-data/cache/datasets/*.json` に保存し、最後に `nerima-open-data/cache/catalog.json` を更新します。

キャッシュ生成結果の例:

- データセット数: 34
- CSVファイル数: 531
- 行数: 84,802
- 生成JSONの合計サイズ目安: 約252MB

公式サイトの更新により、対象データセット数や行数は変わります。インポート時点の正確な件数は `/open-data/cache` または `get_dataset_stats` で確認してください。

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
gs://<bucket>/nerima-open-data/cache/rss/news.json
gs://<bucket>/nerima-open-data/cache/garbage/collection-days.json
```

## 運用確認

MCP endpointはStreamable HTTPです。SSE方式の `/sse` は提供していません。

汎用URL:

```text
https://<your-app-name>.herokuapp.com/mcp
```

このプロジェクトの運用URL:

```text
https://nod-mcp.code4nerima.org/mcp
```

汎用URLでの疎通確認:

```bash
curl -X POST https://<your-app-name>.herokuapp.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

運用URLでの疎通確認:

```bash
curl -X POST https://nod-mcp.code4nerima.org/mcp \
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
