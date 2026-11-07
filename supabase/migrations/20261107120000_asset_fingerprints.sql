-- What each generated file was made from (pipeline/fingerprint.py): text + voice for audio, prompt for pictures.
-- `storylingo.py media` remakes a file when its source changed, e.g. a reworded question or another voice.
alter table assets add column fingerprint text;
