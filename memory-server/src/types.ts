// =============================================================================
// types.ts - TypeScript Type Definitions
// =============================================================================

export interface Memory {
  id: number;
  category: string;
  title: string;
  content: string;
  tags: string | null;
  project: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryInput {
  category: string;
  title: string;
  content: string;
  tags?: string[];
  project?: string;
}

export interface SearchParams {
  query: string;
  category?: string;
  limit?: number;
}

export interface UpdateParams {
  id: number;
  content?: string;
  tags?: string[];
}

export type MemoryCategory =
  | 'bug_fix'
  | 'lesson'
  | 'decision'
  | 'context'
  | 'api'
  | 'config'
  | 'pattern';

export const VALID_CATEGORIES: MemoryCategory[] = [
  'bug_fix',
  'lesson',
  'decision',
  'context',
  'api',
  'config',
  'pattern'
];
