import { endKeep, MIA } from '../mia/raceMia.js'
import { miaGap } from '../mia/miaSpeech.js'

// Сколько держится стадия-эпилог финала boss-end (директор гонки, useRaceActs.holdMs): Мия договаривает последнюю колкость (st.preWait, useMiaEnter) → потом реплики Мии и Пита и хвост, не дольше st.ms.
// Финал пройден плохо (Пит в коробке): стадию отпускает не таймер, а снятие коробки учеником (useMiaBoxFree.afterCount опрашивает), поэтому здесь — только ожидание Мии + опрос.
export function endHoldMs(st, mb, mspeech) {
  const pre = st.preWait ?? 0, GAP_MS = miaGap() // пауза очереди речи — настройка mia.gap
  if (endKeep(mb.m, st)) return st.act === 'boss' ? Math.min(st.ms, pre + mspeech.msOf('boss_mia_stay') + GAP_MS + mspeech.msOf('boss_pit_keep', 'pit') + GAP_MS + 800) : pre + 600 // экзамен: Мия остаётся на коробке и говорит вердикт, Пит из коробки — «приходи завтра, вытащи меня»; стадия ждёт обе реплики (коробку никто не снимает), потом итог
  if (st.act !== 'boss') return Math.min(st.ms, pre + Math.max(2500, mspeech.msOf('mia_leave') + GAP_MS + Math.max(MIA.BACK2_AT, MIA.BACK_AT) + mspeech.msOf('pit_back_2', 'pit') + 800)) // круг с Мией, все слова верны: «вы победили» + две реплики Пита
  const d = 2800 // экзамен сдан: Мия «вот твои трофеи» → Мия «Коробка мне ещё пригодится, пока» → Пит (boss_pit_well)
  return Math.min(st.ms, pre + Math.max(2500, Math.max(d, mspeech.msOf('boss_mia_free') + GAP_MS + mspeech.msOf('boss_mia_bye') + GAP_MS) + mspeech.msOf('boss_pit_well', 'pit') + 800))
}
