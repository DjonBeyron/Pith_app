import { useMemo } from 'react'
import { compareLayout } from './mirrorCompare.js'

// Раскладка «Дубля и зеркала» на дорожках (rh.compare → сцена mirror движка пилюль, useWordLaneFlow): появляется, когда стадия mirror идёт и Пит уже договорил (active), и пока данные дубля есть.
// Меняется только вместе с данными дубля (mirror — один объект на стадию), поэтому сцена не пересобирается на каждый рендер. Нет дубля или стадия другая — null (дорожки пусты).
export function useCompareScene({ active, mirror, chunks }) {
  return useMemo(() => (active && mirror && chunks?.length ? compareLayout({ chunks, student: mirror.student, measure: mirror.measure }) : null), [active, mirror, chunks])
}
