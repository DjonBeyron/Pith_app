import { useState, useEffect } from 'react'
import { clearPlayerLog, pLog, setDebug } from '../../shared/lib/debug.js'
import { preloadSounds } from '../../shared/lib/sounds.js'
import { DEBUG_TOOLS_ON } from '../../shared/lib/debugToolsEnabled.js'
import { APP_VERSION } from '../../shared/lib/version.js'
import { usePlayerDebugUi } from '../../shared/lib/usePlayerDebugUi.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import BackButton from '../../shared/ui/BackButton.jsx'

// Must match AvatarCrop.jsx AVATAR_CROP_FRAME = 80
const CROP_FRAME  = 80
const AVATAR_SIZE = 36

export default function PlayerTopBar({ title, onClose, teacherName, teacherLogo, teacherLogoCrop, onDownloadLog, progress = 0 }) {
  const [intrinsic, setIntrinsic] = useState(null)
  // Кнопка «⬇ лог» и номер версии — один диагностический набор, нужный для
  // одного и того же: чтобы пользователь прислал внятный отчёт о баге. Админу
  // они есть всегда, остальным — только если админ их включил (настройка в
  // базе, см. usePlayerDebugUi.js). isAdmin здесь эффективный: в «режиме
  // пользователя» набор гаснет вместе с остальным админским интерфейсом
  const { isAdmin } = useAdmin()
  const debugUiForAll = usePlayerDebugUi()
  const showDebugUi   = isAdmin || debugUiForAll

  // Сброс размеров при смене лого — подстройка состояния прямо в рендере
  // (паттерн из доков React вместо setState в эффекте)
  const [prevLogo, setPrevLogo] = useState(teacherLogo)
  if (prevLogo !== teacherLogo) {
    setPrevLogo(teacherLogo)
    setIntrinsic(null)
  }

  useEffect(() => {
    setDebug(true)
    clearPlayerLog()
    pLog('=== Player opened ===', 'v' + APP_VERSION, 'ua:', navigator.userAgent)
    // Fallback preload in case player opened without going through LaunchPreloader.
    // If already decoded in LaunchPreloader, this is a no-op.
    preloadSounds()
  }, [])

  const name    = teacherName || 'Учитель'
  const initial = name[0]?.toUpperCase() ?? 'У'
  const crop    = teacherLogoCrop ?? { x: 0, y: 0, scale: 1 }
  const ratio   = AVATAR_SIZE / CROP_FRAME

  // Same formula as AvatarCrop.getMediaDims() but for AVATAR_SIZE frame
  function getAvatarDims() {
    if (!intrinsic) return null
    const ma = intrinsic.w / intrinsic.h
    return ma > 1
      ? { w: AVATAR_SIZE * ma, h: AVATAR_SIZE }
      : { w: AVATAR_SIZE, h: AVATAR_SIZE / ma }
  }

  const dims = getAvatarDims()

  // Exact same rendering approach as AvatarCrop — absolute positioning + scaled x,y
  const imgStyle = dims
    ? {
        position: 'absolute',
        left: '50%', top: '50%',
        width: dims.w + 'px', height: dims.h + 'px',
        transform: `translate(calc(-50% + ${crop.x * ratio}px), calc(-50% + ${crop.y * ratio}px)) scale(${crop.scale})`,
        transformOrigin: 'center center',
        userSelect: 'none',
        pointerEvents: 'none',
      }
    : {
        position: 'absolute',
        width: '100%', height: '100%',
        objectFit: 'cover',
      }

  return (
    <div className="playerTopBar">
      {/* Полоса прогресса — по нижней кромке шапки, поверх её границы.
          Абсолютная: в поток не входит, поэтому шапка от неё не становится
          выше ни на пиксель. Ширина внутренней части и есть доля пройденного */}
      <div className="playerTopBarProgress" aria-hidden="true">
        <div className="playerTopBarProgressFill" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <BackButton onClick={onClose} label="Закрыть" />
      <div className="playerTopBarAvatar">
        {teacherLogo
          ? <img
              src={teacherLogo}
              alt=""
              style={imgStyle}
              draggable={false}
              onLoad={e => setIntrinsic({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
          : initial
        }
      </div>
      <div className="playerTopBarInfo">
        <span className="playerTopBarName">{name}</span>
        {/* Вместо «онлайн» — что именно сейчас проходят. Строка живёт ВНУТРИ
            блока с именем, а не отдельным элементом справа: там она жалась к
            140px и на узком экране пряталась совсем. Здесь длинное название
            просто сокращается многоточием и шапку не растягивает —
            .playerTopBarInfo стоит с min-width: 0 (см. topbar.css).
            Урока нет (запуск ноды из канваса) — показываем прежнее «онлайн»,
            иначе строка осталась бы пустой */}
        <span className="playerTopBarStatus" title={title || undefined}>
          {title ? `изучаем ${title}` : 'онлайн'}
        </span>
      </div>
      {showDebugUi && <span className="playerTopBarVersion">v{APP_VERSION}</span>}
      {showDebugUi && (
        <button
          className="playerTopBarDebugBtn"
          onClick={onDownloadLog}
          title="Скачать лог"
          aria-label="Скачать лог"
        >⬇ лог</button>
      )}
      {/* Единственная точка входа в дебаг-тулбар: своей плавающей кнопки у него
          больше нет. Тот же выключатель, что и у самого тулбара, — иначе кнопка
          осталась бы висеть при выключенном дебаге и ничего не открывала */}
      {DEBUG_TOOLS_ON && (
        <button
          className="playerTopBarDebugBtn"
          onClick={() => import('../debugTools/debugToolbarState.js').then(m => m.openDebugToolbar())}
          title="Покадровый дебаг-тулбар"
          aria-label="Покадровый дебаг-тулбар"
        >🐞</button>
      )}
    </div>
  )
}
