import { NextResponse } from 'next/server'
import { generateBallot, BallotGenerationError } from '@/lib/ai/generate-ballot'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  let body: { topic?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  if (topic.length < 3 || topic.length > 200) {
    return NextResponse.json({ error: '주제는 3–200자' }, { status: 400 })
  }

  try {
    const ballot = await generateBallot(topic)
    return NextResponse.json({ ballot })
  } catch (err) {
    if (err instanceof BallotGenerationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === 'TIMEOUT' ? 504 : 502 },
      )
    }
    return NextResponse.json({ error: '알 수 없는 오류' }, { status: 500 })
  }
}
