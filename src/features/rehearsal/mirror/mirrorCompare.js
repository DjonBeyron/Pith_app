// «Дубль и зеркало» прямо на дорожках (v3.3.86): раскладка сравнения — что на какой дорожке и как залито. Чистая функция, без DOM и React; рисует её движок пилюль (wordLaneMirrorScene.js).
// Дорожки встали, и на них две «ленты» по вертикали: верхняя — Пит (диктор), нижняя — ты. Кусок i стоит на дорожке i (дорожки читаются слева направо как фраза), у фразы из одного слова — на средней;
// на каждой дорожке пара пилюль цвета дорожки; каждую тройку обнимает горизонтальная подложка с одной подписью — «Пит» сверху, «Твоя фраза» снизу (wordLaneMirrorBands.js; tag — её подпись).
// Пилюля Пита залита полностью. Пилюля «Ты» — по измерениям дубля (mirrorMeasure.measureTake): кусок сказан — залита; пропущен — пустая с полосками промаха (data-wrong); порядок и пауза — как есть
// (кусок сказан, залит; про порядок и паузу говорит заметка Пита), состояние пишется в state для проверки и отладки.
export const PIT_Y = 28       // центр верхней ленты (Пит), % высоты экрана: верх подложки на 14,6 % — под подписями кусков; между подложками (39,2…45,6 %) стоит плашка заметки Пита
export const YOU_Y = 59       // центр нижней ленты (ты): низ подложки на 70,2 % — выше нижнего затемнения (72 %) и кнопок (71 %)
export const TAG_PIT = 'Пит'
export const TAG_YOU = 'Твоя фраза'

/** Дорожка куска i из n: номер куска; единственный кусок — средняя дорожка */
export const compareLane = (i, n) => (n === 1 ? 1 : i)

/** Состояние куска в дубле по измерениям: 'missing' | 'order' | 'pause' | 'ok' (приоритет — по порядку) */
export function chunkState(text, measure) {
  if (!measure) return 'ok'
  if ((measure.missing ?? []).includes(text)) return 'missing'
  if (measure.order && (measure.order.early === text || measure.order.late === text)) return 'order'
  if ((measure.pauses ?? []).some(p => p.before === text)) return 'pause'
  return 'ok'
}

/**
 * Раскладка сравнения. chunks — куски фразы; student — запись человека (нет или без url — записи нет, нижней ленты не будет); measure — измерения дубля или null.
 * Возвращает { pit: [{ i, lane, y, tag, fill, wrong: false, state: 'ok' }], you: [{ i, lane, y, tag, fill, wrong, state }] } — по пилюле на кусок, fill 0…1.
 */
export function compareLayout({ chunks, student = null, measure = null }) {
  const n = chunks.length
  const base = (i, y, tag) => ({ i, lane: compareLane(i, n), y, tag })
  const pit = chunks.map((_, i) => ({ ...base(i, PIT_Y, TAG_PIT), fill: 1, wrong: false, state: 'ok' }))
  const you = student?.url
    ? chunks.map((text, i) => {
      const state = chunkState(text, measure)
      const miss = state === 'missing'
      return { ...base(i, YOU_Y, TAG_YOU), fill: miss ? 0 : 1, wrong: miss, state }
    })
    : []
  return { pit, you }
}
