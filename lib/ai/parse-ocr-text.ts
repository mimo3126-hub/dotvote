import type { ExtractedBallot } from '@/lib/types/ballot'

/**
 * Tesseract OCR 결과(원시 텍스트)를 투표 항목 구조로 변환.
 *
 * 휴리스틱:
 * - 첫 줄이 번호/불릿으로 시작하지 않으면 title로 사용
 * - 나머지 줄에서 "1.", "1)", "•", "-" 등 리스트 prefix 제거
 * - 한글/영문이 없는 줄, 너무 짧거나 긴 줄 필터링
 * - 최대 9개 항목
 */
export function parseOcrText(raw: string): ExtractedBallot {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .filter((l) => /[가-힣a-zA-Z]/.test(l))

  if (lines.length === 0) return { items: [] }

  let title: string | undefined
  let startIdx = 0

  // 첫 줄이 번호/불릿이 아니면 제목으로 채택
  const isListPrefix = /^([\d０-９]+\s*[.)\]、:\-]|[•·●○\-—–▪◦])\s/
  if (lines[0] && !isListPrefix.test(lines[0])) {
    title = lines[0]
    startIdx = 1
  }

  const items = lines
    .slice(startIdx)
    .map((l) =>
      l
        .replace(/^([\d０-９]+\s*[.)\]、:\-])\s*/, '')
        .replace(/^[•·●○\-—–▪◦]\s*/, '')
        .trim(),
    )
    .filter((l) => l.length >= 2 && l.length <= 80)
    .slice(0, 9)
    .map((label) => ({ label }))

  return { title, items }
}
