import { NextResponse } from 'next/server'
import { extractFromImage, ExtractError } from '@/lib/ai/extract-from-image'

export const runtime = 'nodejs'
export const maxDuration = 30

interface Body {
  image?: string
  mediaType?: string
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  if (typeof body.image !== 'string' || body.image.length === 0) {
    return NextResponse.json({ error: '이미지 데이터 누락' }, { status: 400 })
  }
  if (body.image.length > 6_000_000) {
    return NextResponse.json(
      { error: '이미지가 너무 큽니다 (4MB 이하로 줄여주세요)' },
      { status: 413 },
    )
  }

  try {
    const result = await extractFromImage(body.image, body.mediaType ?? 'image/jpeg')
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ExtractError) {
      const status =
        err.code === 'TIMEOUT' ? 504 : err.code === 'EMPTY' ? 422 : err.code === 'API_ERROR' ? 502 : 500
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: '알 수 없는 오류' }, { status: 500 })
  }
}
