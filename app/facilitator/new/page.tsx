'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeCanvas } from 'qrcode.react'
import Link from 'next/link'
import { colorFor } from '@/lib/utils/option-colors'
import type { Ballot } from '@/lib/types/ballot'

type Phase = 'setup' | 'creating' | 'created'

interface ItemDraft {
  label: string
  description: string
}

const INITIAL_ITEMS: ItemDraft[] = [
  { label: '', description: '' },
  { label: '', description: '' },
  { label: '', description: '' },
]

/** 사진을 1200px 너비 이내로 축소 + JPEG 0.85 압축 → base64 반환 */
async function compressImage(file: File): Promise<{ base64: string; mediaType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('이미지 디코딩 실패'))
    i.src = dataUrl
  })
  const maxDim = 1200
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height))
  const w = Math.round(img.width * ratio)
  const h = Math.round(img.height * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 미지원')
  ctx.drawImage(img, 0, 0, w, h)
  const compressed = canvas.toDataURL('image/jpeg', 0.85)
  return {
    base64: compressed.split(',')[1] ?? '',
    mediaType: 'image/jpeg',
  }
}

export default function FacilitatorNewPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('setup')
  const [topic, setTopic] = useState('')
  const [items, setItems] = useState<ItemDraft[]>(INITIAL_ITEMS)
  const [dots, setDots] = useState(5)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [createError, setCreateError] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  function patchItem(i: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  function addItem() {
    if (items.length >= 9) return
    setItems((prev) => [...prev, { label: '', description: '' }])
  }

  function removeItem(i: number) {
    if (items.length <= 2) return
    setItems((prev) => prev.filter((_, j) => j !== i))
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 가능하게
    if (!file) return
    setPhotoError('')
    setPhotoLoading(true)
    try {
      const { base64, mediaType } = await compressImage(file)
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPhotoError(data.error ?? '추출 실패 — 직접 입력하세요')
        return
      }
      const extracted: { title?: string; items: { label: string; description?: string }[] } = data
      if (extracted.title && !topic.trim()) {
        setTopic(extracted.title)
      }
      setItems(
        extracted.items.map((it) => ({
          label: it.label,
          description: it.description ?? '',
        })),
      )
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : '추출 실패')
    } finally {
      setPhotoLoading(false)
    }
  }

  async function startSession() {
    const valid = items
      .map((it) => ({ label: it.label.trim(), description: it.description.trim() }))
      .filter((it) => it.label.length > 0)

    if (!topic.trim()) {
      setCreateError('투표 주제를 입력하세요')
      return
    }
    if (valid.length < 2) {
      setCreateError('항목을 2개 이상 입력하세요')
      return
    }

    setCreateError('')
    setPhase('creating')

    const ballot: Ballot = {
      title: topic.trim(),
      options: valid.map((o, i) => ({
        id: `opt${i + 1}`,
        label: o.label,
        description: o.description || undefined,
      })),
      total_dots: dots,
    }

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), ballot }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error ?? '룸 생성 실패')
        setPhase('setup')
        return
      }
      setRoomCode(data.room_code)
      setPhase('created')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '룸 생성 실패')
      setPhase('setup')
    }
  }

  // ──── CREATING ────
  if (phase === 'creating') {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
          <div className="w-16 h-16 rounded-full border-4 border-amber-200/20 border-t-amber-200 animate-spin" />
          <p className="text-lg font-bold text-amber-100">워크숍 만드는 중…</p>
        </div>
      </Shell>
    )
  }

  // ──── CREATED ────
  if (phase === 'created') {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const voteUrl = `${baseUrl}/vote/${roomCode}`
    return (
      <Shell>
        <div className="p-5 anim-fade-up">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-3xl anim-bounce" aria-hidden>
              🎉
            </span>
            <h1 className="text-xl font-black text-amber-100">워크숍 시작!</h1>
          </div>

          <div
            className="rounded-3xl p-6 text-center mb-5"
            style={{ backgroundColor: '#C0392B', boxShadow: '0 12px 32px rgba(192,57,43,.45)' }}
          >
            <p className="text-white/70 text-base mb-2">참여 코드</p>
            <p
              className="text-white font-black leading-none"
              style={{ fontSize: 76, letterSpacing: 10 }}
            >
              {roomCode}
            </p>
          </div>

          <div
            className="rounded-2xl p-5 mb-5 flex flex-col items-center"
            style={{ backgroundColor: 'rgba(255,255,255,.06)' }}
          >
            <p className="text-amber-200/60 text-sm mb-3">QR 또는 주소</p>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeCanvas value={voteUrl} size={180} />
            </div>
            <p className="text-amber-200/80 text-sm mt-3 break-all text-center">{voteUrl}</p>
          </div>

          <div className="space-y-3">
            <Link
              href={`/results/${roomCode}`}
              className="block w-full py-4 rounded-2xl text-white text-lg font-bold text-center"
              style={{ backgroundColor: '#1A5276' }}
            >
              📊 결과 화면 (빔프로젝터용)
            </Link>
            <a
              href={`/sheets/${roomCode}`}
              target="_blank"
              rel="noopener"
              className="block w-full py-4 rounded-2xl text-lg font-bold text-center"
              style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#F5CBA7' }}
            >
              🖨 인쇄 시트 PDF
            </a>
            <Link
              href={`/vote/${roomCode}`}
              className="block w-full py-4 rounded-2xl text-lg font-bold text-center"
              style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#F5CBA7' }}
            >
              📱 투표 화면 미리보기
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  // ──── SETUP ────
  return (
    <Shell>
      <div className="p-5 pb-8">
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => router.push('/')}
            className="text-2xl px-2 py-1"
            style={{ color: '#E59866' }}
            aria-label="처음으로"
          >
            ←
          </button>
          <h2 className="text-xl font-black text-amber-100">📋 세션 설정</h2>
        </div>

        {/* 주제 */}
        <Label icon="📌">투표 주제</Label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 마을 행사 장소 선정"
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl mb-5 outline-none text-base"
          style={inputStyle()}
        />

        {/* 도트 개수 */}
        <Label icon="🔴">1인당 스티커 개수</Label>
        <div className="flex items-center gap-4 mb-5">
          <RoundBtn onClick={() => setDots((d) => Math.max(1, d - 1))} aria-label="줄이기">
            −
          </RoundBtn>
          <span
            className="text-4xl font-black text-amber-100"
            style={{ minWidth: 56, textAlign: 'center' }}
          >
            {dots}
          </span>
          <RoundBtn onClick={() => setDots((d) => Math.min(10, d + 1))} aria-label="늘리기">
            +
          </RoundBtn>
          <span className="text-base" style={{ color: '#8D7B68' }}>
            개
          </span>
        </div>

        {/* 항목 + 사진 OCR 도우미 */}
        <div className="flex items-center justify-between mb-2">
          <Label icon="📝">투표 항목</Label>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoLoading}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#A04000', color: 'white' }}
          >
            {photoLoading ? '📷 분석 중…' : '📷 사진으로 채우기'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            className="hidden"
          />
        </div>
        {photoError && (
          <p className="text-xs mb-2" style={{ color: '#E74C3C' }}>
            {photoError}
          </p>
        )}
        <p className="text-[11px] mb-2" style={{ color: '#5D5248' }}>
          화이트보드/종이/화면을 찍으면 자동으로 항목이 채워집니다
        </p>

        <div className="space-y-2 mb-4">
          {items.map((it, i) => {
            const c = colorFor(i)
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex gap-2 items-center">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 text-white"
                    style={{ backgroundColor: c.light }}
                  >
                    {i + 1}
                  </div>
                  <input
                    value={it.label}
                    onChange={(e) => patchItem(i, { label: e.target.value })}
                    placeholder={`항목 ${i + 1}`}
                    className="flex-1 px-3 py-2 rounded-lg text-base outline-none min-w-0"
                    style={inputStyle()}
                  />
                  {items.length > 2 && (
                    <button
                      onClick={() => removeItem(i)}
                      className="text-xl px-2"
                      style={{ color: '#6B4C40' }}
                      aria-label={`항목 ${i + 1} 삭제`}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="pl-11 pr-8">
                  <input
                    value={it.description}
                    onChange={(e) => patchItem(i, { description: e.target.value })}
                    placeholder="한 줄 설명 (선택)"
                    className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                    style={{
                      backgroundColor: 'rgba(255,255,255,.04)',
                      border: '1px solid rgba(255,255,255,.08)',
                      color: 'rgba(255,255,255,.7)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {items.length < 9 && (
          <button
            onClick={addItem}
            className="w-full py-3 rounded-xl text-sm mb-5"
            style={{
              backgroundColor: 'rgba(255,255,255,.04)',
              border: '2px dashed rgba(255,255,255,.1)',
              color: '#E59866',
            }}
          >
            + 항목 추가
          </button>
        )}

        {createError && (
          <p className="text-sm mb-3 text-center" style={{ color: '#E74C3C' }}>
            {createError}
          </p>
        )}

        <button
          onClick={startSession}
          className="w-full py-5 rounded-2xl text-white text-xl font-black"
          style={{ backgroundColor: '#D35400', boxShadow: '0 8px 24px rgba(211,84,0,.4)' }}
        >
          🚀 투표 시작하기
        </button>
      </div>
    </Shell>
  )
}

// ──── 공통 ────

function Shell({ children }: { children: React.ReactNode }) {
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
    </main>
  )
}

function Label({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="text-sm font-bold mb-2" style={{ color: '#8D7B68' }}>
      {icon} {children}
    </p>
  )
}

function RoundBtn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-12 h-12 rounded-full text-2xl text-white"
      style={{ backgroundColor: 'rgba(255,255,255,.08)' }}
    >
      {children}
    </button>
  )
}

function inputStyle(): React.CSSProperties {
  return {
    backgroundColor: 'rgba(255,255,255,.08)',
    border: '1.5px solid rgba(255,255,255,.15)',
    color: 'white',
  }
}
