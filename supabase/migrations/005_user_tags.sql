-- ユーザータグ（プロフィールに追加）
ALTER TABLE profiles ADD COLUMN tags TEXT[] DEFAULT '{}';

-- 回数券プランに対象タグを追加（空配列＝全員に表示）
ALTER TABLE ticket_plans ADD COLUMN target_tags TEXT[] DEFAULT '{}';

-- タグ検索用インデックス
CREATE INDEX idx_profiles_tags ON profiles USING GIN (tags);
CREATE INDEX idx_ticket_plans_target_tags ON ticket_plans USING GIN (target_tags);
