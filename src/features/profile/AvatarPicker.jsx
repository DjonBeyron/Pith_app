import { AVATAR_SEEDS, avatarUrl } from '../../shared/lib/avatarPack.js'

// Сетка выбора аватара из готового пака DiceBear (https://www.dicebear.com) —
// свою картинку загрузить нельзя, только один из этих вариантов. Менять
// можно сколько угодно раз, без лимитов (в отличие от ника). Обёртку с
// заголовком/попапом рисует вызывающий компонент (AvatarPickerPopup).
export default function AvatarPicker({ selected, onSelect, busy }) {
  return (
    <div className="avpGrid">
      <button
        className={!selected ? 'avpItem avpItemActive' : 'avpItem'}
        onClick={() => onSelect(null)}
        disabled={busy}
        title="Буква вместо картинки"
      >
        <span className="avpDefault">Aa</span>
      </button>
      {AVATAR_SEEDS.map(seed => (
        <button
          key={seed}
          className={selected === seed ? 'avpItem avpItemActive' : 'avpItem'}
          onClick={() => onSelect(seed)}
          disabled={busy}
        >
          <img src={avatarUrl(seed)} alt="" />
        </button>
      ))}
    </div>
  )
}
