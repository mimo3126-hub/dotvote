# 도트보팅 (dotvote)

농어촌 마을 워크숍을 위한 하이브리드 도트보팅 도구. 50대 이상 주민도 쉽게 참여할 수 있도록 폰과 종이 스티커가 함께 작동합니다.

🌐 라이브: https://dotvote.vercel.app

## 핵심 기능

- **진행자 / 참여자 모드 분리** — 홈 화면 큰 빨간 버튼은 참여자, 작은 ⚙️ 버튼은 PIN 게이트(기본 1234) 진행자
- **사진 → 자동 항목 추출** — 화이트보드/종이를 폰으로 찍으면 OCR로 투표 항목 자동 채움 (Claude vision 우선, 미설정 시 Tesseract.js 자동 폴백)
- **하이브리드 참여** — 폰 사용자(QR/4자리 코드)와 비폰 사용자(인쇄 시트 + 스티커) 동시 참여
- **카드 터치 좌표 도트** — +/– 버튼 없이 손가락 댄 자리에 실제 스티커처럼 부착
- **TTS 음성 안내** — 투표 시작 전/시작/도트 잔여/완료 4단계 한국어 음성
- **스와이프 네비게이션** — 좌우 60px+ 드래그로 항목 이동 (탭과 명확히 구분)
- **큰 흰색 + 검정 테두리 스티커** — 화면 폭의 40% (시인성)
- **오프라인 내성** — WiFi 끊어져도 localStorage 큐 → 재연결 시 자동 전송
- **실시간 결과** — 빔프로젝터용 막대그래프 + 1위 👑 + 개별 도트 그리드 + 디지털·아날로그 합산
- **PDF 산출물** — A4 인쇄 시트 (스티커 자리 포함) + 회의록 자동 생성 (자동 채움 + 토론 메모)
- **PWA** — "홈 화면에 추가"로 네이티브 앱처럼 풀스크린 실행
- **다크 테마** — 모바일 통일 (#1E1A14 + 앰버 텍스트)

## 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Realtime + RLS) — Vercel Marketplace 자동 통합
- @react-pdf/renderer (PDF) + NanumGothic 한글 폰트 (GitHub raw 로드)
- Tesseract.js v5 (한글 OCR, dynamic import) + Anthropic Claude Haiku 4.5 (선택)
- qrcode.react (QR 생성)
- Vercel 배포

## 로컬 셋업

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local 편집 — Supabase 키 필수, Anthropic 키 선택

# 3. Supabase 스키마 적용
# Supabase 대시보드 → SQL Editor에 supabase/migrations/001_initial.sql 붙여넣고 실행

# 4. 개발 서버
npm run dev
```

## 사용 흐름

1. **진행자**: 홈 → ⚙️ → PIN(1234) → 주제 입력 → 항목 직접 입력 OR 📷 사진으로 자동 채우기 → 🚀 투표 시작 → 4자리 코드 + QR 표시
2. **인쇄 시트**: "🖨 인쇄 시트 PDF" → A4 출력 → 비폰 참여자에게 배포
3. **참여자 (폰)**: 홈 → 👆 투표 참여하기 → 4자리 코드 입력 → Preview(스와이프 또는 버튼) → Confirm(음성 안내) → Voting(터치로 흰 스티커 부착) → 완료 음성
4. **참여자 (종이)**: 인쇄 시트에 빨간 스티커 부착
5. **진행자**: "📊 결과 화면" → 빔프로젝터에 띄움 → 종이 스티커 사진 찍은 후 "📋 종이 카운트" 메뉴에서 옵션별 개수 입력 → 디지털과 합산
6. **마무리**: "🛑 투표 마감" → "📝 회의록 PDF" → 토론 메모 입력 → PDF 다운로드

## 아키텍처 결정 사항

`plan-eng-review` 결과 (커밋 [e471322](https://github.com/mimo3126-hub/dotvote/commit/e471322) 참고):

- PDF: `@react-pdf/renderer` (Puppeteer는 Vercel 50MB 제한 초과)
- 오프라인: localStorage 큐 + 재연결 시 RE-FETCH (IndexedDB는 Phase 2)
- RLS: `votes_insert`는 `room_code` 존재 + `expires_at > now()` + `is_closed = false` 검증
- 룸 만료: `expires_at` 기본 24시간
- 결과 집계: `vote_counts` Postgres view (N+1 쿼리 방지)
- 타입 계약: `lib/types/ballot.ts` 단일 진실 공급원
- OCR 폴백 순서: Claude vision → Tesseract.js (키 미설정 시에도 작동)

## 라우트 구조

```
/                            홈 (진행자/참여자 분기, PIN 게이트)
/facilitator/new             진행자 셋업 (단일 화면, manual + 사진 OCR)
/vote/[roomCode]             투표 (Preview → Confirm → Voting → Done)
/results/[roomCode]          결과 (실시간, 빔프로젝터용)
/sheets/[roomCode]           PDF 인쇄 시트
/api/extract                 사진 OCR (Claude vision, 폴백은 클라이언트)
/api/rooms                   룸 + 투표안 생성
/api/rooms/[]/close          투표 마감
/api/votes/analog            종이 카운트 입력
/api/minutes/[roomCode]      회의록 PDF 생성
```

## 라이선스

MIT
