// Админская диагностика «Сказать фразу» в уроке — СБОР контекста для sayDiagRows.buildDiagRows из живых источников (без React, всё подставляется в тестах):
// состояние Vosk в памяти (voskRuntime), кэш модели и фоновая загрузка, режим админа, журнал последней попытки, решение панели по микрофону, среда телефона.
// Вызывается раз в секунду, пока окно диагностики открыто (useSayDiag.js); при закрытом окне не вызывается вообще. Микрофон не открывает, ничего не запускает.
import { voskRuntime } from '../vosk/voskRuntime.js'
import { peekCached } from '../vosk/voskStorage.js'
import { readModelUrl, modelUrlSource } from '../vosk/voskConfig.js'
import { getBgStatus } from '../vosk/voskBgStatus.js'
import { isStopped } from '../vosk/voskBgPolicy.js'
import { APP_VERSION } from '../version.js'
import { pickEngine } from './sayEnginePick.js'
import { readSayEngine } from './sayEngineMode.js'
import { sayAttemptLog } from './sayAttemptLast.js'
import { sayPermission } from './sayPermission.js'
import { readDiagEnv, readMicPermission } from './sayDiagEnv.js'

const hostOf = url => { try { return new URL(url).host } catch { return '' } }

/**
 * @param {{phrase: string}} p
 * @param {object} [deps] подмена источников в тестах
 * @returns {Promise<object>} контекст для buildDiagRows
 */
export async function collectDiagContext({ phrase }, deps = {}) {
  const d = {
    runtime: voskRuntime, perm: sayPermission, attempts: sayAttemptLog, now: Date.now, version: APP_VERSION,
    peek: peekCached, readUrl: readModelUrl, urlSource: modelUrlSource, bgStatus: getBgStatus, bgStopped: isStopped, getMode: readSayEngine,
    env: readDiagEnv, micPerm: readMicPermission, ...deps,
  }
  const url = d.readUrl()
  const [cache, perm] = await Promise.all([d.peek(url).catch(() => null), d.micPerm().catch(() => 'unavailable')])
  const snap = d.runtime.snapshot()
  const mode = d.getMode()
  const now = d.now()
  const env = d.env()
  return {
    now, version: d.version, phrase, mode, snap, info: d.runtime.info(), cache, cacheApi: env.cacheApi,
    bg: d.bgStatus(), bgStopped: d.bgStopped(), urlSource: d.urlSource(), urlHost: hostOf(url),
    pick: pickEngine({ mode, phrase, ...snap, now }), attempt: d.attempts.get(), gate: d.perm.decide(), env, perm,
  }
}

/** Кнопка «Прогреть сейчас» в окне диагностики: запустить / перезапустить прогрев вручную (паузу после сбоя снимает); результат виден в строках «Прогрев Vosk» */
export const warmNowFromDiag = (runtime = voskRuntime) => runtime.warmNow('manual')
