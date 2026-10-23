-- ============================================================
-- Tempo — Appointment & Reminder System
-- MySQL / MariaDB schema for XAMPP + phpMyAdmin
--
-- Import this file in phpMyAdmin (Import tab) or run:
--   mysql -u root -p < database.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS appointment_reminder_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE appointment_reminder_system;

-- ------------------------------------------------------------
-- Users
-- Tempo is a single-workspace local app. A default owner is
-- created below so appointments and reminders always belong to
-- a real user record. No passwords are stored.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Per-user preferences
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_settings (
  user_id VARCHAR(40) NOT NULL,
  default_reminder INT NULL,
  default_duration INT NOT NULL DEFAULT 45,
  notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Clients
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id VARCHAR(40) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  company VARCHAR(120) NOT NULL DEFAULT '',
  email VARCHAR(160) NOT NULL DEFAULT '',
  phone VARCHAR(60) NOT NULL DEFAULT '',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clients_user (user_id),
  KEY idx_clients_user_name (user_id, name),
  CONSTRAINT fk_clients_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Appointments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(40) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  client_id VARCHAR(40) NULL,
  title VARCHAR(160) NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 45,
  status ENUM('scheduled', 'confirmed', 'completed', 'cancelled')
    NOT NULL DEFAULT 'scheduled',
  reminder_minutes INT NULL,
  location VARCHAR(240) NOT NULL DEFAULT '',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointments_user_date (user_id, appointment_date, start_time),
  KEY idx_appointments_status (user_id, status),
  KEY idx_appointments_client (client_id),
  CONSTRAINT fk_appointments_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_appointments_client
    FOREIGN KEY (client_id) REFERENCES clients (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Reminders
-- One scheduled reminder per appointment. The backend keeps
-- this table in sync with appointments.reminder_minutes, and
-- exposes CRUD endpoints for direct reminder management.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  appointment_id VARCHAR(40) NOT NULL,
  minutes_before INT NOT NULL,
  remind_at DATETIME NOT NULL,
  status ENUM('pending', 'sent', 'snoozed', 'dismissed')
    NOT NULL DEFAULT 'pending',
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reminders_appointment (appointment_id),
  KEY idx_reminders_user_time (user_id, remind_at),
  KEY idx_reminders_status (user_id, status),
  CONSTRAINT fk_reminders_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reminders_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- In-app notifications (the bell menu)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  appointment_id VARCHAR(40) NULL,
  title VARCHAR(180) NOT NULL,
  body VARCHAR(500) NOT NULL DEFAULT '',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_created (user_id, created_at),
  KEY idx_notifications_appointment (appointment_id),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notifications_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Default workspace owner and settings
-- ------------------------------------------------------------
INSERT INTO users (id, name, email)
VALUES ('usr_default', 'Tempo User', 'owner@tempo.local')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO user_settings (user_id, default_reminder, default_duration, notifications_enabled)
VALUES ('usr_default', 30, 45, 1)
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);
