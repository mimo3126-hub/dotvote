import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateRoomCode } from '@/lib/utils/room-code'
import type { Ballot } from '@/lib/types/ballot'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { topic?: unknown; ballot?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  const ballot = body.ballot as Ballot | undefined

  if (topic.length < 3) {
    return NextResponse.json({ error: '주제 누락' }, { status: 400 })
  }
  if (
    !ballot ||
    typeof ballot.title !== 'string' ||
    !Array.isArray(ballot.options) ||
    ballot.options.length < 2
  ) {
    return NextResponse.json({ error: '투표안 형식 오류' }, { status: 400 })
  }

  const supabase = createClient()

  // 충돌 시 재시도 (최대 10회)
  let roomCode = ''
  let roomId = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateRoomCode()
    const { data, error } = await supabase
      .from('rooms')
      .insert({ room_code: candidate, topic })
      .select('id, room_code')
      .single()

    if (!error && data) {
      roomCode = data.room_code
      roomId = data.id
      break
    }
    // 23505 = unique_violation (코드 충돌). 그 외 에러는 즉시 종료.
    if (error?.code !== '23505') {
      return NextResponse.json(
        { error: `룸 생성 실패: ${error?.message ?? 'unknown'}` },
        { status: 500 },
      )
    }
  }

  if (!roomCode) {
    return NextResponse.json({ error: '룸 코드 충돌 — 다시 시도해주세요' }, { status: 503 })
  }

  const { error: ballotError } = await supabase.from('ballots').insert({
    room_id: roomId,
    title: ballot.title,
    description: ballot.description ?? null,
    options: ballot.options,
    total_dots: ballot.total_dots,
  })

  if (ballotError) {
    // 룸은 만들어졌지만 투표안 저장 실패 → 룸 삭제 후 에러 반환
    await supabase.from('rooms').delete().eq('id', roomId)
    return NextResponse.json(
      { error: `투표안 저장 실패: ${ballotError.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ room_code: roomCode, room_id: roomId })
}
