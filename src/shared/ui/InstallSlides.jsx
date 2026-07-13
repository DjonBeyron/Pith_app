import { useRef, useState } from 'react'
import { getSlides } from './installSlidesContent.js'
import { getInstallPrompt, hasInstallPrompt, detectBrowser } from '../lib/pwaInstall.js'
import { GEAR_PATH } from './icons.js'

// Иконки слайдов — простые линии (stroke 1.8), тот же стиль, что и остальной
// интерфейс. settings — исключение: грубая шестерёнка Android/Material
// (заливка, не линия, см. icons.js) — тонкая line-шестерёнка на маленьком
// размере не читалась как шестерёнка вовсе
const ICON_PATHS = {
  phone: <><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M10 18h4" /></>,
  install: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M5 20h14" /></>,
  share: <><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>,
  add: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></>,
  check: <path d="M4 12l5 5L20 6" />,
  menu: <><path d="M12 5.5v.01M12 12v.01M12 18.5v.01" /></>,
}

function SlideIcon({ name }) {
  if (name === 'settings') {
    return <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d={GEAR_PATH} /></svg>
  }
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name] ?? ICON_PATHS.phone}
    </svg>
  )
}

const ARROW_PATHS = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  install: 'M12 5v12M6 12l6 6 6-6',
}

function ArrowIcon({ dir }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={ARROW_PATHS[dir]} />
    </svg>
  )
}

// Слайд-инструкция: РОВНО 3 слайда, набор подбирается один раз при
// монтировании по определённому браузеру (см. pwaInstall.detectBrowser +
// installSlidesContent.getSlides) — точная формулировка под конкретное меню.
// Карточка фиксированного размера — контент центрируется, не «прыгает».
// Низ: слева «назад», справа «вперёд» — кнопки видны ВСЕГДА (не пропадают),
// на первом/последнем слайде просто задизейблены (тускло-серые), между ними —
// тонкий сегментный прогресс. Кнопки статичные, без мигания — сама карточка
// достаточно заметна. Свайп работает как кнопки.
export default function InstallSlides({ onClose }) {
  const [slides] = useState(() => getSlides(detectBrowser(), hasInstallPrompt()))
  const [i, setI] = useState(0)
  const touchX = useRef(null)
  const slide = slides[i]
  const last = i === slides.length - 1

  function go(delta) {
    setI(v => Math.max(0, Math.min(slides.length - 1, v + delta)))
  }

  async function forward() {
    if (slide.action === 'install') {
      const prompt = getInstallPrompt()
      if (prompt) {
        prompt.prompt()
        await prompt.userChoice.catch(() => {})
      }
      go(1)
      return
    }
    go(1)
  }

  function onTouchStart(e) { touchX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 40) return
    if (dx < 0) { if (!last) forward() }
    else if (i > 0) go(-1)
  }

  return (
    <div className="installSlidesOverlay">
      <div className="installSlidesCard" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button className="installSlidesClose" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="installSlidesBody">
          <div className="installSlidesIcon"><SlideIcon name={slide.icon} /></div>
          {slide.title && <div className="installSlidesTitle">{slide.title}</div>}
          {slide.steps && (
            <ol className="installSlidesSteps">
              {slide.steps.map((step, idx) => <li key={idx}>{step}</li>)}
            </ol>
          )}
          {slide.text && <div className="installSlidesText">{slide.text}</div>}
          {slide.warn && <div className="installSlidesWarn">{slide.warn}</div>}
        </div>

        <div className="installSlidesNavRow">
          <button className="installSlidesNav" onClick={() => go(-1)} disabled={i === 0} aria-label="Назад">
            <ArrowIcon dir="back" />
          </button>
          <div className="installSlidesProgress">
            {slides.map((_, idx) => (
              <div key={idx} className={idx <= i ? 'installSlidesSeg installSlidesSegDone' : 'installSlidesSeg'} />
            ))}
          </div>
          <button className="installSlidesNav" onClick={forward} disabled={last} aria-label="Вперёд">
            <ArrowIcon dir={slide.action === 'install' ? 'install' : 'forward'} />
          </button>
        </div>
      </div>
    </div>
  )
}
