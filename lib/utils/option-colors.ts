/** 항목별로 자동 할당되는 8색 팔레트 (다크 배경에 잘 보이도록 명도 페어 구성) */
export const OPTION_COLORS = [
  { bg: '#C0392B', light: '#E74C3C' }, // 빨강
  { bg: '#1A5276', light: '#2980B9' }, // 파랑
  { bg: '#1E8449', light: '#27AE60' }, // 초록
  { bg: '#6C3483', light: '#9B59B6' }, // 보라
  { bg: '#A04000', light: '#E67E22' }, // 주황
  { bg: '#0E6655', light: '#1ABC9C' }, // 청록
  { bg: '#7D6608', light: '#F4D03F' }, // 노랑
  { bg: '#7B241C', light: '#CB4335' }, // 진빨강
] as const

export type OptionColor = (typeof OPTION_COLORS)[number]

export function colorFor(idx: number): OptionColor {
  return OPTION_COLORS[idx % OPTION_COLORS.length]
}
