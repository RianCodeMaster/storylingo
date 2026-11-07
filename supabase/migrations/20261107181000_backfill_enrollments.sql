-- Sessions and learners from before editions: until then every page was Dutch, so German was /duits and Spanish
-- /spaans. Each learner is enrolled where they played, at the level of the easiest story they finished there
-- (A2 when they finished none).
update sessions s set edition = case st.language_code when 'de' then 'duits' when 'es' then 'spaans' end
from stories st where st.id = s.story_id and s.edition is null;

insert into enrollments (user_id, edition, level, started_at)
select s.user_id, s.edition,
       coalesce(min(st.cefr_level) filter (where s.completed_at is not null), 'A2'),
       min(s.started_at)
from sessions s join stories st on st.id = s.story_id
where s.edition is not null
group by s.user_id, s.edition
on conflict do nothing;
