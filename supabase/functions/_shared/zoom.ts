// Zoom連携共通モジュール（Server-to-Server OAuth）
// =====================================================
// 予約確定時にZoom会議を自動作成する。Zoomの認証情報が未設定なら null を返し、
// 呼び出し側は「Zoom会議なし」として従来どおり処理を続行する（予約は絶対に止めない）。
//
// 必要な環境変数（Supabaseのシークレット）:
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
//   （ZoomマーケットプレイスでServer-to-Server OAuthアプリを作成し、scope: meeting:write）
// =====================================================
const ACCOUNT_ID = Deno.env.get('ZOOM_ACCOUNT_ID');
const CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET');

export function zoomConfigured(): boolean {
  return !!(ACCOUNT_ID && CLIENT_ID && CLIENT_SECRET);
}

async function getAccessToken(): Promise<string | null> {
  if (!zoomConfigured()) return null;
  try {
    const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ACCOUNT_ID!)}`,
      { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    if (!res.ok) { console.error('[zoom] token error', res.status, await res.text()); return null; }
    const j = await res.json();
    return (j.access_token as string) ?? null;
  } catch (e) {
    console.error('[zoom] token exception', (e as Error).message);
    return null;
  }
}

export interface ZoomMeeting { id: string; joinUrl: string; }

// 予約日時のZoom会議を作成。失敗時・未設定時は null（呼び出し側は無視して続行）。
export async function createZoomMeeting(opts: {
  hostUserId: string;   // 開催者のZoomユーザー（メール or userId）
  topic: string;
  startIso: string;     // 開始時刻 ISO8601（app_bookings.starts_at をそのまま渡す）
  durationMin: number;
}): Promise<ZoomMeeting | null> {
  try {
    if (!opts.hostUserId) return null;
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(opts.hostUserId)}/meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: opts.topic.slice(0, 200),
        type: 2,                      // 日時指定のミーティング
        start_time: opts.startIso,    // UTC ISO（Zはそのまま解釈）
        duration: opts.durationMin,
        timezone: 'Asia/Tokyo',
        settings: { join_before_host: true, waiting_room: true, approval_type: 2, audio: 'both' },
      }),
    });
    if (!res.ok) { console.error('[zoom] create error', res.status, await res.text()); return null; }
    const j = await res.json();
    if (!j.join_url) return null;
    return { id: String(j.id), joinUrl: j.join_url as string };
  } catch (e) {
    console.error('[zoom] create exception', (e as Error).message);
    return null;
  }
}
