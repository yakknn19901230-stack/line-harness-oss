'use client'

import Link from 'next/link'

/**
 * 使い方ページ（静的・1カラム・大きめ文字）。
 * 保全くんの日々の使い方を、IT が苦手な方でも読めるよう、です・ます調でまとめる。
 * サイドバー最下部の「使い方」から開く。文面は静的（データ取得なし）。
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
      <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] sm:text-base leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white"
        style={{ backgroundColor: '#14283F' }}
      >
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}

/** そのままコピーして使える文例ボックス（本文は改行を保持して表示）。 */
function Example({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-900 mb-1">{label}</p>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

export default function GuidePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">保全くんの使い方</h1>
        <p className="text-sm text-gray-500 mt-1">
          はじめての方は、上から順に読んでみてください。
        </p>
      </div>

      <Section title="保全くんとは">
        <p>
          保全くんは、保険営業の「保全業務」から次のご紹介や追加のご契約につなげるための、
          顧客管理の道具です。
        </p>
        <p>
          お客様の誕生日や契約の更新時期、面談のメモなどをためておくと、
          「今日は誰に連絡すればよいか」を保全くんが毎日自動で教えてくれます。
          むずかしい設定はいりません。出てきた人に、順番に連絡していくだけです。
        </p>
      </Section>

      <Section title="お客様に友だち追加してもらうには">
        <p>
          お客様に渡す「友だち追加URL」と「QRコード」は、設定の
          <Link href="/accounts" className="text-brand font-medium underline mx-0.5">LINEアカウント</Link>
          画面に表示されています。
        </p>
        <ol className="space-y-3">
          <Step n={1}>
            設定の
            <Link href="/accounts" className="text-brand font-medium underline mx-0.5">LINEアカウント</Link>
            を開きます。
          </Step>
          <Step n={2}>
            アカウントの「友だち追加」欄にあるURLをコピーするか、「QRを保存」で
            QRコード画像を保存します。
          </Step>
        </ol>
        <p>
          これをお客様にお渡しすれば、タップまたは読み取りで友だち追加してもらえます。
        </p>
        <p className="text-sm text-gray-500">
          名刺印刷などで短いURL（lin.ee）が必要な場合は、LINE公式アカウントの管理画面
          （manager.line.biz）で発行できます。手順：manager.line.biz にログイン→
          アカウントを選択→「友だちを増やす」→「URLを作成」または「友だち追加QRコードを作成」。
        </p>

        <div className="pt-2">
          <p className="font-medium text-gray-900 mb-2">運用のコツ</p>
          <ul className="space-y-2 list-disc pl-5">
            <li>名刺の裏にQRコードを印刷しておく。渡すだけで案内が終わります。</li>
            <li>
              スマホにQRコード画像を保存しておき、面談の最後に画面を見せて、
              その場で読み取ってもらいます。
            </li>
            <li>既存のお客様には、下の文例をコピーしてLINEやメールで送ります。</li>
          </ul>
        </div>

        <div className="pt-2 space-y-3">
          <p className="font-medium text-gray-900">そのまま使える文例</p>
          <Example
            label="■ 面談の最後に口頭で伝えるとき"
            body={'「最後にひとつだけ。今後のご連絡、LINEでいただけると見落としがなくて助かります。このQRコードから追加してもらえますか。」'}
          />
          <Example
            label="■ 既存のお客様にLINEやメールで送るとき"
            body={
`〇〇様
お世話になっております。△△です。
このたび、保険のご連絡窓口をLINEにご用意しました。更新のお知らせや手続きのご案内をこちらからお送りします。お手数ですが、下のリンクから友だち追加をお願いできますか。
（ここに友だち追加URLを貼る）
ご質問などもLINEからどうぞ。お電話より早くお返事できることが多いです。`}
          />
          <Example
            label="■ メールの署名や資料の隅に添えるとき"
            body={'保険のご相談・お手続きはLINEからどうぞ（友だち追加URL）'}
          />
          <p className="text-sm text-gray-500">
            〇〇様・△△はお客様とご自身の名前に置き換えてください。
          </p>
        </div>
      </Section>

      <Section title="毎朝の使い方">
        <p>朝、まずダッシュボードを開いてください。今日やることがカードで並びます。</p>
        <ol className="space-y-3">
          <Step n={1}>
            <Link href="/" className="text-brand font-medium underline">ダッシュボード</Link>
            を開きます。「今週の誕生日」「契約更新が近い顧客」「今日のフォロー予定」「乗り換え提案の候補」が出ています。
          </Step>
          <Step n={2}>
            出ている人を上から順に対応します。名前を押すとチャットが開き、
            ぴったりの文面が用意された状態から始められます。
          </Step>
          <Step n={3}>
            連絡し終えたら「済み」を押します。カードが消えていきます。
          </Step>
          <Step n={4}>
            カードが全部消えたら、今日の保全は完了です。おつかれさまでした。
          </Step>
        </ol>
      </Section>

      <Section title="メッセージの送り方">
        <p>
          ダッシュボードやフォロー予定から名前を押すと、そのお客様とのチャットが開きます。
          誕生日や更新のご案内など、場面に合った文面が最初から入っているので、
          そのまま送っても、少し書き足してから送ってもかまいません。
        </p>
        <p>
          <span className="font-medium text-gray-900">「場面から選ぶ」</span>
          を押すと、あいさつ・お礼・リスケ対応など、よく使う文面を呼び出せます。
          呼び出したあとは自由に編集できます。ひとことでも相手のことを添えると、
          より気持ちが伝わります。
        </p>
        <p>
          文面の下にある
          <span className="font-medium text-gray-900">「面談メモ」</span>
          を開くと、そのお客様の直近のメモを見ながら書けます。
        </p>
      </Section>

      <Section title="顧客カルテの育て方">
        <p>
          保全くんは、お客様の情報を入れるほど賢くなります。
          <Link href="/friends" className="text-brand font-medium underline">友だち管理</Link>
          から、次のような情報を少しずつ足していってください。
        </p>
        <ul className="space-y-2 list-disc pl-5">
          <li>
            <span className="font-medium text-gray-900">誕生日</span>
            … 入れておくと、その週にダッシュボードへ自動で出ます。
          </li>
          <li>
            <span className="font-medium text-gray-900">契約</span>
            （契約名・更新日）… 更新の60日前になると自動でお知らせが出ます。
          </li>
          <li>
            <span className="font-medium text-gray-900">面談メモ</span>
            … 会ったときの話を日付つきで残せます。次の連絡のときに役立ちます。
          </li>
          <li>
            <span className="font-medium text-gray-900">次回フォロー予定</span>
            … 「いつ・何を」を決めておくと、その日にダッシュボードへ出ます。
          </li>
        </ul>
        <p className="text-sm text-gray-500">
          入れた情報が多いほど、毎朝の「今日やること」が正確になっていきます。
        </p>
      </Section>

      <Section title="困ったときは">
        <p>
          <Link href="/notifications" className="text-brand font-medium underline">未対応</Link>
          には、お客様からの返信にまだ返せていない会話が集まります。
          返信すると、その会話は一覧から消えます。ここが空になっていれば、返し忘れはありません。
        </p>
        <div className="space-y-3 pt-1">
          <div>
            <p className="font-medium text-gray-900">Q. ダッシュボードに誰も出てきません。</p>
            <p>
              A. 今日ご連絡すべき方がいないか、まだお客様の情報（誕生日・契約・フォロー予定）が
              入っていない状態です。友だち管理から少しずつ足していってください。
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Q. 送った相手がまだカードに残っています。</p>
            <p>
              A. メッセージを送ると自動で「済み」になりますが、手動で送った場合は
              「済み」を押すと消えます。
            </p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Q. まちがえて「済み」にしてしまいました。</p>
            <p>
              A. 情報は消えていません。翌年の誕生日や次の更新時期など、次のタイミングでまた出てきます。
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
