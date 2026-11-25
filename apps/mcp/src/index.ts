// Pactline MCP Server — exposes procurement specialists to Amber
// Transport: stdio (default) or SSE
// All tools return structured JSON with confidence scores + source citations
// Never makes things up — UNKNOWN when evidence is missing
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "pactline",
  version: "0.1.0",
});

// Tools to be registered (each calls into @pactline/incident-runtime):
// server.tool("analyze_schedule_impact",   ...)
// server.tool("investigate_procurement_issue", ...)
// server.tool("check_compliance",          ...)
// server.tool("find_alternatives",         ...)
// server.tool("evaluate_recovery_options", ...)
// server.tool("get_incident_status",       ...)
// server.tool("submit_approval",           ...)

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Pactline MCP server running on stdio");
