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
    // 【】部分は顧客ごとに違うので、手で埋める穴埋めプレースホルダ（名前のみ自動差し込み）。
    template: `{name}さん、こんばんは。
明日【○時〜】、【場所】でお待ちしていますね。
前回お話しした内容で、気になったことや聞いてみたいことがあれば、明日まとめてお答えしますので、遠慮なくぶつけてください。
それでは明日、お会いできるのを楽しみにしています。
お気をつけてお越しください。`,
  },
  {
    id: 'reschedule',
    label: 'リスケ対応',
    variants: [
      {
        id: 'child_sick',
        label: 'お子さんの体調不良',
        template: `{name}さん、ご連絡ありがとうございます。
お子さんの体調が一番ですから、今日のところはどうかそばにいてあげてください。
面談の日程はこちらで調整しますね。あらためて、

・【候補日1 ○月○日(○) ○時〜】
・【候補日2 ○月○日(○) ○時〜】

このあたりでご都合いかがでしょうか。
合わないようでしたら、遠慮なくお知らせください。
早く良くなりますように。`,
      },
      {
        id: 'self_sick',
        label: 'ご本人の体調不良',
        template: `{name}さん、ご連絡ありがとうございます。
おつらい中、ご丁寧にご連絡いただいて恐縮です。
今日はどうかゆっくり休まれてください。
面談はあらためて、

・【候補日1 ○月○日(○) ○時〜】
・【候補日2 ○月○日(○) ○時〜】

このあたりでいかがでしょうか。
難しければ遠慮なくお知らせください。
どうぞお大事になさってください。`,
      },
      {
        id: 'work',
        label: 'お仕事の都合',
        template: `{name}さん、ご連絡ありがとうございます。
お仕事でしたら仕方ないです。どうかそちらを優先されてください。
面談はあらためて、

・【候補日1 ○月○日(○) ○時〜】
・【候補日2 ○月○日(○) ○時〜】

このあたりでご都合いかがでしょうか。
合わないようでしたら別の日程もお出ししますので、遠慮なくお知らせください。
引き続きよろしくお願いいたします。`,
      },
    ],
  },
  {
    id: 'apo_thanks',
    label: 'アポ後お礼',
    // 第20弾でバリアント化（次回決定済み／次回未定）。
    variants: [
      {
        id: 'next_fixed',
        label: '次回決定済み',
        template: `{name}さん、本日はお時間をいただきありがとうございました。
お話しできてうれしかったです。
次回は【○月○日(○) ○時〜】、【次回お話しする内容】についてお話しさせていただきますね。
しっかり準備してまいりますので、楽しみにしていてください。
それまでに気になることや聞いてみたいことが出てきましたら、いつでもこのLINEにお送りください。`,
      },
      {
        id: 'next_tbd',
        label: '次回未定',
        template: `{name}さん、本日はお時間をいただきありがとうございました。
お話しできてうれしかったです。
本日お話しした内容で、気になることや聞いてみたいことが出てきましたら、いつでもこのLINEにお送りください。
それと、次回ぜひ続きをお話しさせていただければと思っています。

・【候補日1 ○月○日(○) ○時〜】
・【候補日2 ○月○日(○) ○時〜】

このあたりでご都合いかがでしょうか。
合わないようでしたら、遠慮なくお知らせください。`,
      },
    ],
  },
  {
    id: 'birthday',
    label: '誕生日',
    template: `{name}さん、お誕生日おめでとうございます!
{name}さんにとって、すてきな一年になりますように。
また近況などお聞かせください。
これからの一年も、どうぞよろしくお願いいたします。`,
  },
  {
    id: 'contract_thanks',
    label: '契約お礼',
    template: `{name}さん、このたびはご契約いただきありがとうございました。
数ある選択肢の中から私を信頼してお任せいただけたこと、本当にうれしく思います。
ここからが本当のお付き合いのスタートだと思っています。
保険のことはもちろん、お金まわりで気になることがあれば、いつでもこのLINEにお送りください。
今後とも末永くよろしくお願いいたします。`,
  },
  {
    id: 'renewal_notice',
    label: '契約更新のご案内',
    template: `{name}さん、こんにちは。
ご契約中の保険が【○月】に更新の時期を迎えますので、ご案内です。
前回のご契約から時間も経っていますので、お仕事やご家族のことなど、状況が変わっていないかも含めて、一度お話しできればと思っています。

・【候補日1 ○月○日(○) ○時〜】
・【候補日2 ○月○日(○) ○時〜】

このあたりでご都合いかがでしょうか。
お会いできるのを楽しみにしています。`,
  },
  {
    id: 'switch_proposal',
    label: '乗り換えのご提案',
    // 第23弾: 乗り換え提案パネルから開く。商品名・理由は顧客ごとに違うので穴埋め。
    template: `{name}さん、こんにちは。
ご契約中の【現在の商品名】について、最近の商品と比べて見直しの余地がないか、定期的に点検しています。
{name}さんの場合、【乗り換え先の商品名】への切り替えで条件が良くなる可能性がありそうでしたので、ご案内です。
一度、現在のご契約内容の確認も兼ねてお話しできればと思っています。

・【候補日1 ○月○日(○) ○時〜】
・【候補日2 ○月○日(○) ○時〜】

このあたりでご都合いかがでしょうか。
無理にお勧めするものではありませんので、お気軽にご相談ください。`,
  },
  {
    id: 'reconnect',
    label: '久しぶりの連絡',
    template: `{name}さん、お久しぶりです。ご無沙汰してしまいました。
皆さまに順番にご連絡を差し上げています。
前回お話ししてから、お仕事やご家族のことなど、お変わりありませんか。
特に変わりないようでしたら、それが何よりです。
もし保険のことに限らず、お金まわりで気になっていることがありましたら、いつでもこのLINEにお送りください。`,
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

/**
 * 場面文面の【…】穴埋めプレースホルダを実データで置換する共通ヘルパ。
 * fills のキーは【…】を含む全文一致（例: '【現在の商品名】'）。値が空のキーは埋めずに残す
 * （手で埋める従来運用のまま）。fills 未指定なら何もしない。
 */
export function applySceneFills(text: string, fills?: Record<string, string>): string {
  if (!fills) return text
  let out = text
  for (const [placeholder, value] of Object.entries(fills)) {
    if (!value) continue
    out = out.split(placeholder).join(value)
  }
  return out
}

/**
 * 場面 switch_proposal の穴埋めセット（第23弾）。
 * プレースホルダ表記は文面テンプレと対で、このファイルの中だけで一致を管理する。
 * 呼び出し側（乗り換え提案パネル等）は商品名を渡すだけでよい。
 */
export function switchProposalFills(currentName: string, proposedName: string): Record<string, string> {
  return {
    '【現在の商品名】': currentName,
    '【乗り換え先の商品名】': proposedName,
  }
}

/** バリアント（枝分かれ）を持つ場面かどうか。 */
export function hasVariants(scene: MessageScene): boolean {
  return Array.isArray(scene.variants) && scene.variants.length > 0
}

/**
 * text が（name 差し込み済みの）いずれかの場面／バリアント定型文と完全一致するか。
 * 「未編集の定型文なら黙って置き換える／編集済みなら確認する」の判定に使う。
 * fills を渡すと穴埋め済みの文面（applySceneFills 適用後）も未編集扱いにする。
 */
export function isSceneText(text: string, name: string, fills?: Record<string, string>): boolean {
  const matches = (template: string): boolean => {
    const rendered = renderSceneMessage(template, name)
    if (rendered === text) return true
    return fills !== undefined && applySceneFills(rendered, fills) === text
  }
  for (const scene of MESSAGE_SCENES) {
    if (scene.template && matches(scene.template)) return true
    if (scene.variants) {
      for (const v of scene.variants) {
        if (matches(v.template)) return true
      }
    }
  }
  return false
}
