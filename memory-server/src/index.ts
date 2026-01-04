// =============================================================================
// index.ts - MCP Memory Server Main Entry Point
// =============================================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

import { TOOLS } from './tools.js';
import {
  initDatabase,
  insertMemory,
  searchMemories,
  getRecentMemories,
  getMemoryById,
  updateMemory,
  deleteMemory,
  getStats,
} from './database.js';
import { VALID_CATEGORIES } from './types.js';

// =============================================================================
// Zod Schemas
// =============================================================================

const RememberKnowledgeSchema = z.object({
  category: z.enum(VALID_CATEGORIES as [string, ...string[]]),
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

const SearchMemorySchema = z.object({
  query: z.string().min(1),
  category: z.enum(VALID_CATEGORIES as [string, ...string[]]).optional(),
  limit: z.number().min(1).max(50).optional(),
});

const GetRecentSchema = z.object({
  limit: z.number().min(1).max(50).optional(),
  category: z.enum(VALID_CATEGORIES as [string, ...string[]]).optional(),
});

const UpdateMemorySchema = z.object({
  id: z.number(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const DeleteMemorySchema = z.object({
  id: z.number(),
});

// =============================================================================
// Tool Handlers
// =============================================================================

function handleRememberKnowledge(args: unknown): string {
  const parsed = RememberKnowledgeSchema.parse(args);

  const id = insertMemory({
    category: parsed.category,
    title: parsed.title,
    content: parsed.content,
    tags: parsed.tags,
  });

  console.error(`[Memory] Saved: "${parsed.title}" (ID: ${id})`);

  return JSON.stringify({
    success: true,
    id,
    message: `บันทึกความรู้สำเร็จ (ID: ${id})`,
    category: parsed.category,
    title: parsed.title,
  });
}

function handleSearchMemory(args: unknown): string {
  const parsed = SearchMemorySchema.parse(args);

  const results = searchMemories({
    query: parsed.query,
    category: parsed.category,
    limit: parsed.limit || 5,
  });

  console.error(`[Memory] Search "${parsed.query}": found ${results.length} results`);

  // Format results with parsed tags
  const formattedResults = results.map(m => ({
    id: m.id,
    category: m.category,
    title: m.title,
    content: m.content,
    tags: m.tags ? m.tags.split(',').filter(Boolean) : [],
    created_at: m.created_at,
  }));

  return JSON.stringify({
    success: true,
    query: parsed.query,
    count: formattedResults.length,
    memories: formattedResults,
  });
}

function handleGetProjectRules(): string {
  // Look for CLAUDE.md in parent directory
  const possiblePaths = [
    path.resolve(process.cwd(), '..', 'CLAUDE.md'),
    path.resolve(process.cwd(), 'CLAUDE.md'),
    path.resolve(process.cwd(), '..', '..', 'CLAUDE.md'),
  ];

  for (const claudePath of possiblePaths) {
    try {
      if (fs.existsSync(claudePath)) {
        const content = fs.readFileSync(claudePath, 'utf-8');
        console.error(`[Memory] Read rules from: ${claudePath}`);

        return JSON.stringify({
          success: true,
          path: claudePath,
          content,
        });
      }
    } catch (error) {
      // Continue to next path
    }
  }

  return JSON.stringify({
    success: false,
    error: 'CLAUDE.md not found',
    searchedPaths: possiblePaths,
  });
}

function handleGetRecentMemories(args: unknown): string {
  const parsed = GetRecentSchema.parse(args);

  const results = getRecentMemories(parsed.limit || 10, parsed.category);

  console.error(`[Memory] Get recent: ${results.length} results`);

  const formattedResults = results.map(m => ({
    id: m.id,
    category: m.category,
    title: m.title,
    content: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
    tags: m.tags ? m.tags.split(',').filter(Boolean) : [],
    created_at: m.created_at,
  }));


  const stats = getStats();

  return JSON.stringify({
    success: true,
    count: formattedResults.length,
    stats,
    memories: formattedResults,
  });
}

function handleUpdateMemory(args: unknown): string {
  const parsed = UpdateMemorySchema.parse(args);

  const existing = getMemoryById(parsed.id);
  if (!existing) {
    return JSON.stringify({
      success: false,
      error: `Memory ID ${parsed.id} not found`,
    });
  }

  const updated = updateMemory({
    id: parsed.id,
    content: parsed.content,
    tags: parsed.tags,
  });

  if (updated) {
    console.error(`[Memory] Updated ID: ${parsed.id}`);
    return JSON.stringify({
      success: true,
      message: `อัปเดตความจำ ID ${parsed.id} สำเร็จ`,
    });
  }

  return JSON.stringify({
    success: false,
    error: 'No changes made',
  });
}

function handleDeleteMemory(args: unknown): string {
  const parsed = DeleteMemorySchema.parse(args);

  const existing = getMemoryById(parsed.id);
  if (!existing) {
    return JSON.stringify({
      success: false,
      error: `Memory ID ${parsed.id} not found`,
    });
  }

  const deleted = deleteMemory(parsed.id);

  if (deleted) {
    console.error(`[Memory] Deleted ID: ${parsed.id}`);
    return JSON.stringify({
      success: true,
      message: `ลบความจำ ID ${parsed.id} สำเร็จ`,
      deleted: {
        id: existing.id,
        title: existing.title,
      },
    });
  }

  return JSON.stringify({
    success: false,
    error: 'Failed to delete',
  });
}

// =============================================================================
// MCP Server Setup
// =============================================================================

const server = new Server(
  {
    name: 'memory-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[Memory] Tool called: ${name}`);

  try {
    let result: string;

    switch (name) {
      case 'remember_knowledge':
        result = handleRememberKnowledge(args);
        break;
      case 'search_memory':
        result = handleSearchMemory(args);
        break;
      case 'get_project_rules':
        result = handleGetProjectRules();
        break;
      case 'get_recent_memories':
        result = handleGetRecentMemories(args);
        break;
      case 'update_memory':
        result = handleUpdateMemory(args);
        break;
      case 'delete_memory':
        result = handleDeleteMemory(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Memory] Error: ${errorMessage}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: errorMessage }),
        },
      ],
      isError: true,
    };
  }
});

// =============================================================================
// Start Server
// =============================================================================

async function main() {
  console.error('╔════════════════════════════════════════╗');
  console.error('║     🧠 MCP Memory Server v1.0.0        ║');
  console.error('╚════════════════════════════════════════╝');
  console.error('');

  await initDatabase();

  const stats = getStats();
  console.error(`[Memory] Total memories: ${stats.total}`);
  console.error(`[Memory] Categories: ${JSON.stringify(stats.byCategory)}`);
  console.error('');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Memory] Server running on stdio');
}

main().catch((error) => {
  console.error('[Memory] Fatal error:', error);
  process.exit(1);
});
