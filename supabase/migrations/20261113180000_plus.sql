-- Plus and the free tier (docs/plus.md). A membership product (kind 'membership', one per target language) opens
-- everything of its languages; without it a learner gets per level the first stories and phrases, and per day a few
-- new ones. The limits live in the product (content/products/plus-<lang>.yaml, `free`), written here by sync.
-- As with packs, the database itself decides what may be read; the app only shows locks and the way to Plus.

alter table products
  drop column price_amount,
  drop column price_currency,
  drop column price_interval,
  add column prices jsonb not null default '[]',
  add column targets text[] not null default '{}',
  add column free jsonb;

-- Whether a story is in the free part of its language (set by sync: the first stories per level).
alter table stories add column free boolean not null default true;

-- A limit of the free tier in a language ('stories_per_day', 'phrases_per_level' …); null: that language has no
-- membership (yet), so it has no limits.
create function free_limit(lang text, what text) returns integer
  language sql stable security definer set search_path = public as $$
    select (free ->> what)::int from products
    where kind = 'membership' and status <> 'draft' and lang = any(targets)
    limit 1
  $$;

-- Whether the current learner has Plus for a language now.
create function has_plus(lang text) returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from purchases pu join products p on p.slug = pu.product
      where pu.user_id = auth.uid() and pu.status = 'active' and (pu.valid_until is null or pu.valid_until > now())
        and p.kind = 'membership' and lang = any(p.targets))
  $$;

-- Midnight in the learners' time zone (Germany, the Netherlands and Spain share it): when "today" starts.
create function today_start() returns timestamptz
  language sql stable as $$ select date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin' $$;

revoke all on function free_limit(text, text), has_plus(text) from public;
grant execute on function free_limit(text, text), has_plus(text), today_start() to anon, authenticated;

-- Stories: a pack's stories for its owners; otherwise the free ones for everyone, all of them with Plus.
drop policy "read published stories" on stories;
create policy "read published stories" on stories
  for select using (
    status = 'published'
    and case when product is not null then owns(product) else free or has_plus(language_code) end);

-- Phrases: per level the first ones for everyone, all of them with Plus.
drop policy "phrases are public" on phrases;
create policy "free phrases, all with plus" on phrases
  for select to anon, authenticated using (
    exists (
      select 1 from lexemes l where l.id = lexeme_id
        and (phrases.position <= coalesce(free_limit(l.language_code, 'phrases_per_level'), 2147483647)
             or has_plus(l.language_code))));

-- What the app may show of every published story, also of the locked ones: title, level, summary and cover, so a
-- lock can say what it keeps closed. Not the scenes, questions or words (those stay behind the policies above).
create view story_cards as
select s.id, s.slug, s.title, s.cefr_level, s.language_code, s.tags, s.product, s.free, s.published_at,
       sl.base_language, sl.summary, a.id as cover_id, a.storage_path as cover_path
from stories s
join story_localizations sl on sl.story_id = s.id
left join lateral (select image_asset_id from scenes where story_id = s.id order by position limit 1) sc on true
left join assets a on a.id = sc.image_asset_id
where s.status = 'published';
grant select on story_cards to anon, authenticated;

-- How many phrases each level has, also the locked ones ("30 of 200").
create view phrase_counts as
select l.language_code, p.level, count(*)::int as total
from phrases p join lexemes l on l.id = p.lexeme_id
group by l.language_code, p.level;
grant select on phrase_counts to anon, authenticated;

-- A new story per day without Plus: starting a story is free when it is a pack's, when the learner has Plus, or when
-- they played it before (replaying); a story not played before counts against `stories_per_day`.
create function may_start_story(story uuid) returns boolean
  language sql stable security definer set search_path = public as $$
    select s.product is not null
        or has_plus(s.language_code)
        or exists (select 1 from sessions where user_id = auth.uid() and story_id = story)
        or (select count(distinct x.story_id) from sessions x
              where x.user_id = auth.uid() and x.started_at >= today_start()
                and not exists (select 1 from sessions y
                                where y.user_id = x.user_id and y.story_id = x.story_id and y.started_at < today_start()))
           < coalesce(free_limit(s.language_code, 'stories_per_day'), 2147483647)
    from stories s where s.id = story
  $$;
revoke all on function may_start_story(uuid) from public;
grant execute on function may_start_story(uuid) to authenticated;

create policy "new stories per day" on sessions as restrictive for insert to authenticated
  with check (may_start_story(story_id));
