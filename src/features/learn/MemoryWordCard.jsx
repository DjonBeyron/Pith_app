import { useEffect, useRef, useState } from 'react'
import { X, Play } from 'lucide-react'
import WordCardBlocks from '../wordCard/WordCardBlocks.jsx'
import { loadWordCardRaw } from '../../shared/lib/lessonsApi.js'
import { normalizeWordCard } from '../wordCard/wordCardModel.js'
import { splitByWord } from '../review/reviewSession.js'
import { useWordVoice } from './useWordVoice.js'
import { levelOf, lineFills } from './memoryLadder.js'
import { dueLabel } from './learnView.js'

const LEVEL_SHORT = ['Новые', 'Знакомые', 'Усвоенные']
const LEVEL_COLOR = ['var(--lvl1)', 'var(--lvl2)', 'var(--lvl3)']

// Карточка слова — справка для новичка (PROJECT.md → «Макет «Карточка слова»»): слово,
// озвучка, перевод, где оно в фразе, блоки справки урока-слова (script.wordCard) и одна
// строка про память. Открывается тапом по слову в карточке выученной фразы. Справки у
// слова нет (не написана или не загрузилась) — onFallback: обычное окно слова; пока
// идёт загрузка, не рисуется вовсе (карточка не мелькает перед окном слова), а карточка
// фразы под ней остаётся на экране; когда справка готова — onReady (фразу закрываем)
export default function MemoryWordCard({ word, phrase, perm, today, onLesson, onFallback, onReady, onClose }) {
  const [state, setState] = useState({ status: 'loading', card: null })
  const voice = useWordVoice()
  const fallbackRef = useRef(onFallback)
  const readyRef = useRef(onReady)
  useEffect(() => { fallbackRef.current = onFallback; readyRef.current = onReady })

  useEffect(() => {
    let off = false
    if (!word.lessonId) { fallbackRef.current(); return undefined }
    loadWordCardRaw(word.lessonId)
      .then(raw => {
        if (off) return
        const card = normalizeWordCard(raw)
        if (card) { readyRef.current?.(); setState({ status: 'ok', card }) }
        else fallbackRef.current()
      })
      .catch(() => { if (!off) fallbackRef.current() })
    return () => { off = true }
  }, [word.lessonId])

  // Пока справка грузится — ничего не рисуем: если справки у слова нет, сразу откроется
  // окно слова (onFallback), а мелькнувшая пустая карточка перед ним только путала бы
  if (state.status === 'loading') return null
  const card = state.card
  const lvl = levelOf(word.step) - 1
  const fills = lineFills(word.step)
  const when = perm ? '' : dueLabel(word.due, today)
  return (
    <div className="lrSheetBack" onClick={onClose}>
      <div className="wcCard" role="dialog" aria-label={`Карточка слова ${word.word}`} onClick={e => e.stopPropagation()}>
        <div className="wcHead">
          <div className="wcTop">
            <span className="wcTag">{card.tag || 'слово'}</span>
            <button className="wcX" onClick={onClose} aria-label="Закрыть"><X /></button>
          </div>
          <div className="wcWordRow">
            <h3 className="wcWord">{word.word}</h3>
            {voice.has(word.word) && (
              <button className="wcSnd" onClick={() => voice.play(word.word)} aria-label={`Воспроизвести «${word.word}»`}><Play fill="currentColor" /></button>
            )}
          </div>
          {word.translation && <p className="wcGloss">{word.translation}</p>}
          {phrase && (
            <div className="wcCtx">
              <span>В фразе</span>
              <p>{splitByWord(phrase, word.word).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</p>
            </div>
          )}
        </div>
        <div className="wcMid">
          <WordCardBlocks nodes={card.nodes} />
        </div>
        <div className="wcFoot">
          <div className="wcMem">
            {!perm && <span className="wcLine">{fills.map((f, i) => <i key={i} style={{ '--c': LEVEL_COLOR[i], '--f': `${f * 100}%` }} />)}</span>}
            <span>
              <b style={{ color: perm ? 'var(--lvlP)' : LEVEL_COLOR[lvl] }}>{perm ? 'Постоянная память' : LEVEL_SHORT[lvl]}</b>
              {!perm && ` · шаг ${word.step} из 5`}{when && ` · повтор ${when}`}
            </span>
          </div>
          <div className="wcActs">
            {word.lessonId && <button className="lrBtn lrBtnMain" onClick={onLesson}>Пройти урок слова</button>}
            <button className="lrBtn lrBtnGhost" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  )
}
