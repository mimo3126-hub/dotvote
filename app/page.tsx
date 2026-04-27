'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN ?? '1234'

type View = 'home' | 'code' | 'pin'

export default function HomePage() {
  const router = useRouter()
  const [view, setView] = useState<View>('home')
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  function tryLogin() {
    if (pin === ADMIN_PIN) {
      router.push('/facilitator/new')
    } else {
      setError('비밀번호가 틀렸습니다')
      setPin('')
    }
  }

  function tryCode(e: React.FormEvent) {
    e.preventDefault()
    if (/^\d{4}$/.test(code)) {
      router.push(`/vote/${code}`)
    } else {
      setError('4자리 숫자를 입력하세요')
    }
  }

  function reset() {
    setView('home')
    setPin('')
    setCode('')
    setError('')
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-7 gap-7 mx-auto"
      style={{
        backgroundColor: '#1E1A14',
        color: '#F0EBE3',
        maxWidth: 480,
        fontFamily: '"Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", sans-serif',
      }}
    >
      {view === 'home' && (
        <>
          <div className="text-center anim-fade-up">
            <div className="text-6xl anim-bounce" aria-hidden>🗳️</div>
            <h1
              className="text-4xl font-black mt-2"
              style={{
                background: 'linear-gradient(135deg, #F5CBA7, #E59866)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              도트 투표
            </h1>
            <p className="text-base mt-1" style={{ color: '#8D7B68' }}>
              마을공동체 의사결정 시스템
            </p>
          </div>

          <button
            onClick={() => {
              setError('')
              setView('code')
            }}
            className="w-full max-w-xs py-7 px-5 rounded-3xl text-white text-2xl font-black flex flex-col items-center gap-1 anim-heartbeat"
            style={{ backgroundColor: '#C0392B', boxShadow: '0 12px 32px rgba(192,57,43,.45)' }}
          >
            <span className="text-3xl" aria-hidden>👆</span>
            <span>투표 참여하기</span>
          </button>

          <button
            onClick={() => {
              setError('')
              setView('pin')
            }}
            className="px-6 py-3 rounded-2xl text-base"
            style={{
              backgroundColor: 'rgba(255,255,255,.07)',
              border: '1px solid rgba(255,255,255,.1)',
              color: '#8D7B68',
            }}
          >
            ⚙️ 진행자 (관리자)
          </button>

          <p className="text-xs text-center mt-4" style={{ color: '#5D5248' }}>
            농어촌 마을공동체를 위한
            <br />
            오픈소스 의사결정 도구
          </p>
        </>
      )}

      {view === 'code' && (
        <div className="flex flex-col items-center gap-4 anim-fade-up w-full max-w-xs">
          <div className="text-5xl anim-bounce" aria-hidden>📝</div>
          <p className="text-lg" style={{ color: '#A0896E' }}>
            참여 코드 4자리
          </p>
          <form onSubmit={tryCode} className="w-full">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
              placeholder="0000"
              autoFocus
              className="w-full text-center font-black py-4 rounded-2xl outline-none"
              style={{
                fontSize: 48,
                letterSpacing: 12,
                backgroundColor: 'rgba(255,255,255,.08)',
                border: '2px solid rgba(255,255,255,.15)',
                color: 'white',
              }}
            />
            {error && (
              <p className="text-sm mt-2 text-center" style={{ color: '#E74C3C' }}>
                {error}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-3 rounded-2xl text-lg"
                style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#8D7B68' }}
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-[2] py-3 rounded-2xl text-lg font-bold text-white"
                style={{ backgroundColor: '#C0392B' }}
                disabled={code.length !== 4}
              >
                투표하러 가기 →
              </button>
            </div>
          </form>
          <p className="text-xs mt-2" style={{ color: '#5D5248' }}>
            진행자가 안내한 4자리 숫자를 입력하세요
          </p>
        </div>
      )}

      {view === 'pin' && (
        <div className="flex flex-col items-center gap-4 anim-fade-up">
          <div className="text-5xl" aria-hidden>🔒</div>
          <p className="text-lg" style={{ color: '#A0896E' }}>
            진행자 비밀번호
          </p>
          <input
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') tryLogin()
            }}
            placeholder="••••"
            autoFocus
            className="text-center py-3 rounded-xl outline-none"
            style={{
              width: 160,
              fontSize: 24,
              letterSpacing: 6,
              backgroundColor: 'rgba(255,255,255,.08)',
              border: '2px solid rgba(255,255,255,.15)',
              color: 'white',
            }}
          />
          {error && (
            <p className="text-sm" style={{ color: '#E74C3C' }}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={tryLogin}
              className="px-6 py-3 rounded-2xl text-white text-lg font-bold"
              style={{ backgroundColor: '#E67E22' }}
            >
              확인
            </button>
            <button
              onClick={reset}
              className="px-5 py-3 rounded-2xl text-lg"
              style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#8D7B68' }}
            >
              취소
            </button>
          </div>
          <p className="text-xs" style={{ color: '#5D5248' }}>
            기본 비밀번호: 1234
          </p>
        </div>
      )}
    </main>
  )
}
