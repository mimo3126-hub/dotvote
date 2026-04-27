'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { colorFor } from '@/lib/utils/option-colors'
import type {
  AggregatedResult,
  BallotOption,
  BallotRow,
  Room,
  VoteCount,
} from '@/lib/types/ballot'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; room: Room; ballot: BallotRow }

export default function ResultsPage() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [results, setResults] = useState<AggregatedResult[]>([])
  const [analogMode, setAnalogMode] = useState(false)
  const [analogDraft, setAnalogDraft] = useState<Record<string, number>>({})
  const [savingAnalog, setSavingAnalog] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reconnects, setReconnects] = useState(0)
  const [minutesMode, setMinutesMode] = useState(false)
  const [minutesNotes, setMinutesNotes] = useState('')
  const [minutesNextSteps, setMinutesNextSteps] = useState('')
  const [minutesAttendees, setMinutesAttendees] = useState('')
  const [downloadingMinutes, setDownloadingMinutes] = useState(false)
  const supabaseRef = useRef(createClient())

  // 룸 + 투표안 로드
  useEffect(() => {
    let cancelled = false
    async function init() {
      const supabase = supabaseRef.current
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single()
      if (cancelled) return
      if (roomErr || !room) {
        setLoad({ status: 'error', message: '룸을 찾을 수 없습니다' })
        return
      }
      const { data: ballot } = await supabase
        .from('ballots')
        .select('*')
        .eq('room_id', room.id)
        .single()
      if (cancelled || !ballot) {
        setLoad({ status: 'error', message: '투표안을 찾을 수 없습니다' })
        return
      }
      setLoad({ status: 'ready', room, ballot })
    }
    init()
    return () => {
      cancelled = true
    }
  }, [roomCode])

  // vote_counts 뷰에서 집계 (N+1 방지)
  const fetchCounts = useCallback(
    async (roomId: string, options: BallotOption[]) => {
      const supabase = supabaseRef.current
      const { data, error } = await supabase
        .from('vote_counts')
        .select('option_id, channel, total_dots, vote_count')
        .eq('room_id', roomId)
      if (error) return
      const map = new Map<string, AggregatedResult>(
        options.map((o) => [
          o.id,
          { option_id: o.id, label: o.label, digital: 0, analog: 0, total: 0 },
        ]),
      )
      for (const row of (data ?? []) as VoteCount[]) {
        const cur = map.get(row.option_id)
        if (!cur) continue
        const dots = Number(row.total_dots ?? 0)
        if (row.channel === 'digital') cur.digital = dots
        else cur.analog = dots
        cur.total = cur.digital + cur.analog
      }
      const sorted = Array.from(map.values()).sort((a, b) => b.total - a.total)
      setResults(sorted)
      // analog draft 동기화 (편집 모드 아닐 때만)
      setAnalogDraft((prev) => {
        if (Object.keys(prev).length > 0) return prev
        return Object.fromEntries(sorted.map((r) => [r.option_id, r.analog]))
      })
    },
    [],
  )

  // 실시간 구독 + 재연결 시 RE-FETCH
  useEffect(() => {
    if (load.status !== 'ready') return
    const supabase = supabaseRef.current
    const { room, ballot } = load
    const options = ballot.options as BallotOption[]

    fetchCounts(room.id, options)

    const channel = supabase
      .channel(`room:${room.room_code}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votes',
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          fetchCounts(room.id, options)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // 매번 SUBSCRIBED일 때 강제 RE-FETCH (오프라인 재연결 대응)
          fetchCounts(room.id, options)
          setReconnects((n) => n + 1)
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [load, fetchCounts])

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
        <Link href="/" className="btn-secondary inline-block mt-6">
          처음으로
        </Link>
      </main>
    )
  }

  const { room, ballot } = load
  const options = ballot.options as BallotOption[]
  const maxTotal = Math.max(1, ...results.map((r) => r.total))
  const sumDigital = results.reduce((s, r) => s + r.digital, 0)
  const sumAnalog = results.reduce((s, r) => s + r.analog, 0)

  async function saveAnalog() {
    setSavingAnalog(true)
    const counts = Object.entries(analogDraft).map(([option_id, dots]) => ({
      option_id,
      dots: Math.max(0, Math.floor(dots)),
    }))
    await fetch('/api/votes/analog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_code: room.room_code, counts }),
    })
    // 즉시 RE-FETCH
    await fetchCounts(room.id, options)
    setSavingAnalog(false)
    setAnalogMode(false)
  }

  async function closeVoting() {
    if (!confirm('투표를 마감하시겠습니까? 더 이상 투표가 추가되지 않습니다.')) return
    setClosing(true)
    await fetch(`/api/rooms/${room.room_code}/close`, { method: 'POST' })
    setClosing(false)
    location.reload()
  }

  async function downloadMinutes() {
    setDownloadingMinutes(true)
    try {
      const res = await fetch(`/api/minutes/${room.room_code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: minutesNotes,
          nextSteps: minutesNextSteps,
          attendees: minutesAttendees,
        }),
      })
      if (!res.ok) {
        alert('회의록 생성 실패: ' + (await res.text()))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dotvote-minutes-${room.room_code}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingMinutes(false)
    }
  }

  if (minutesMode) {
    return (
      <main className="min-h-screen p-6 max-w-3xl mx-auto pb-32">
        <h1 className="text-elder-2xl font-bold mb-2">📝 회의록 PDF 만들기</h1>
        <p className="text-elder-sm text-gray-600 mb-6">
          주제 · 날짜 · 투표 결과는 자동으로 채워집니다. 토론 내용과 다음 단계만 입력하세요.
          비워두면 "(기록 없음)" 으로 표시됩니다.
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-elder-base font-bold mb-2">
              참여자 수{' '}
              <span className="text-elder-sm font-normal text-gray-500">(선택)</span>
            </label>
            <input
              type="text"
              value={minutesAttendees}
              onChange={(e) => setMinutesAttendees(e.target.value)}
              placeholder="예: 12명 (어르신 8 + 진행자 2 + 청년 2)"
              className="input-large"
              maxLength={80}
            />
          </div>

          <div>
            <label className="block text-elder-base font-bold mb-2">
              토론 내용{' '}
              <span className="text-elder-sm font-normal text-gray-500">
                (자유 메모, 회의 중 정리)
              </span>
            </label>
            <textarea
              value={minutesNotes}
              onChange={(e) => setMinutesNotes(e.target.value)}
              placeholder="예: 1순위 항목에 대해 이장님께서 예산 확보 가능성을 언급. 2순위는 마을 청년회가 자원봉사로 진행 가능하다는 의견."
              className="input-large resize-y"
              rows={6}
              maxLength={3000}
            />
          </div>

          <div>
            <label className="block text-elder-base font-bold mb-2">
              다음 단계 / 합의 사항
            </label>
            <textarea
              value={minutesNextSteps}
              onChange={(e) => setMinutesNextSteps(e.target.value)}
              placeholder={
                '예:\n· 다음 회의 일정: 2026년 5월 10일 (화) 오후 2시\n· 1순위 안건은 군청 담당자에게 5월 5일까지 제출\n· 이장: 마을 방송으로 결과 공유'
              }
              className="input-large resize-y"
              rows={5}
              maxLength={2000}
            />
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <button
              onClick={() => setMinutesMode(false)}
              className="btn-secondary flex-1"
              disabled={downloadingMinutes}
            >
              뒤로
            </button>
            <button
              onClick={downloadMinutes}
              className="btn-primary flex-1"
              disabled={downloadingMinutes}
            >
              {downloadingMinutes ? '생성 중…' : '📄 PDF 다운로드'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (analogMode) {
    return (
      <main className="min-h-screen p-6 max-w-3xl mx-auto pb-32">
        <h1 className="text-elder-2xl font-bold mb-2">📋 종이 시트 카운트 입력</h1>
        <p className="text-elder-sm text-gray-600 mb-6">
          종이에 붙어있는 스티커 수를 옵션별로 입력하세요. 저장하면 디지털 투표와 합산됩니다.
        </p>

        <div className="space-y-3">
          {options.map((opt) => (
            <div key={opt.id} className="border-2 border-gray-200 rounded-xl p-4">
              <h3 className="text-elder-base font-bold mb-2">{opt.label}</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setAnalogDraft((prev) => ({
                      ...prev,
                      [opt.id]: Math.max(0, (prev[opt.id] ?? 0) - 1),
                    }))
                  }
                  className="w-14 h-14 rounded-full bg-gray-200 text-elder-2xl font-bold"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={analogDraft[opt.id] ?? 0}
                  onChange={(e) =>
                    setAnalogDraft((prev) => ({
                      ...prev,
                      [opt.id]: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  className="flex-1 text-center text-elder-2xl font-bold border-2 border-gray-300 rounded-xl py-2"
                />
                <button
                  onClick={() =>
                    setAnalogDraft((prev) => ({
                      ...prev,
                      [opt.id]: (prev[opt.id] ?? 0) + 1,
                    }))
                  }
                  className="w-14 h-14 rounded-full bg-blue-900 text-white text-elder-2xl font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <button
              onClick={() => setAnalogMode(false)}
              className="btn-secondary flex-1"
              disabled={savingAnalog}
            >
              취소
            </button>
            <button
              onClick={saveAnalog}
              className="btn-primary flex-1"
              disabled={savingAnalog}
            >
              {savingAnalog ? '저장 중…' : '저장하고 합산'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-elder-sm text-gray-500">참여 코드 {room.room_code} · {room.topic}</p>
          <h1 className="text-elder-3xl font-bold text-blue-900">{ballot.title}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setAnalogMode(true)} className="btn-secondary">
            📋 종이 카운트 입력
          </button>
          <button onClick={() => setMinutesMode(true)} className="btn-secondary">
            📝 회의록 PDF
          </button>
          {!room.is_closed && (
            <button onClick={closeVoting} disabled={closing} className="btn-danger">
              {closing ? '마감 중…' : '🛑 투표 마감'}
            </button>
          )}
        </div>
      </div>

      {/* 합계 */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="📱 폰 투표" value={sumDigital} color="blue" />
        <Stat label="📋 종이 투표" value={sumAnalog} color="orange" />
        <Stat label="합계" value={sumDigital + sumAnalog} color="black" />
      </div>

      {/* 막대그래프 */}
      <div className="space-y-4">
        {results.length === 0 ? (
          <p className="text-elder-base text-gray-500 text-center py-12">
            아직 투표가 없습니다
          </p>
        ) : (
          results.map((r, rank) => {
            const originalIdx = options.findIndex((o) => o.id === r.option_id)
            const c = colorFor(originalIdx >= 0 ? originalIdx : rank)
            const widthDigital = (r.digital / maxTotal) * 100
            const widthAnalog = (r.analog / maxTotal) * 100
            const isTop = rank === 0 && r.total > 0
            return (
              <div
                key={r.option_id}
                className="rounded-xl p-4 transition-all"
                style={{
                  backgroundColor: isTop ? `${c.bg}15` : 'white',
                  border: `2px solid ${isTop ? `${c.light}66` : '#e5e7eb'}`,
                }}
              >
                <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
                  <h3 className="text-elder-lg font-bold flex items-center gap-2">
                    {isTop && <span className="text-2xl">👑</span>}
                    <span
                      className="rounded-full w-8 h-8 inline-flex items-center justify-center text-white text-elder-sm font-bold"
                      style={{ backgroundColor: c.light }}
                    >
                      {originalIdx + 1}
                    </span>
                    <span className="text-gray-400">{rank + 1}위</span>
                    <span>{r.label}</span>
                  </h3>
                  <p className="text-elder-xl font-bold" style={{ color: c.bg }}>
                    {r.total}
                    <span className="text-elder-sm text-gray-500 font-normal"> 도트</span>
                  </p>
                </div>
                <div className="bg-gray-100 rounded-lg h-12 overflow-hidden flex">
                  <div
                    className="h-full flex items-center px-3 text-white font-bold text-elder-sm transition-all"
                    style={{ width: `${widthDigital}%`, backgroundColor: c.bg }}
                  >
                    {r.digital > 0 && r.digital}
                  </div>
                  <div
                    className="h-full flex items-center px-3 text-white font-bold text-elder-sm transition-all"
                    style={{ width: `${widthAnalog}%`, backgroundColor: c.light }}
                  >
                    {r.analog > 0 && r.analog}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {room.is_closed && (
        <div className="mt-8 bg-gray-100 border-2 border-gray-300 rounded-xl p-4 text-center">
          <p className="text-elder-base font-bold text-gray-700">
            🛑 투표가 마감되었습니다
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-right mt-6">
        실시간 동기화 · 재연결 {reconnects}회
      </p>
    </main>
  )
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'blue' | 'orange' | 'black'
}) {
  const colorMap = {
    blue: 'text-blue-700',
    orange: 'text-orange-600',
    black: 'text-gray-900',
  }
  return (
    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
      <p className="text-elder-sm text-gray-600 mb-1">{label}</p>
      <p className={`text-elder-3xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  )
}
