-- Where each sentence starts and ends in a narration, so the app can play one sentence for the learner to repeat
-- (shadowing). [{"text", "start", "end"}] in seconds; null for audio without sentences (questions, words).
alter table assets add column marks jsonb;
