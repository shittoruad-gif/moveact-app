-- Migration 078: 事前決済ゲートの動作確認で作成したテスト予約を削除
-- 077デプロイ後の本番動作確認（create→confirm）で作成した
-- guest_name='【動作確認】テスト' の予約を掃除する。実顧客データには影響しない。
DELETE FROM app_bookings
 WHERE source = 'web'
   AND guest_name = '【動作確認】テスト'
   AND guest_phone_norm = '09000000077';
