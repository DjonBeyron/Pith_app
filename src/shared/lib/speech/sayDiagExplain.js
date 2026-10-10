// Админская диагностика «Сказать фразу» в уроке — ОБЪЯСНЕНИЯ простым русским (чистые функции, без React): почему следующая попытка пойдёт на том или ином движке,
// что с фоновой загрузкой модели, что с моделью в памяти. Каждая ветка sayEnginePick.pickEngine (ready / mode-system / phrase / broken / no-model / loading / not-loaded / no-lib)
// имеет своё объяснение + подсказку «что делать». level: ok (всё хорошо) | warn (работает запасной путь / ждём) | bad (поломка) | info (просто сведения).
import { voskPhraseProblem } from '../vosk/sayVoskGrammar.js'
import { bgStatusText } from '../vosk/voskBgStatus.js'

export const MARK = { ok: '✅', warn: '⚠️', bad: '❌', info: '•' }

const pad = n => String(n).padStart(2, '0')
/** Время суток по местным часам: «14:32» */
export const clock = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
/** Секунды из миллисекунд одним знаком: 1234 → «1,2 с» */
export const sec = ms => `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} с`
const whole = ms => `${Math.max(0, Math.round(ms / 1000))} с`

const PHRASE_TEXT = {
  numbers: 'во фразе число, которого Vosk не умеет читать (десятичное, от 10000, телефон, время с am/pm)',
  chars: 'во фразе не только латинские буквы',
  empty: 'фраза пустая',
}

/** Фоновая загрузка модели одной фразой + уровень. s — getBgStatus(); inCache — модель в кэше; stopped — админ выключил загрузку на этом устройстве */
export function explainBackground(s, inCache = false, stopped = false) {
  if (inCache || s.state === 'cached') return { level: 'ok', text: 'модель скачана, в кэше' }
  if (s.state === 'downloading') return { level: 'warn', text: `скачивается — ${bgStatusText(s, false)}` }
  if (s.state === 'waiting') return { level: 'warn', text: `ждёт — ${bgStatusText(s, false)}` }
  if (s.state === 'error') return { level: 'bad', text: `сломалась — ${bgStatusText(s, false)}` }
  if (stopped || s.state === 'off') return { level: 'warn', text: 'остановлена админом на этом телефоне' }
  if (s.state === 'other') return { level: 'info', text: 'ведёт другая вкладка приложения' }
  if (s.state === 'check') return { level: 'info', text: 'проверяет кэш…' }
  return { level: 'warn', text: 'ещё не запускалась (стартует через 5–8 с после запуска приложения, только в тишине)' }
}

/** Модель в памяти: { level, text }. snap — voskRuntime.snapshot(), info — voskRuntime.info() */
export function explainMemory({ snap, info }) {
  const now = info.now
  if (snap.loaded) {
    const ago = info.loadedAt ? `загружена ${whole(now - info.loadedAt)} назад` : 'загружена'
    const keep = info.users > 0 ? 'держится, пока открыта панель' : `выгрузится через ${whole(Math.max(0, info.freeAt - now))}`
    return { level: 'ok', text: `да — ${ago}; ${keep}` }
  }
  if (snap.loading) return { level: 'warn', text: `грузится в память уже ${whole(now - (info.warmAt || now))} (обычно 2–15 с)` }
  if (snap.cached === true) return { level: 'warn', text: info.users > 0 ? 'нет — модель в кэше, но в память не загружена' : 'нет — панель закрыта, прогрева нет' }
  return { level: 'info', text: 'нет' }
}

/**
 * Почему следующая попытка пойдёт на этом движке. pick — результат pickEngine; c: { mode, phrase, snap, info, bg, inCache, bgStopped }.
 * @returns {{level: string, text: string, hint: string}}
 */
export function explainPick(pick, c) {
  const { snap, info } = c
  const reason = pick?.reason
  const sys = (level, why, hint = '') => ({ level, text: `Системное — ${why}`, hint })
  if (pick?.engine === 'vosk') return { level: 'ok', text: 'Vosk — модель в кэше и в памяти, библиотека загружена', hint: '' }
  const onlyVosk = c.mode === 'vosk' ? ' Режим «Только Vosk» тап не ждёт: эта попытка всё равно на системном.' : ''
  switch (reason) {
    case 'mode-system': return sys('warn', 'в админ-настройках выбран режим «Только системное»', 'Сменить: Админ → Голос → «Сказать фразу» → «Авто».')
    case 'phrase': return sys('warn', `фраза не подходит для Vosk: ${PHRASE_TEXT[voskPhraseProblem(c.phrase)] ?? 'неизвестная причина'}`, 'Простые числа (2, 25, 1998, 21st, 5%, $5, 3:30) Vosk читает.')
    case 'broken': return sys('bad', `пауза после сбоя Vosk до ${clock(snap.brokenUntil)}. Причина: ${snap.brokenWhy || info.lastError || 'не записана'}`, 'Смена режима в админке снимает паузу сразу.')
    case 'no-model': {
      const bg = explainBackground(c.bg, c.inCache, c.bgStopped)
      return sys('bad', `модели Vosk ещё нет в кэше телефона. Фоновая загрузка: ${bg.text}.${onlyVosk}`, 'Нажмите «Загрузить модель сейчас», дождитесь «в кэше» и откройте панель заново.')
    }
    case 'loading': return sys('warn', `модель из кэша ещё грузится в память (идёт ${whole(info.now - (info.warmAt || info.now))}, обычно 2–15 с).${onlyVosk}`, 'Через несколько секунд следующая попытка пойдёт на Vosk.')
    case 'no-lib': return sys('bad', 'не загрузилась библиотека Vosk (нужен интернет при первом запуске после обновления приложения)', 'Закройте приложение и откройте снова.')
    case 'not-loaded': {
      if (snap.cached == null) return sys('warn', `кэш модели ещё не проверен — прогрев только начинается.${onlyVosk}`, 'Подождите 1–2 с.')
      const why = info.users > 0 ? 'прогрев не запустился' : 'панель не держит прогрев'
      const err = info.lastError ? ` Последняя ошибка: ${info.lastError}.` : ''
      return sys(info.lastError ? 'bad' : 'warn', `модель в кэше, но не загружена в память: ${why}.${err}${onlyVosk}`, 'Откройте панель заново; в режиме «Только системное» прогрева нет.')
    }
    default: return sys('warn', `причина не определена (${reason || '—'})`)
  }
}

/** Что решает панель ДО выбора движка (sayPermission.decide): fallback → запасной режим, Vosk не греется. d — { action, reason?, kind? } */
export function explainGate(d) {
  if (d?.action === 'fallback') {
    const why = { unsupported: 'браузер не поддерживает системное распознавание речи', browser: 'Firefox: панель показывает пояснение вместо задания', cant_speak: 'включено «Я не могу говорить»', denied: 'микрофон запрещён' }[d.reason] ?? d.reason
    return { level: 'bad', text: `панель в запасном режиме без микрофона — ${why}; Vosk при этом не греется` }
  }
  if (d?.action === 'explain') return { level: 'info', text: 'микрофон ещё не разрешали — перед первой попыткой покажется пояснение' }
  return { level: 'ok', text: 'микрофон можно включать по тапу' }
}
