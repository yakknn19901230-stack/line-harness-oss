import { describe, expect, it } from 'vitest'
import {
  applySceneFills,
  findScene,
  isSceneText,
  renderSceneMessage,
  switchProposalFills,
} from './message-scenes'

// 第23弾仕上げ: switch_proposal の【現在の商品名】【乗り換え先の商品名】穴埋め。
// プレースホルダ表記は message-scenes.ts の中だけで管理する(テンプレと fills の対応ずれをここで検知)。

describe('switchProposalFills + applySceneFills', () => {
  it('switch_proposal の定型文に商品名が埋まり、プレースホルダが残らない', () => {
    const template = findScene('switch_proposal').template ?? ''
    const fills = switchProposalFills(
      'ソニー生命 バリアブルライフ 変額保険（終身型/無配当）',
      'マニュライフ生命 こだわり変額保険v2',
    )
    const text = applySceneFills(renderSceneMessage(template, '山田'), fills)

    expect(text).toContain('山田さん')
    expect(text).toContain('ソニー生命 バリアブルライフ 変額保険（終身型/無配当）')
    expect(text).toContain('マニュライフ生命 こだわり変額保険v2')
    expect(text).not.toContain('【現在の商品名】')
    expect(text).not.toContain('【乗り換え先の商品名】')

    // 穴埋め済み文面は fills 付きの isSceneText で「未編集の定型文」として認識される
    // (場面チップを切り替えて戻すとき、確認ダイアログなしで復元できる前提)
    expect(isSceneText(text, '山田', fills)).toBe(true)
    // fills なし・別名では一致しない(既存挙動の維持)
    expect(isSceneText(text, '山田')).toBe(false)
    // 値が空の fills は埋めずに残す(手で埋める従来運用)
    expect(applySceneFills('【現在の商品名】', { '【現在の商品名】': '' })).toBe('【現在の商品名】')
  })
})
