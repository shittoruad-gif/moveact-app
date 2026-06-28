// 日付・金額の表示フォーマット共通ユーティリティ
// =====================================================
// 全画面で同じフォーマットを使うために定義。タイムゾーンは Asia/Tokyo 固定。

const TZ = 'Asia/Tokyo';

/**
 * 「2026年4月30日」形式
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ja-JP', {
    timeZone: TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 「2026/4/30」形式（コンパクト）
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ja-JP', {
    timeZone: TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

/**
 * 「14:30」形式
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('ja-JP', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 「2026年4月30日 14:30」形式
 */
export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * 「¥1,234」形式
 */
export function formatYen(amount: number | null | undefined): string {
  return `¥${(amount ?? 0).toLocaleString('ja-JP')}`;
}

/**
 * エラーオブジェクトから安全なメッセージを抽出（PIIや内部詳細を含めない）
 */
export function safeErrorMessage(e: unknown, fallback = 'エラーが発生しました'): string {
  if (e instanceof Error) {
    const msg = e.message;
    // メールアドレス・電話番号らしき文字列が含まれていたら fallback 返す
    if (/@\S+\.\S+|\+?\d{10,}/.test(msg)) return fallback;
    if (msg.length > 200) return fallback;
    if (!msg) return fallback;
    return msg;
  }
  if (typeof e === 'string' && e.length < 200) return e;
  return fallback;
}

/**
 * デバウンスヘルパー（TextInput 等で使用）
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
