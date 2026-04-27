'use client'

/**
 * Korean TTS — 시스템에서 가장 자연스러운 음성을 자동 선택.
 *
 * 우선순위:
 *  1. iOS Premium/Enhanced (Yuna, Sora) — 거의 인간 수준
 *  2. Apple/Google/MS의 한국어 뉴럴 음성
 *  3. 그 외 ko-KR 기본 음성
 *  4. 시스템 fallback
 *
 * 사용자가 음성을 추가로 다운로드하면 (iOS: 설정 → 손쉬운 사용 → 음성 콘텐츠 → 음성)
 * 자동으로 더 좋은 음성을 픽업.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined = undefined

// 가장 자연스러운 음성을 위에 배치
const PREFERRED_PATTERNS: RegExp[] = [
  // iOS Premium / Enhanced (다운로드 시 거의 인간 수준)
  /Yuna.*Premium/i,
  /Sora.*Premium/i,
  /Yuna.*Enhanced/i,
  /Sora.*Enhanced/i,
  // Apple 기본 한국어 음성
  /\bYuna\b/i,
  /\bSora\b/i,
  /\bMinsu\b/i,
  // Google (Android Chrome / Chrome OS)
  /Google.*한국/i,
  /Google.*Korean/i,
  // Microsoft (Windows / Edge) 뉴럴
  /Heami/i, // Microsoft Heami Online (Natural)
  /SunHi/i, // Microsoft SunHi Online
  /InJoon/i,
  /BongJin/i,
  /JiMin/i,
  /GookMin/i,
  /SeoHyeon/i,
]

function isKorean(v: SpeechSynthesisVoice): boolean {
  const lang = v.lang.toLowerCase().replace('_', '-')
  return lang === 'ko-kr' || lang.startsWith('ko-') || lang === 'ko'
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null // 아직 로드 안 됨 — 다음 호출에서 재시도
  const koVoices = voices.filter(isKorean)
  if (koVoices.length === 0) {
    cachedVoice = null
    return null
  }
  for (const pat of PREFERRED_PATTERNS) {
    const match = koVoices.find((v) => pat.test(v.name))
    if (match) {
      cachedVoice = match
      return match
    }
  }
  // 시스템 default를 우선, 그래도 없으면 첫 번째
  const def = koVoices.find((v) => v.default)
  cachedVoice = def ?? koVoices[0]
  return cachedVoice
}

// 모듈 로드 시점에 음성 목록 워밍업 + 변경 감지
if (typeof window !== 'undefined' && window.speechSynthesis) {
  // Chrome/Edge는 lazy-load. 빈 배열을 반환해도 호출 자체가 로드를 트리거함
  window.speechSynthesis.getVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = undefined
    window.speechSynthesis.getVoices()
  })
}

function isHighQuality(voice: SpeechSynthesisVoice | null): boolean {
  if (!voice) return false
  return /Premium|Enhanced|Neural|Natural/i.test(voice.name)
}

/** 도트 찍을 때 팝 효과음 (Sine 900→200Hz + Triangle 450→110Hz) */
export function playPop(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t = ctx.currentTime
    const note = (f1: number, f2: number, vol: number, type: OscillatorType, dur: number) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.connect(g)
      g.connect(ctx.destination)
      o.frequency.setValueAtTime(f1, t)
      o.frequency.exponentialRampToValueAtTime(f2, t + dur)
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.start()
      o.stop(t + dur)
    }
    note(900, 200, 0.45, 'sine', 0.18)
    note(450, 110, 0.2, 'triangle', 0.12)
  } catch {
    // 미지원 환경 — 무시
  }
}

/** 한국어 TTS — 시스템에서 가장 자연스러운 음성 자동 선택 */
export function speak(text: string): void {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    const voice = pickVoice()
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    }
    // Premium 음성은 1.0이 자연스럽고, 그 외 음성은 약간 느리게 (어르신 가독성)
    u.rate = isHighQuality(voice) ? 1.0 : 0.85
    u.pitch = 1.0
    u.volume = 1.0
    window.speechSynthesis.speak(u)
  } catch {
    // 미지원 환경 — 무시
  }
}
