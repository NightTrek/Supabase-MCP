# Supabase MCP Server

A Model Context Protocol (MCP) server for interacting with Supabase databases. This server provides tools for querying tables and generating TypeScript types through the MCP interface.

## Features

- **Query Tables**: Execute queries on any table with support for:
  - Schema selection
  - Column filtering
  - Where clauses with multiple operators
  - Pagination
  - Error handling

- **Type Generation**: Generate TypeScript types for your database:
  - Support for any schema (public, auth, api, etc.)
  - Works with both local and remote Supabase projects
  - Direct output to console
  - Automatic project reference detection

## Prerequisites

1. Node.js (v16 or higher)
2. A Supabase project (either local or hosted)
3. Supabase CLI (for type generation)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/supabase-mcp-server.git
cd supabase-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Install the Supabase CLI (required for type generation):
```bash
# Using npm
npm install -g supabase

# Or using Homebrew on macOS
brew install supabase/tap/supabase
```

## Configuration

1. Get your Supabase credentials:
   - For hosted projects:
     1. Go to your Supabase project dashboard
     2. Navigate to Project Settings > API
     3. Copy the Project URL and service_role key (NOT the anon key)
   
   - For local projects:
     1. Start your local Supabase instance
     2. Use the local URL (typically http://localhost:54321)
     3. Use your local service_role key

2. Configure environment variables:
```bash
# Create a .env file (this will be ignored by git)
echo "SUPABASE_URL=your_project_url
SUPABASE_KEY=your_service_role_key" > .env
```

3. Build the server:
```bash
npm run build
```

## Integration with Claude Desktop

1. Open Claude Desktop settings:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Add the server configuration:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "node",
      "args": ["/absolute/path/to/supabase-mcp-server/build/index.js"],
      "env": {
        "SUPABASE_URL": "your_project_url",
        "SUPABASE_KEY": "your_service_role_key"
      }
    }
  }
}
```

## Integration with VSCode Extension

1. Open VSCode settings:
   - macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
   - Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
   - Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

2. Add the server configuration (same format as Claude Desktop).

## Usage Examples

### Querying Tables

```typescript
// Query with schema selection and where clause
<use_mcp_tool>
<server_name>supabase</server_name>
<tool_name>query_table</tool_name>
<arguments>
{
  "schema": "public",
  "table": "users",
  "select": "id,name,email",
  "where": [
    {
      "column": "is_active",
      "operator": "eq",
      "value": true
    }
  ]
}
</arguments>
</use_mcp_tool>
```

### Generating Types

```typescript
// Generate types for public schema
<use_mcp_tool>
<server_name>supabase</server_name>
<tool_name>generate_types</tool_name>
<arguments>
{
  "schema": "public"
}
</arguments>
</use_mcp_tool>
```

## Available Tools

### query_table
Query a specific table with schema selection and where clause support.

Parameters:
- `schema` (optional): Database schema (defaults to public)
- `table` (required): Name of the table to query
- `select` (optional): Comma-separated list of columns
- `where` (optional): Array of conditions with:
  - `column`: Column name
  - `operator`: One of: eq, neq, gt, gte, lt, lte, like, ilike, is
  - `value`: Value to compare against

### generate_types
Generate TypeScript types for your Supabase database schema.

Parameters:
- `schema` (optional): Database schema (defaults to public)

## Troubleshooting

### Type Generation Issues

1. Ensure Supabase CLI is installed:
```bash
supabase --version
```

2. For local projects:
   - Make sure your local Supabase instance is running
   - Verify your service_role key is correct

3. For hosted projects:
   - Confirm your project ref is correct (extracted from URL)
   - Verify you're using the service_role key, not the anon key

### Query Issues

1. Check your schema and table names
2. Verify column names in select and where clauses
3. Ensure your service_role key has necessary permissions

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

MIT License - see LICENSE file for details
