// =============================================================================
// database.ts - SQLite Database Connection & Operations
// =============================================================================

import Database from 'better-sqlite3';
import * as path from 'path';
import { Memory, MemoryInput, SearchParams, UpdateParams } from './types.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'brain.db');

// Initialize database
const db = new Database(DB_PATH);

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    project TEXT DEFAULT 'line-oa',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
  CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
`);

console.error(`[Database] Initialized at: ${DB_PATH}`);

// =============================================================================
// CRUD Operations
// =============================================================================

export function insertMemory(input: MemoryInput): number {
  const stmt = db.prepare(`
    INSERT INTO memories (category, title, content, tags, project)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    input.category,
    input.title,
    input.content,
    input.tags ? input.tags.join(',') : null,
    input.project || 'line-oa'
  );

  return result.lastInsertRowid as number;
}

export function searchMemories(params: SearchParams): Memory[] {
  const { query, category, limit = 5 } = params;

  // Build WHERE clause
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  // Fuzzy search in title and content
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (searchTerms.length > 0) {
    const termConditions = searchTerms.map(() =>
      `(LOWER(title) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags) LIKE ?)`
    );
    conditions.push(`(${termConditions.join(' AND ')})`);
    searchTerms.forEach(term => {
      const pattern = `%${term}%`;
      values.push(pattern, pattern, pattern);
    });
  }

  // Category filter
  if (category) {
    conditions.push('category = ?');
    values.push(category);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const sql = `
    SELECT * FROM memories
    ${whereClause}
    ORDER BY
      CASE WHEN LOWER(title) LIKE ? THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT ?
  `;

  const firstTerm = searchTerms[0] ? `%${searchTerms[0].toLowerCase()}%` : '%';
  values.push(firstTerm, limit);

  const stmt = db.prepare(sql);
  return stmt.all(...values) as Memory[];
}

export function getRecentMemories(limit: number = 10, category?: string): Memory[] {
  let sql = 'SELECT * FROM memories';
  const values: (string | number)[] = [];

  if (category) {
    sql += ' WHERE category = ?';
    values.push(category);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  values.push(limit);

  const stmt = db.prepare(sql);
  return stmt.all(...values) as Memory[];
}

export function getMemoryById(id: number): Memory | null {
  const stmt = db.prepare('SELECT * FROM memories WHERE id = ?');
  return (stmt.get(id) as Memory) || null;
}

export function updateMemory(params: UpdateParams): boolean {
  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: (string | number)[] = [];

  if (params.content !== undefined) {
    updates.push('content = ?');
    values.push(params.content);
  }

  if (params.tags !== undefined) {
    updates.push('tags = ?');
    values.push(params.tags.join(','));
  }

  if (updates.length === 1) {
    return false; // Nothing to update
  }

  values.push(params.id);

  const sql = `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`;
  const stmt = db.prepare(sql);
  const result = stmt.run(...values);

  return result.changes > 0;
}

export function deleteMemory(id: number): boolean {
  const stmt = db.prepare('DELETE FROM memories WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getStats(): { total: number; byCategory: Record<string, number> } {
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM memories');
  const total = (totalStmt.get() as { count: number }).count;

  const categoryStmt = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM memories
    GROUP BY category
  `);
  const categories = categoryStmt.all() as { category: string; count: number }[];

  const byCategory: Record<string, number> = {};
  categories.forEach(row => {
    byCategory[row.category] = row.count;
  });

  return { total, byCategory };
}
