// Маленькое прохождение для тестов «Монтажа» (montageModel / montageEdits / montageScreen .test): числа круглые, чтобы результат правки считался в уме. Времена — мс от начала.
//   0        стадия sprint (ученик)
//   1000–3050  Пит «А» (озвучка 2000 мс, рот закрылся на 50 мс позже звука → хвост 50)
//   3050–6050  тишина 3000 — «игра молчит» (долгая)
//   6050–7050  Диктор «w1»
//   7050–7100  тишина 50 · 7100–9100 ждём игрока (пилюля «w1» до принятия ответа) · 9100–9700 тишина 600
//   9700–11200 Пит «Б»            → зазор перед ним 2650: можно убрать 650, ожидание игрока 2000 — нельзя
//   11200–11700 тишина 500 · 11700–12700 Мия «М» · 12700–13200 тишина 500 · 13200–14000 Пит «А» (второй раз) · 14000–14500 тишина 500 · 14500–15000 Пит «В» · конец 16000
export const montageEvents = () => [
  { t: 0, k: 'run', run: 1, game: 'race' },
  { t: 0, k: 'stage-in', idx: 0, sid: 'sprint', act: 'sprint', type: 'student', title: '', line: null },
  { t: 1000, k: 'line-start', who: 'pit', id: 'a', text: 'А', ms: 2000 }, { t: 3050, k: 'line-end', id: 'a', played: 2050, why: 'done' },
  { t: 6050, k: 'line-start', who: 'dictor', id: 'w1', text: 'w1', ms: 1000 }, { t: 7050, k: 'line-end', id: 'w1', played: 1000, why: 'done' },
  { t: 7100, k: 'pill', idx: 0, word: 'w1', lane: 0 }, { t: 9100, k: 'claim', idx: 0, ms: 2000 }, { t: 9200, k: 'answer', res: 'win', idx: 0, word: 'w1', final: true }, { t: 9200, k: 'note', order: 0 },
  { t: 9700, k: 'line-start', who: 'pit', id: 'b', text: 'Б', ms: 1500 }, { t: 11200, k: 'line-end', id: 'b', played: 1500, why: 'done' },
  { t: 11700, k: 'line-start', who: 'mia', id: 'm', text: 'М', ms: 1000 }, { t: 12700, k: 'line-end', who: 'mia', id: 'm' },
  { t: 13200, k: 'line-start', who: 'pit', id: 'a', text: 'А', ms: 800 }, { t: 14000, k: 'line-end', id: 'a', played: 800, why: 'done' },
  { t: 14500, k: 'line-start', who: 'pit', id: 'c', text: 'В', ms: 500 }, { t: 15000, k: 'line-end', id: 'c', played: 500, why: 'done' },
  { t: 16000, k: 'end' },
]
