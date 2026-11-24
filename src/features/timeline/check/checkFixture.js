// Фикстура настроек реплик для «Проверки сценария» (стенд _stand/timeline ?fixture=check и тесты): весь каталог «Встряхни память» озвучен как надо (длина — 14,5 знака в секунду, тайминги слов как у ElevenLabs),
// а в набор PROBLEMS подмешаны все виды проблем. clean: true — без проблем (всё зелёное, кроме известной тишины в церемонии). Формат — сырое значение app_settings.rotate_cat_lines: { lines: { [id]: { text, url, duration, words, said } } }.
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { MIA_LINES } from '../../pitrace/mia/miaLines.js'

export const PROBLEMS = {
  none: 'race_good_3',        // запись есть, звука нет
  fresh: 'boss_mia_go',       // реплики нет в настройках вовсе
  stale: 'mia_push',          // файл говорит прежний текст
  nodur: 'boss_pit_next',     // звук без длительности
  long: 'boss_mia_red',       // слишком длинный файл для текста
  short: 'race_start',        // слишком короткий (обрезан)
  tail: 'pit_back_2',         // тишина в конце файла
  head: 'race_phrases_show',  // тишина в начале файла
  nowords: ['race_reverse', 'mia_leave'], // рот не размечен
  risk: 'race_demo_2',        // длиннее потолка реплики примера «Скажи»
  orphan: 'mia_announce_1',   // запись озвучки удалённой реплики
}

const r2 = v => Math.round(v * 100) / 100
/** Тайминги слов как у ElevenLabs: слова подряд от from до to секунд */
export function evenWords(text, from, to) {
  const list = String(text).split(/\s+/).filter(Boolean), step = (to - from) / Math.max(1, list.length)
  return list.map((w, i) => ({ w, t: r2(from + i * step), e: r2(from + (i + 1) * step - 0.02) }))
}
const good = (text, url) => { const duration = r2(Math.max(0.7, text.length / 14.5)); return { text, url, duration, words: evenWords(text, 0.05, duration - 0.1), said: text } }

export function checkFixtureRaw(url = 'https://r2.example/line.mp3', { clean = false } = {}) {
  const lines = Object.fromEntries([...RACE_LINES, ...MIA_LINES].map(d => [d.id, good(d.text, url)]))
  if (clean) return { lines }
  const P = PROBLEMS, L = lines
  const gone = [P.none, P.stale, P.nodur, P.long, P.short, P.tail, P.head, P.risk, ...P.nowords].filter(id => !L[id])
  if (gone.length) throw new Error(`checkFixture: реплик ${gone.join(', ')} больше нет в каталоге — замени их в PROBLEMS`)
  L[P.none] = { text: L[P.none].text }
  delete L[P.fresh]
  L[P.stale] = { ...L[P.stale], said: 'Иди сюда, пушистик, дальше командую я' }
  L[P.nodur] = { ...L[P.nodur], duration: null }
  L[P.long] = { ...L[P.long], duration: 9.2, words: evenWords(L[P.long].text, 0.05, 9.1) }
  L[P.short] = { ...L[P.short], duration: 1.1, words: evenWords(L[P.short].text, 0.05, 1.0) }
  L[P.tail] = { ...L[P.tail], duration: r2(L[P.tail].duration + 1.6) }
  L[P.head] = { ...L[P.head], duration: r2(L[P.head].duration + 0.9), words: L[P.head].words.map(w => ({ ...w, t: r2(w.t + 0.9), e: r2(w.e + 0.9) })) }
  for (const id of P.nowords) L[id] = { ...L[id], words: null }
  L[P.risk] = { ...L[P.risk], duration: 4.6, words: evenWords(L[P.risk].text, 0.05, 4.5) }
  L[P.orphan] = { text: 'Посиди в коробке, понял?', url, duration: 1.6, said: 'Посиди в коробке, понял?' }
  return { lines }
}
