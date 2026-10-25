-- ============================================================================
-- CampusEats Assignment 7: GraphQL Menu Service
-- Database Schema and Seed Data
-- ============================================================================

-- Create database if it does not already exist
CREATE DATABASE IF NOT EXISTS campuseats_graphql;
USE campuseats_graphql;

-- Drop table if it exists to ensure idempotent execution
DROP TABLE IF EXISTS dishes;

-- Create dishes table
CREATE TABLE dishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed rows (4 realistic CampusEats dishes)
INSERT INTO dishes (name, price, available) VALUES
  ('Paneer Butter Masala', 180.00, TRUE),
  ('Masala Dosa', 80.00, TRUE),
  ('Veg Hakka Noodles', 120.00, TRUE),
  ('Cold Coffee with Ice Cream', 70.00, FALSE);
