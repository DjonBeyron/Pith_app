import { useEffect, useRef } from 'react'

// Микрофон игры: круглая кнопка внизу по центру и волны вокруг неё (как в «Сказать фразу»). Живые кольца — по голосу ученика (levels: подписка «уровень 0..1 каждый кадр», sayLevelSource),
// transform пишется прямо в DOM. Нет распознавания (manual) — кольца просто дышат (CSS), а тап по кнопке засчитывает слово.
// mode: starting (включаю) | listening (слушаю) | manual (тап = слово сказано) | done.
const CAPTION = { starting: 'Включаю микрофон…', listening: 'Слушаю — повтори слово', manual: 'Нажми, когда повторишь', done: 'Есть!' }

export default function WordLaneMic({ mode, levels, onTap, visible }) {
  const rings = useRef(null)
  useEffect(() => {
    const box = rings.current
    if (!visible || mode !== 'listening' || !levels || !box) return undefined
    const els = [...box.children]
    let smooth = 0
    const off = levels.subscribe(level => {
      smooth += (level - smooth) * (level > smooth ? 0.6 : 0.12) // быстро вверх, плавно вниз
      els.forEach((el, i) => {
        el.style.transform = `scale(${(1 + smooth * (0.5 + i * 0.35)).toFixed(3)})`
        el.style.opacity = (0.15 + smooth * 0.55 * (1 - i * 0.25)).toFixed(3)
      })
    })
    return () => { off(); els.forEach(el => { el.style.transform = ''; el.style.opacity = '' }) }
  }, [mode, levels, visible])

  return (
    <div className={`wlMic wlMic--${mode}${visible ? ' wlMic--in' : ''}`} data-testid="wl-mic">
      <div className="wlMicCaption">{CAPTION[mode] ?? ''}</div>
      <div className="wlMicBox">
        <div ref={rings} className="wlMicRings" aria-hidden="true"><i /><i /><i /></div>
        <button type="button" className="wlMicBtn" onClick={onTap} aria-label="Микрофон" data-no-unlock="" data-testid="wl-mic-btn">
          <svg width="38" height="38" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="17" y="4" width="14" height="24" rx="7" fill="currentColor" />
            <path d="M9.5 22.5v1.5a14.5 14.5 0 0 0 29 0v-1.5M24 38.5v5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
