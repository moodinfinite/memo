import { Link } from 'react-router-dom'
import { useStudyStore } from '@/store/studyStore'
import type { Card } from '@/lib/database.types'
import StoryCard from '@/components/cards/StoryCard'
import LearnCard from '@/components/cards/LearnCard'
import MasteryChange from './MasteryChange'
import styles from '@/pages/StudyPage.module.css'

interface Props {
  title: string
  cards: Card[]
  backTo: string
  backLabel: string
  masteryLabel?: string
  handleEnd: () => void
}

export default function LearnSession({ title, cards, backTo, backLabel, masteryLabel, handleEnd }: Props) {
  const { learnComplete, learnStoryReady, learnBatchSummary, learnBatch, learnSetId,
    learnCards, learnGraduated, startLearnSession, completeLearnStory } = useStudyStore()
  // ── Learn story interlude (after batch graduates, before advancing) ──
  if (learnStoryReady && !learnComplete) {
    // Use the just-graduated batch cards (learnBatchSummary) for the story.
    // Fall back to learnBatch if summary is empty for some reason.
    const storyCards = learnBatchSummary.length > 0 ? learnBatchSummary : learnBatch
    return (
      <div className={styles.page}>
        <div className={styles.learnStoryTop}>
          <button className={styles.backBtn} onClick={handleEnd}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5"/></svg>
            <span>{title}</span>
          </button>
          <button className={styles.skipLink} onClick={completeLearnStory}>Skip story</button>
        </div>
        <div className={styles.learnStoryHint}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7.5l3 3 7-7"/></svg>
          <span><strong>Batch learned.</strong> Read the words in a story, then tap Continue.</span>
        </div>
        <StoryCard
          terms={storyCards}
          setId={learnSetId}
          setTitle={title}
          onNewBatch={completeLearnStory}
          onComplete={completeLearnStory}
        />
      </div>
    )
  }
  // ─────────────────────────────────────────────────────────────

  // ── Learn session active ──────────────────────────────────────
  if (!learnComplete) {
    return (
      <div className={styles.page}>
        <div className={styles.topBar}>
          <button className={styles.backBtn} onClick={handleEnd}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5"/></svg>
            {title}
          </button>
          <div className={styles.topBarRight}>
            <button className={styles.exitBtn} onClick={handleEnd}>End session</button>
          </div>
        </div>
        <LearnCard />
      </div>
    )
  }

  // ── Learn session complete ────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.summaryWrap}>
        <div className={styles.summary}>
          <div className={styles.countScore}>🎉</div>
          <div className={styles.summaryTitle}>Practice complete!</div>
          <MasteryChange cards={cards} label={masteryLabel} />
          <div className={styles.summaryMeta}>{learnGraduated.length} of {learnCards.length} cards practised this session</div>
          {learnGraduated.length > 0 && (
            <div className={styles.checkpointChips}>
              {learnCards.filter(c => learnGraduated.includes(c.id)).map((c, i) => (
                <div key={c.id} className={styles.checkpointChip} style={{ animationDelay: `${i * 40}ms` }}>{c.term}</div>
              ))}
            </div>
          )}
          <div className={styles.checkpointSaved}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7l3 3 6-6"/></svg>
            Review these cards when due to keep building mastery
          </div>
          <div className={styles.summaryActions}>
            <button className={styles.retryBtn} onClick={() => startLearnSession(learnCards, learnSetId)}>Study again</button>
            <button className={styles.changeModeBtn} onClick={handleEnd}>Change mode</button>
            <Link to={backTo} className={styles.doneBtn}>{backLabel}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
