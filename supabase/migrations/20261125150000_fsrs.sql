-- Spaced repetition with FSRS (web/lib/srs.ts, the ts-fsrs library) instead of the SM-2 formula: per lexeme how
-- stable the memory is (stability, in days), how hard the item is (difficulty, 1-10) and where it is in learning
-- (state: 0 new, 1 learning, 2 review, 3 relearning). A card in (re)learning comes back after minutes; a card in review
-- after days. exposures, correct, ease and interval_days stay for history (interval_days = the days until the next
-- review, as before).
alter table user_lexeme_state
  add column state smallint,
  add column stability double precision,
  add column difficulty double precision,
  add column reps int not null default 0,
  add column lapses int not null default 0,
  add column learning_steps int not null default 0,
  add column scheduled_days int not null default 0,
  add column last_review timestamptz;

-- What learners practised under SM-2 carries on as cards in review: the interval becomes the stability, an ease
-- below the start (2.5) a higher difficulty, and the last review lies one interval before the due date.
update user_lexeme_state set
  state = 2,
  stability = greatest(interval_days, 1),
  difficulty = least(10, greatest(1, 5 + (2.5 - ease) * 4)),
  reps = exposures,
  lapses = greatest(exposures - correct, 0),
  scheduled_days = interval_days,
  last_review = due_at - make_interval(days => interval_days)
where state is null and due_at is not null;

create index user_lexeme_state_due on user_lexeme_state (user_id, state, due_at);
