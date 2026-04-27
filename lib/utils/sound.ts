'use client'

/** 도트 찍을 때 팝 효과음 (Sine 900→200Hz + Triangle 450→110Hz) */
export function playPop(): void {
  try {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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
    // 음성 컨텍스트 미지원 환경 — 조용히 무시
  }
}

/** 한국어 TTS 음성 안내 (느린 속도, 약간 높은 톤) */
export function speak(text: string): void {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ko-KR'
    u.rate = 0.75
    u.pitch = 1.1
    window.speechSynthesis.speak(u)
  } catch {
    // TTS 미지원 환경 — 조용히 무시
  }
}
