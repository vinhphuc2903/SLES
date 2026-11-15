-- ============================================================
-- SLES Database Schema v1.2
-- PostgreSQL 16+ | ASP.NET Core / EF Core
-- ============================================================
-- Design notes:
-- 1. Each Student belongs to exactly one creating Teacher.
-- 2. Each Teacher owns their Chapters and Exams.
-- 3. Students can practice published chapters owned by their Teacher.
-- 4. Every ExamAttempt gets its own immutable 10-question snapshot.
-- 5. Each attempt question stores four immutable option snapshots.
-- 6. A student can have only one attempt per exam.
-- 7. All timestamps are stored in UTC (TIMESTAMPTZ).
--
-- Run this script against an empty database.
-- ============================================================

BEGIN;

-- ---------- 1. ENUM-LIKE CHECKED DOMAINS ----------
-- VARCHAR + CHECK is intentionally used instead of PostgreSQL ENUM
-- to make future migrations and EF Core mapping easier.

-- ---------- 2. CORE TABLES ----------

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(30) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE grades (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(20) NOT NULL UNIQUE,
    name          VARCHAR(50) NOT NULL,
    display_order SMALLINT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_grades_display_order CHECK (display_order > 0)
);

CREATE TABLE subjects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id                 UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    created_by_teacher_id   UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
    grade_id                UUID NULL REFERENCES grades(id) ON DELETE RESTRICT,
    username                VARCHAR(100) NOT NULL,
    password_hash           TEXT NOT NULL,
    full_name               VARCHAR(255) NOT NULL,
    email                   VARCHAR(255),
    phone                   VARCHAR(30),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password    BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_id_owner UNIQUE (id, created_by_teacher_id)
);

-- Refresh token hashes only; never store raw refresh tokens.
CREATE TABLE refresh_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_ip    INET,
    user_agent    TEXT,
    CONSTRAINT ck_refresh_token_expiry CHECK (expires_at > created_at)
);

-- ---------- 3. LEARNING CONTENT ----------

CREATE TABLE chapters (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    grade_id      UUID NOT NULL REFERENCES grades(id) ON DELETE RESTRICT,
    subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    name          VARCHAR(255) NOT NULL,
    description   TEXT,
    display_order INTEGER NOT NULL DEFAULT 1,
    status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT ck_chapters_status CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    CONSTRAINT ck_chapters_display_order CHECK (display_order > 0),
    CONSTRAINT uq_chapters_id_teacher UNIQUE (id, teacher_id)
);

-- One current theory document per chapter.
-- Versioning can be added later if full revision history is required.
CREATE TABLE chapter_contents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id  UUID NOT NULL UNIQUE REFERENCES chapters(id) ON DELETE CASCADE,
    content     TEXT NOT NULL DEFAULT '',
    content_format VARCHAR(20) NOT NULL DEFAULT 'HTML',
    version     INTEGER NOT NULL DEFAULT 1,
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_chapter_content_format CHECK (content_format IN ('HTML','MARKDOWN')),
    CONSTRAINT ck_chapter_content_version CHECK (version > 0)
);

-- ---------- 4. QUESTION BANK ----------

CREATE TABLE questions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id  UUID NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
    content     TEXT NOT NULL,
    explanation TEXT,
    difficulty  VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    image_url   TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT ck_questions_difficulty CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
    CONSTRAINT ck_questions_status CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    CONSTRAINT uq_questions_id_chapter UNIQUE (id, chapter_id)
);

CREATE TABLE question_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    label       CHAR(1) NOT NULL,
    content     TEXT NOT NULL,
    is_correct  BOOLEAN NOT NULL DEFAULT FALSE,
    display_order SMALLINT NOT NULL,
    CONSTRAINT ck_question_option_label CHECK (label IN ('A','B','C','D')),
    CONSTRAINT ck_question_option_order CHECK (display_order BETWEEN 1 AND 4),
    CONSTRAINT uq_question_option_label UNIQUE (question_id, label),
    CONSTRAINT uq_question_option_order UNIQUE (question_id, display_order),
    CONSTRAINT uq_question_option_id_question UNIQUE (id, question_id)
);

-- ---------- 5. HOME PRACTICE ----------

CREATE TABLE practice_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL,
    teacher_id      UUID NOT NULL,
    chapter_id      UUID NOT NULL,
    mode            VARCHAR(20) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    total_questions INTEGER NOT NULL DEFAULT 0,
    correct_count   INTEGER NOT NULL DEFAULT 0,
    wrong_count     INTEGER NOT NULL DEFAULT 0,
    score           NUMERIC(5,2),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_practice_student_owner
        FOREIGN KEY (student_id, teacher_id)
        REFERENCES users(id, created_by_teacher_id) ON DELETE RESTRICT,
    CONSTRAINT fk_practice_chapter_owner
        FOREIGN KEY (chapter_id, teacher_id)
        REFERENCES chapters(id, teacher_id) ON DELETE RESTRICT,
    CONSTRAINT ck_practice_mode CHECK (mode IN ('PRACTICE','TEST')),
    CONSTRAINT ck_practice_status CHECK (status IN ('IN_PROGRESS','SUBMITTED')),
    CONSTRAINT ck_practice_counts CHECK (
        total_questions >= 0 AND correct_count >= 0 AND wrong_count >= 0
    ),
    CONSTRAINT ck_practice_score CHECK (score IS NULL OR score BETWEEN 0 AND 10)
);

CREATE TABLE practice_answers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practice_attempt_id UUID NOT NULL REFERENCES practice_attempts(id) ON DELETE CASCADE,
    question_id         UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    selected_option_id  UUID,
    is_correct          BOOLEAN,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_practice_answer_question UNIQUE (practice_attempt_id, question_id),
    CONSTRAINT fk_practice_selected_option
        FOREIGN KEY (selected_option_id, question_id)
        REFERENCES question_options(id, question_id) ON DELETE RESTRICT
);

-- ---------- 6. EXAMINATION ----------

CREATE TABLE exams (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    chapter_id       UUID NOT NULL,
    name             VARCHAR(255) NOT NULL,
    description      TEXT,
    question_count   SMALLINT NOT NULL DEFAULT 10,
    duration_minutes INTEGER NOT NULL,
    start_at         TIMESTAMPTZ,
    end_at           TIMESTAMPTZ,
    status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    opened_at        TIMESTAMPTZ,
    closed_at        TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_exam_chapter_owner
        FOREIGN KEY (chapter_id, teacher_id)
        REFERENCES chapters(id, teacher_id) ON DELETE RESTRICT,
    CONSTRAINT ck_exam_question_count CHECK (question_count = 10),
    CONSTRAINT ck_exam_duration CHECK (duration_minutes > 0),
    CONSTRAINT ck_exam_time_window CHECK (
        start_at IS NULL OR end_at IS NULL OR end_at > start_at
    ),
    CONSTRAINT ck_exam_status CHECK (
        status IN ('DRAFT','SCHEDULED','ACTIVE','CLOSED','CANCELLED')
    ),
    CONSTRAINT uq_exams_id_teacher UNIQUE (id, teacher_id)
);

CREATE TABLE exam_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id     UUID NOT NULL,
    teacher_id  UUID NOT NULL,
    student_id  UUID NOT NULL,
    granted_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status      VARCHAR(20) NOT NULL DEFAULT 'GRANTED',
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ,
    CONSTRAINT fk_permission_exam_owner
        FOREIGN KEY (exam_id, teacher_id)
        REFERENCES exams(id, teacher_id) ON DELETE CASCADE,
    CONSTRAINT fk_permission_student_owner
        FOREIGN KEY (student_id, teacher_id)
        REFERENCES users(id, created_by_teacher_id) ON DELETE RESTRICT,
    CONSTRAINT uq_exam_permission UNIQUE (exam_id, student_id),
    CONSTRAINT ck_exam_permission_status CHECK (status IN ('GRANTED','REVOKED'))
);

CREATE TABLE exam_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID NOT NULL,
    student_id      UUID NOT NULL,
    teacher_id      UUID NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    total_questions SMALLINT NOT NULL DEFAULT 10,
    correct_count   SMALLINT NOT NULL DEFAULT 0,
    wrong_count     SMALLINT NOT NULL DEFAULT 0,
    score           NUMERIC(5,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_attempt_exam_owner
        FOREIGN KEY (exam_id, teacher_id)
        REFERENCES exams(id, teacher_id) ON DELETE RESTRICT,
    CONSTRAINT fk_attempt_student_owner
        FOREIGN KEY (student_id, teacher_id)
        REFERENCES users(id, created_by_teacher_id) ON DELETE RESTRICT,
    CONSTRAINT uq_exam_attempt_student UNIQUE (exam_id, student_id),
    CONSTRAINT uq_exam_attempt_id_exam UNIQUE (id, exam_id),
    CONSTRAINT ck_exam_attempt_status CHECK (
        status IN ('IN_PROGRESS','SUBMITTED','AUTO_SUBMITTED')
    ),
    CONSTRAINT ck_exam_attempt_question_count CHECK (total_questions = 10),
    CONSTRAINT ck_exam_attempt_counts CHECK (
        correct_count BETWEEN 0 AND 10 AND wrong_count BETWEEN 0 AND 10
    ),
    CONSTRAINT ck_exam_attempt_score CHECK (score IS NULL OR score BETWEEN 0 AND 10),
    CONSTRAINT ck_exam_attempt_time CHECK (expires_at > started_at),
    CONSTRAINT ck_exam_attempt_submission CHECK (
        (status = 'IN_PROGRESS' AND submitted_at IS NULL)
        OR
        (status IN ('SUBMITTED','AUTO_SUBMITTED') AND submitted_at IS NOT NULL)
    )
);

-- Immutable question snapshot for each student's attempt.
CREATE TABLE exam_attempt_questions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_attempt_id     UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    source_question_id  UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    question_snapshot   JSONB NOT NULL,
    display_order       SMALLINT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attempt_question_source UNIQUE (exam_attempt_id, source_question_id),
    CONSTRAINT uq_attempt_question_order UNIQUE (exam_attempt_id, display_order),
    CONSTRAINT uq_attempt_question_id_attempt UNIQUE (id, exam_attempt_id),
    CONSTRAINT ck_attempt_question_order CHECK (display_order BETWEEN 1 AND 10),
    CONSTRAINT ck_question_snapshot_object CHECK (jsonb_typeof(question_snapshot) = 'object')
);

-- Four option snapshots per question, including the correct flag.
-- Correctness is never returned by the in-exam API.
CREATE TABLE exam_attempt_options (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_attempt_question_id  UUID NOT NULL
        REFERENCES exam_attempt_questions(id) ON DELETE CASCADE,
    source_option_id          UUID REFERENCES question_options(id) ON DELETE SET NULL,
    label                     CHAR(1) NOT NULL,
    content                   TEXT NOT NULL,
    is_correct                BOOLEAN NOT NULL,
    display_order             SMALLINT NOT NULL,
    CONSTRAINT ck_attempt_option_label CHECK (label IN ('A','B','C','D')),
    CONSTRAINT ck_attempt_option_order CHECK (display_order BETWEEN 1 AND 4),
    CONSTRAINT uq_attempt_option_label UNIQUE (exam_attempt_question_id, label),
    CONSTRAINT uq_attempt_option_order UNIQUE (exam_attempt_question_id, display_order),
    CONSTRAINT uq_attempt_option_id_question UNIQUE (id, exam_attempt_question_id)
);

CREATE TABLE exam_answers (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_attempt_question_id  UUID NOT NULL UNIQUE
        REFERENCES exam_attempt_questions(id) ON DELETE CASCADE,
    selected_option_id        UUID,
    is_correct                BOOLEAN,
    answered_at               TIMESTAMPTZ,
    CONSTRAINT fk_exam_answer_option
        FOREIGN KEY (selected_option_id, exam_attempt_question_id)
        REFERENCES exam_attempt_options(id, exam_attempt_question_id)
        ON DELETE RESTRICT
);

-- ---------- 7. AUDIT ----------

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   UUID,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 8. INDEXES ----------

-- Users
CREATE INDEX ix_users_role_active ON users(role_id, is_active)
    WHERE deleted_at IS NULL;
CREATE INDEX ix_users_teacher_owner ON users(created_by_teacher_id)
    WHERE created_by_teacher_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_users_grade ON users(grade_id)
    WHERE grade_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_users_full_name ON users USING GIN (to_tsvector('simple', full_name));

-- Refresh tokens
CREATE INDEX ix_refresh_tokens_user_expiry ON refresh_tokens(user_id, expires_at);

-- Chapters
CREATE INDEX ix_chapters_teacher_grade_subject
    ON chapters(teacher_id, grade_id, subject_id)
    WHERE deleted_at IS NULL;
CREATE INDEX ix_chapters_published
    ON chapters(grade_id, subject_id, teacher_id)
    WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

-- Questions
CREATE INDEX ix_questions_chapter_status
    ON questions(chapter_id, status)
    WHERE deleted_at IS NULL;
CREATE INDEX ix_questions_chapter_difficulty
    ON questions(chapter_id, difficulty)
    WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

-- Practice
CREATE INDEX ix_practice_student_created
    ON practice_attempts(student_id, created_at DESC);
CREATE INDEX ix_practice_chapter
    ON practice_attempts(chapter_id, created_at DESC);
CREATE INDEX ix_practice_answers_attempt
    ON practice_answers(practice_attempt_id);

-- Exams
CREATE INDEX ix_exams_teacher_status_start
    ON exams(teacher_id, status, start_at DESC);
CREATE INDEX ix_exams_chapter
    ON exams(chapter_id, created_at DESC);

-- Permissions
CREATE INDEX ix_exam_permissions_student_status
    ON exam_permissions(student_id, status, exam_id);
CREATE INDEX ix_exam_permissions_exam_status
    ON exam_permissions(exam_id, status);

-- Attempts
CREATE INDEX ix_exam_attempts_student_started
    ON exam_attempts(student_id, started_at DESC);
CREATE INDEX ix_exam_attempts_exam_status
    ON exam_attempts(exam_id, status);
CREATE INDEX ix_exam_attempts_teacher_exam
    ON exam_attempts(teacher_id, exam_id);

-- Snapshots and answers
CREATE INDEX ix_attempt_questions_attempt_order
    ON exam_attempt_questions(exam_attempt_id, display_order);
CREATE INDEX ix_attempt_options_question_order
    ON exam_attempt_options(exam_attempt_question_id, display_order);
CREATE INDEX ix_audit_logs_user_created
    ON audit_logs(user_id, created_at DESC);
CREATE INDEX ix_audit_logs_entity
    ON audit_logs(entity_type, entity_id, created_at DESC);

-- ---------- 9. UPDATED_AT TRIGGER ----------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subjects_updated_at
BEFORE UPDATE ON subjects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chapters_updated_at
BEFORE UPDATE ON chapters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chapter_contents_updated_at
BEFORE UPDATE ON chapter_contents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_questions_updated_at
BEFORE UPDATE ON questions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_exams_updated_at
BEFORE UPDATE ON exams
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 10. DEFERRED VALIDATION TRIGGERS ----------
-- Validate published questions at transaction commit.
-- This permits inserting/updating all four options in one transaction.

CREATE OR REPLACE FUNCTION validate_published_question(p_question_id UUID)
RETURNS VOID AS $$
DECLARE
    v_status TEXT;
    v_count INTEGER;
    v_correct INTEGER;
BEGIN
    SELECT status INTO v_status
    FROM questions
    WHERE id = p_question_id;

    IF NOT FOUND OR v_status <> 'PUBLISHED' THEN
        RETURN;
    END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct)
    INTO v_count, v_correct
    FROM question_options
    WHERE question_id = p_question_id;

    IF v_count <> 4 OR v_correct <> 1 THEN
        RAISE EXCEPTION
            'Published question % must have exactly 4 options and exactly 1 correct option',
            p_question_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_question_options_constraint()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM validate_published_question(OLD.question_id);
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM validate_published_question(NEW.question_id);
        IF OLD.question_id <> NEW.question_id THEN
            PERFORM validate_published_question(OLD.question_id);
        END IF;
    ELSE
        PERFORM validate_published_question(NEW.question_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ctr_question_options_valid
AFTER INSERT OR UPDATE OR DELETE ON question_options
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_options_constraint();

CREATE OR REPLACE FUNCTION check_question_publish_constraint()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM validate_published_question(NEW.id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ctr_question_publish_valid
AFTER INSERT OR UPDATE ON questions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_question_publish_constraint();

-- Validate that a completed exam attempt has exactly 10 questions
-- and exactly 4 options / exactly 1 correct answer in each snapshot.
CREATE OR REPLACE FUNCTION validate_exam_attempt_snapshot(p_attempt_id UUID)
RETURNS VOID AS $$
DECLARE
    v_attempt_status TEXT;
    v_question_count INTEGER;
    v_bad_questions INTEGER;
BEGIN
    SELECT status INTO v_attempt_status
    FROM exam_attempts
    WHERE id = p_attempt_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_question_count
    FROM exam_attempt_questions
    WHERE exam_attempt_id = p_attempt_id;

    IF v_question_count <> 10 THEN
        RAISE EXCEPTION 'Exam attempt % must contain exactly 10 questions', p_attempt_id;
    END IF;

    SELECT COUNT(*) INTO v_bad_questions
    FROM (
        SELECT q.id
        FROM exam_attempt_questions q
        LEFT JOIN exam_attempt_options o
            ON o.exam_attempt_question_id = q.id
        WHERE q.exam_attempt_id = p_attempt_id
        GROUP BY q.id
        HAVING COUNT(o.id) <> 4
            OR COUNT(o.id) FILTER (WHERE o.is_correct) <> 1
    ) invalid;

    IF v_bad_questions > 0 THEN
        RAISE EXCEPTION
            'Exam attempt % contains question snapshots without exactly 4 options and 1 correct option',
            p_attempt_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_attempt_snapshot_constraint()
RETURNS TRIGGER AS $$
DECLARE
    v_attempt_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'exam_attempts' THEN
        v_attempt_id := NEW.id;
    ELSIF TG_TABLE_NAME = 'exam_attempt_questions' THEN
        v_attempt_id := COALESCE(NEW.exam_attempt_id, OLD.exam_attempt_id);
    ELSE
        SELECT exam_attempt_id INTO v_attempt_id
        FROM exam_attempt_questions
        WHERE id = COALESCE(NEW.exam_attempt_question_id, OLD.exam_attempt_question_id);
    END IF;

    IF v_attempt_id IS NOT NULL THEN
        PERFORM validate_exam_attempt_snapshot(v_attempt_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ctr_attempt_valid_on_status
AFTER INSERT OR UPDATE ON exam_attempts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_attempt_snapshot_constraint();

CREATE CONSTRAINT TRIGGER ctr_attempt_questions_valid
AFTER INSERT OR UPDATE OR DELETE ON exam_attempt_questions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_attempt_snapshot_constraint();

CREATE CONSTRAINT TRIGGER ctr_attempt_options_valid
AFTER INSERT OR UPDATE OR DELETE ON exam_attempt_options
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_attempt_snapshot_constraint();

-- ---------- 11. SEED DATA ----------

INSERT INTO roles (code, name, description) VALUES
('ADMIN',   'Administrator', 'System administrator'),
('TEACHER', 'Teacher',       'Teacher account'),
('STUDENT', 'Student',       'Student account');

INSERT INTO grades (code, name, display_order) VALUES
('GRADE_10', 'Lớp 10', 1),
('GRADE_11', 'Lớp 11', 2),
('GRADE_12', 'Lớp 12', 3);

INSERT INTO subjects (code, name, description) VALUES
('MATH', 'Toán', 'Môn Toán học'),
('PHYSICS', 'Vật lý', 'Môn Vật lý'),
('CHEMISTRY', 'Hóa học', 'Môn Hóa học'),
('BIOLOGY', 'Sinh học', 'Môn Sinh học'),
('LITERATURE', 'Ngữ văn', 'Môn Ngữ văn'),
('ENGLISH', 'Tiếng Anh', 'Môn Tiếng Anh'),
('HISTORY', 'Lịch sử', 'Môn Lịch sử'),
('GEOGRAPHY', 'Địa lý', 'Môn Địa lý');

COMMIT;

-- ============================================================
-- END OF SCHEMA
-- ============================================================

-- IMPORTANT IMPLEMENTATION NOTES:
-- A. Create Teacher/Admin users through a secure application bootstrap
--    process. Never seed a production password in this file.
-- B. To create a Student, set role_id=STUDENT and
--    created_by_teacher_id=current teacher ID.
-- C. Create ExamAttempt + 10 ExamAttemptQuestions + 40
--    ExamAttemptOptions in one DB transaction.
-- D. The exam-start endpoint must be idempotent and handle a concurrent
--    UNIQUE (exam_id, student_id) conflict by returning the existing attempt.
-- E. Only return option id/label/content to the student during the exam.
--    Never serialize is_correct or question_snapshot wholesale.
-- F. On submit, calculate correctness from exam_attempt_options.is_correct
--    inside a transaction, then set submitted_at/status/score.
-- G. Do not hard-delete questions/options used in historical attempts.
-- H. A DB trigger validates published question option counts at commit.
--    Application authorization is still required for all ownership checks.
