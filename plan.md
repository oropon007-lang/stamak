# stamak — 作業引き継ぎメモ

LINE スタンプ作成パイプライン + プレビュー UI。新セッションはこのファイルから始めればいいように書いてます。

## いまどこ

| Phase | 状態 | 内容 |
|---|---|---|
| 1. パイプライン構築 | ✅ 完了 | 切り出し → AI背景除去 → 仕上げ → 207枚出力 |
| 2. UI 構築 | ✅ 完了 | React + Vite + TS、LINE 風ギャラリー (`ui/`) |
| 3. GitHub Pages デプロイ | ✅ 完了 | https://oropon007-lang.github.io/stamak/ で公開中 (oropon007-lang/stamak) |

## ディレクトリ構成

```
~/projects/stamak/                           ← プロジェクト本体 (BoxSync 外)
├── .claude/commands/                        ← スラッシュコマンド (build, retry, fix, review, rename, add-sheet, clear)
├── .github/workflows/deploy.yml             ← GitHub Pages デプロイ workflow
├── .gitignore                               ← node_modules, .cache, venv, dist 除外
├── README.md
├── plan.md                                  ← このファイル
├── tools/                                   ← パイプライン
│   ├── crop.mjs                              # ソースシートをグリッドで切り出し
│   ├── postprocess.mjs                       # rembg + 透過処理 + LINE 規格仕上げ
│   ├── apply-rename.mjs                      # rename-map.json を再適用
│   ├── package.json
│   ├── py/
│   │   ├── rembg-batch.sh                    # nix-shell 経由で rembg を呼ぶラッパー
│   │   └── venv/                             # Python venv (gitignored)
│   └── .cache/                               # 切り出し中間 + rembg 出力 (gitignored)
├── stickers/                                ← 最終出力 (207枚 + main/tab、約36MB、git 込み)
└── ui/
    ├── src/App.tsx, App.css, manifest.json
    ├── scripts/build-manifest.mjs            # stickers/ をスキャンして manifest 生成
    ├── public/stickers → ../../stickers      # 相対 symlink、build 時に dist/ にコピーされる
    └── vite.config.ts                        # base path: /stamak/ (GitHub Pages 用)

~/BoxSync/tool/stamak/                       ← ソース画像のみ (同期で他デバイスに行く)
├── *.jpg / *.png                             # 14シートのソース
└── .claude/commands/                         # ここで Claude を起動した時用にコピー
```

## 元画像の場所と扱い

- ソース画像は `/home/sasakiy/BoxSync/tool/stamak/` にあります（BoxSync で他デバイスと同期）
- パスはプロジェクトルートの `.env` の `STAMAK_SOURCE_DIR` で指定（`tools/package.json` の `crop` スクリプトが `node --env-file-if-exists=../.env` で読み込む）。`crop.mjs` 側にも BoxSync 絶対パスのデフォルトあり
- 場所を変えるときは `.env` の 1 行だけ書き換えれば OK。`.env.example` がコミット済テンプレ
- 「BoxSync が古いバージョンに勝手に巻き戻す」現象を避けるため、プログラムと出力は BoxSync 外（ここ）に置いている

## パイプラインを動かす

```bash
cd ~/projects/stamak/tools
npm run build              # crop → rembg → finalize の全行程 (約2分)
npm run rebuild:final      # 仕上げだけやり直し (rembg キャッシュ活用、30秒)
npm run retry              # 全削除して全行程 (約2分)
npm run clear              # stickers/ と .cache/ を全削除
```

スラッシュコマンドからも:
- `/build` — フルビルド
- `/retry` — クリアして全ビルド
- `/fix <ファイルパス or 説明>` — 個別の不具合を診断・修正
- `/review [シート名]` — 出力を私が目視チェックして問題報告
- `/rename <シート名>` — テキスト/感情に基づいて `01_むり.png` 形式にリネーム
- `/add-sheet <ファイル名>` — 新しいソースシートを SHEETS 配列に登録
- `/clear` — 出力削除

## モデル選択 (`tools/postprocess.mjs` の SHEET_OPTS)

| モデル | 使用シート | 特徴 |
|---|---|---|
| `isnet-general-use` (デフォルト) | ゆるタイガー、下半身タイガー、ゴブリン等 11シート | 一般、~5秒/シート |
| `isnet-anime` | ドット霊夢、ドット万理沙 | アニメ/ピクセル特化、緑バック対応 |
| `birefnet-general` | 遅刻神、絶景 | 全景アート対応 (テキスト・月などの周辺要素も拾う)、~12秒/シート |
| `engine: "none"` | 目の錯覚 | 透過処理スキップ、白背景維持 (パンダ等、白を内部色とする絵柄) |

特殊オプション:
- `bg: "green"` — チロマキー的に緑色ピクセルを最終クリーンアップ (チビ画用)
- `alphaT: 30` — 二値化閾値を緩める (BiRefNet の滑らかな α 出力で薄い要素を保持)

## UI を動かす

```bash
cd ~/projects/stamak/ui
npm install                # 初回のみ
npm run dev                # http://localhost:5173 (開発)
npm run build              # dist/ にビルド
npm run preview            # http://localhost:4173 (本番ビルドの確認)
```

`scripts/build-manifest.mjs` が stickers/ をスキャンして `src/manifest.json` を作る。`npm run dev`/`build` で自動実行される。

## まだ残ってるタスク

### Phase 3 (完了)

- ✅ 初回コミット (`159d7b8`、`main` ブランチ)
- ✅ `oropon007-lang/stamak` (Public) に push
- ✅ GitHub Pages 有効化 (Actions ソース)
- ✅ デプロイ成功、https://oropon007-lang.github.io/stamak/ で公開中

### あると嬉しい (任意)

- [ ] UI の dev server が静的ファイルを返さない問題の調査 (build/preview は OK)
- [ ] スタンプの並び順を rename-map.json で制御できるように (現在はファイル名順)
- [ ] シート毎の説明・タグ追加 (例: 「動物系」「文字系」)
- [ ] 画像をクリックしたら LINE チャット風プレビューに切り替えるトグル機能
- [ ] 全シートの `tab.png` をシート切り替えタブのアイコンとして全面利用 (現状そうなってる)
- [ ] Dark mode

### 既知の小さな問題

- ドット霊夢_05 の上部リボンが穴あき気味 → AI モデル限界、許容範囲
- ドット万理沙_06 に visible green 80px 程度残存 → 視認不能レベル

## 環境再現メモ

新しいマシンでセットアップする場合:

```bash
git clone git@github.com:<USERNAME>/stamak.git ~/projects/stamak
cd ~/projects/stamak

# tools 用 (画像処理を回したい場合のみ)
cd tools && npm install
cd py
nix-shell -p python312 python312Packages.virtualenv --run "python3 -m venv venv"
nix-shell -p stdenv.cc.cc.lib zlib --run "
  source venv/bin/activate
  export LD_LIBRARY_PATH=\$NIX_LD_LIBRARY_PATH:\$LD_LIBRARY_PATH
  pip install 'rembg[gpu,cli]'
"
cd ../..
# .env を作ってソース画像の場所を指定
cp .env.example .env
$EDITOR .env   # STAMAK_SOURCE_DIR= を実環境のパスに書き換え
npm --prefix tools run build

# UI 用
cd ui && npm install && npm run dev
```

## 重要な決定事項 (これまでの合意)

- AI モデルは **rembg + ISNet/BiRefNet** (CPU、ローカル、無料、ライセンス全て MIT 系)
- **二値アルファ** で出力（中間アルファだと色付き背景でゴーストる）
- スタンプは LINE 規格内最大化 (height 320 まで拡大、偶数寸法、PNG)
- main/tab は各シートで自動生成（ソースは _01.png デフォルト、`mainSource`/`tabSource` で上書き可）
- rename 結果は `tools/rename-map.json` に保存して `/retry` で復元

## ハマったところ (再発防止メモ)

- **BoxSync が同期で古い版に巻き戻す** → プログラムを BoxSync 外に置けば回避
- **rembg の Python venv は絶対パスを焼き込む** → ディレクトリ移動したら venv 再作成必要
- **NixOS で onnxruntime が libstdc++.so.6 を見失う** → `nix-shell -p stdenv.cc.cc.lib zlib` 経由で起動 (`rembg-batch.sh` が対応)
- **Vite dev server で symlink + 日本語パスがうまく動かない** → build/preview は OK なので一旦放置
- **二値化閾値 128 だと BiRefNet の薄い要素 (月、テキスト)が消える** → `alphaT: 30` で対応
