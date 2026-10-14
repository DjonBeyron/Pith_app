import { useState } from 'react'
import { SPRITES } from '../../scene/v2/sprites/spriteRegistry.js'
import SpriteCard from './SpriteCard.jsx'
import ScTip from './ScTip.jsx'

// Раздел «Спрайты»: галерея реестра SPRITES с фильтром по категории и короткое
// пояснение для администратора (слот, якорь, бюджет). Карточки — SpriteCard.
const CATEGORIES = [
  ['all', 'Все'], ['character-part', 'Коты'], ['office', 'Офис'], ['cafe', 'Кафе'], ['common', 'Общие'], ['background', 'Фоны'],
]

export default function SpritesPanel() {
  const [cat, setCat] = useState('all')
  const list = cat === 'all' ? SPRITES : SPRITES.filter(s => s.category === cat)

  return (
    <div className="scSprites">
      <div className="scCard scExplain">
        <p className="scCardTitle">Как устроена сцена</p>
        <ul className="scList">
          <li>
            <b>Спрайт</b> — один рисунок SVG из реестра: кот, предмет или фон. Коты и фон есть в каждой сцене, предметы ставятся по желанию.
          </li>
          <li>
            <b>Слот</b> <ScTip help="slot" /> — именованная ячейка на холсте («окно слева», «на столе справа»); у каждого — список совместимых предметов.
            Настольные слоты требуют стол.
          </li>
          <li>
            <b>Якорь</b> <ScTip help="anchor" /> — точка предмета, за которую он ставится в слот: низ (стоит), центр (висит на стене), верх (подвешен).
          </li>
          <li>
            <b>Бюджет</b> <ScTip help="budget" /> — предел числа фигур на сцену, чтобы слабые телефоны не лагали. Каждая карточка показывает,
            сколько узлов «стоит» спрайт <ScTip help="nodes" />, и прошёл ли он проверку <ScTip help="sprite_check" />.
          </li>
        </ul>
      </div>
      <div className="scFilter" role="tablist" aria-label="Категория спрайтов">
        {CATEGORIES.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={cat === id} className={cat === id ? 'scChip scChipOn' : 'scChip'} onClick={() => setCat(id)}>
            {label} <span className="scChipN">{id === 'all' ? SPRITES.length : SPRITES.filter(s => s.category === id).length}</span>
          </button>
        ))}
      </div>
      <div className="scGrid">
        {list.map(s => <SpriteCard key={s.id} sprite={s} />)}
      </div>
    </div>
  )
}
