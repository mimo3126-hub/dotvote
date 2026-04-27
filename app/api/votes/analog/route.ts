import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface AnalogPayload {
  room_code: string
  counts: { option_id: string; dots: number }[]
}

export async function POST(req: Request) {
  let body: AnalogPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  if (!body.room_code || !Array.isArray(body.counts)) {
    return NextResponse.json({ error: '형식 오류' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('room_code', body.room_code)
    .single()

  if (!room) {
    return NextResponse.json({ error: '존재하지 않는 룸' }, { status: 404 })
  }

  // 기존 analog 투표 모두 삭제 후 재기록 (idempotent)
  await supabase.from('votes').delete().eq('room_id', room.id).eq('channel', 'analog')

  const rows = body.counts
    .filter((c) => c.dots > 0)
    .map((c) => ({
      room_id: room.id,
      option_id: c.option_id,
      dots: c.dots,
      channel: 'analog' as const,
    }))

  if (rows.length > 0) {
    const { error } = await supabase.from('votes').insert(rows)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, count: rows.length })
}
