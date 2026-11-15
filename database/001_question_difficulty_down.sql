-- Stop API writes and back up first. New rows need an explicit operator-reviewed legacy value.
-- No new classification is silently converted to EASY/MEDIUM/HARD.
BEGIN;
LOCK TABLE questions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='questions' AND column_name='legacy_difficulty') THEN
  IF EXISTS (SELECT 1 FROM questions WHERE legacy_difficulty IS NULL) THEN
   RAISE EXCEPTION 'Rollback blocked: assign reviewed EASY/MEDIUM/HARD legacy_difficulty values for new rows first';
  END IF;
  ALTER TABLE questions DROP CONSTRAINT ck_questions_difficulty;
  ALTER TABLE questions RENAME COLUMN difficulty TO difficulty_v13_archive;
  ALTER TABLE questions RENAME COLUMN legacy_difficulty TO difficulty;
  ALTER TABLE questions RENAME CONSTRAINT ck_questions_legacy_difficulty TO ck_questions_difficulty;
  ALTER TABLE questions ALTER COLUMN difficulty SET NOT NULL;
  ALTER TABLE questions ALTER COLUMN difficulty SET DEFAULT 'MEDIUM';
 END IF;
END $$;
COMMIT;
