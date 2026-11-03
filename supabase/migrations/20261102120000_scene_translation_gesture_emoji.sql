-- What the MVP player needs on top of the initial schema.
-- A learner can reveal the meaning of a scene, and a gesture has an emoji until it has a drawn image.

alter table scenes
  add column translation  text,         -- meaning in the learner's language, hidden until tapped
  add column image_prompt text;         -- kept so an image can be generated later

alter table gestures
  add column emoji text;
