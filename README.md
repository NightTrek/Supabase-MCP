# Supabase MCP Server

A Model Context Protocol (MCP) server for interacting with Supabase databases.

## Features

- Query tables with schema selection and where clause support
- Generate TypeScript types for database schemas

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

3. Build the server:
```bash
npm run build
```

## Usage

Add the server to your MCP settings file:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "node",
      "args": ["/path/to/supabase-server/build/index.js"],
      "env": {
        "SUPABASE_URL": "your_supabase_url",
        "SUPABASE_KEY": "your_supabase_key"
      }
    }
  }
}
```
