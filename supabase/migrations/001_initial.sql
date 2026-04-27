-- 워크숍 룸
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code   CHAR(4) UNIQUE NOT NULL,
  topic       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  is_closed   BOOLEAN DEFAULT FALSE
);

-- AI가 생성한 투표안 (룸당 1개)
CREATE TABLE ballots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  options     JSONB NOT NULL,   -- BallotOption[]
  total_dots  INTEGER NOT NULL DEFAULT 5
);

-- 투표 기록 (도트 하나 = 1행)
CREATE TABLE votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  option_id  TEXT NOT NULL,
  dots       INTEGER NOT NULL DEFAULT 1 CHECK (dots > 0 AND dots <= 20),
  channel    TEXT NOT NULL DEFAULT 'digital' CHECK (channel IN ('digital', 'analog')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE rooms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes   ENABLE ROW LEVEL SECURITY;

-- rooms: 누구나 읽기/쓰기 (Phase 1: 인증 없음)
CREATE POLICY "rooms_select" ON rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms_update" ON rooms FOR UPDATE USING (true);

-- ballots: 누구나 읽기/쓰기
CREATE POLICY "ballots_select" ON ballots FOR SELECT USING (true);
CREATE POLICY "ballots_insert" ON ballots FOR INSERT WITH CHECK (true);

-- votes: 유효한 룸에만 INSERT 허용 (만료·마감 방어)
CREATE POLICY "votes_select" ON votes FOR SELECT USING (true);
CREATE POLICY "votes_insert" ON votes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms
      WHERE id      = room_id
        AND is_closed  = FALSE
        AND expires_at > NOW()
    )
  );

-- 옵션별 도트 합산 뷰 (N+1 방지)
CREATE OR REPLACE VIEW vote_counts AS
SELECT
  room_id,
  option_id,
  channel,
  SUM(dots)  AS total_dots,
  COUNT(*)   AS vote_count
FROM votes
GROUP BY room_id, option_id, channel;

-- Supabase 실시간 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
