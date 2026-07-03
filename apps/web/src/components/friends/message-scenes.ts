// 場面別メッセージの定型文（v1・仮文面）。
// ★ここが文面の唯一の置き場所。後で文面を差し替える運用を想定しているため、
//   コンポーネント側に文面を直書きしないこと（誕生日パネル等もここを参照する）。
// テンプレート内の {name} は友だちの表示名に置換される。各行の改行はそのまま送られる。
//
// 一部の場面は「バリアント（枝分かれ）」を持つ。バリアントを持つ場面は、場面選択後に
// バリアント選択肢を出し、選んだバリアントの文面を挿入する（バリアントなしは1タップ）。

/** 場面のバリアント（枝分かれ）。 */
export interface SceneVariant {
  /** 内部ID（場面内で一意） */
  id: string
  /** バリアント選択肢に出す表示名 */
  label: string
  /** 文面テンプレート。{name} が表示名に置換される。改行は保持。 */
  template: string
}

export interface MessageScene {
  /** 内部ID */
  id: string
  /** チップに出す表示名 */
  label: string
  /** 文面テンプレート。{name} が表示名に置換される。改行は保持。
   *  バリアントを持つ場面では未使用（undefined）。 */
  template?: string
  /** 枝分かれ。指定時は場面選択後にこの選択肢を出す。 */
  variants?: SceneVariant[]
}

// 表示順は使用頻度順（面談前日リマインド → リスケ対応 → …）。
// ★既存5場面の id は変更しない（誕生日パネル等の scene 参照を壊さないため）。
export const MESSAGE_SCENES: MessageScene[] = [
  {
    id: 'reminder_prev_day',
    label: '面談前日リマインド',
    // 日時・場所は顧客ごとに違うので、手で埋める穴埋めプレースホルダを入れておく
    // （自動差し込みはしない／名前のみ自動差し込み）。
    template: `{name}さん、こんにちは。
明日【日時】に【場所】でお会いできるのを楽しみにしています。
お足元お気をつけてお越しください。よろしくお願いします。`,
  },
  {
    id: 'reschedule',
    label: 'リスケ対応',
    variants: [
      {
        id: 'child_sick',
        label: 'お子さんの体調不良',
        template: `{name}さん、承知しました。お子さんの体調は大丈夫ですか。
日程のことは全然大丈夫なので、今はどうか看病を優先してください。
落ち着いたら、またご連絡いただけたら嬉しいです。どうぞお大事に。`,
      },
      {
        id: 'self_sick',
        label: 'ご本人の体調不良',
        template: `{name}さん、承知しました。体調は大丈夫ですか。
日程のことは全然大丈夫なので、どうか無理をなさらないでください。
落ち着いたら、またご連絡ください。まずはお大事にしてください。`,
      },
      {
        id: 'work',
        label: 'お仕事の都合',
        template: `{name}さん、承知しました。お仕事お疲れさまです。
日程のことは全然気にしないでください。改めて調整しましょう。
落ち着いたタイミングで、またご連絡いただけたら嬉しいです。`,
      },
    ],
  },
  {
    id: 'apo_thanks',
    label: 'アポ後お礼',
    template: `{name}さん、今日はお時間いただきありがとうございました。
話せてよかったです。
気になることが出てきたら、いつでも気軽に連絡してください。`,
  },
  {
    id: 'birthday',
    label: '誕生日',
    template: `{name}さん、お誕生日おめでとうございます🎂
1年に一度の日、ゆっくりできていますか。
{name}さんにとって、いい1年になりますように。`,
  },
  {
    id: 'contract_thanks',
    label: '契約お礼',
    template: `{name}さん、このたびはありがとうございました。
ここからが本当のお付き合いだと思っています。
何かあったときは、まず私に連絡してください。`,
  },
  {
    id: 'renewal_notice',
    label: '契約更新のご案内',
    template: `{name}さん、こんにちは。
ご契約の更新時期が近づいてきたのでご連絡しました。
内容の確認も兼ねて、一度お話しできたら嬉しいです。`,
  },
  {
    id: 'reconnect',
    label: '久しぶりの連絡',
    template: `{name}さん、ご無沙汰しています。
ふと思い出して連絡しました。お変わりないですか。
また近いうちに、お茶でもしましょう。`,
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

/** バリアント（枝分かれ）を持つ場面かどうか。 */
export function hasVariants(scene: MessageScene): boolean {
  return Array.isArray(scene.variants) && scene.variants.length > 0
}
