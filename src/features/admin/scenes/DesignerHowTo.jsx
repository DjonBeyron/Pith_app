import { useState, useId } from 'react'
import { HOWTO_TITLE, HOWTO_STEPS, EXPORT_HINTS, EXPORT_GENERIC, APP_TITLE, APP_POINTS, GOODBAD } from './designerHowToTexts.js'
import { GoodMouthFig, BadMouthFig } from './DesignerHowToFigs.jsx'
import '../../../styles/admin-scenes-designer-howto.css'

// Мини-инструкция рядом с кнопками «Скачать шаблон» / «Проверить SVG»: 5 шагов, как это
// будет работать в приложении, пример «хорошо / плохо». Свёрнутость — в localStorage
// (в try/catch: в приватном окне хранилище может быть недоступно); по умолчанию раскрыто.
const LS_KEY = 'pithy.designerHowTo.collapsed'
const ICON = { scene: '🎬', cat: '🐱', props: '🪴', where: '📱', light: '🪶' }
const readCollapsed = () => { try { return localStorage.getItem(LS_KEY) === '1' } catch { return false } }
const writeCollapsed = v => { try { localStorage.setItem(LS_KEY, v ? '1' : '0') } catch { /* без хранилища — просто не запоминаем */ } }

export default function DesignerHowTo() {
  const [open, setOpen] = useState(() => !readCollapsed())
  const bodyId = useId()
  const toggle = () => { writeCollapsed(open); setOpen(!open) }
  return (
    <div className="scdh">
      <button type="button" className="scBtn scdhToggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> Инструкция
      </button>
      {open && (
        <div className="scdhBody" id={bodyId}>
          <h3 className="scdhH">{HOWTO_TITLE}</h3>
          <ol className="scdhSteps">
            {HOWTO_STEPS.map(s => (
              <li key={s.id}>
                <b>{s.title}.</b> {s.body}
                {s.id === 'export' && (
                  <ul className="scdhExport">
                    {EXPORT_HINTS.map(([app, t]) => <li key={app}><b>{app}:</b> {t}</li>)}
                    <li className="scHint">{EXPORT_GENERIC}</li>
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <h3 className="scdhH">{APP_TITLE}</h3>
          <ul className="scdhApp">
            {APP_POINTS.map(([k, t]) => <li key={k}><span className="scdhIco" aria-hidden="true">{ICON[k]}</span><span>{t}</span></li>)}
          </ul>
          <div className="scdhPair">
            <figure className="scdhCard scdhGood"><GoodMouthFig /><figcaption>{GOODBAD.good}</figcaption></figure>
            <figure className="scdhCard scdhBad"><BadMouthFig /><figcaption>{GOODBAD.bad}</figcaption></figure>
          </div>
        </div>
      )}
    </div>
  )
}
