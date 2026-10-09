import { useState } from 'react'
import { VARIANTS, DEFAULT_VARIANT, readVariant, writeVariant, runningVariant } from './startVariant.js'

// Админ → «Старт»: «Эксперимент: вариант запуска». Тап по варианту пишет выбор в localStorage; применяется со СЛЕДУЮЩЕГО запуска
// (его читает первый скрипт в <head> index.html). Какой вариант идёт прямо сейчас — runningVariant() (то, что скрипт реально применил).
export default function StartVariantBlock() {
  const [chosen, setChosen] = useState(readVariant)
  const [note, setNote] = useState('')
  const running = runningVariant()

  function pick(id) {
    const ok = writeVariant(id)
    setChosen(ok ? id : readVariant())
    setNote(ok ? `Выбран вариант ${id}. Применится со следующего запуска.` : 'Не удалось сохранить выбор (хранилище недоступно)')
  }

  return (
    <section className="astVar">
      <div className="aeTitle">Эксперимент: вариант запуска</div>
      <p className="aeHint">
        Применяется со СЛЕДУЮЩЕГО запуска: закрой приложение полностью и открой с «Домой» 3 раза; смотри на последний кадр перед появлением лого.
        Если моргание пропало на варианте X — напиши мне, какой.
      </p>
      <div className="astVarList">
        {VARIANTS.map(v => (
          <button key={v.id} className={`astVarBtn${chosen === v.id ? ' astVarBtnOn' : ''}`} onClick={() => pick(v.id)} aria-pressed={chosen === v.id}>
            <span className="astVarId">{v.id}</span>
            <span className="astVarBody">
              <span className="astVarTitle">{v.title}</span>
              <span className="astVarText">{v.text}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="astBtns">
        <button className="aeRefresh" onClick={() => pick(DEFAULT_VARIANT)} disabled={chosen === DEFAULT_VARIANT}>Сбросить на {DEFAULT_VARIANT}</button>
      </div>
      <p className="aeHint">Выбрано: {chosen} · этот запуск идёт на варианте: {running}</p>
      {note && <p className="aeHint">{note}</p>}
    </section>
  )
}
