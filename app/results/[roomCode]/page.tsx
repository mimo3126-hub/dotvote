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
      <DarkMain>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-base text-amber-100">불러오는 중…</p>
        </div>
      </DarkMain>
    )
  }
  if (load.status === 'error') {
    return (
      <DarkMain>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-6">
          <p className="text-xl font-bold text-amber-100">{load.message}</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-2xl font-bold"
            style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#E59866' }}
          >
            처음으로
          </Link>
        </div>
      </DarkMain>
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
      <DarkMain>
        <div className="p-4 pb-28">
          <h1 className="text-xl font-black text-amber-100 mb-2">📝 회의록 PDF 만들기</h1>
          <p className="text-xs mb-5" style={{ color: '#8D7B68' }}>
            주제 · 날짜 · 투표 결과는 자동으로 채워집니다. 비워두면 "(기록 없음)" 표시.
          </p>

          <div className="space-y-4">
            <DarkField label="참여자 수 (선택)">
              <input
                type="text"
                value={minutesAttendees}
                onChange={(e) => setMinutesAttendees(e.target.value)}
                placeholder="예: 12명 (어르신 8 + 진행자 2 + 청년 2)"
                maxLength={80}
                className="w-full px-3 py-2.5 rounded-lg outline-none text-base"
                style={darkInputStyle()}
              />
            </DarkField>

            <DarkField label="토론 내용 (자유 메모)">
              <textarea
                value={minutesNotes}
                onChange={(e) => setMinutesNotes(e.target.value)}
                placeholder="예: 1순위 항목에 대해 이장님께서 예산 확보 가능성을 언급. 2순위는 마을 청년회가 자원봉사로 진행 가능하다는 의견."
                rows={6}
                maxLength={3000}
                className="w-full px-3 py-2.5 rounded-lg outline-none text-sm resize-y"
                style={darkInputStyle()}
              />
            </DarkField>

            <DarkField label="다음 단계 / 합의 사항">
              <textarea
                value={minutesNextSteps}
                onChange={(e) => setMinutesNextSteps(e.target.value)}
                placeholder={
                  '예:\n· 다음 회의: 2026년 5월 10일 (화) 오후 2시\n· 1순위 안건은 군청에 5월 5일까지 제출'
                }
                rows={5}
                maxLength={2000}
                className="w-full px-3 py-2.5 rounded-lg outline-none text-sm resize-y"
                style={darkInputStyle()}
              />
            </DarkField>
          </div>
        </div>

        <DarkBottomBar>
          <button
            onClick={() => setMinutesMode(false)}
            disabled={downloadingMinutes}
            className="flex-1 py-3 rounded-xl font-bold"
            style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#F5CBA7' }}
          >
            뒤로
          </button>
          <button
            onClick={downloadMinutes}
            disabled={downloadingMinutes}
            className="flex-1 py-3 rounded-xl text-white font-bold"
            style={{ backgroundColor: '#D35400' }}
          >
            {downloadingMinutes ? '생성 중…' : '📄 PDF 다운로드'}
          </button>
        </DarkBottomBar>
      </DarkMain>
    )
  }

  if (analogMode) {
    return (
      <DarkMain>
        <div className="p-4 pb-28">
          <h1 className="text-xl font-black text-amber-100 mb-2">📋 종이 시트 카운트</h1>
          <p className="text-xs mb-5" style={{ color: '#8D7B68' }}>
            종이에 붙은 스티커 수를 옵션별로 입력하세요. 저장하면 디지털 투표와 합산됩니다.
          </p>

          <div className="space-y-2.5">
            {options.map((opt, i) => {
              const c = colorFor(i)
              return (
                <div
                  key={opt.id}
                  className="rounded-2xl p-3"
                  style={{
                    backgroundColor: 'rgba(255,255,255,.04)',
                    border: '1.5px solid rgba(255,255,255,.06)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 text-white"
                      style={{ backgroundColor: c.light }}
                    >
                      {i + 1}
                    </div>
                    <h3 className="text-base font-bold text-amber-50">{opt.label}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setAnalogDraft((prev) => ({
                          ...prev,
                          [opt.id]: Math.max(0, (prev[opt.id] ?? 0) - 1),
                        }))
                      }
                      className="w-12 h-12 rounded-full text-2xl text-white font-black"
                      style={{ backgroundColor: 'rgba(255,255,255,.08)' }}
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
                      className="flex-1 text-center text-2xl font-black rounded-xl py-2 outline-none"
                      style={darkInputStyle()}
                    />
                    <button
                      onClick={() =>
                        setAnalogDraft((prev) => ({
                          ...prev,
                          [opt.id]: (prev[opt.id] ?? 0) + 1,
                        }))
                      }
                      className="w-12 h-12 rounded-full text-2xl text-white font-black"
                      style={{ backgroundColor: c.light }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <DarkBottomBar>
          <button
            onClick={() => setAnalogMode(false)}
            disabled={savingAnalog}
            className="flex-1 py-3 rounded-xl font-bold"
            style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#F5CBA7' }}
          >
            취소
          </button>
          <button
            onClick={saveAnalog}
            disabled={savingAnalog}
            className="flex-1 py-3 rounded-xl text-white font-bold"
            style={{ backgroundColor: '#D35400' }}
          >
            {savingAnalog ? '저장 중…' : '저장하고 합산'}
          </button>
        </DarkBottomBar>
      </DarkMain>
    )
  }

  return (
    <main
      className="min-h-screen mx-auto"
      style={{
        backgroundColor: '#1E1A14',
        color: '#F0EBE3',
        maxWidth: 480,
        fontFamily: '"Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", sans-serif',
      }}
    >
      <div className="p-4">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-2 h-2 rounded-full anim-glow"
                style={{ backgroundColor: room.is_closed ? '#7B241C' : '#2ECC71' }}
              />
              <span
                className="text-xs font-bold"
                style={{ color: room.is_closed ? '#7B241C' : '#2ECC71' }}
              >
                {room.is_closed ? '마감됨' : '총 집계 중'}
              </span>
              <span className="text-xs ml-2" style={{ color: '#5D5248' }}>
                {room.room_code}
              </span>
            </div>
            <h2 className="text-lg font-black text-amber-100 truncate">{ballot.title}</h2>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <CounterBox label="참여" value={Math.max(sumDigital, sumAnalog)} color="#74b9ff" hint />
            <CounterBox label="스티커" value={sumDigital + sumAnalog} color="#fd79a8" />
          </div>
        </div>

        {/* 채널 합계 */}
        <div className="flex gap-2 mb-4 text-xs">
          <span className="px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(116,185,255,.15)', color: '#74b9ff' }}>
            📱 폰 {sumDigital}
          </span>
          <span className="px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(230,126,34,.15)', color: '#E67E22' }}>
            📋 종이 {sumAnalog}
          </span>
        </div>

        {/* 항목별 결과 */}
        <div className="space-y-2.5 mb-4">
          {results.length === 0 ? (
            <p className="text-base text-center py-12" style={{ color: '#5D5248' }}>
              아직 투표가 없습니다
            </p>
          ) : (
            results.map((r, rank) => {
              const originalIdx = options.findIndex((o) => o.id === r.option_id)
              const c = colorFor(originalIdx >= 0 ? originalIdx : rank)
              const pct = maxTotal > 0 ? (r.total / maxTotal) * 100 : 0
              const isTop = rank === 0 && r.total > 0
              return (
                <div
                  key={r.option_id}
                  className="rounded-2xl p-3.5 transition-all"
                  style={{
                    backgroundColor: isTop ? `${c.bg}33` : 'rgba(255,255,255,.04)',
                    border: `1.5px solid ${isTop ? `${c.light}55` : 'rgba(255,255,255,.06)'}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isTop && <span className="text-lg">👑</span>}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 text-white"
                        style={{ backgroundColor: c.light }}
                      >
                        {originalIdx + 1}
                      </div>
                      <span className="text-base font-bold text-amber-50 truncate">{r.label}</span>
                    </div>
                    <span className="text-2xl font-black flex-shrink-0" style={{ color: c.light }}>
                      {r.total}
                    </span>
                  </div>

                  <div
                    className="h-2 rounded-full mb-2 overflow-hidden"
                    style={{ backgroundColor: 'rgba(255,255,255,.07)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: c.light }}
                    />
                  </div>

                  {/* 스티커 도트 그리드 (프로토타입 시그니처) */}
                  {r.total > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Array.from({ length: r.digital }).map((_, i) => (
                        <div
                          key={`d${i}`}
                          className="w-3.5 h-3.5 rounded-full"
                          style={{
                            backgroundColor: '#E74C3C',
                            boxShadow: '0 2px 5px rgba(192,57,43,.6)',
                          }}
                        />
                      ))}
                      {Array.from({ length: r.analog }).map((_, i) => (
                        <div
                          key={`a${i}`}
                          className="w-3.5 h-3.5 rounded-full"
                          style={{
                            backgroundColor: '#E67E22',
                            boxShadow: '0 2px 5px rgba(160,64,0,.6)',
                          }}
                          title="종이 스티커"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* 진행자 액션 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setAnalogMode(true)}
            className="py-3 rounded-xl text-sm font-bold"
            style={{ backgroundColor: 'rgba(255,255,255,.07)', color: '#E59866' }}
          >
            📋 종이 카운트
          </button>
          <button
            onClick={() => setMinutesMode(true)}
            className="py-3 rounded-xl text-sm font-bold"
            style={{ backgroundColor: 'rgba(255,255,255,.07)', color: '#E59866' }}
          >
            📝 회의록 PDF
          </button>
        </div>

        {!room.is_closed && (
          <button
            onClick={closeVoting}
            disabled={closing}
            className="w-full py-3 rounded-xl text-sm font-bold text-white"
            style={{ backgroundColor: '#7B241C' }}
          >
            {closing ? '마감 중…' : '🛑 투표 마감'}
          </button>
        )}

        {room.is_closed && (
          <div
            className="rounded-xl p-3 text-center"
            style={{ backgroundColor: 'rgba(123,36,28,.2)', border: '1px solid rgba(123,36,28,.4)' }}
          >
            <p className="text-base font-bold" style={{ color: '#E74C3C' }}>
              🛑 투표가 마감되었습니다
            </p>
          </div>
        )}

        <p className="text-xs text-right mt-4" style={{ color: '#5D5248' }}>
          실시간 동기화 · 재연결 {reconnects}회
        </p>
      </div>
    </main>
  )
}

function CounterBox({
  label,
  value,
  color,
  hint,
}: {
  label: string
  value: number
  color: string
  hint?: boolean
}) {
  return (
    <div
      className="text-center rounded-xl px-3 py-2"
      style={{ backgroundColor: 'rgba(255,255,255,.06)' }}
      title={hint ? '대략값 (max(폰, 종이))' : undefined}
    >
      <div className="text-xl font-black" style={{ color }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: '#6B5B48' }}>
        {label}
      </div>
    </div>
  )
}

function DarkMain({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen flex flex-col mx-auto"
      style={{
        backgroundColor: '#1E1A14',
        color: '#F0EBE3',
        maxWidth: 480,
        fontFamily: '"Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", sans-serif',
      }}
    >
      {children}
    </main>
  )
}

function DarkField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-bold mb-2" style={{ color: '#A0896E' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function DarkBottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-0 inset-x-0 mx-auto p-3 flex gap-2"
      style={{
        backgroundColor: '#1E1A14',
        borderTop: '1px solid rgba(255,255,255,.08)',
        maxWidth: 480,
      }}
    >
      {children}
    </div>
  )
}

function darkInputStyle(): React.CSSProperties {
  return {
    backgroundColor: 'rgba(255,255,255,.08)',
    border: '1.5px solid rgba(255,255,255,.15)',
    color: 'white',
  }
}
