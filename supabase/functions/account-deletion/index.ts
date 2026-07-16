import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>アカウント削除 | Moveact</title>
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
    .steps {
      background: #f0f4f8;
      padding: 20px;
      border-radius: 8px;
      margin: 16px 0;
    }
    .steps ol {
      padding-left: 24px;
    }
    .steps li {
      margin-bottom: 8px;
    }
    .warning {
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 16px;
      border-radius: 4px;
      margin: 16px 0;
    }
    .contact {
      background: #f0f4f8;
      padding: 20px;
      border-radius: 8px;
      margin-top: 12px;
    }
    .contact p { margin-bottom: 4px; }
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
      <h1>アカウント削除について</h1>
      <p>Account Deletion</p>
    </header>

    <p>Moveactアプリのアカウント削除をご希望の場合は、以下の方法でお手続きいただけます。</p>

    <h2>アプリ内からの削除手順</h2>
    <div class="steps">
      <ol>
        <li>Moveactアプリを開きます</li>
        <li>「マイページ」タブをタップします</li>
        <li>「設定」をタップします</li>
        <li>「アカウント削除」をタップします</li>
        <li>確認画面で「削除する」をタップします</li>
      </ol>
    </div>

    <h2>削除されるデータ</h2>
    <p>アカウントを削除すると、以下のデータがすべて削除されます。</p>
    <ul>
      <li>アカウント情報（氏名、電話番号、メールアドレス）</li>
      <li>予約履歴</li>
      <li>回数券・サブスクリプション情報</li>
      <li>注文履歴</li>
      <li>プッシュ通知設定</li>
    </ul>

    <div class="warning">
      <p><strong>ご注意：</strong>アカウント削除は取り消すことができません。未使用の回数券やサブスクリプションがある場合は、削除前にスタッフまでご相談ください。</p>
    </div>

    <h2>データの保持期間</h2>
    <p>アカウント削除後、お客様の個人データは30日以内にすべてのシステムから完全に削除されます。ただし、法令に基づき保持が義務付けられている取引記録（決済履歴等）については、法定期間中は保持されます。</p>

    <h2>お問い合わせによる削除</h2>
    <p>アプリからの削除が難しい場合は、下記までご連絡ください。ご本人確認の上、アカウントの削除を行います。</p>
    <div class="contact">
      <p><strong>Moveact</strong></p>
      <p>金光店：岡山県浅口郡金光町占見新田790-1</p>
      <p>玉島店：岡山県倉敷市玉島1-2-3</p>
    </div>

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
