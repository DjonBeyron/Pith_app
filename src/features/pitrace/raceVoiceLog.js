import { pLog } from '../../shared/lib/debug.js'

/** Журнал голоса перевода: какое слово и какой перевод Пит говорит перед выездом этой пилюли (одна запись повтора: слово, перевод, дорожка, скорость). Расхождение с записью слова круга — строка «РАССИНХРОН» (не должно быть никогда) */
export function logPre(stage, rep) {
  if (!rep || !['sprint', 'catch', 'boss'].includes(stage?.act)) return
  const w = stage.words?.[rep.idx], want = stage.act === 'catch' ? w?.text : w?.translation
  pLog(`[race] голос: повтор ${rep.idx + 1}/${stage.words?.length ?? '?'}${stage.sid.endsWith('2') ? ' (второй круг)' : ''} слово «${w?.text ?? rep.text}», ${stage.act === 'catch' ? 'говорит слово' : 'перевод'} «${rep.say ?? rep.cap}», на пилюле «${rep.cap}», дорожка ${rep.lanes?.[0]}, скорость ${rep.speed}${w && want !== (rep.say ?? rep.cap) ? `; РАССИНХРОН: в записи слова «${want}»` : ''}`)
}
