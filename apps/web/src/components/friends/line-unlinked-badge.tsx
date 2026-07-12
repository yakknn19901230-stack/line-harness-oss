// 第25弾: CSVインポート由来の「LINE未連携」友だち(line_user_id が import: 始まり)の表示バッジ。
// 判定は @line-crm/shared の isImportPseudoId を使うこと(判定をUI側に書かない)。

export default function LineUnlinkedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-200 text-gray-600 ${className}`}
      title="CSVインポートで作成された顧客です。LINEでの友だち追加後に連携できます(メッセージ送信は不可)"
    >
      LINE未連携
    </span>
  )
}
