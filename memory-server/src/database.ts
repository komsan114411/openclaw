// =============================================================================
// database.ts - SQLite Database Connection & Operations (sql.js)
// =============================================================================

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { Memory, MemoryInput, SearchParams, UpdateParams } from './types.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'brain.db');

let db: SqlJsDatabase | null = null;

function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.error('[Database] Loaded from: ' + DB_PATH);
  } else {
    db = new SQL.Database();
    console.error('[Database] Created new at: ' + DB_PATH);
  }
  db.run('CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT, project TEXT DEFAULT \'line-oa\', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  db.run('CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)');
  db.run('CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project)');
  db.run('CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)');
  saveDatabase();
}

function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function rowsToMemories(result: ReturnType<SqlJsDatabase['exec']>): Memory[] {
  if (!result[0]) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj as unknown as Memory;
  });
}

export function insertMemory(input: MemoryInput): number {
  const database = getDb();
  database.run('INSERT INTO memories (category, title, content, tags, project) VALUES (?, ?, ?, ?, ?)',
    [input.category, input.title, input.content, input.tags ? input.tags.join(',') : null, input.project || 'line-oa']);
  const result = database.exec('SELECT last_insert_rowid() as id');
  const id = (result[0]?.values[0]?.[0] as number) || 0;
  saveDatabase();
  return id;
}

export function searchMemories(params: SearchParams): Memory[] {
  const database = getDb();
  const { query, category, limit = 5 } = params;
  const values: (string | number | null)[] = [];
  let sql = 'SELECT * FROM memories';
  const conditions: string[] = [];
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (searchTerms.length > 0) {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(content) LIKE ?)');
    values.push('%' + searchTerms[0] + '%', '%' + searchTerms[0] + '%');
  }
  if (category) { conditions.push('category = ?'); values.push(category); }
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  values.push(limit);
  return rowsToMemories(database.exec(sql, values));
}

export function getRecentMemories(limit: number = 10, category?: string): Memory[] {
  const database = getDb();
  let sql = 'SELECT * FROM memories';
  const values: (string | number)[] = [];
  if (category) { sql += ' WHERE category = ?'; values.push(category); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  values.push(limit);
  return rowsToMemories(database.exec(sql, values));
}

export function getMemoryById(id: number): Memory | null {
  const database = getDb();
  const result = database.exec('SELECT * FROM memories WHERE id = ?', [id]);
  const memories = rowsToMemories(result);
  return memories[0] || null;
}

export function updateMemory(params: UpdateParams): boolean {
  const database = getDb();
  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: (string | number)[] = [];
  if (params.content !== undefined) { updates.push('content = ?'); values.push(params.content); }
  if (params.tags !== undefined) { updates.push('tags = ?'); values.push(params.tags.join(',')); }
  if (updates.length === 1) return false;
  values.push(params.id);
  database.run('UPDATE memories SET ' + updates.join(', ') + ' WHERE id = ?', values);
  const changes = database.getRowsModified();
  if (changes > 0) saveDatabase();
  return changes > 0;
}

export function deleteMemory(id: number): boolean {
  const database = getDb();
  database.run('DELETE FROM memories WHERE id = ?', [id]);
  const changes = database.getRowsModified();
  if (changes > 0) saveDatabase();
  return changes > 0;
}

export function getStats(): { total: number; byCategory: Record<string, number> } {
  const database = getDb();
  const totalResult = database.exec('SELECT COUNT(*) as count FROM memories');
  const total = (totalResult[0]?.values[0]?.[0] as number) || 0;
  const categoryResult = database.exec('SELECT category, COUNT(*) as count FROM memories GROUP BY category');
  const byCategory: Record<string, number> = {};
  if (categoryResult[0]) {
    categoryResult[0].values.forEach(row => { byCategory[row[0] as string] = row[1] as number; });
  }
  return { total, byCategory };
}
