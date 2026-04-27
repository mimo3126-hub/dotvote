# 도트보팅 (dotvote)

농어촌 마을 워크숍을 위한 하이브리드 도트보팅 도구. 50대 이상 주민도 쉽게 참여할 수 있도록 폰과 종이 스티커가 함께 작동합니다.

## Phase 1 핵심 기능

- **AI 투표안 자동 생성** — 워크숍 주제만 입력하면 Claude가 질문·선택지·인쇄시트 PDF를 만들어줍니다
- **하이브리드 참여** — 스마트폰 사용자(QR/4자리 코드)와 비폰 사용자(인쇄 시트 + 스티커) 동시 참여
- **오프라인 내성** — WiFi 끊어져도 localStorage에 큐잉, 재연결 시 자동 전송
- **실시간 결과** — 빔프로젝터용 큰 막대그래프, 디지털·아날로그 합산
- **노인 친화 UI** — WCAG AAA 기준 (큰 글씨 18px+, 64px 터치 영역, 고대비)

## 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Realtime + RLS)
- Anthropic Claude Haiku (투표안 생성)
- @react-pdf/renderer (인쇄 시트)
- Vercel 배포

## 로컬 셋업

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local 편집해서 Supabase, Anthropic 키 입력

# 3. Supabase 스키마 적용
# Supabase 대시보드 → SQL Editor에 supabase/migrations/001_initial.sql 붙여넣고 실행

# 4. 개발 서버 실행
npm run dev
```

## 사용 흐름

1. **퍼실리테이터**: `/facilitator/new`에서 주제 입력 → AI가 투표안 생성 → 룸 코드(4자리) + QR 코드 표시
2. **인쇄 시트**: `/sheets/{roomCode}` 클릭 → A4 PDF 다운로드 → 종이 출력
3. **주민 (폰)**: QR 스캔하거나 메인페이지에서 4자리 코드 입력 → `/vote/{roomCode}` → 도트 분배 → 제출
4. **주민 (종이)**: 인쇄 시트에 스티커 부착
5. **퍼실리테이터**: `/results/{roomCode}` 빔프로젝터에 띄우기, 종료 시 종이 카운트를 직접 입력해서 합산

## 아키텍처 결정 사항

`plan-eng-review` 결과 ([상세](https://github.com/mimo3126-hub/dotvote/issues)):

- PDF: `@react-pdf/renderer` 사용 (Puppeteer는 Vercel 50MB 제한 초과)
- 오프라인: localStorage 큐 + 재연결 시 RE-FETCH (IndexedDB는 Phase 2)
- RLS: `votes_insert`는 `room_code` 존재 + `expires_at > now()` + `is_closed = false` 검증
- 룸 만료: `expires_at` 기본 24시간
- AI 타임아웃: 15초, 실패 시 수동 입력 폴백
- 결과 집계: `vote_counts` Postgres view (N+1 쿼리 방지)
- 타입 계약: `lib/types/ballot.ts` 단일 진실 공급원

## 라이선스

MIT
