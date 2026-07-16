import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>プライバシーポリシー | Moveact</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;
      line-height: 1.8;
      color: #333;
      background: #fafafa;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #4A90D9;
    }
    header h1 {
      font-size: 24px;
      color: #4A90D9;
      margin-bottom: 8px;
    }
    header p {
      font-size: 14px;
      color: #888;
    }
    h2 {
      font-size: 18px;
      color: #4A90D9;
      margin-top: 32px;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e0e0e0;
    }
    p { margin-bottom: 12px; }
    ul {
      margin-bottom: 12px;
      padding-left: 24px;
    }
    li { margin-bottom: 6px; }
    .contact {
      background: #f0f4f8;
      padding: 20px;
      border-radius: 8px;
      margin-top: 12px;
    }
    .contact p { margin-bottom: 4px; }
    .date {
      text-align: right;
      color: #888;
      font-size: 14px;
      margin-top: 32px;
    }
    footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      color: #888;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>プライバシーポリシー</h1>
      <p>Privacy Policy</p>
    </header>

    <p>Moveact（以下「当店」といいます）は、Moveactアプリ（以下「本アプリ」といいます）をご利用いただくお客様の個人情報の保護を重要な責務と認識し、以下のとおりプライバシーポリシーを定め、個人情報の適切な取扱いと保護に努めます。</p>

    <h2>1. 個人情報の定義</h2>
    <p>個人情報とは、氏名、電話番号、メールアドレス等、特定の個人を識別できる情報をいいます。</p>

    <h2>2. 個人情報の収集</h2>
    <p>当店は、本アプリにおいて以下の場合に個人情報を収集することがあります。</p>
    <ul>
      <li>アカウント登録の際にお名前、電話番号、メールアドレスをご提供いただく場合</li>
      <li>施術のご予約をいただく場合</li>
      <li>回数券・サブスクリプションをご購入いただく場合</li>
      <li>グループレッスンにご予約いただく場合</li>
      <li>物販商品をご注文いただく場合</li>
      <li>お問い合わせをいただく場合</li>
    </ul>

    <h2>3. 個人情報の利用目的</h2>
    <p>当店は、収集した個人情報を以下の目的で利用いたします。</p>
    <ul>
      <li>アカウントの作成・認証・管理</li>
      <li>ご予約の確認・変更・キャンセルに関するご連絡</li>
      <li>回数券・サブスクリプションの管理</li>
      <li>商品のご注文・お受け取りに関するご連絡</li>
      <li>グループレッスンの予約管理・ご案内</li>
      <li>当店のサービスやキャンペーン等に関するプッシュ通知・ご案内</li>
      <li>お客様からのお問い合わせへの対応</li>
      <li>サービスの品質向上および改善のための分析</li>
    </ul>

    <h2>4. 個人情報の第三者提供</h2>
    <p>当店は、以下の場合を除き、お客様の個人情報を第三者に提供することはありません。</p>
    <ul>
      <li>お客様ご本人の同意がある場合</li>
      <li>法令に基づく場合</li>
      <li>人の生命、身体または財産の保護のために必要がある場合であって、お客様の同意を得ることが困難である場合</li>
      <li>決済処理のために決済代行サービス（Stripe Inc.）に必要最低限の情報を提供する場合</li>
    </ul>

    <h2>5. 外部サービスの利用</h2>
    <p>本アプリでは、以下の外部サービスを利用しています。各サービスのプライバシーポリシーについては、各社のウェブサイトをご確認ください。</p>
    <ul>
      <li><strong>Supabase:</strong> アカウント認証・データ管理に使用</li>
      <li><strong>Stripe:</strong> 決済処理に使用</li>
      <li><strong>Expo:</strong> プッシュ通知の配信に使用</li>
    </ul>

    <h2>6. 個人情報の管理</h2>
    <p>当店は、お客様の個人情報を適切に管理し、個人情報の漏えい、滅失またはき損の防止に努めます。データは暗号化された通信（SSL/TLS）を使用して送受信され、適切なセキュリティ対策を講じたサーバーに保管されます。</p>

    <h2>7. 個人情報の開示・訂正・削除</h2>
    <p>お客様ご本人から個人情報の開示・訂正・削除の請求があった場合は、ご本人であることを確認した上で、速やかに対応いたします。アカウントの削除をご希望の場合は、アプリ内の設定画面またはお問い合わせ窓口よりお申し出ください。</p>

    <h2>8. プッシュ通知について</h2>
    <p>本アプリでは、予約のリマインダーやキャンセル通知、お知らせ等のプッシュ通知を送信する場合があります。プッシュ通知はアプリの設定画面またはお使いの端末の設定から無効にすることが可能です。</p>

    <h2>9. プライバシーポリシーの変更</h2>
    <p>当店は、必要に応じて本プライバシーポリシーの内容を変更することがあります。変更後のプライバシーポリシーは、本ページに掲載した時点から効力を生じるものとします。</p>

    <h2>10. お問い合わせ窓口</h2>
    <p>個人情報の取扱いに関するお問い合わせは、下記までご連絡ください。</p>
    <div class="contact">
      <p><strong>Moveact</strong></p>
      <p>金光店：岡山県浅口郡金光町占見新田790-1</p>
      <p>玉島店：岡山県倉敷市玉島1-2-3</p>
    </div>

    <p class="date">制定日：2026年4月7日</p>

    <footer>
      <p>&copy; 2026 Moveact. All rights reserved.</p>
    </footer>
  </div>
</body>
</html>`;

serve((_req: Request) => {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
});
