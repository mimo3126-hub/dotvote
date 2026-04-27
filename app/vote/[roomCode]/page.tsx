'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { BallotOption, BallotRow, PendingVote, Room } from '@/lib/types/ballot'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; room: Room; ballot: BallotRow }
  | { status: 'closed' }
  | { status: 'submitted' }

const PENDING_KEY = 'dotvote_pending'

function readPending(): PendingVote[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as PendingVote[]) : []
  } catch {
    return []
  }
}

function writePending(list: PendingVote[]) {
  if (typeof window === 'undefined') return
  if (list.length === 0) localStorage.removeItem(PENDING_KEY)
  else localStorage.setItem(PENDING_KEY, JSON.stringify(list))
}

export default function VotePage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const router = useRouter()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // 룸 + 투표안 로드
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single()

      if (cancelled) return
      if (roomErr || !room) {
        setLoad({ status: 'error', message: '존재하지 않는 참여 코드입니다' })
        return
      }
      if (room.is_closed) {
        setLoad({ status: 'closed' })
        return
      }
      if (room.expires_at && new Date(room.expires_at) < new Date()) {
        setLoad({ status: 'closed' })
        return
      }

      const { data: ballot, error: ballotErr } = await supabase
        .from('ballots')
        .select('*')
        .eq('room_id', room.id)
        .single()

      if (cancelled) return
      if (ballotErr || !ballot) {
        setLoad({ status: 'error', message: '투표안을 찾을 수 없습니다' })
        return
      }

      setLoad({ status: 'ready', room, ballot })
      setAllocations(
        Object.fromEntries((ballot.options as BallotOption[]).map((o) => [o.id, 0])),
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [roomCode])

  // 오프라인 상태 추적 + 재연결 시 큐 플러시
  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateOnline = () => setIsOffline(!navigator.onLine)
    updateOnline()
    setPendingCount(readPending().length)

    async function flushPending() {
      const pending = readPending()
      if (pending.length === 0) return
      const supabase = createClient()
      const { error } = await supabase.from('votes').insert(pending)
      if (!error) {
        writePending([])
        setPendingCount(0)
      }
    }

    function onOnline() {
      updateOnline()
      void flushPending()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  if (load.status === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-elder-lg">불러오는 중…</p>
      </main>
    )
  }

  if (load.status === 'error') {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto pt-20 text-center">
        <p className="text-elder-xl font-bold mb-3">{load.message}</p>
        <button onClick={() => router.push('/')} className="btn-secondary mt-6">
          처음으로
        </button>
      </main>
    )
  }

  if (load.status === 'closed') {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto pt-20 text-center">
        <p className="text-elder-xl font-bold mb-3">투표가 마감되었습니다</p>
        <button onClick={() => router.push('/')} className="btn-secondary mt-6">
          처음으로
        </button>
      </main>
    )
  }

  if (load.status === 'submitted') {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto pt-20 text-center space-y-6">
        <div className="text-7xl">✓</div>
        <p className="text-elder-2xl font-bold text-blue-900">투표 완료!</p>
        <p className="text-elder-base text-gray-700">
          참여해주셔서 감사합니다.
          {pendingCount > 0 && (
            <>
              <br />
              <span className="text-orange-700">
                ({pendingCount}건 미전송 — 인터넷 복구 시 자동 전송됩니다)
              </span>
            </>
          )}
        </p>
        <button onClick={() => router.push('/')} className="btn-secondary">
          처음으로
        </button>
      </main>
    )
  }

  const { room, ballot } = load
  const options = ballot.options as BallotOption[]
  const used = Object.values(allocations).reduce((a, b) => a + b, 0)
  const remaining = ballot.total_dots - used

  function adjust(optId: string, delta: number) {
    setAllocations((prev) => {
      const cur = prev[optId] ?? 0
      const next = cur + delta
      if (next < 0) return prev
      const newUsed = used - cur + next
      if (newUsed > ballot.total_dots) return prev
      return { ...prev, [optId]: next }
    })
  }

  async function handleSubmit() {
    if (used === 0) return
    setSubmitting(true)

    const rows: PendingVote[] = Object.entries(allocations)
      .filter(([, dots]) => dots > 0)
      .map(([option_id, dots]) => ({
        room_id: room.id,
        option_id,
        dots,
        channel: 'digital',
      }))

    const supabase = createClient()
    const { error } = await supabase.from('votes').insert(rows)

    if (error) {
      // 오프라인 또는 네트워크 실패 → localStorage에 저장
      const existing = readPending()
      const merged = [...existing, ...rows]
      writePending(merged)
      setPendingCount(merged.length)
    }

    setSubmitting(false)
    setLoad({ status: 'submitted' })
  }

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto pb-32">
      {/* 상단: 룸 정보 + 오프라인 배지 */}
      <div className="bg-blue-50 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-elder-sm text-gray-600">참여 코드</p>
            <p className="text-elder-xl font-bold text-blue-900">{room.room_code}</p>
          </div>
          {isOffline && (
            <div className="bg-orange-100 text-orange-800 px-3 py-2 rounded-lg text-elder-sm font-bold">
              ⚠ 오프라인
            </div>
          )}
        </div>
        <p className="text-elder-sm text-gray-700 mt-2">{room.topic}</p>
      </div>

      {/* 질문 */}
      <h1 className="text-elder-2xl font-bold mb-2">{ballot.title}</h1>
      {ballot.description && (
        <p className="text-elder-base text-gray-700 mb-6">{ballot.description}</p>
      )}

      {/* 남은 도트 */}
      <div className="sticky top-0 bg-white border-b-2 border-gray-200 -mx-4 px-4 py-3 mb-4 z-10">
        <p className="text-center text-elder-xl">
          남은 스티커{' '}
          <span
            className={`font-bold ${remaining === 0 ? 'text-green-700' : 'text-blue-900'}`}
          >
            {remaining}
          </span>
          <span className="text-elder-base text-gray-500"> / {ballot.total_dots}</span>
        </p>
      </div>

      {/* 선택지 목록 */}
      <div className="space-y-3 mb-8">
        {options.map((opt) => {
          const dots = allocations[opt.id] ?? 0
          return (
            <div key={opt.id} className="border-2 border-gray-200 rounded-xl p-4">
              <div className="mb-3">
                <h3 className="text-elder-lg font-bold">{opt.label}</h3>
                {opt.description && (
                  <p className="text-elder-sm text-gray-600 mt-1">{opt.description}</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => adjust(opt.id, -1)}
                  disabled={dots === 0}
                  aria-label={`${opt.label} 도트 빼기`}
                  className="w-16 h-16 rounded-full bg-gray-200 text-elder-2xl font-bold disabled:opacity-30 active:bg-gray-300"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <span className="text-elder-3xl font-bold text-blue-900">{dots}</span>
                  <span className="text-elder-base text-gray-500"> 개</span>
                </div>
                <button
                  type="button"
                  onClick={() => adjust(opt.id, 1)}
                  disabled={remaining === 0}
                  aria-label={`${opt.label} 도트 더하기`}
                  className="w-16 h-16 rounded-full bg-blue-900 text-white text-elder-2xl font-bold disabled:opacity-30 active:bg-blue-950"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 제출 버튼 (고정) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={used === 0 || submitting}
            className="btn-primary w-full"
          >
            {submitting ? '제출 중…' : `투표 제출하기 (${used}개)`}
          </button>
        </div>
      </div>
    </main>
  )
}
