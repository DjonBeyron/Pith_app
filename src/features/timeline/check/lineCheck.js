// Проверка ОДНОЙ реплики Пита / Мии по текущим настройкам (CONCEPT_TIMELINE.md, «Проверка сценария»). Статус озвучки не считается заново — берётся из аудита admin/speech/voiceAudit.js
// (тот же, что у таблицы «Озвучка Пита» и счётчика на вкладке «Голос»); здесь к нему добавляются проверки самого файла: длина против текста, тишина по краям, разметка рта.
// Пороги (подобраны по настоящей игре владельца — timelineFixtureReal.js: реплики от 20 знаков звучат со скоростью 12,6–16,6 знака в секунду, короткие «Мимо», «Отлично» — 0,7–1,1 с):
//   • SPEED: реплика от MIN_CHARS знаков вне 9–21 знака/с ⇒ «длина подозрительна» (вероятно, не тот файл или обрезан); короче MIN_CHARS — скорость не считается, только потолок SHORT_MAX_S;
//   • HEAD_S / TAIL_S: первое слово начинается позже 0,4 с либо последнее кончается раньше длительности − 0,6 с ⇒ «в файле тишина — в игре будет пауза» (только если есть тайминги слов; звук не декодируется).
// → { id, status, text, dur (с), flags: [{ k, icon, level, text }], level } ; level: 'todo' (нужно озвучить) > 'warn' (проверить) > 'note' (мелочь) > 'ok'; 'skip' — не озвучивается.
// Чистые функции без React.
import { alignInfo } from '../../../shared/lib/vosk/voskAlignFill.js'

export const SPEED = { min: 9, max: 21 } // знаков текста в секунду
export const MIN_CHARS = 15
export const SHORT_MAX_S = 2.5
export const HEAD_S = 0.4
export const TAIL_S = 0.6
export const ICON = { nosound: '🔇', stale: '✏️', length: '⏱', silence: '⏱', mouth: '👄', risk: '⚠' }
const LEVELS = ['ok', 'note', 'warn', 'todo']
export const worst = list => list.reduce((a, b) => (LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a), 'ok')
export const sec = s => `${(Math.round(s * 10) / 10).toFixed(1).replace('.', ',')} с`

/** Длина файла против текста → null (в порядке) либо фраза для человека */
export function lengthNote(text, dur) {
  const n = String(text ?? '').trim().length
  if (!(dur > 0) || !n) return null
  if (n < MIN_CHARS) return dur > SHORT_MAX_S ? `короткая реплика звучит ${sec(dur)} — похоже, не тот файл` : null
  const v = n / dur, want = `${sec(n / SPEED.max).replace(' с', '')}–${sec(n / SPEED.min)}`
  if (v > SPEED.max) return `слишком коротко: ${sec(dur)} на ${n} знаков (обычно ${want}) — файл обрезан или говорит другое`
  if (v < SPEED.min) return `слишком длинно: ${sec(dur)} на ${n} знаков (обычно ${want}) — не тот файл или в нём тишина`
  return null
}

/** Тишина по краям файла по таймингам слов → { head, tail } в секундах (0 — нет); таймингов нет — null */
export function edgeSilence(words, dur) {
  if (!Array.isArray(words) || !words.length || !(dur > 0)) return null
  const t = Number(words[0]?.t), e = Number(words.at(-1)?.e)
  if (!Number.isFinite(t) || !Number.isFinite(e)) return null
  return { head: t > HEAD_S ? t : 0, tail: dur - e > TAIL_S ? dur - e : 0 }
}

/** a — запись аудита { status, now, was }; rec — реплика из настроек (normalizeLines): { url, duration, words } */
export function checkLine(id, a, rec) {
  if (!a) return { id, status: null, text: rec?.text ?? '', dur: null, flags: [], level: 'ok', unknown: true }
  const flags = [], add = (k, level, text) => flags.push({ k, icon: ICON[k], level, text })
  const dur = a.status === 'ok' && rec?.duration > 0 ? rec.duration : null
  if (a.status === 'skip') return { id, status: 'skip', text: a.now, dur: null, flags, level: 'skip' }
  if (a.status === 'new' || a.status === 'none') add('nosound', 'todo', 'нет озвучки — в игре будет только подпись')
  if (a.status === 'stale') add('stale', 'todo', `текст изменён, а файл говорит прежнее${a.was ? `: «${a.was}»` : ''} — игра такой звук не играет`)
  if (a.status === 'nodur') add('length', 'todo', 'у звука нет длительности — рот и паузы не работают, озвучить заново')
  if (dur) {
    const len = lengthNote(a.now, dur)
    if (len) add('length', 'warn', len)
    const s = edgeSilence(rec.words, dur)
    if (s?.head) add('silence', 'warn', `в начале файла тишина ${sec(s.head)} — в игре будет пауза перед репликой`)
    if (s?.tail) add('silence', 'warn', `в конце файла тишина ${sec(s.tail)} — в игре будет пауза после реплики`)
    if (!alignInfo(rec.words).has) add('mouth', 'note', 'рот не размечен по словам — будет открываться по тексту')
  }
  return { id, status: a.status, text: a.now, dur, flags, level: worst(flags.map(f => f.level)) }
}
