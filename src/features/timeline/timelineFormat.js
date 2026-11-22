// Подписи и числа «Таймлайна игры»: одно место для экрана и текстового отчёта (timelineReport.js). Чистые функции.
export const WHO = { pit: 'Пит', mia: 'Мия', dictor: 'Диктор' }
export const WHO_GEN = { pit: 'Пита', mia: 'Мии', dictor: 'диктора' } // «после реплики Пита»
export const RES = { win: 'верно', late: 'верно, в последний момент', miss: 'ошибка', fail: 'не успел', none: 'без исхода' }
export const PAUSE_KIND = { dead: 'игра молчит', player: 'ждём игрока', count: 'отсчёт нотами', wait: 'ждём технику', paused: 'игра на паузе' }
export const THRESHOLDS = [1000, 1500, 2000] // порог «долгой» паузы, мс
export const DEFAULT_THRESHOLD = 1500

const ru = (n, d) => n.toFixed(d).replace('.', ',')
/** Отметка времени от начала прохождения: «+12,340 с» */
export const stamp = ms => `+${ru(Math.max(0, ms) / 1000, 3)} с`
/** Длительность: «1,8 с» (короче 100 мс — «80 мс», от двух минут — «26 мин 30 с») */
export const dur = ms => (!ms ? '0 с' : Math.abs(ms) < 100 ? `${Math.round(ms)} мс` : ms >= 120000 ? `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с` : `${ru(ms / 1000, 1)} с`)
/** Часы оси: «0:12» / «3:05,5» */
export const clock = (ms, tenths = false) => { const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60), r = s - m * 60; return `${m}:${tenths ? ru(r, 1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0')}` }
/** Момент словами для карточки паузы: «на 2:13» */
export const atClock = ms => `на ${clock(ms)}`
/** Текст в «ёлочках», обрезанный до max знаков */
export const quote = (text, max = 90) => { const t = String(text ?? '').trim(); return `«${t.length > max ? `${t.slice(0, max)}…` : t}»` }
/** Реплика одной фразой: «Пит: «текст» (race_good_2, 1,8 с)» */
export const lineText = l => `${WHO[l.who] ?? l.who}: ${quote(l.text || l.id)} (${l.who === 'dictor' ? '' : `${l.id}, `}${dur(l.end - l.t)}${l.silent ? ', без озвучки — подпись' : ''}${l.why && !['done', 'timer'].includes(l.why) ? `, оборвана: ${l.why}` : ''})`
