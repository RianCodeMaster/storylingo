-- English and Arabic are base languages (app texts, translations, tips); `storylingo.py check <base>` verifies them.
-- English was opened in 20261106090000 without the flag. Arabic is right-to-left (direction set in the first layer).
update languages set is_base = true where code in ('en', 'ar');
update language_pairs set status = 'beta' where base_language = 'ar' and target_language = 'de';
