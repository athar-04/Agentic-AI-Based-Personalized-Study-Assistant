-- PostgreSQL initialization script
-- Creates extensions and initial setup

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create enum types
CREATE TYPE user_role AS ENUM ('STUDENT', 'ADMIN', 'INSTRUCTOR');
CREATE TYPE plan_status AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE session_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'RESCHEDULED');
CREATE TYPE quiz_difficulty AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
CREATE TYPE question_type AS ENUM ('MCQ', 'TRUE_FALSE', 'FILL_IN_BLANK', 'SHORT_ANSWER');
CREATE TYPE revision_status AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'OVERDUE');
