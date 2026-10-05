# PUBLISHING

公開する前に見ることと、リポジトリの説明文・トピックの案です。このファイルは実行の後に人が加えました
（goal-pack/SCOPE.md の「Changes after the run」の 5）。

## GitHub の説明文（案）

> A runnable demo of adding a group platform's sign-in to an existing multi-tenant SaaS without a
> second session: authorization code + PKCE ending in the app's own server-side session, Bearer
> tokens as in-memory principals, server-side permissions and signed webhooks. Built spec-first,
> implemented by one unattended goal-bus run.

日本語で出す場合の案です。

> 既存のマルチテナント SaaS に、グループ基盤の IdP ログインを後付けする動くデモ。認可コード + PKCE、
> Bearer トークンの受理、サーバー側の権限判定、署名付き Webhook とテナント同期。仕様駆動で書いた仕様から
> goal 包を作り、バスで無人実装しました。

## トピック（案）

`oauth2` `openid-connect` `pkce` `keycloak` `multi-tenant` `saas` `webhooks` `hmac` `fastify`
`react` `rsbuild` `mongodb` `playwright` `spec-driven-development` `spec-kit` `typescript`

## 公開前のチェックリスト

### 1. 漏れていないか

- [ ] 認証情報が一つも入っていないこと。少なくとも次を見ます。
      `git grep -nEi 'password|secret|token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY'`
      — 出てくるのは変数名・ダミー・説明文・テストが実行時に作る値だけであることを確認します。
- [ ] `.env.example` の値がすべてダミーか空であること。本物の値は `pnpm stack:up` が実行のたびに
      `${TMPDIR:-/tmp}/acme-idp-demo.env` に作り、リポジトリには書きません。
- [ ] この機械の絶対パスが入っていないこと。
      `git grep -nE '(^|[ "'"'"'(=])/(home|root|Users)/'`
- [ ] 会社名・製品名・顧客名・チーム名・個人名が入っていないこと。README 末尾の署名行だけが例外です。
      Acme Tasks とグループ基盤は架空の名前です。
- [ ] 実務の数値が入っていないこと。数字はケーススタディ側にあります。

### 2. 上流のファイル

- [ ] `.specify/` と `.claude/skills/speckit-*` は spec-kit v1.0.12 の `specify init` が生成したものです。
      上流のライセンスを `.specify/LICENSE-spec-kit` に置いています。消さないでください。

### 3. リンクが生きているか

- [ ] README の「背景」のケーススタディへのリンクと、「何を示すか」の spec-driven-dev-playbook への
      リンク。どちらも、そのリポジトリを公開した後でないと開けません。
- [ ] README の「作り方」の表から `specs/` と `goal-pack/` の各ファイルへのリンク。

### 4. 動くか

- [ ] README の「動かし方」の手順が通ること（`pnpm stack:up` → `pnpm install` → `pnpm seed` →
      `pnpm test` → `pnpm e2e`）。
- [ ] `pnpm lint` と `pnpm typecheck` が通ること。
- [ ] CI（`.github/workflows/ci.yml`）は、GitHub ではまだ一度も動かしていません。公開後、Actions を
      有効にして一度動かし、緑になることを確かめてください。

### 5. 残っていないか

- [ ] `pnpm stack:down -v` の後、`docker ps -a`、`docker volume ls`、`docker network ls` を
      `acme-idp-demo` で絞って、どれも何も出ないこと。
- [ ] 不要になったら `${TMPDIR:-/tmp}/acme-idp-demo.env` を手で消すこと（`pnpm stack:down` は消しません）。
