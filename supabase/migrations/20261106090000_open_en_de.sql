-- English as the second base language: the app has en.json and every German story has an English layer.
-- beta = on offer for testing; new stories are localized into it by `generate`. Set to 'live' after review.
update language_pairs set status = 'beta' where base_language = 'en' and target_language = 'de';
