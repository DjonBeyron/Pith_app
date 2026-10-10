import { silenceReasons, suppressedCount, lastSuppressed, deferredNames, isSoundQuiet } from './soundQuiet.js'
import { soundCtxState } from './sounds.js'
import { getSoundLog } from './soundTrace.js'
import { createAudioSession } from './speech/speechAudioSession.js'

// Снимок «почему не играют звуки интерфейса» для админа (SoundDiagBlock в «Голосе») и для pLog. Только чтение, ничего не меняет.
// quiet: кто сейчас глушит (полная тишина по причинам — например 'admin-voice'; окно записи), сколько звуков проглочено, что ждёт повтора;
// ctx: состояние общего AudioContext звуков (running/suspended/interrupted/нет); session: navigator.audioSession.type;
// problems: сколько запросов звука закончились не «прозвучал»; last: последний запрос звука и его итог; dropped: последний проглоченный.
export function soundDiag({ session = createAudioSession(), trace = getSoundLog, now = Date.now } = {}) {
  const t = trace()
  const reqs = t.запросы ?? []
  const last = reqs[reqs.length - 1] ?? null
  const problems = Object.values(t.сводка ?? {}).reduce((n, b) => n + (b.проблем || 0), 0)
  const d = lastSuppressed()
  return {
    ctx: soundCtxState() ?? 'нет',
    session: session.current() ?? 'нет API',
    quiet: { silence: silenceReasons(), window: isSoundQuiet(), dropped: suppressedCount(), deferred: deferredNames() },
    requests: reqs.length, problems,
    last: last ? { name: last.звук, result: last.итог, ctx: last.состояниеCtx ?? null, where: last.откуда ?? null } : null,
    dropped: d ? { name: d.name, agoMs: Math.max(0, now() - d.at), silence: d.silence } : null,
  }
}

/** Короткие строки для показа: ['контекст: running · сессия: auto', 'тишина: admin-voice · проглочено 5', 'последний: message-in → прозвучал'] */
export function soundDiagLines(d = soundDiag()) {
  const q = d.quiet
  const quiet = q.silence.length ? `ПОЛНАЯ ТИШИНА (${q.silence.join(', ')})` : q.window ? 'окно записи открыто' : 'тишины нет'
  return [
    `контекст звуков: ${d.ctx} · аудиосессия: ${d.session}`,
    `${quiet} · проглочено: ${q.dropped}${q.deferred.length ? ` · ждут: ${q.deferred.join(', ')}` : ''}`,
    `запросов: ${d.requests} · проблем: ${d.problems} · последний: ${d.last ? `${d.last.name} → ${d.last.result}${d.last.where ? ` (${d.last.where})` : ''}` : '—'}`,
    d.dropped ? `проглочен последним: ${d.dropped.name} ${Math.round(d.dropped.agoMs / 1000)} с назад${d.dropped.silence ? ' (полная тишина)' : ''}` : 'проглоченных нет',
  ]
}
