// 第25弾: CSVインポートで作る「LINE未連携」友だちの疑似ID。
//
// friends.line_user_id は UNIQUE NOT NULL のため、LINE未連携の顧客レコードは
// `import:` プレフィックスの疑似IDで表現する(スキーマ変更なし)。
// 疑似IDの友だちにはLINE送信できない — 送信ガードの実体は
// packages/line-sdk/src/client.ts(pushMessage / multicast)にあり、
// プレフィックス文字列は両パッケージで一致していること(workerのテストで担保)。
//
// 後日のLINE本連携時のマージ(疑似レコード → 本物のline_user_id への統合)は
// 第25弾のスコープ外(integration-design.md の宿題参照)。

export const IMPORT_PSEUDO_ID_PREFIX = 'import:';

/** CSVインポート由来の「LINE未連携」疑似IDかどうか。 */
export function isImportPseudoId(lineUserId: string | null | undefined): boolean {
  return typeof lineUserId === 'string' && lineUserId.startsWith(IMPORT_PSEUDO_ID_PREFIX);
}

/** 新しい疑似IDを採番する(worker側のインポートAPIで使用)。 */
export function makeImportPseudoId(): string {
  // shared のビルドは DOM lib なしのため globalThis 経由で参照(Workers/ブラウザ両方に存在する)
  const { crypto } = globalThis as unknown as { crypto: { randomUUID(): string } };
  return `${IMPORT_PSEUDO_ID_PREFIX}${crypto.randomUUID()}`;
}
