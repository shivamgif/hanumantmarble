-- Stock Management Database Schema (Neon PostgreSQL)
-- Run this after DATABASE_URL is configured and db:setup is completed

-- ====== INVENTORY TABLES ======

-- Categories for organizing stock items
CREATE TABLE IF NOT EXISTS stock_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  nameHi VARCHAR(255),
  description TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main inventory items table
CREATE TABLE IF NOT EXISTS stock_items (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  nameHi VARCHAR(255),
  categoryId INT REFERENCES stock_categories(id),
  description TEXT,
  descriptionHi TEXT,
  
  -- Stock levels
  quantity INT NOT NULL DEFAULT 0,
  reorderLevel INT DEFAULT 10,
  maximumLevel INT DEFAULT 100,
  unit VARCHAR(20) DEFAULT 'pc',
  
  -- Cost and pricing
  costPrice DECIMAL(10, 2),
  sellingPrice DECIMAL(10, 2),
  
  -- Status and dates
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Storage locations/warehouses
CREATE TABLE IF NOT EXISTS stock_locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock movement tracking (inventory in/out)
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  itemId INT NOT NULL REFERENCES stock_items(id),
  locationId INT REFERENCES stock_locations(id),
  
  -- Movement details
  type VARCHAR(50) NOT NULL CHECK (type IN ('purchase', 'sale', 'adjustment', 'transfer', 'damage', 'return')),
  quantity INT NOT NULL,
  reference VARCHAR(100), -- PO number, invoice, etc.
  notes TEXT,
  
  -- Who and when
  createdBy VARCHAR(255) NOT NULL, -- Auth0 email
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====== AUDIT & LOGGING ======

-- Comprehensive audit log for compliance/tracking
CREATE TABLE IF NOT EXISTS stock_audit_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'
  entityType VARCHAR(50) NOT NULL, -- 'item', 'movement', 'category', 'location'
  entityId INT,
  
  -- Who and when
  userId VARCHAR(255) NOT NULL, -- Auth0 sub
  userEmail VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- What changed
  changes JSONB, -- {old: {...}, new: {...}}
  details TEXT,
  
  -- Security tracking
  ipAddress VARCHAR(50),
  userAgent TEXT
);

-- ====== INDEXES FOR PERFORMANCE ======

CREATE INDEX IF NOT EXISTS idx_stock_items_categoryId ON stock_items(categoryId);
CREATE INDEX IF NOT EXISTS idx_stock_items_sku ON stock_items(sku);
CREATE INDEX IF NOT EXISTS idx_stock_movements_itemId ON stock_movements(itemId);
CREATE INDEX IF NOT EXISTS idx_stock_movements_createdAt ON stock_movements(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_stock_audit_logs_timestamp ON stock_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stock_audit_logs_userEmail ON stock_audit_logs(userEmail);
CREATE INDEX IF NOT EXISTS idx_stock_audit_logs_action ON stock_audit_logs(action);
