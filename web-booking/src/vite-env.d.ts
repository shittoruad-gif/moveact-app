/// <reference types="vite/client" />

// Meta Pixel（index.html で読み込み）。予約完了イベント送信用のグローバル関数。
interface Window {
  fbq?: (...args: unknown[]) => void;
}
