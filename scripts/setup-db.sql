-- AIReadBook Database Setup
-- Run: mysql -u root -p < scripts/setup-db.sql

CREATE DATABASE IF NOT EXISTS aireadbook
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'aireadbook'@'localhost' IDENTIFIED BY 'aireadbook2024!';
GRANT ALL PRIVILEGES ON aireadbook.* TO 'aireadbook'@'localhost';
FLUSH PRIVILEGES;

SELECT 'Database and user created successfully.' AS status;
