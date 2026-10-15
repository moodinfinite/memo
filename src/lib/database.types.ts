export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]
export type StudyMode = 'flashcard' | 'multiple_choice' | 'typed' | 'sentence' | 'learn'

export interface SentenceEntry {
  card_id: string
  term: string; definition: string; sentence: string
  feedback: string; improved: string | null
  score: 'great' | 'good' | 'needs_work'
}

export interface Folder {
  id: string; user_id: string; name: string; color: string; position: number; created_at: string
}
export interface FlashcardSet {
  id: string; user_id: string; title: string; description: string
  folder_id?: string | null; pinned: boolean
  created_at: string; updated_at: string; cards?: Card[]; cardCount?: number
}
export interface Card {
  id: string; set_id: string; user_id: string; term: string; definition: string; position: number
}
export interface StudySession {
  id: string; user_id: string; set_id: string; mode: StudyMode
  total_cards: number; known_count: number; unknown_count: number; score_pct: number; completed_at: string
}
export interface CardProgress {
  id: string; user_id: string; card_id: string; set_id: string
  known_count: number; unknown_count: number; last_seen_at: string
}
export interface SessionDraft {
  scope_id?: string
  session_id?: string
  state?: {
    unshuffledOrder?: string[]
    masteryBefore?: Record<string, number> | null
    timerSecsLeft?: number; typedAnswer?: string; sentenceInput?: string; sentenceEntries?: SentenceEntry[]
    sentenceStatus?: string; sentenceFeedback?: string; sentenceImproved?: string | null
    sentenceScore?: 'great' | 'good' | 'needs_work' | null
    learnBatch?: string[]; learnQueue?: string[]; learnGraduated?: string[]; learnScores?: Record<string, number>
    learnBatchIdx?: number; learnBatchComplete?: boolean; learnBatchSummary?: string[]; learnStoryReady?: boolean
  }
  id: string; user_id: string; set_id: string; mode: StudyMode
  card_order: string[]; current_index: number
  known_ids: string[]; unknown_ids: string[]
  do_shuffle: boolean; timer_dur_min: number; updated_at: string
}
export interface Database { public: { Tables: Record<string, unknown> } }
