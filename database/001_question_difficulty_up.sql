-- Run with psql -v ON_ERROR_STOP=1 against the intended database, while API writes are stopped.
BEGIN;
LOCK TABLE questions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='questions' AND column_name='legacy_difficulty') THEN
  ALTER TABLE questions RENAME COLUMN difficulty TO legacy_difficulty;
  ALTER TABLE questions RENAME CONSTRAINT ck_questions_difficulty TO ck_questions_legacy_difficulty;
  ALTER TABLE questions ALTER COLUMN legacy_difficulty DROP DEFAULT;
  ALTER TABLE questions ALTER COLUMN legacy_difficulty DROP NOT NULL;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='questions' AND column_name='difficulty_v13_archive') THEN
   ALTER TABLE questions RENAME COLUMN difficulty_v13_archive TO difficulty;
  ELSE
   ALTER TABLE questions ADD COLUMN difficulty varchar(32) NULL;
  END IF;
  ALTER TABLE questions ADD CONSTRAINT ck_questions_difficulty CHECK (difficulty IS NULL OR difficulty IN ('RECOGNITION','COMPREHENSION','LOW_APPLICATION','HIGH_APPLICATION'));
 END IF;
END $$;
COMMIT;
