# stamak

LINEスタンプ作成パイプライン + プレビュー UI。

## 構成

```
~/projects/stamak/
├── tools/               # 画像処理パイプライン (Node.js + Python rembg)
│   ├── crop.mjs           # シート画像をグリッドで切り出し
│   ├── postprocess.mjs    # rembg + 透過処理 + LINE規格仕上げ
│   ├── apply-rename.mjs   # 任意のリネームマップを再適用
│   ├── py/                # Python venv + rembg-batch.sh
│   └── .cache/            # 中間ファイル (gitignored)
├── stickers/            # 最終出力 PNG (シート別、main.png/tab.png 付き)
└── ui/                  # React + Vite プレビュー UI

# ソース画像は別管理
/home/sasakiy/BoxSync/tool/stamak/  # 元シート画像 (.jpg/.png)
```

## パイプラインを動かす

ソース画像を BoxSync 配下に置いて、`tools/crop.mjs` の `SHEETS` に登録してから:

```bash
cd ~/projects/stamak/tools
npm run build       # crop → rembg → finalize
npm run rebuild:final  # 仕上げだけやり直し (rembg キャッシュ活用)
npm run clear       # 全削除
```

`STAMAK_SOURCE_DIR` 環境変数でソース画像のディレクトリを上書きできます。

### 必要環境

- Node.js 22+
- Nix (rembg を動かすために `nix-shell -p stdenv.cc.cc.lib zlib` を内部で利用)
- Python venv が `tools/py/venv` にあること（初回は手動セットアップ）

```bash
cd ~/projects/stamak/tools/py
nix-shell -p python312 python312Packages.virtualenv --run "python3 -m venv venv"
nix-shell -p stdenv.cc.cc.lib zlib --run "
  source venv/bin/activate
  export LD_LIBRARY_PATH=\$NIX_LD_LIBRARY_PATH:\$LD_LIBRARY_PATH
  pip install 'rembg[gpu,cli]'
"
```

## UI を動かす

```bash
cd ~/projects/stamak/ui
npm install
npm run dev       # http://localhost:5173 (開発)
npm run build     # dist/ にビルド
npm run preview   # http://localhost:4173 (本番ビルドの確認)
```

## GitHub Pages デプロイ

`main` ブランチへ push すると `.github/workflows/deploy.yml` が動き、`https://<user>.github.io/stamak/` に公開されます。

カスタムドメインで使う場合は workflow の `BASE` を上書き:

```yaml
env:
  BASE: /
```

## モデル選択 (rembg)

シート毎の AI モデルは `tools/postprocess.mjs` の `SHEET_OPTS` で指定:

| モデル | 用途 |
|---|---|
| `isnet-general-use` | 一般 (デフォルト) |
| `isnet-anime` | アニメ調・ピクセルアート (チビ画) |
| `birefnet-general` | 全景アート (背景含めて切り抜きたい時、遅め) |

`engine: "none"` を指定すると透過処理をスキップして白背景を保持 (パンダ等、白を内部色として使う絵柄向け)。
