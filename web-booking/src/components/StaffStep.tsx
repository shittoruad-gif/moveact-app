import type { RosterStaff } from '../lib/api';
import { workDaysLabel } from '../lib/api';

interface Props {
  staffList: RosterStaff[];
  selected: string | null | undefined;   // undefined=未選択, null=おまかせ, string=指名
  onSelect: (id: string | null) => void;
}

// フロー内の担当者（スタッフ）指名選択。おまかせ or 指名を1つ選ぶ。
export function StaffStep({ staffList, selected, onSelect }: Props) {
  return (
    <div>
      <h2 className="heading">ご希望の担当者</h2>
      <p className="lead">ご指名の担当者をお選びください。「おまかせ」も選べます。</p>

      <button
        type="button"
        className={`staff-pick ${selected === null ? 'on' : ''}`}
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
      >
        <div className="sp-avatar omakase">指</div>
        <div className="sp-body">
          <div className="sp-name">おまかせ</div>
          <div className="sp-note">空いている担当者がご対応します</div>
        </div>
        <span className="sp-check" aria-hidden="true" />
      </button>

      {staffList.length > 0 && <div className="eyebrow">指名する</div>}
      {staffList.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`staff-pick ${selected === s.id ? 'on' : ''}`}
          aria-pressed={selected === s.id}
          onClick={() => onSelect(s.id)}
        >
          <div className="sp-avatar">
            {s.photoUrl
              ? <img src={s.photoUrl} alt={s.name} loading="lazy" />
              : s.name.charAt(0)}
          </div>
          <div className="sp-body">
            <div className="sp-name">
              {s.name}
              {s.title && <span className="sp-title">{s.title}</span>}
            </div>
            <div className="sp-note">
              {s.workDays && s.workDays.length > 0
                ? <>出勤：{workDaysLabel(s.workDays)}</>
                : 'ご指名で予約します'}
            </div>
            {s.bio && <p className="sp-bio">{s.bio}</p>}
          </div>
          <span className="sp-check" aria-hidden="true" />
        </button>
      ))}

      {staffList.length === 0 && (
        <p className="note">この店舗は担当者のご指名を承っておりません。<br />「おまかせ」でお進みください。</p>
      )}
    </div>
  );
}
