// 顧客向けメール通知共通モジュール（Resend API使用）
// RESEND_API_KEY 未設定時は無音スキップ。
// RESEND_FROM_EMAIL: Resendで認証済みのsender（例: "Moveact予約 <noreply@moveact.jp>"）
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Moveact予約 <noreply@moveact.jp>';

const STORE_MAP: Record<string, { name: string; phone: string; address: string }> = {
  tamashima: { name: '玉島店', phone: '080-5126-4249', address: '〒713-8122 岡山県倉敷市玉島中央町3丁目911-186 2F' },
  kanamitsu: { name: '金光店', phone: '070-2231-8300', address: '〒719-0104 岡山県浅口市金光町占見新田283-1 2階' },
};
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export interface EmailData {
  guestName: string;
  guestEmail: string;
  date: string;            // YYYY-MM-DD (JST)
  time: string;            // HH:MM (JST)
  menuName: string;
  durationMinutes: number;
  storeId: string;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dow = new Date(`${d}T00:00:00+09:00`).getDay();
  return `${y}年${m}月${day}日（${WEEKDAYS[dow]}）`;
}

function endTime(time: string, dur: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + dur;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) {
    console.log('[email] RESEND_API_KEY not set — skipping');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[email] Resend error:', res.status, txt);
  }
}

function baseHtml(guestName: string, intro: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px">
<table width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
  <tr><td style="background:#1a1a1a;padding:28px 32px">
    <div style="color:#C4956A;font-size:22px;letter-spacing:4px;font-weight:300">MOVEACT</div>
    <div style="color:#888;font-size:12px;letter-spacing:2px;margin-top:4px">整体・美容鍼・ピラティス</div>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="color:#333;font-size:16px;margin:0 0 8px 0">${guestName} 様</p>
    <p style="color:#333;font-size:15px;margin:0 0 24px 0">${intro}</p>
    ${bodyHtml}
    <p style="color:#999;font-size:12px;margin-top:24px">このメールはMoveact Web予約システムから自動送信されています。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function bookingTable(data: EmailData): string {
  const store = STORE_MAP[data.storeId];
  if (!store) return '';
  return `
<table width="100%" style="border:1px solid #e8e4dd;border-radius:6px;overflow:hidden">
  <tr><td style="background:#f8f5f0;padding:12px 16px;border-bottom:1px solid #e8e4dd">
    <span style="color:#C4956A;font-size:12px;letter-spacing:1px">ご予約内容</span>
  </td></tr>
  <tr><td style="padding:16px">
    <table width="100%">
      <tr><td style="color:#888;font-size:13px;padding:5px 0;width:80px">日時</td>
          <td style="color:#333;font-size:14px;font-weight:bold;padding:5px 0">${fmtDate(data.date)} ${data.time}〜${endTime(data.time, data.durationMinutes)}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:5px 0">メニュー</td>
          <td style="color:#333;font-size:14px;padding:5px 0">${data.menuName}（${data.durationMinutes}分）</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:5px 0">店舗</td>
          <td style="color:#333;font-size:14px;padding:5px 0">${store.name}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:5px 0">住所</td>
          <td style="color:#666;font-size:13px;padding:5px 0">${store.address}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:5px 0">電話</td>
          <td style="color:#333;font-size:13px;padding:5px 0">${store.phone}</td></tr>
    </table>
  </td></tr>
</table>`;
}

export async function sendConfirmationEmail(data: EmailData): Promise<void> {
  if (!data.guestEmail) return;
  const store = STORE_MAP[data.storeId];
  if (!store) return;
  const dateLabel = fmtDate(data.date);
  const body = bookingTable(data) + `
<div style="background:#fff9f0;border-left:3px solid #C4956A;padding:12px 16px;margin-top:20px;font-size:13px;color:#666;border-radius:0 4px 4px 0">
  ご予約の変更・キャンセルは、前日までにお電話にてご連絡ください。<br>
  当日のキャンセル・無断キャンセルの場合は、施術1回分の料金を申し受けます。
</div>`;
  const html = baseHtml(data.guestName, '当日お気をつけてお越しくださいませ。', body);
  await sendEmail(data.guestEmail, `【Moveact】ご予約が確定しました｜${dateLabel} ${data.time}`, html);
}

export async function sendReminderEmail(data: EmailData): Promise<void> {
  if (!data.guestEmail) return;
  const store = STORE_MAP[data.storeId];
  if (!store) return;
  const dateLabel = fmtDate(data.date);
  const body = bookingTable(data) + `
<div style="background:#fff9f0;border-left:3px solid #C4956A;padding:12px 16px;margin-top:20px;font-size:13px;color:#666;border-radius:0 4px 4px 0">
  ご変更・キャンセルは本日中にお電話にてご連絡ください。<br>
  当日のキャンセル・無断キャンセルの場合は、施術1回分の料金を申し受けます。
</div>`;
  const html = baseHtml(data.guestName, '明日のご予約のご案内です。お気をつけてお越しくださいませ。', body);
  await sendEmail(data.guestEmail, `【Moveact】明日のご予約のご案内｜${dateLabel} ${data.time}`, html);
}
