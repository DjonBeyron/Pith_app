import { Component } from 'react'
import { APP_VERSION } from '../shared/lib/version.js'
import { getErrorLines } from '../shared/lib/errorTrap.js'
import { reportError } from '../shared/lib/errorReport.js'

// Классовый ErrorBoundary (у хуков аналога componentDidCatch нет): любая
// ошибка рендера показывает этот экран вместо белой страницы. Стили инлайном
// намеренно — экран ошибки не должен зависеть от загрузки app-CSS.
const S = {
  wrap: {
    position: 'fixed', inset: 0, background: '#0b0d10', color: '#e0e0e0',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center',
    fontFamily: 'inherit', zIndex: 99999,
  },
  icon:  { fontSize: 44, lineHeight: 1 },
  title: { fontSize: 18, fontWeight: 700, margin: 0 },
  text:  { fontSize: 13, color: '#888', margin: 0, maxWidth: 340 },
  btn: {
    background: '#b6fe3b', border: 'none', borderRadius: 11,
    padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#0d0f14',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  report: {
    background: 'transparent', border: 'none', color: '#555',
    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    textDecoration: 'underline', padding: 6,
  },
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    reportError({
      message: error?.message ?? String(error),
      stack: (error?.stack ?? '') + '\n--- components ---' + (info?.componentStack ?? ''),
      source: 'boundary',
    })
  }

  downloadReport = () => {
    const { error, info } = this.state
    const lines = [
      '=== Pithy Error Report ===',
      `version: ${APP_VERSION}`,
      `ts: ${new Date().toISOString()}`,
      `ua: ${navigator.userAgent}`,
      '',
      '--- Ошибка рендера ---',
      String(error?.stack ?? error ?? '?'),
      '',
      '--- Дерево компонентов ---',
      info?.componentStack ?? '(нет)',
      '',
      '--- Глобальные ошибки окна (errorTrap) ---',
      ...getErrorLines(),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pithy-error-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={S.wrap}>
        <div style={S.icon}>😵</div>
        <h1 style={S.title}>Что-то пошло не так</h1>
        <p style={S.text}>
          Приложение столкнулось с ошибкой. Перезагрузка обычно помогает —
          твой прогресс сохранён.
        </p>
        <button style={S.btn} onClick={() => window.location.reload()}>
          Перезагрузить
        </button>
        <button style={S.report} onClick={this.downloadReport}>
          Скачать отчёт об ошибке
        </button>
      </div>
    )
  }
}
