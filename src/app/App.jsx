import ShellV2 from './ShellV2.jsx'

// Этап 6 миграции завершён: старая оболочка вынесена в old/ (вне git и
// сборки), приложение — это новая оболочка ShellV2.
export default function App() {
  return <ShellV2 />
}
