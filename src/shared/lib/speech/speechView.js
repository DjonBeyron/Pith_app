// Состояние, которое speechController отдаёт наружу (view). Вынесено из контроллера, чтобы тот не рос; контроллер реэкспортирует.
import { MAX_ATTEMPTS } from './speechPolicy.js'

export const emptyView = {
  status: 'idle', // idle | starting | listening | retrying | done | error
  interim: '', lastInterim: '', final: null, alternatives: [], usedInterim: false, // lastInterim — последний промежуточный текст попытки (диагностика админа)
  error: null, hint: null, notice: null, needTap: false,
  runNo: 0, reference: '', lang: '', at: null, attempt: 0, maxAttempts: MAX_ATTEMPTS, attemptId: 0,
  history: [], segments: [], applied: null, extra: null, // диагностика пробы: история interim [{t,text,final?}] и служебных событий [{t,kind}] ≤80, сегменты continuous, что выставил configure, снимок extra из start()
  cooling: false, preparing: false, // cooling — прошлый экземпляр ещё закрывается/пауза после end (новый запуск ждёт); preparing — наш запуск стоит в очереди на это время
}

export const isBusy = view => view.status === 'starting' || view.status === 'listening' || view.status === 'retrying'
