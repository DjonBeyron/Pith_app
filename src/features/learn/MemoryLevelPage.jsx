import BackButton from '../../shared/ui/BackButton.jsx'
import MemoryWordChip from './MemoryWordChip.jsx'
import MemoryLevelHead from './MemoryLevelHead.jsx'
import { useWordVoice } from './useWordVoice.js'
import { pageTabs } from './memoryLadder.js'

// Страница уровней памяти (по числу, названию или ⤢ ступени, по пятиугольнику).
// Сверху — название уровня полностью: «Первый уровень памяти» … «Четвёртый
// уровень памяти» и стрелка «назад» в стиле «Ежедневных наград» (общий
// BackButton). Ниже — четыре вкладки с числами слов: три ступени и
// «Постоянная» (пятиугольник); переключаться можно, не возвращаясь. Шапка
// уровня (MemoryLevelHead) — что это за слова и когда спросим; её можно свернуть
// в иконку, дальше список слов
// (MemoryWordChip, строкой, у озвученных — ▶). level — 1..4, onLevel — сменить
// уровень, onWord(слово, perm) — окно слова, onBack — на главный экран памяти
export default function MemoryLevelPage({ ladder, level, onLevel, onWord, onBack }) {
  const tabs = pageTabs(ladder)
  const cur = tabs[level - 1]
  const voice = useWordVoice()
  const n = cur.words.length
  return (
    <div className="memPage">
      <header className="memHeader">
        <BackButton onClick={onBack} />
        <h1 className="memTitle">{cur.title}</h1>
      </header>
      <div className="memTabs" role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={t.id === level}
            className={`memTab memTab--${t.perm ? 'Perm' : t.id}`} onClick={() => onLevel(t.id)}>
            <b>{t.words.length}</b>{t.short}
          </button>
        ))}
      </div>
      <MemoryLevelHead cur={cur} level={level} />
      <div className="memList">
        {cur.words.map(w => (
          <MemoryWordChip key={w.word} w={w} row perm={cur.perm} onClick={word => onWord(word, cur.perm)}
            onPlay={voice.play} canPlay={voice.has(w.word)} />
        ))}
        {!n && !cur.perm && <p className="memListEmpty">Здесь пока пусто</p>}
      </div>
    </div>
  )
}
