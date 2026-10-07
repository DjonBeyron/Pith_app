// Авто-ответ админа в «выбери слово» (SolveCorrectButton): какой вариант
// «нажать». Первый с isCorrect в порядке показа — ровно тот, что ученик
// нажал бы верно; нет верных (только сигнальные «знаю/не знаю») — null,
// собирать нечего.
export function pickCorrectOption(options = []) {
  return options.find(o => !!o.isCorrect) ?? null
}
