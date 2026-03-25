import styles from './Skeleton.module.css'

/** Animated shimmer bar — pass width/height overrides via style prop */
export function Bone({ style, className }: { style?: React.CSSProperties; className?: string }) {
  return <div className={[styles.bone, className].filter(Boolean).join(' ')} style={style} />
}

/** Top-of-page indeterminate loading bar */
export function TopLoadingBar() {
  return (
    <div className={styles.topBar}>
      <div className={styles.topBarFill} />
    </div>
  )
}

/** Skeleton for the home / dashboard page */
export function HomePageSkeleton() {
  return (
    <div className={styles.group}>
      <TopLoadingBar />
      <div className={styles.inline}>
        <Bone style={{ height: 22, width: '35%' }} />
      </div>
      <Bone style={{ height: 13, width: '20%' }} />
      <div className={styles.statsGrid}>
        <Bone className={styles.statCard} />
        <Bone className={styles.statCard} />
        <Bone className={styles.statCard} />
      </div>
      <Bone style={{ height: 38, width: '100%' }} />
      <div className={styles.grid}>
        <Bone className={styles.card} />
        <Bone className={styles.card} />
        <Bone className={styles.card} />
        <Bone className={styles.card} />
      </div>
    </div>
  )
}

/** Skeleton for set detail page */
export function SetDetailSkeleton() {
  return (
    <div className={styles.group}>
      <TopLoadingBar />
      <div className={styles.inline}>
        <Bone style={{ height: 22, width: '45%' }} />
        <div style={{ flex: 1 }} />
        <Bone style={{ height: 36, width: 80 }} />
        <Bone style={{ height: 36, width: 60 }} />
      </div>
      <Bone style={{ height: 13, width: '25%' }} />
      <div className={styles.row}>
        <Bone style={{ height: 52 }} />
        <Bone style={{ height: 52 }} />
        <Bone style={{ height: 52 }} />
        <Bone style={{ height: 52 }} />
        <Bone style={{ height: 52 }} />
      </div>
    </div>
  )
}

/** Skeleton for study page (loading set) */
export function StudyPageSkeleton() {
  return (
    <div className={styles.group} style={{ maxWidth: 660, margin: '0 auto' }}>
      <TopLoadingBar />
      <Bone style={{ height: 16, width: '30%' }} />
      <Bone className={styles.cardTall} />
      <div className={styles.inline} style={{ justifyContent: 'center' }}>
        <Bone style={{ height: 44, width: '45%' }} />
        <Bone style={{ height: 44, width: '45%' }} />
      </div>
    </div>
  )
}

/** Generic centered loading with bar */
export function FullPageSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <TopLoadingBar />
      <Bone style={{ width: 48, height: 48, borderRadius: '50%' }} />
      <Bone style={{ width: 120, height: 14 }} />
    </div>
  )
}
