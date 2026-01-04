// =============================================================================
// tools.ts - MCP Tool Definitions
// =============================================================================

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'remember_knowledge',
    description: 'บันทึกความรู้ใหม่ลง database (Save new knowledge to memory)',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['bug_fix', 'lesson', 'decision', 'context', 'api', 'config', 'pattern'],
          description: 'หมวดหมู่ของความรู้ (bug_fix, lesson, decision, context, api, config, pattern)',
        },
        title: {
          type: 'string',
          description: 'หัวข้อสั้นๆ อธิบายความรู้นี้',
        },
        content: {
          type: 'string',
          description: 'เนื้อหาละเอียดของความรู้',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags สำหรับค้นหา (optional)',
        },
      },
      required: ['category', 'title', 'content'],
    },
  },
  {
    name: 'search_memory',
    description: 'ค้นหาความรู้จาก database แบบ fuzzy search (Search memories)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'คำค้นหา (จะค้นใน title และ content)',
        },
        category: {
          type: 'string',
          enum: ['bug_fix', 'lesson', 'decision', 'context', 'api', 'config', 'pattern'],
          description: 'กรองตามหมวดหมู่ (optional)',
        },
        limit: {
          type: 'number',
          description: 'จำนวนผลลัพธ์สูงสุด (default: 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_project_rules',
    description: 'อ่านไฟล์ CLAUDE.md เพื่อดูกฎของโปรเจกต์ (Read project rules)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_recent_memories',
    description: 'ดึงความจำล่าสุด (Get recent memories)',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'จำนวนรายการ (default: 10)',
        },
        category: {
          type: 'string',
          enum: ['bug_fix', 'lesson', 'decision', 'context', 'api', 'config', 'pattern'],
          description: 'กรองตามหมวดหมู่ (optional)',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_memory',
    description: 'อัปเดตความจำที่มีอยู่ (Update existing memory)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'ID ของ memory ที่ต้องการแก้ไข',
        },
        content: {
          type: 'string',
          description: 'เนื้อหาใหม่ (optional)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags ใหม่ (optional)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_memory',
    description: 'ลบความจำ (Delete memory)',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'ID ของ memory ที่ต้องการลบ',
        },
      },
      required: ['id'],
    },
  },
];
