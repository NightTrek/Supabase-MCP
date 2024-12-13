#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_KEY environment variables are required"
  );
}

// After the check above, we can safely assert these are defined
const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_KEY;

type WhereOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is";

interface QueryTableArgs {
  schema?: string;
  table: string;
  select?: string;
  where?: {
    column: string;
    operator: WhereOperator;
    value: any;
  }[];
}

interface TypeGenArgs {
  schema?: string;
}

const isValidQueryTableArgs = (args: any): args is QueryTableArgs =>
  typeof args === "object" &&
  args !== null &&
  typeof args.table === "string" &&
  (args.schema === undefined || typeof args.schema === "string") &&
  (args.select === undefined || typeof args.select === "string") &&
  (args.where === undefined ||
    (Array.isArray(args.where) &&
      args.where.every(
        (w: any) =>
          typeof w === "object" &&
          w !== null &&
          typeof w.column === "string" &&
          typeof w.operator === "string" &&
          [
            "eq",
            "neq",
            "gt",
            "gte",
            "lt",
            "lte",
            "like",
            "ilike",
            "is",
          ].includes(w.operator)
      )));

const isValidTypeGenArgs = (args: any): args is TypeGenArgs =>
  typeof args === "object" &&
  args !== null &&
  (args.schema === undefined || typeof args.schema === "string");

class SupabaseServer {
  private server: Server;
  private supabase;
  private projectRef?: string;

  constructor() {
    this.server = new Server(
      {
        name: "supabase-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Create client with service role key
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Extract project ref from URL if not local
    if (!supabaseUrl.includes('localhost')) {
      const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match) {
        this.projectRef = match[1];
      }
    }

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private applyWhereCondition(
    query: any,
    condition: { column: string; operator: WhereOperator; value: any }
  ): any {
    switch (condition.operator) {
      case "eq":
        return query.eq(condition.column, condition.value);
      case "neq":
        return query.neq(condition.column, condition.value);
      case "gt":
        return query.gt(condition.column, condition.value);
      case "gte":
        return query.gte(condition.column, condition.value);
      case "lt":
        return query.lt(condition.column, condition.value);
      case "lte":
        return query.lte(condition.column, condition.value);
      case "like":
        return query.like(condition.column, condition.value);
      case "ilike":
        return query.ilike(condition.column, condition.value);
      case "is":
        return query.is(condition.column, condition.value);
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unsupported operator: ${condition.operator}`
        );
    }
  }

  private async checkSupabaseCLI(): Promise<boolean> {
    try {
      await execAsync('npx supabase --version');
      return true;
    } catch (error) {
      return false;
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "query_table",
          description:
            "Query a specific table with schema selection and where clause support",
          inputSchema: {
            type: "object",
            properties: {
              schema: {
                type: "string",
                description: "Database schema (optional, defaults to public)",
              },
              table: {
                type: "string",
                description: "Name of the table to query",
              },
              select: {
                type: "string",
                description:
                  "Comma-separated list of columns to select (optional, defaults to *)",
              },
              where: {
                type: "array",
                description: "Array of where conditions (optional)",
                items: {
                  type: "object",
                  properties: {
                    column: {
                      type: "string",
                      description: "Column name",
                    },
                    operator: {
                      type: "string",
                      description: "Comparison operator",
                      enum: [
                        "eq",
                        "neq",
                        "gt",
                        "gte",
                        "lt",
                        "lte",
                        "like",
                        "ilike",
                        "is",
                      ],
                    },
                    value: {
                      type: "any",
                      description: "Value to compare against",
                    },
                  },
                  required: ["column", "operator", "value"],
                },
              },
            },
            required: ["table"],
          },
        },
        {
          name: "generate_types",
          description: "Generate TypeScript types for your Supabase database schema",
          inputSchema: {
            type: "object",
            properties: {
              schema: {
                type: "string",
                description: "Database schema (optional, defaults to public)",
              }
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case "query_table": {
            if (!isValidQueryTableArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid query table arguments"
              );
            }

            const {
              schema = "public",
              table,
              select = "*",
              where = [],
            } = request.params.arguments;

            // Start the query builder
            let query = this.supabase
              .schema(schema)
              .from(table)
              .select(select)
              .limit(25);

            // Apply where conditions
            where.forEach((condition) => {
              query = this.applyWhereCondition(query, condition);
            });

            const { data, error } = await query;

            if (error) throw error;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(data, null, 2),
                },
              ],
            };
          }

          case "generate_types": {
            if (!isValidTypeGenArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid type generation arguments"
              );
            }

            const hasSupabaseCLI = await this.checkSupabaseCLI();
            if (!hasSupabaseCLI) {
              throw new McpError(
                ErrorCode.InternalError,
                'Supabase CLI not found. Please install it with: npm install -g supabase'
              );
            }

            const { schema = 'public' } = request.params.arguments;
            
            let command = 'npx supabase gen types typescript';
            if (this.projectRef) {
              command += ` --project-id "${this.projectRef}"`;
            } else {
              command += ' --local';
            }
            command += ` --schema ${schema}`;

            try {
              const { stdout, stderr } = await execAsync(command);
              return {
                content: [
                  {
                    type: "text",
                    text: stdout || stderr || 'No types generated',
                  },
                ],
              };
            } catch (error: any) {
              throw new McpError(
                ErrorCode.InternalError,
                `Failed to generate types: ${error.message}`
              );
            }
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: any) {
        console.error("Error executing tool:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error?.message || "Unknown error occurred"}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Supabase MCP server running on stdio");
  }
}

const server = new SupabaseServer();
server.run().catch(console.error);
