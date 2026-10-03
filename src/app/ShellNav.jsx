import { useEffect, useState } from 'react'
import { Cog, Video, UserRound, Trophy, Brain, Flame } from 'lucide-react'
import { requestLessonsHome } from '../shared/lib/lessonsHomeEvent.js'
import { requestLearnHome } from '../shared/lib/learnHomeEvent.js'

// Нижняя панель оболочки: Уроки / Память / Профиль / Рейтинг (+ Админ).
// «Память» зовёт, когда есть что повторить сегодня или новое слово из урока
// (learnDot): иконка залита цветом, светится и мягко пульсирует — без числа,
// число давило бы долгом (PROJECT.md → «Вкладки»). Когда всё повторено (learnSleeping) — мозг спит:
// из-за значка выплывают три мелких «Z». Активная супергонка (raceFlame) — над кубком «Рейтинга» мерцает
// огонёк с искрами (nav-race.css). Вынесено из ShellV2.jsx

// Силуэт мозга под контуром иконки Brain (lucide) — заливка «есть что повторить»
const BRAIN_FILL = 'M12 4.2c-1-1.4-3.6-1.6-5 .1-1.8.1-3.2 1.6-3 3.4-1.6 1-2 3.2-.9 4.7-1 1.6-.4 3.8 1.3 4.6.3 2 2.3 3.3 4.2 2.9 1 1 2.6 1.2 3.4.2.8 1 2.4.8 3.4-.2 1.9.4 3.9-.9 4.2-2.9 1.7-.8 2.3-3 1.3-4.6 1.1-1.5.7-3.7-.9-4.7.2-1.8-1.2-3.3-3-3.4-1.4-1.7-4-1.5-5-.1z'
const FADE_MS = 900 // сколько мозг плавно гаснет после того, как повторять стало нечего

// Подсветка мозга не выключается рывком: когда флаг сменился с «есть что повторить» на «нет», ещё FADE_MS держим вид
// «подсвечен» с классом затухания (цвет, свечение и заливка плавно уходят — learn.css), и только потом переключаемся
function useFadeOut(on) {
  const [seen, setSeen] = useState(on)
  const [fading, setFading] = useState(false)
  if (seen !== on) { setSeen(on); setFading(!on) } // смена флага — состояние от предыдущего рендера (без эффекта)
  useEffect(() => {
    if (!fading) return undefined
    const t = setTimeout(() => setFading(false), FADE_MS)
    return () => clearTimeout(t)
  }, [fading])
  return fading
}

export default function ShellNav({ tab, setTab, learnDot, learnSleeping = false, raceFlame = false, isRealAdmin, userMode }) {
  const cls = (id, extra = '') => `shellV2NavBtn${tab === id ? ' shellV2NavBtnActive' : ''}${extra}`
  const dueFading = useFadeOut(!!learnDot) // повторить стало нечего — мозг ещё мягко гаснет
  const due = learnDot || dueFading
  return (
    <nav className="shellV2Nav">
      <button
        className={cls('feed')}
        // Уже на «Уроках» — повторное нажатие = «назад» из схемы модуля
        onClick={() => { if (tab === 'feed') requestLessonsHome(); setTab('feed') }}>
        <Video />
        Уроки
      </button>
      {/* data-nav — цель полёта нового слова из итога урока (memoryFresh.js) */}
      <button className={cls('learn', due ? ` shellV2NavBtnDue${dueFading ? ' shellV2NavBtnDueOut' : ''}` : learnSleeping ? ' shellV2NavBtn--sleep' : '')} data-nav="learn"
        // Уже в «Памяти» — повторное нажатие = «назад» из списка слов на главный экран
        onClick={() => { if (tab === 'learn') requestLearnHome(); setTab('learn') }}>
        {/* Всё повторено — мозг спит: три мелких «Z» выплывают из-за значка (маска по силуэту мозга, learn-sleep.css) */}
        {learnSleeping && !due ? (
          <span className="shellV2NavBrain">
            <span className="shellV2NavZzz zMask" aria-hidden="true"><i>Z</i><i>Z</i><i>Z</i></span>
            <Brain />
          </span>
        ) : (
          <Brain>{due && <path className="shellV2NavBrainFill" d={BRAIN_FILL} />}</Brain>
        )}
        Память
      </button>
      <button className={cls('profile')} onClick={() => setTab('profile')}>
        <UserRound />
        Профиль
      </button>
      <button className={cls('rating')} onClick={() => setTab('rating')}>
        {raceFlame ? (
          <span className="shellV2NavCup">
            <span className="shellV2NavFlame" aria-hidden="true"><Flame /><i /><i /></span>
            <Trophy />
          </span>
        ) : <Trophy />}
        Рейтинг
      </button>
      {isRealAdmin && (
        /* В «режиме пользователя» это единственная админская кнопка на экране —
           помечаем точкой, иначе легко забыть, что режим ещё включён */
        <button className={cls('admin', userMode ? ' shellV2NavBtnUserMode' : '')} onClick={() => setTab('admin')}>
          <Cog />
          Админ
        </button>
      )}
    </nav>
  )
}
