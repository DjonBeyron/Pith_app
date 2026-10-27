// «Это точно голос ученика?» — ворота перед худом и заливкой пилюль в фазе ученика. Раньше любой звук громче порога (шум комнаты, который усиливает автоусиление микрофона, щелчок, а главное —
// нота-награда из динамика, которую слышит микрофон) сразу запускал заливку и подсказки: «я ещё ничего не сказал, а анимация пошла». Теперь голос засчитывается, только если он:
//  • выше «пола» — медленно подстраивающегося уровня окружающего шума (пол быстро падает вслед за тишиной и медленно ползёт вверх), плюс запас ON_MARGIN;
//  • держится дольше ON_MS подряд (одиночный всплеск голосом не считается);
//  • не попал в окно заглушения (mute): после принятой пилюли звучит нота — микрофон слышит её, пока она играет и затихает.
// Выключается голос, когда уровень ниже пола + OFF_MARGIN дольше HOLD_MS (слова с паузами внутри не рвутся). Чистая логика: время приходит аргументом.
export const ON_MARGIN = 0.16
export const OFF_MARGIN = 0.08
export const ON_MS = 90
export const HOLD_MS = 260
export const FLOOR_START = 0.05
export const FLOOR_MAX = 0.6
export const WARM_MS = 450         // первые мгновения фазы голос не засчитывается: пол быстро «слушает» комнату (шумный фон не должен сойти за голос)
export const MUTE_MS = 1100        // нота-награда (до 560 мс) + её затухание в комнате

export function createVoiceGate() {
  let floor = FLOOR_START
  let loudSince = null
  let quietSince = null
  let on = false
  let muteUntil = 0
  let t0 = null
  return {
    /** Принятая пилюля / нота: на ms мс голос не засчитывается и пол не учится на эхе */
    mute(now, ms = MUTE_MS) { muteUntil = Math.max(muteUntil, now + ms); on = false; loudSince = null; quietSince = null },
    /** Один кадр: level — громкость микрофона 0…1, now — мс, dt — мс с прошлого кадра. Возвращает { on, level } — level уже без шума (0 пока голоса нет) */
    step(level, now, dt = 16) {
      t0 ??= now
      if (now < muteUntil) return { on: false, level: 0 }
      const lv = Math.max(0, level || 0)
      const warm = now - t0 < WARM_MS
      if (!on) {
        // пол учится только на «тишине»: быстро вниз, медленно вверх (шум комнаты поднимается плавно, речь — нет); в первые WARM_MS — быстро в обе стороны
        floor = lv < floor ? floor + (lv - floor) * 0.5 : Math.min(FLOOR_MAX, floor + (lv - floor) * Math.min(1, dt / (warm ? 120 : 4000)))
      }
      if (warm) return { on: false, level: 0 }
      if (!on) {
        if (lv > floor + ON_MARGIN) { loudSince ??= now; if (now - loudSince >= ON_MS) { on = true; quietSince = null } }
        else loudSince = null
      } else if (lv < floor + OFF_MARGIN) {
        quietSince ??= now
        if (now - quietSince >= HOLD_MS) { on = false; loudSince = null; quietSince = null }
      } else quietSince = null
      return { on, level: on ? Math.min(1, Math.max(0, (lv - floor) / (1 - floor))) : 0 }
    },
    floor: () => floor,
  }
}
