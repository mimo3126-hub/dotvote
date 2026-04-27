import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 사진 속의 워크숍 안건/투표 항목을 OCR + 정리하여 추출합니다.

입력: 화이트보드, 종이, 화면 등에 적힌 한국어 텍스트의 사진.
출력: 투표 항목 리스트 (JSON).

규칙:
1. 사진 속에서 명확히 구분되는 항목 2-9개를 추출.
2. 각 항목의 label은 8-25자, 한국어, 그대로 옮기되 명백한 오타는 자연스럽게 정정.
3. 각 항목에 보충 설명이 있으면 description으로 분리 (없으면 생략).
4. 제목/주제로 보이는 큰 글씨가 있으면 title로 분리.
5. 사진에 항목이 없거나 알아볼 수 없으면 items: [] 반환.
6. 출력은 JSON만. 마크다운 코드 펜스 금지.

JSON 형식:
{
  "title": "...",   // 선택
  "items": [
    { "label": "...", "description": "..." },
    ...
  ]
}`

export interface ExtractedBallot {
  title?: string
  items: { label: string; description?: string }[]
}

export class ExtractError extends Error {
  constructor(
    message: string,
    public code: 'TIMEOUT' | 'API_ERROR' | 'PARSE_ERROR' | 'INVALID_SHAPE' | 'EMPTY',
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 25_000

type SupportedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

function normalizeMediaType(input: string): SupportedMediaType {
  if (input === 'image/jpg') return 'image/jpeg'
  if (
    input === 'image/jpeg' ||
    input === 'image/png' ||
    input === 'image/gif' ||
    input === 'image/webp'
  ) {
    return input
  }
  return 'image/jpeg'
}

export async function extractFromImage(
  base64: string,
  mediaType: string,
): Promise<ExtractedBallot> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractError('ANTHROPIC_API_KEY 미설정', 'API_ERROR')
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let raw: string
  try {
    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: normalizeMediaType(mediaType),
                  data: base64,
                },
              },
              {
                type: 'text',
                text: '이 사진에서 투표 항목을 추출해서 JSON으로만 응답해주세요.',
              },
            ],
          },
        ],
      },
      { signal: controller.signal },
    )
    const block = response.content[0]
    if (block.type !== 'text') {
      throw new ExtractError('AI 응답 형식 오류', 'API_ERROR')
    }
    raw = block.text
  } catch (err) {
    if (err instanceof ExtractError) throw err
    if (controller.signal.aborted) {
      throw new ExtractError('AI 응답 시간 초과 (25초)', 'TIMEOUT')
    }
    throw new ExtractError(
      `AI 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      'API_ERROR',
    )
  } finally {
    clearTimeout(timeout)
  }

  return parseAndValidate(raw)
}

function parseAndValidate(raw: string): ExtractedBallot {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  let data: unknown
  try {
    data = JSON.parse(cleaned)
  } catch {
    throw new ExtractError(`JSON 파싱 실패: ${cleaned.slice(0, 200)}`, 'PARSE_ERROR')
  }
  if (typeof data !== 'object' || data === null) {
    throw new ExtractError('JSON 객체 아님', 'INVALID_SHAPE')
  }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.items)) {
    throw new ExtractError('items 누락', 'INVALID_SHAPE')
  }
  if (obj.items.length === 0) {
    throw new ExtractError('사진에서 항목을 찾을 수 없습니다', 'EMPTY')
  }
  const items = obj.items
    .filter((it) => typeof it === 'object' && it !== null)
    .map((it) => it as Record<string, unknown>)
    .filter((it) => typeof it.label === 'string' && it.label.length > 0)
    .slice(0, 9)
    .map((it) => ({
      label: String(it.label).trim(),
      description: typeof it.description === 'string' ? it.description.trim() : undefined,
    }))

  if (items.length < 2) {
    throw new ExtractError('항목이 2개 미만입니다', 'EMPTY')
  }

  return {
    title: typeof obj.title === 'string' && obj.title.length > 0 ? obj.title.trim() : undefined,
    items,
  }
}
