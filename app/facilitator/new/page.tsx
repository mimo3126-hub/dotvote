'use client'

import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import Link from 'next/link'
import type { Ballot, BallotOption } from '@/lib/types/ballot'

type Step = 'topic' | 'generating' | 'preview' | 'manual' | 'created'

export default function NewWorkshopPage() {
  const [step, setStep] = useState<Step>('topic')
  const [topic, setTopic] = useState('')
  const [ballot, setBallot] = useState<Ballot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (topic.trim().length < 3) return
    setError(null)
    setStep('generating')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '알 수 없는 오류')
        setStep('manual')
        return
      }
      setBallot(data.ballot)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 호출 실패')
      setStep('manual')
    }
  }

  async function handleCreateRoom() {
    if (!ballot) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, ballot }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        setCreating(false)
        return
      }
      setRoomCode(data.room_code)
      setStep('created')
    } catch (err) {
      setError(err instanceof Error ? err.message : '룸 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  if (step === 'topic') {
    return (
      <main className="min-h-screen p-6 max-w-2xl mx-auto">
        <Link href="/" className="text-blue-700 text-elder-sm">← 처음으로</Link>
        <h1 className="text-elder-2xl font-bold text-blue-900 mt-4 mb-2">새 워크숍 만들기</h1>
        <p className="text-elder-sm text-gray-600 mb-8">
          주제를 한 줄로 적으면 AI가 투표 질문과 선택지를 만들어드립니다.
        </p>

        <form onSubmit={handleGenerate} className="space-y-6">
          <div>
            <label htmlFor="topic" className="block text-elder-base font-bold mb-2">
              워크숍 주제
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 마을 진입로 정비 우선순위"
              className="input-large"
              maxLength={200}
              required
            />
            <p className="text-elder-sm text-gray-500 mt-2">3–200자</p>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={topic.trim().length < 3}>
            AI로 투표안 만들기
          </button>
        </form>
      </main>
    )
  }

  if (step === 'generating') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="inline-block w-16 h-16 border-4 border-blue-200 border-t-blue-900 rounded-full animate-spin" />
          <p className="text-elder-lg font-bold">AI가 투표안을 만들고 있어요…</p>
          <p className="text-elder-sm text-gray-500">최대 15초 소요</p>
        </div>
      </main>
    )
  }

  if (step === 'manual') {
    return (
      <ManualBallotEditor
        topic={topic}
        initialError={error}
        onSubmit={(b) => {
          setBallot(b)
          setStep('preview')
        }}
        onCancel={() => setStep('topic')}
      />
    )
  }

  if (step === 'preview' && ballot) {
    return (
      <main className="min-h-screen p-6 max-w-3xl mx-auto pb-24">
        <button
          onClick={() => setStep('topic')}
          className="text-blue-700 text-elder-sm mb-4"
        >
          ← 다시 만들기
        </button>
        <h1 className="text-elder-2xl font-bold mb-2">{ballot.title}</h1>
        {ballot.description && (
          <p className="text-elder-base text-gray-700 mb-6">{ballot.description}</p>
        )}

        <div className="space-y-3 mb-8">
          {ballot.options.map((opt, idx) => (
            <div key={opt.id} className="border-2 border-gray-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="bg-blue-900 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <h3 className="text-elder-base font-bold">{opt.label}</h3>
                  {opt.description && (
                    <p className="text-elder-sm text-gray-600 mt-1">{opt.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 rounded-xl p-4 mb-6">
          <p className="text-elder-base">
            1인당 도트 <strong>{ballot.total_dots}개</strong>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('manual')}
            className="btn-secondary flex-1"
          >
            수정하기
          </button>
          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={creating}
            className="btn-primary flex-1"
          >
            {creating ? '만드는 중…' : '워크숍 시작'}
          </button>
        </div>
      </main>
    )
  }

  if (step === 'created' && roomCode) {
    const baseUrl =
      typeof window !== 'undefined' ? window.location.origin : ''
    const voteUrl = `${baseUrl}/vote/${roomCode}`
    const resultsUrl = `/results/${roomCode}`
    const sheetsUrl = `/sheets/${roomCode}`

    return (
      <main className="min-h-screen p-6 max-w-2xl mx-auto">
        <h1 className="text-elder-2xl font-bold text-blue-900 mb-6">워크숍이 시작되었습니다</h1>

        <div className="bg-blue-900 text-white rounded-2xl p-8 text-center mb-6">
          <p className="text-elder-base opacity-80 mb-2">참여 코드</p>
          <p className="text-[80px] font-bold tracking-[0.3em] leading-none">{roomCode}</p>
        </div>

        <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 mb-6 flex flex-col items-center">
          <p className="text-elder-sm text-gray-600 mb-3">QR 또는 주소</p>
          <QRCodeCanvas value={voteUrl} size={200} />
          <p className="text-elder-sm mt-3 break-all text-center">{voteUrl}</p>
        </div>

        <div className="space-y-3">
          <Link href={resultsUrl} className="btn-primary block text-center">
            📊 결과 화면 열기 (빔프로젝터용)
          </Link>
          <a
            href={sheetsUrl}
            target="_blank"
            rel="noopener"
            className="btn-secondary block text-center"
          >
            🖨 인쇄 시트 다운로드 (PDF)
          </a>
          <Link href={`/vote/${roomCode}`} className="btn-secondary block text-center">
            📱 투표 화면 미리보기
          </Link>
        </div>
      </main>
    )
  }

  return null
}

function ManualBallotEditor({
  topic,
  initialError,
  onSubmit,
  onCancel,
}: {
  topic: string
  initialError: string | null
  onSubmit: (b: Ballot) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState<BallotOption[]>([
    { id: 'opt1', label: '', description: '' },
    { id: 'opt2', label: '', description: '' },
    { id: 'opt3', label: '', description: '' },
  ])
  const [totalDots, setTotalDots] = useState(5)

  function updateOption(idx: number, patch: Partial<BallotOption>) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)))
  }

  function addOption() {
    if (options.length >= 9) return
    setOptions((prev) => [...prev, { id: `opt${prev.length + 1}`, label: '', description: '' }])
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = options.filter((o) => o.label.trim().length > 0)
    if (!title.trim() || valid.length < 2) return
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      options: valid.map((o, i) => ({
        id: `opt${i + 1}`,
        label: o.label.trim(),
        description: o.description?.trim() || undefined,
      })),
      total_dots: totalDots,
    })
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto pb-24">
      <button onClick={onCancel} className="text-blue-700 text-elder-sm mb-4">
        ← 돌아가기
      </button>
      <h1 className="text-elder-2xl font-bold mb-2">투표안 직접 입력</h1>
      <p className="text-elder-sm text-gray-600 mb-2">주제: {topic}</p>

      {initialError && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-6">
          <p className="text-orange-800">⚠ AI 생성 실패: {initialError}</p>
          <p className="text-elder-sm text-orange-700 mt-1">직접 작성해주세요.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-elder-base font-bold mb-2">투표 질문</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-large"
            placeholder="예: 마을 진입로에서 가장 시급한 정비는?"
            required
          />
        </div>

        <div>
          <label className="block text-elder-base font-bold mb-2">
            보충 설명 <span className="text-elder-sm font-normal text-gray-500">(선택)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-large"
            rows={2}
          />
        </div>

        <div>
          <label className="block text-elder-base font-bold mb-2">선택지 (2–9개)</label>
          <div className="space-y-3">
            {options.map((opt, idx) => (
              <div key={idx} className="border-2 border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-blue-900 text-white rounded-full w-7 h-7 flex items-center justify-center text-elder-sm font-bold">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOption(idx, { label: e.target.value })}
                    placeholder="선택지 이름"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-elder-base"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="text-red-600 px-2 py-1"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={opt.description ?? ''}
                  onChange={(e) => updateOption(idx, { description: e.target.value })}
                  placeholder="한 줄 설명 (선택)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-elder-sm"
                />
              </div>
            ))}
          </div>
          {options.length < 9 && (
            <button
              type="button"
              onClick={addOption}
              className="mt-3 text-blue-700 font-bold text-elder-sm"
            >
              + 선택지 추가
            </button>
          )}
        </div>

        <div>
          <label className="block text-elder-base font-bold mb-2">1인당 도트 수</label>
          <input
            type="number"
            min={1}
            max={10}
            value={totalDots}
            onChange={(e) => setTotalDots(Number(e.target.value) || 5)}
            className="input-large w-32"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          확인 →
        </button>
      </form>
    </main>
  )
}
