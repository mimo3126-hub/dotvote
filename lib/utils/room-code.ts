/** 4자리 숫자 룸 코드 생성 (0000–9999) */
export function generateRoomCode(): string {
  return Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
}
