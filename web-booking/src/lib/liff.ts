// LINE（LIFF）連携：LINEのメニューから予約に来たお客様を本人と確認し、
// 連絡先を自動入力するための最小限のヘルパー。
// =====================================================
// 方針:
//   - VITE_LIFF_ID が未設定 / LINE外のブラウザ / 読み込み失敗 のときは
//     すべて null を返して**何もしない**（通常の予約フローに一切影響させない）。
//   - 本人確認はIDトークンをサーバー(line-booking-contact)へ渡し、
//     LINEのサーバーで検証する。クライアントはユーザーIDを名乗らない。

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;
const SDK_URL = 'https://static.line-scdn.net/liff/edge/2/sdk.js';

// deno-lint-ignore no-explicit-any
type Liff = any;

let liffPromise: Promise<Liff | null> | null = null;

function loadSdk(): Promise<Liff | null> {
  return new Promise((resolve) => {
    // すでに読み込まれている場合はそれを使う
    // deno-lint-ignore no-explicit-any
    const existing = (window as any).liff;
    if (existing) return resolve(existing);
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    // deno-lint-ignore no-explicit-any
    s.onload = () => resolve((window as any).liff ?? null);
    s.onerror = () => resolve(null);   // 通信不可でも予約は続けられるようにする
    document.head.appendChild(s);
  });
}

export function initLiff(): Promise<Liff | null> {
  if (!LIFF_ID) return Promise.resolve(null);        // 未設定＝機能オフ
  if (liffPromise) return liffPromise;
  liffPromise = (async () => {
    const liff = await loadSdk();
    if (!liff) return null;
    try {
      await liff.init({ liffId: LIFF_ID });
      return liff;
    } catch {
      return null;   // LIFF ID誤り等でも予約フローは止めない
    }
  })();
  return liffPromise;
}

/** LINEアプリ内で開かれ、本人が確認できる場合のみIDトークンを返す。それ以外は null。 */
export async function getLineIdToken(): Promise<string | null> {
  const liff = await initLiff();
  if (!liff) return null;
  try {
    if (!liff.isLoggedIn?.()) return null;
    return liff.getIDToken?.() ?? null;
  } catch {
    return null;
  }
}

/** LINE経由で開かれているか（案内文の出し分け用） */
export async function isInLineClient(): Promise<boolean> {
  const liff = await initLiff();
  if (!liff) return false;
  try { return !!liff.isInClient?.(); } catch { return false; }
}
