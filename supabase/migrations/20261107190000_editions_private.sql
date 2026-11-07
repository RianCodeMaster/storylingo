-- Editions stay out of sight of the public: a learner in one niche should not be able to list the others through the
-- database API. The app reads its own edition from web/lib/editions.json on the server; nothing in the browser
-- needs this table (enrollments only reference it).
drop policy "editions are public" on editions;
