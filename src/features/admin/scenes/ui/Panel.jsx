import { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'
import { usePanels, useColumnName } from './panelContext.js'
import { useDensity } from './useDensity.js'
import { panelTone } from '../lintPanelMap.js'
import { panelHue } from './panelTones.js'
import ScTip from '../ScTip.jsx'

// Сворачиваемая панель сборщика сцен (любой блок: «Локация», «Реплики», реплика №3,
// персонаж A, «Предпросмотр», «Мои сцены»…). Заголовок крупный, кнопки «свернуть» и «на весь
// экран». Свёрнутая — мини-блок в одну строку: только заголовок и кнопка развернуть.
// Состояние — PanelCtx (usePanelState: свёрнутость в localStorage, fullscreen не хранится);
// без провайдера — локальное. Содержимое НЕ размонтируется ни при сворачивании (hidden), ни
// на весь экран (CSS position:fixed на месте) — поля, черновик и позиция прокрутки те же.
// Линтер: data-tone="error" → красная рамка и красный заголовок (и у свёрнутого мини-блока),
// "warn" — янтарная метка; счётчик в заголовке (lintPanelMap). data-density — useDensity.
// data-hue — оттенок блока по id (panelTones.js, styles/admin-scenes-tones.css); он слабее data-tone линтера.
// id — стабильный ключ панели («timeline.3»), fieldId — DOM id для подсветки поля (f-…).

// label — текст заголовка для aria, когда title — разметка (со счётчиком); tip — ключ «?» (scenesHelp),
// кнопка подсказки стоит РЯДОМ с кнопкой заголовка (кнопка в кнопке недопустима)
export default function Panel({ id, title, label, tip = null, fieldId, extra = null, children, nested = false, fullscreenable = true, as = 'h2', className = '' }) {
  const Tag = as
  const text = typeof title === 'string' ? title : label ?? 'панель'
  const ctx = usePanels()
  const column = useColumnName()
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const [localFs, setLocalFs] = useState(false)
  const rootRef = useRef(null)
  const fsBtnRef = useRef(null)
  const wasFs = useRef(false)
  const hid = useId()
  useDensity(rootRef)

  useEffect(() => (ctx ? ctx.register(id, column) : undefined), [ctx, id, column])

  const collapsed = ctx ? ctx.isCollapsed(id) : localCollapsed
  const fs = ctx ? ctx.fullscreen === id : localFs
  const lintState = ctx?.lintState
  const tone = panelTone(lintState, id)
  const counts = lintState?.[id]

  // Выход из полноэкранного режима (кнопка, Esc) — фокус обратно на кнопку панели
  useEffect(() => {
    if (wasFs.current && !fs) fsBtnRef.current?.focus({ preventScroll: true })
    wasFs.current = fs
  }, [fs])

  const setFs = v => { if (ctx) (v ? ctx.setFullscreen(id) : ctx.exitFullscreen()); else setLocalFs(v) }
  const toggle = () => {
    if (fs) setFs(false)
    if (ctx) ctx.toggle(id); else setLocalCollapsed(c => !c)
  }

  return (
    <section
      ref={rootRef} id={fieldId} className={`scbPanel${nested ? ' scbPanelNested' : ''}${className ? ` ${className}` : ''}`}
      data-panel={id} data-collapsed={collapsed ? '1' : undefined} data-fullscreen={fs ? '1' : undefined} data-tone={tone ?? undefined} data-hue={panelHue(id)} data-density="normal"
      aria-labelledby={hid}
    >
      <div className="scbPanelHead">
        <Tag id={hid} className="scbPanelTitle">
          <button type="button" className="scbPanelTitleBtn" onClick={toggle} aria-expanded={!collapsed} title={collapsed ? 'Развернуть' : 'Свернуть'}>
            {collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            <span className="scbPanelTitleText">{title}</span>
          </button>
          {tip && <ScTip help={tip} />}
          {counts?.errors > 0 && <span className="scbPanelBadge scbPanelBadge-error" role="img" aria-label={`Ошибок линтера: ${counts.errors}`}>{counts.errors}</span>}
          {!counts?.errors && counts?.warns > 0 && <span className="scbPanelBadge scbPanelBadge-warn" role="img" aria-label={`Предупреждений линтера: ${counts.warns}`}>{counts.warns}</span>}
        </Tag>
        {!collapsed && extra && <div className="scbPanelExtra">{extra}</div>}
        <div className="scbPanelBtns">
          {fullscreenable && !collapsed && (
            <button ref={fsBtnRef} type="button" className="scbPanelBtn" onClick={() => setFs(!fs)} aria-pressed={fs} aria-label={fs ? 'Вернуть панель на место (Esc)' : `На весь экран: ${text}`} title={fs ? 'Вернуть (Esc)' : 'На весь экран'}>
              {fs ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="scbPanelBtn" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? `Развернуть: ${text}` : `Свернуть: ${text}`} title={collapsed ? 'Развернуть' : 'Свернуть'}>
            {collapsed ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div className="scbPanelBody" hidden={collapsed}>{children}</div>
    </section>
  )
}
