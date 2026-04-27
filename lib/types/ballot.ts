export interface BallotOption {
  id: string
  label: string
  description?: string
}

export interface Ballot {
  title: string
  description?: string
  options: BallotOption[]
  total_dots: number
}

export interface Room {
  id: string
  room_code: string
  topic: string
  created_at: string
  expires_at: string | null
  is_closed: boolean
}

export interface BallotRow {
  id: string
  room_id: string
  title: string
  description: string | null
  options: BallotOption[]
  total_dots: number
}

export interface Vote {
  id: string
  room_id: string
  option_id: string
  dots: number
  channel: 'digital' | 'analog'
  created_at: string
}

export interface VoteCount {
  option_id: string
  channel: 'digital' | 'analog'
  total_dots: number
  vote_count: number
}

/** 오프라인 큐에 저장되는 미전송 투표 */
export interface PendingVote {
  room_id: string
  option_id: string
  dots: number
  channel: 'digital'
}

/** 결과 화면에서 옵션별 집계된 도트 수 */
export interface AggregatedResult {
  option_id: string
  label: string
  digital: number
  analog: number
  total: number
}
