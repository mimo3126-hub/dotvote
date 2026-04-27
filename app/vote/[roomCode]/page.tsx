'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { colorFor } from '@/lib/utils/option-colors'
import { playPop, speak } from '@/lib/utils/sound'
import type { BallotOption, BallotRow, PendingVote, Room } from '@/lib/types/ballot'

type Phase =
  | 'loading'
  | 'error'
  | 'closed'
  | 'preview'
  | 'confirm'
  | 'voting'
  | 'submitting'
  | 'submitted'

interface PlacedDot {
  x: number
  y: number
  id: number
}

interface Placement {
  optionId: string
  dotId: number
}

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
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [room, setRoom] = useState<Room | null>(null)
  const [ballot, setBallot] = useState<BallotRow | null>(null)
  const [idx, setIdx] = useState(0)
  const [seenAll, setSeenAll] = useState(false)
  const [direction, setDirection] = useState<'L' | 'R'>('R')
  const [myDots, setMyDots] = useState<Record<string, PlacedDot[]>>({})
  const [order, setOrder] = useState<Placement[]>([])
  const [ripples, setRipples] = useState<PlacedDot[]>([])
  const [isOffline, setIsOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // 룸 + 투표안 로드
  useEffect(() => {
    let cancelled = false
    async function init() {
      const supabase = createClient()
      const { data: r, error: rErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single()
      if (cancelled) return
      if (rErr || !r) {
        setErrorMsg('존재하지 않는 참여 코드입니다')
        setPhase('error')
        return
      }
      if (r.is_closed || (r.expires_at && new Date(r.expires_at) < new Date())) {
        setRoom(r)
        setPhase('closed')
        return
      }
      const { data: b, error: bErr } = await supabase
        .from('ballots')
        .select('*')
        .eq('room_id', r.id)
        .single()
      if (cancelled) return
      if (bErr || !b) {
        setErrorMsg('투표안을 찾을 수 없습니다')
        setPhase('error')
        return
      }
      setRoom(r)
      setBallot(b)
      setMyDots(Object.fromEntries((b.options as BallotOption[]).map((o) => [o.id, [] as PlacedDot[]])))
      setPhase('preview')
    }
    init()
    return () => {
      cancelled = true
    }
  }, [roomCode])

  // 모든 항목 봤는지 체크
  useEffect(() => {
    if (ballot && idx === (ballot.options as BallotOption[]).length - 1) setSeenAll(true)
  }, [idx, ballot])

  // 오프라인 추적 + 재연결 시 큐 플러시
  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setIsOffline(!navigator.onLine)
    update()
    setPendingCount(readPending().length)

    async function flush() {
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
      update()
      void flush()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', update)
    }
  }, [])

  // ──── 화면 분기 ────

  if (phase === 'loading') {
    return <FullScreen text="불러오는 중…" />
  }

  if (phase === 'error') {
    return (
      <FullScreen>
        <p className="text-2xl font-bold mb-3">{errorMsg}</p>
        <button onClick={() => router.push('/')} className="darken-btn mt-6">
          처음으로
        </button>
      </FullScreen>
    )
  }

  if (phase === 'closed') {
    return (
      <FullScreen>
        <div className="text-6xl mb-4">🛑</div>
        <p className="text-2xl font-bold mb-3">투표가 마감되었습니다</p>
        <button onClick={() => router.push('/')} className="darken-btn mt-6">
          처음으로
        </button>
      </FullScreen>
    )
  }

  if (phase === 'submitted') {
    return (
      <FullScreen>
        <div className="text-7xl anim-bounce mb-4">🎉</div>
        <p className="text-3xl font-black mb-2">투표 완료!</p>
        <p className="text-lg text-amber-200/70">
          소중한 참여
          <br />
          감사합니다 😊
          {pendingCount > 0 && (
            <>
              <br />
              <span className="text-orange-300 text-sm">
                ({pendingCount}건 미전송 — 인터넷 복구 시 자동 전송)
              </span>
            </>
          )}
        </p>
        <button onClick={() => router.push('/')} className="darken-btn mt-8">
          처음으로
        </button>
      </FullScreen>
    )
  }

  if (!room || !ballot) return null

  const roomId = room.id
  const options = ballot.options as BallotOption[]
  const totalUsed = order.length
  const remaining = ballot.total_dots - totalUsed
  const item = options[idx]
  const color = colorFor(idx)

  function goNext() {
    setDirection('R')
    setIdx((i) => Math.min(i + 1, options.length - 1))
  }
  function goPrev() {
    setDirection('L')
    setIdx((i) => Math.max(0, i - 1))
  }

  function handleTap(e: React.MouseEvent | React.TouchEvent) {
    if (phase !== 'voting' || remaining <= 0) return
    e.preventDefault()
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY
    const xP = Math.max(5, Math.min(95, ((cx - rect.left) / rect.width) * 100))
    const yP = Math.max(5, Math.min(95, ((cy - rect.top) / rect.height) * 100))
    const dotId = Date.now() + Math.random()

    setMyDots((d) => ({ ...d, [item.id]: [...(d[item.id] ?? []), { x: xP, y: yP, id: dotId }] }))
    setOrder((o) => [...o, { optionId: item.id, dotId }])
    setRipples((r) => [...r, { x: xP, y: yP, id: dotId }])
    setTimeout(() => {
      setRipples((r) => r.filter((rr) => rr.id !== dotId))
    }, 700)

    playPop()

    if (remaining - 1 <= 0) {
      // 마지막 도트 → TTS + 자동 제출
      setTimeout(
        () => speak('스티커를 모두 사용하셨습니다. 투표가 완료되었습니다. 감사합니다!'),
        200,
      )
      void submit([...order, { optionId: item.id, dotId }])
    }
  }

  function undoLast() {
    if (order.length === 0) return
    const last = order[order.length - 1]
    setOrder((o) => o.slice(0, -1))
    setMyDots((d) => ({
      ...d,
      [last.optionId]: (d[last.optionId] ?? []).filter((p) => p.id !== last.dotId),
    }))
  }

  async function submit(finalOrder: Placement[]) {
    setPhase('submitting')
    // optionId별 도트 수 집계
    const tally = new Map<string, number>()
    for (const p of finalOrder) {
      tally.set(p.optionId, (tally.get(p.optionId) ?? 0) + 1)
    }
    const rows: PendingVote[] = Array.from(tally.entries())
      .filter(([, dots]) => dots > 0)
      .map(([option_id, dots]) => ({
        room_id: roomId,
        option_id,
        dots,
        channel: 'digital',
      }))

    const supabase = createClient()
    const { error } = await supabase.from('votes').insert(rows)
    if (error) {
      const merged = [...readPending(), ...rows]
      writePending(merged)
      setPendingCount(merged.length)
    }
    setTimeout(() => setPhase('submitted'), 1200)
  }

  const placed = myDots[item.id] ?? []
  const isLastSlide = idx === options.length - 1

  // ──── PREVIEW ────
  if (phase === 'preview') {
    return (
      <DarkShell>
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={() => router.push('/')} className="text-amber-300 text-xl px-2">
            ←
          </button>
          <div className="text-center">
            <p className="text-xs text-amber-200/60 font-bold">📖 미리보기</p>
            <p className="text-base font-bold text-amber-100">{ballot.title}</p>
          </div>
          <span className="text-amber-200/60 text-base font-bold">
            {idx + 1}/{options.length}
          </span>
        </header>

        <Progress total={options.length} current={idx} />

        <div className="flex-1 flex p-4">
          <div
            key={idx}
            className={`flex-1 flex items-center justify-center rounded-3xl p-8 relative overflow-hidden touch-card ${
              direction === 'R' ? 'anim-slide-r' : 'anim-slide-l'
            }`}
            style={{ backgroundColor: color.bg, boxShadow: `0 16px 40px ${color.bg}66`, minHeight: 240 }}
          >
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
            <div className="text-center relative z-10">
              <div className="text-5xl font-black text-white mb-2">{idx + 1}</div>
              <p
                className="font-black text-white leading-snug break-keep"
                style={{ fontSize: 'clamp(24px, 7vw, 34px)', textShadow: '0 2px 8px rgba(0,0,0,.35)' }}
              >
                {item.label}
              </p>
              {item.description && (
                <p className="text-white/80 text-base mt-3" style={{ textShadow: '0 1px 4px rgba(0,0,0,.3)' }}>
                  {item.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 flex gap-3">
          {idx > 0 && (
            <button onClick={goPrev} className="dark-secondary flex-1">
              ← 이전
            </button>
          )}
          {!isLastSlide ? (
            <button onClick={goNext} className="dark-primary flex-[2]">
              다음 →
            </button>
          ) : (
            <button
              onClick={() => setPhase('confirm')}
              className="flex-[2] py-4 rounded-2xl font-black text-xl text-white anim-heartbeat"
              style={{ backgroundColor: color.bg, boxShadow: `0 8px 24px ${color.bg}66` }}
            >
              ✅ 다 봐어요!
            </button>
          )}
        </div>
        {seenAll && !isLastSlide && (
          <button
            onClick={() => setPhase('confirm')}
            className="mx-4 mb-4 py-3 rounded-xl bg-white/5 border border-white/10 text-amber-300 font-bold"
          >
            ✅ 이제 투표할게요!
          </button>
        )}
      </DarkShell>
    )
  }

  // ──── CONFIRM ────
  if (phase === 'confirm') {
    return (
      <DarkShell>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center anim-fade-up gap-6">
          <div className="text-6xl anim-bounce">🤔</div>
          <h2 className="font-black text-amber-100" style={{ fontSize: 'clamp(28px, 8vw, 40px)' }}>
            투표하시겠습니까?
          </h2>
          <div className="bg-white/5 rounded-2xl px-6 py-5 max-w-xs">
            <p className="text-amber-200/80 text-lg leading-loose">
              🔴 빨간 스티커{' '}
              <strong className="text-white text-2xl">{ballot.total_dots}</strong>
              개를
              <br />
              원하는 항목에
              <br />
              <strong className="text-amber-300">터치</strong>해서 붙여주세요!
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => {
                setDirection('L')
                setIdx(0)
                setPhase('preview')
              }}
              className="dark-secondary"
            >
              다시 보기
            </button>
            <button
              onClick={() => {
                setIdx(0)
                setPhase('voting')
              }}
              className="px-8 py-4 rounded-2xl bg-red-700 text-white text-xl font-black anim-heartbeat"
              style={{ boxShadow: '0 10px 28px rgba(192,57,43,.5)' }}
            >
              🗳️ 투표 시작!
            </button>
          </div>
        </div>
      </DarkShell>
    )
  }

  // ──── VOTING ────
  return (
    <DarkShell>
      <header className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-amber-200/40 text-sm font-bold w-12">
          {idx + 1}/{options.length}
        </span>
        <div className="text-center">
          <div className="flex gap-1 justify-center mb-1">
            {Array.from({ length: ballot.total_dots }).map((_, i) => {
              const isAvail = i < remaining
              return (
                <div
                  key={i}
                  className="rounded-full transition-all self-center"
                  style={{
                    width: isAvail ? 20 : 11,
                    height: isAvail ? 20 : 11,
                    backgroundColor: isAvail ? '#E74C3C' : 'rgba(255,255,255,.12)',
                    boxShadow: isAvail ? '0 2px 6px rgba(192,57,43,.6)' : 'none',
                  }}
                />
              )
            })}
          </div>
          <p
            className="text-sm font-bold"
            style={{ color: remaining > 0 ? '#E74C3C' : '#5D5248' }}
          >
            {remaining > 0 ? `남은 스티커 ${remaining}개` : '완료! ✅'}
          </p>
        </div>
        <div className="w-12 flex justify-end">
          {isOffline && (
            <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full font-bold">
              오프
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 flex p-3">
        <div
          ref={cardRef}
          onMouseDown={handleTap}
          onTouchStart={handleTap}
          className={`touch-card flex-1 flex flex-col items-center justify-center rounded-3xl ${
            direction === 'R' ? 'anim-slide-r' : 'anim-slide-l'
          }`}
          style={{
            backgroundColor: color.bg,
            boxShadow: `0 16px 44px ${color.bg}55`,
            minHeight: 260,
            cursor: 'pointer',
          }}
        >
          <div className="absolute -top-7 -right-7 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
          <div className="text-center px-6 pointer-events-none z-10 relative">
            <div className="text-5xl font-black text-white mb-1">{idx + 1}</div>
            <p
              className="font-black text-white leading-snug break-keep"
              style={{ fontSize: 'clamp(22px, 7vw, 33px)', textShadow: '0 2px 8px rgba(0,0,0,.4)' }}
            >
              {item.label}
            </p>
          </div>

          {placed.length === 0 && remaining > 0 && (
            <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none z-10">
              <p className="text-white/75 text-lg font-bold anim-bounce">👆 여기를 터치!</p>
            </div>
          )}

          {placed.map((dot) => (
            <div
              key={dot.id}
              className="absolute pointer-events-none z-20"
              style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
            >
              <div
                className="rounded-full anim-dot-pop"
                style={{
                  width: 46,
                  height: 46,
                  background: 'radial-gradient(circle at 32% 30%, #FF7675, #C0392B)',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 4px 14px rgba(192,57,43,.8)',
                  border: '2.5px solid rgba(255,255,255,.4)',
                }}
              />
            </div>
          ))}
          {ripples.map((r) => (
            <div
              key={r.id}
              className="absolute pointer-events-none z-10"
              style={{ left: `${r.x}%`, top: `${r.y}%` }}
            >
              <div
                className="rounded-full anim-ripple"
                style={{
                  width: 68,
                  height: 68,
                  border: '3px solid rgba(255,100,100,.6)',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="px-3 pb-3 flex gap-2">
        {idx > 0 && (
          <button
            onClick={goPrev}
            className="dark-secondary flex-1"
            disabled={remaining === 0}
          >
            ← 이전
          </button>
        )}
        {idx < options.length - 1 && (
          <button
            onClick={goNext}
            className="dark-secondary flex-1"
            disabled={remaining === 0}
          >
            다음 →
          </button>
        )}
        {order.length > 0 && remaining > 0 && (
          <button onClick={undoLast} className="dark-secondary flex-1">
            ↶ 마지막 빼기
          </button>
        )}
        {remaining === 0 && phase === 'voting' && (
          <div className="flex-1 py-3 text-center text-amber-200/60 text-base">
            제출 중… ✅
          </div>
        )}
      </div>
    </DarkShell>
  )
}

// ──── 공통 컴포넌트 ────

function DarkShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen flex flex-col text-amber-50 mx-auto"
      style={{
        backgroundColor: '#1E1A14',
        maxWidth: 480,
        fontFamily: '"Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", sans-serif',
      }}
    >
      {children}
      <DarkStyles />
    </main>
  )
}

function DarkStyles() {
  return (
    <style jsx global>{`
      .dark-primary {
        background: white;
        color: #1a1a1a;
        padding: 16px;
        border-radius: 16px;
        font-size: 19px;
        font-weight: 700;
      }
      .dark-primary:disabled { opacity: 0.5; }
      .dark-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: white;
        padding: 14px;
        border-radius: 16px;
        font-size: 17px;
        font-weight: 700;
      }
      .dark-secondary:disabled { opacity: 0.4; }
      .darken-btn {
        background: rgba(255, 255, 255, 0.07);
        color: #e59866;
        padding: 13px 22px;
        border-radius: 16px;
        font-size: 17px;
        font-weight: 700;
      }
    `}</style>
  )
}

function Progress({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex justify-center gap-1.5 px-4 mb-2">
      {Array.from({ length: total }).map((_, i) => {
        const c = colorFor(i)
        return (
          <div
            key={i}
            className="h-2 rounded-full transition-all"
            style={{
              width: i === current ? 24 : 7,
              backgroundColor: i <= current ? c.light : 'rgba(255,255,255,.12)',
            }}
          />
        )
      })}
    </div>
  )
}

function FullScreen({ text, children }: { text?: string; children?: React.ReactNode }) {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center text-amber-50 px-6 text-center"
      style={{ backgroundColor: '#1E1A14' }}
    >
      {text && <p className="text-xl">{text}</p>}
      {children}
      <DarkStyles />
    </main>
  )
}
