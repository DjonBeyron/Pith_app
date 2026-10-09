// Когда показывать плашку «Продолжить редактирование» (ResumeEditingToast):
// только админу, только во вкладке «Админ», пока она не закрыта на этот сеанс
// и пока не открыт ни один из редакторов урока (граф, продакшен, карточки
// повтора, справка слова). В ленте, «Памяти», «Рейтинге» и профиле её нет.
export function shouldShowResumeToast({ isAdmin, tab, resumeClosed, editorOpen }) {
  return !!isAdmin && tab === 'admin' && !resumeClosed && !editorOpen
}
