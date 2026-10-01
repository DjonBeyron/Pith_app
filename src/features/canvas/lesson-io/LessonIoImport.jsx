import { useMemo, useRef, useState } from 'react'
import { importLesson } from './importLesson.js'
import { lintLesson, fromCanvasNodes } from './lessonLint.js'
import { ALL_PARTS, peekParts, parsedSummary } from './lessonParts.js'
import LessonIoParts from './LessonIoParts.jsx'
import { plural } from '../../../shared/lib/plural.js'

// Правая колонка окна «Поделиться / Импорт» — импорт. В файле может быть любая из трёх
// частей урока-слова или все сразу (lessonParts.js): скрипт урока, карточки повтора,
// справка слова. Галочки выбирают, что применить; урок вставляется на холст кнопками
// «Добавить к уроку» / «Заменить урок», карточки и справка сохраняются на сервер сразу —
// всё за одно подтверждение. Результат проверки привязан к тексту, по которому он получен:
// правишь текст — старый отчёт исчезает сам
export default function LessonIoImport({ text, onText, readFile, title, lessonId, deck, wordCard, onImport, onError }) {
  const [pick, setPick] = useState(ALL_PARTS)
  const [res, setRes] = useState(null) // { forText, report, error, warnings }
  const [copiedWarnings, setCopiedWarnings] = useState(false)
  const fileRef = useRef(null)

  const found = useMemo(() => (text.trim() ? peekParts(text) : null), [text])
  const absent = found ? { lesson: !found.lesson, reviewCards: !found.reviewCards, wordCard: !found.wordCard } : {}
  const on = id => !!found && found[id] > 0 && !!pick[id]
  const anyOn = on('lesson') || on('reviewCards') || on('wordCard')
  const shown = res && res.forText === text ? res : null
  const warnings = shown?.warnings ?? []
  const info = found ? {
    lesson: `${found.lesson} ${plural(found.lesson, 'нода', 'ноды', 'нод')}`,
    reviewCards: `${found.reviewCards} ${plural(found.reviewCards, 'карточка', 'карточки', 'карточек')}`,
    wordCard: `${found.wordCard} ${plural(found.wordCard, 'блок', 'блока', 'блоков')}`,
  } : {}

  // Разбор без применения: сразу видно, сколько нод и СВЯЗЕЙ приедет
  function check() {
    try {
      const r = importLesson(text)
      // lintLesson — механическая проверка по правилам легенды (репиты
      // ответов, dictator без script, imagePrompt/note, подсветки за
      // границей текста, счётная похвала после ошибки). Не совет модели —
      // код, который либо находит нарушение, либо нет; ни один пункт не
      // «забывается» независимо от того, как их формировала нейросеть.
      const lint = r.nodes.length ? lintLesson(fromCanvasNodes(r.nodes)) : []
      setRes({
        forText: text,
        warnings: [...r.warnings, ...lint],
        report: `Разобрано: ${parsedSummary(r)}`
          + (r.nodes.length ? (lint.length ? ` · проверка правил: ${lint.length} замечаний` : ' · проверка правил: чисто') : ''),
      })
      return r
    } catch (e) {
      setRes({ forText: text, warnings: [], report: null, error: e.message ?? 'Не разобрал JSON' })
      return null
    }
  }

  const addReport = msg => setRes(s => (s ? { ...s, report: `${s.report} · ${msg}` } : s))

  // mode: 'append' | 'replace' — как вставить урок; 'parts' — урока нет, только карточки/справка
  function apply(mode) {
    const r = check()
    if (!r) return
    const lessonOn = mode !== 'parts' && on('lesson')
    const cardsOn = on('reviewCards') && r.reviewCards.length > 0
    const wordOn = on('wordCard') && !!r.wordCard
    if (!lessonOn && !cardsOn && !wordOn) return
    const otherLesson = r.lessonId ? r.lessonId !== lessonId : !!r.title && !!title && r.title !== title
    const lines = [
      otherLesson && `⚠ Файл выгружен из урока «${r.title || r.lessonId}», а открыт «${title || 'без названия'}».`,
      lessonOn && (mode === 'replace'
        ? `Урок: заменить весь урок на ${r.nodes.length} нод (${r.links} связей) — текущие ноды пропадут.`
        : `Урок: добавить ${r.nodes.length} нод (${r.links} связей) к текущему.`),
      cardsOn && `Карточки повтора: заменить колоду (сейчас ${deck.cards.length}) на ${r.reviewCards.length} — сохранится сразу.`,
      wordOn && `Справка слова: заменить справку (сейчас блоков: ${wordCard.card?.nodes.length ?? 0}) на ${r.wordCard.nodes.length} — сохранится сразу.`,
    ].filter(Boolean)
    if (!window.confirm(lines.join('\n'))) return
    if (lessonOn) onImport(r.nodes, r.zones ?? [], mode, r.links)
    setRes(s => ({ ...s, report: `Готово: ${[
      lessonOn && `${r.nodes.length} нод, ${r.links} связей на холсте`,
      cardsOn && 'карточки повтора', wordOn && 'справка слова',
    ].filter(Boolean).join(', ')}` }))
    if (cardsOn) {
      deck.applyImported(r.reviewCards, { ask: false }).then(addReport)
        .catch(e => onError(`Колода не сохранилась: ${e?.message ?? '?'}`))
    }
    if (wordOn) {
      wordCard.applyImported(r.wordCard, { ask: false }).then(addReport)
        .catch(e => onError(`Справка не сохранилась: ${e?.message ?? '?'}`))
    }
  }

  // Список предупреждений одним текстом, с номерами — удобно вставить целиком
  // обратно в чат с моделью, которая писала урок, вместо того чтобы
  // переписывать каждую строку руками
  async function copyWarnings() {
    try {
      await navigator.clipboard.writeText(warnings.map((w, i) => `${i + 1}. ${w}`).join('\n'))
      setCopiedWarnings(true)
      setTimeout(() => setCopiedWarnings(false), 1500)
    } catch { onError('Буфер обмена недоступен — скопируйте текст вручную') }
  }

  return (
    <div className="lioCol">
      <div className="lioColHead">Импорт</div>
      <div className="lioHint">
        Выберите файл, перетащите его сюда или вставьте JSON текстом. В файле может быть урок,
        карточки повтора, справка слова — любая часть или всё сразу: отметьте, что применить.
      </div>
      <div className="lioActions">
        <button className="lioBtn" onClick={() => fileRef.current?.click()}>Выбрать файл…</button>
        <button className="lioBtn" onClick={check} disabled={!text.trim()}>Проверить</button>
        <span className="lioMeta">{shown?.report ?? 'или перетащите .json в это окно'}</span>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }}
        />
      </div>
      <textarea
        className="lioText"
        placeholder='{ "format": "pithy-lesson", "nodes": [ … ], "reviewCards": [ … ], "wordCard": { … } }'
        value={text}
        onChange={e => onText(e.target.value)}
      />
      {found && <LessonIoParts title="Что применить из файла" value={pick} onChange={setPick} info={info} absent={absent} />}
      {shown?.error && <div className="lioError">{shown.error}</div>}
      {warnings.length > 0 && (
        <>
          <div className="lioActions">
            <span className="lioMeta">{warnings.length} предупреждени{warnings.length === 1 ? 'е' : 'й'}</span>
            <button className="lioBtn" onClick={copyWarnings}>
              {copiedWarnings ? 'Скопировано' : 'Копировать все'}
            </button>
          </div>
          <ul className="lioWarn">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </>
      )}
      <div className="lioActions">
        <span className="lioMeta">
          {on('lesson') ? 'Ноды получат новые id, номера пересчитаются' : 'Карточки и справка сохранятся на сервер сразу'}
        </span>
        {(on('lesson') || !found) ? (
          <>
            <button className="lioBtn" disabled={!text.trim() || (!!found && !anyOn)} onClick={() => apply('append')}>Добавить к уроку</button>
            <button className="lioBtn lioBtnPrimary" disabled={!text.trim() || (!!found && !anyOn)} onClick={() => apply('replace')}>Заменить урок</button>
          </>
        ) : (
          <button className="lioBtn lioBtnPrimary" disabled={!anyOn} onClick={() => apply('parts')}>Применить выбранное</button>
        )}
      </div>
    </div>
  )
}
