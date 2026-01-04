# 🧠 MCP Memory Server

> AI Knowledge Management Server using Model Context Protocol

## 📋 Features

| Tool | Description |
|------|-------------|
| `remember_knowledge` | บันทึกความรู้ใหม่ลง database |
| `search_memory` | ค้นหาความรู้แบบ fuzzy search |
| `get_project_rules` | อ่านไฟล์ CLAUDE.md |
| `get_recent_memories` | ดึงความจำล่าสุด |
| `update_memory` | อัปเดตความจำที่มีอยู่ |
| `delete_memory` | ลบความจำ |

---

## 🚀 Quick Start

### Installation

```bash
cd memory-server
npm install
```

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

### Development

```bash
npm run dev
```

---

## 🔌 Connect to Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/memory-server/dist/index.js"]
    }
  }
}
```

### Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

---

## 🐳 Docker

### Build Image

```bash
docker build -t memory-server .
```

### Run Container

```bash
# With persistent data
docker run -v memory-data:/data memory-server

# With custom CLAUDE.md location
docker run -v /path/to/project:/project -v memory-data:/data memory-server
```

---

## 📖 Tool Usage Examples

### 1. remember_knowledge

บันทึกความรู้ใหม่:

```json
{
  "category": "bug_fix",
  "title": "Fix IDOR in slip-templates",
  "content": "Added ensureAccountAccess() check before accessing templates",
  "tags": ["security", "idor", "templates"]
}
```

**Categories:**
- `bug_fix` - การแก้ไข bug
- `lesson` - บทเรียนที่ได้เรียนรู้
- `decision` - การตัดสินใจทางเทคนิค
- `context` - บริบทสำคัญของโปรเจกต์
- `api` - ข้อมูล API
- `config` - การตั้งค่า
- `pattern` - Design patterns

### 2. search_memory

ค้นหาความรู้:

```json
{
  "query": "security vulnerability",
  "category": "bug_fix",
  "limit": 5
}
```

### 3. get_project_rules

อ่านกฎของโปรเจกต์:

```json
{}
```

Returns content of `../CLAUDE.md`

### 4. get_recent_memories

ดูความจำล่าสุด:

```json
{
  "limit": 10,
  "category": "lesson"
}
```

### 5. update_memory

อัปเดตความจำ:

```json
{
  "id": 123,
  "content": "Updated content here",
  "tags": ["new", "tags"]
}
```

### 6. delete_memory

ลบความจำ:

```json
{
  "id": 123
}
```

---

## 🗄️ Database Schema

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  project TEXT DEFAULT 'line-oa',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Database location: `./brain.db` (or `$DB_PATH`)

---

## 📁 Project Structure

```
memory-server/
├── package.json
├── tsconfig.json
├── Dockerfile
├── README.md
├── brain.db          # SQLite database (auto-created)
└── src/
    ├── index.ts      # Main server
    ├── database.ts   # SQLite operations
    ├── tools.ts      # MCP tool definitions
    └── types.ts      # TypeScript types
```

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./brain.db` | Path to SQLite database |

---

*Last updated: 2025-01-04*
