// SIMPLE_MODE（保全くんモード）判定。ここ1箇所だけが環境変数を参照し、
// 各画面はこの関数だけを見る。
//
// - デフォルト ON: NEXT_PUBLIC_SIMPLE_MODE が未設定なら SIMPLE_MODE 有効。
// - 明示的に "false" が設定されたときだけ、全機能表示（本家どおり）に戻る。
//
// NEXT_PUBLIC_ 変数はビルド時にインライン化されるため、クライアント/サーバ
// どちらのコンポーネントからでも参照できる。
export function isSimpleMode(): boolean {
  return process.env.NEXT_PUBLIC_SIMPLE_MODE !== 'false'
}
