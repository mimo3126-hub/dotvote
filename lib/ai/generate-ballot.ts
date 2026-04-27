import Anthropic from '@anthropic-ai/sdk'
import type { Ballot } from '@/lib/types/ballot'

const SYSTEM_PROMPT = `당신은 농어촌 마을 워크숍 퍼실리테이터를 돕는 도구입니다.
주민(주로 50–80대)이 도트 스티커로 우선순위 투표를 할 수 있는 투표안을 만듭니다.

규칙:
1. 질문은 한 문장. 주민이 바로 이해할 수 있는 단어 사용. 행정·전문 용어 금지.
2. 선택지는 5–7개. 너무 적으면 토론이 안 되고, 너무 많으면 도트가 분산됨.
3. 각 선택지는 8–20자. 짧고 구체적. "기타", "잘 모름" 같은 의미 없는 항목 금지.
4. 각 선택지에 한 줄 설명(15–30자). 무엇을 뜻하는지 보충.
5. 농어촌 맥락(고령화·예산 제약·이동성·생계) 고려.
6. 출력은 반드시 JSON. 다른 텍스트 일절 금지.

JSON 형식:
{
  "title": "...",
  "description": "...",
  "options": [
    { "id": "opt1", "label": "...", "description": "..." },
    ...
  ],
  "total_dots": 5
}`

export class BallotGenerationError extends Error {
  constructor(
    message: string,
    public code: 'TIMEOUT' | 'API_ERROR' | 'PARSE_ERROR' | 'INVALID_SHAPE',
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 15_000

export async function generateBallot(topic: string): Promise<Ballot> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new BallotGenerationError('ANTHROPIC_API_KEY 미설정', 'API_ERROR')
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let raw: string
  try {
    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `워크숍 주제: ${topic}` }],
      },
      { signal: controller.signal },
    )

    const block = response.content[0]
    if (block.type !== 'text') {
      throw new BallotGenerationError('AI 응답 형식 오류', 'API_ERROR')
    }
    raw = block.text
  } catch (err) {
    if (err instanceof BallotGenerationError) throw err
    if (controller.signal.aborted) {
      throw new BallotGenerationError('AI 응답 시간 초과 (15초)', 'TIMEOUT')
    }
    throw new BallotGenerationError(
      `AI 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      'API_ERROR',
    )
  } finally {
    clearTimeout(timeout)
  }

  return parseAndValidate(raw)
}

function parseAndValidate(raw: string): Ballot {
  // AI가 ```json 펜스를 붙이는 경우 제거
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')

  let data: unknown
  try {
    data = JSON.parse(cleaned)
  } catch {
    throw new BallotGenerationError(`JSON 파싱 실패: ${cleaned.slice(0, 200)}`, 'PARSE_ERROR')
  }

  if (typeof data !== 'object' || data === null) {
    throw new BallotGenerationError('JSON 객체 아님', 'INVALID_SHAPE')
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.title !== 'string' || obj.title.length === 0) {
    throw new BallotGenerationError('title 누락', 'INVALID_SHAPE')
  }

  if (!Array.isArray(obj.options) || obj.options.length < 3 || obj.options.length > 9) {
    throw new BallotGenerationError(
      `options 수 비정상 (${Array.isArray(obj.options) ? obj.options.length : 'N/A'})`,
      'INVALID_SHAPE',
    )
  }

  const options = obj.options.map((opt, idx) => {
    if (typeof opt !== 'object' || opt === null) {
      throw new BallotGenerationError(`options[${idx}] 객체 아님`, 'INVALID_SHAPE')
    }
    const o = opt as Record<string, unknown>
    if (typeof o.label !== 'string' || o.label.length === 0) {
      throw new BallotGenerationError(`options[${idx}].label 누락`, 'INVALID_SHAPE')
    }
    return {
      id: typeof o.id === 'string' && o.id.length > 0 ? o.id : `opt${idx + 1}`,
      label: o.label,
      description: typeof o.description === 'string' ? o.description : undefined,
    }
  })

  return {
    title: obj.title,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    options,
    total_dots: typeof obj.total_dots === 'number' && obj.total_dots > 0 ? obj.total_dots : 5,
  }
}
