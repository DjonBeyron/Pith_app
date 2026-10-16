import { ruleHint } from './sceneTabHelp.js'

// Сводка вверху вкладки + блок «Правила сцен» (S1–S8) со списком нарушений и подсказками
export default function SceneTabSummary({ summary, issues, isWordLesson }) {
  const codes = [...new Set(issues.map(i => i.code))]
  return (
    <div className="scTabSummary">
      <p className="scTabCounts" aria-live="polite">
        Сцен в уроке: <b>{summary.total}</b> · динамичных: <b>{summary.dynamic}</b> · статичных: <b>{summary.static}</b>
        {summary.empty > 0 && <> · пустых: <b>{summary.empty}</b></>}
        {summary.withErr > 0 && <span className="scTabCount--err"> · с ошибками: {summary.withErr}</span>}
        {summary.withWarn > 0 && <span className="scTabCount--warn"> · с предупреждениями: {summary.withWarn}</span>}
      </p>
      {summary.total > 0 && (
        <section className={`scTabRules${issues.length ? (summary.ruleErrors ? ' scTabRules--err' : ' scTabRules--warn') : ' scTabRules--ok'}`} aria-label="Правила сцен">
          <h3 className="scTabRulesTitle">Правила сцен{isWordLesson ? '' : ' (для уроков-слов)'}</h3>
          {!issues.length && <p className="scTabRulesOk">{isWordLesson ? 'Нарушений нет: открывающая и закрывающая сцены, число сцен и реплики в порядке.' : 'Эти правила проверяются только в уроках-словах (заголовок урока — слово латиницей); здесь нарушений нет.'}</p>}
          {issues.length > 0 && (
            <>
              <ul className="scTabRulesList">
                {issues.map((i, k) => (
                  <li key={k} className={`scTabIssue scTabIssue--${i.level}`}>{i.seq != null && <b>Нода №{i.seq}. </b>}{i.level === 'error' ? 'Ошибка' : 'Предупреждение'}: {i.text}</li>
                ))}
              </ul>
              <ul className="scTabHints">
                {codes.map(c => <li key={c}>Как исправить: {ruleHint(c)}</li>)}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
