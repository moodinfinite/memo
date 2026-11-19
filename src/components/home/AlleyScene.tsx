import { useLayoutEffect, useRef, useState } from 'react'
import { LANE_ITEMS, LANE_CAT, LANE_TRAIN, C, laneBack, laneLabels } from './laneScene'
import styles from './TheLane.module.css'

const BACK = laneBack()
const LABELS = laneLabels()
export const LANE_N = LANE_ITEMS.length
const TRAIN = LANE_ITEMS.findIndex(it => it.kind === 'train')

interface Box { x: number; y: number; width: number; height: number }
const boxOf = (svg: SVGSVGElement | null, i: number | null): Box | null => {
  if (!svg || i == null) return null
  try { const b = svg.querySelector<SVGGElement>(`[data-item="${i}"]`)?.getBBox(); return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null } catch { return null }
}

interface Props {
  /** Lights on, counting from Auntie's stall */
  shown: number
  /** How far the next light has warmed, 0–1 */
  warmth: number
  /** The light that just came on: it flickers, glows and gets a ring */
  fresh?: number | null
  /** Zoom towards this light */
  focus?: number | null
  onItem?: (i: number) => void
  label: string
}

/** The dusk alley, drawn from the lights that are on. Shared by Home and the path's "unit done" moment. */
export default function AlleyScene({ shown, warmth, fresh = null, focus = null, onItem, label }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [ring, setRing] = useState<Box | null>(null)
  const [zoom, setZoom] = useState<Box | null>(null)
  useLayoutEffect(() => { setRing(boxOf(svg.current, fresh)) }, [fresh])
  useLayoutEffect(() => { setZoom(boxOf(svg.current, focus)) }, [focus])

  const zoomStyle: React.CSSProperties = zoom
    ? { transform: 'scale(1.32)', transformOrigin: `${zoom.x + zoom.width / 2}px ${zoom.y + zoom.height / 2}px`, transformBox: 'view-box' }
    : { transform: 'none', transformBox: 'view-box' }

  return <svg ref={svg} viewBox="0 0 1600 900" className={styles.svg} role="img" aria-label={label}>
    <g className={styles.zoom} style={zoomStyle}>
      <g dangerouslySetInnerHTML={{ __html: BACK }} />
      <g className={styles.cat} style={{ opacity: shown >= LANE_N / 2 ? 1 : 0 }} fill="#f2efe8" stroke={C.ink} strokeWidth="2" dangerouslySetInnerHTML={{ __html: LANE_CAT }} />
      <g>{LANE_ITEMS.map((it, i) => {
        if (!it.pool) return null
        const [cx, cy, rx, ry] = it.pool
        const o = i < shown ? 1 : i === shown ? warmth * 0.35 : 0
        return <ellipse key={i} className={styles.pool} cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${it.kind === 'cool' ? 'lanePoolCool' : 'lanePoolWarm'})`} style={{ opacity: o }} />
      })}</g>
      <g>{LANE_ITEMS.map((it, i) => {
        if (it.kind === 'train') return null
        const on = i < shown
        const cls = [styles.item, on && styles.on, it.kind === 'cool' && styles.cool, i === fresh && styles.fresh, !onItem && styles.still].filter(Boolean).join(' ')
        return <g key={i} data-item={i} className={cls} onClick={onItem ? () => onItem(i) : undefined}>
          <g fill={it.dim} stroke={C.ink} strokeWidth="2" dangerouslySetInnerHTML={{ __html: it.geo }} />
          <g className={styles.lit} fill={it.lit} stroke={C.ink} strokeWidth="2" style={on ? undefined : { opacity: i === shown ? warmth * 0.35 : 0 }} dangerouslySetInnerHTML={{ __html: it.geo }} />
        </g>
      })}</g>
      <g clipPath="url(#laneGap)"><g className={`${styles.trainWrap} ${fresh === TRAIN ? styles.fresh : ''}`} style={{ opacity: TRAIN < shown ? 1 : 0 }}>
        <g className={styles.train} dangerouslySetInnerHTML={{ __html: LANE_TRAIN }} />
      </g></g>
      {ring && <ellipse key={fresh ?? -1} className={`${styles.ring} ${fresh != null && LANE_ITEMS[fresh]?.kind === 'cool' ? styles.ringCool : ''}`}
        cx={ring.x + ring.width / 2} cy={ring.y + ring.height / 2} rx={ring.width / 2 + 22} ry={ring.height / 2 + 22} />}
      <g style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: LABELS }} />
    </g>
  </svg>
}
