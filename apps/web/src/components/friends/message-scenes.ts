// 場面別メッセージの定型文（v1・仮文面）。
// ★ここが文面の唯一の置き場所。後で文面を差し替える運用を想定しているため、
//   コンポーネント側に文面を直書きしないこと（誕生日パネル等もここを参照する）。
// テンプレート内の {name} は友だちの表示名に置換される。各行の改行はそのまま送られる。

export interface MessageScene {
  /** 内部ID */
  id: string
  /** チップに出す表示名 */
  label: string
  /** 文面テンプレート。{name} が表示名に置換される。改行は保持。 */
  template: string
}

export const MESSAGE_SCENES: MessageScene[] = [
  {
    id: 'apo_thanks',
    label: 'アポ後お礼',
    template: `{name}さん、今日はお時間いただきありがとうございました。
話せてよかったです。
気になることが出てきたら、いつでも気軽に連絡してください。`,
  },
  {
    id: 'contract_thanks',
    label: '契約お礼',
    template: `{name}さん、このたびはありがとうございました。
ここからが本当のお付き合いだと思っています。
何かあったときは、まず私に連絡してください。`,
  },
  {
    id: 'reconnect',
    label: '久しぶりの連絡',
    template: `{name}さん、ご無沙汰しています。
ふと思い出して連絡しました。お変わりないですか。
また近いうちに、お茶でもしましょう。`,
  },
  {
    id: 'renewal_notice',
    label: '契約更新のご案内',
    template: `{name}さん、こんにちは。
ご契約の更新時期が近づいてきたのでご連絡しました。
内容の確認も兼ねて、一度お話しできたら嬉しいです。`,
  },
  {
    id: 'birthday',
    label: '誕生日',
    template: `{name}さん、お誕生日おめでとうございます🎂
1年に一度の日、ゆっくりできていますか。
{name}さんにとって、いい1年になりますように。`,
  },
]

/** 一覧の各行から開いたときの初期選択場面（一番使う場面）。 */
export const DEFAULT_SCENE_ID = 'apo_thanks'

/** テンプレートの {name} を表示名に置換する。名前が空なら「お客」。 */
export function renderSceneMessage(template: string, name: string): string {
  const n = name || 'お客'
  return template.replace(/\{name\}/g, n)
}

/** id から場面を引く。無ければ先頭を返す。 */
export function findScene(sceneId: string | undefined): MessageScene {
  return MESSAGE_SCENES.find((s) => s.id === sceneId) ?? MESSAGE_SCENES[0]
}
