// 前回のお客様情報を「この端末だけ」に記憶して、次回の予約で自動入力する。
// =====================================================
// 目的: リピーターが毎回 お名前・電話・メール を打ち直す手間をなくす。
// 方針:
//   - 保存先は localStorage（お客様の端末内のみ。サーバーへは何も増やさない）
//   - 保存するのは連絡先3項目だけ。ご要望・同意・学割は毎回入力し直してもらう
//     （前回の要望が残っていると誤って送信されるため。同意も毎回取り直すのが正しい）
//   - 家族共用スマホ等に配慮し、画面から「別の方が予約する」で消せるようにする

const KEY = 'moveact_booking_contact_v1';

export interface RememberedContact {
  name: string;
  phone: string;
  email: string;
}

export function loadRememberedContact(): RememberedContact | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<RememberedContact>;
    const name = typeof o.name === 'string' ? o.name : '';
    const phone = typeof o.phone === 'string' ? o.phone : '';
    const email = typeof o.email === 'string' ? o.email : '';
    // 3つとも空なら「記憶なし」と同じ扱い
    if (!name && !phone && !email) return null;
    return { name, phone, email };
  } catch {
    return null;   // プライベートブラウズ等で参照できない場合は静かに諦める
  }
}

export function saveRememberedContact(c: RememberedContact): void {
  try {
    const name = c.name.trim(), phone = c.phone.trim(), email = c.email.trim();
    if (!name && !phone && !email) return;
    localStorage.setItem(KEY, JSON.stringify({ name, phone, email }));
  } catch {
    /* 保存できない環境では自動入力を諦めるだけ（予約自体には影響させない） */
  }
}

export function clearRememberedContact(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
