export type McpCatalogTool = {
  name: string;
  description: string | null;
  inputSchema?: Record<string, unknown> | null;
};

export function filterMcpTools(tools: McpCatalogTool[], query: string): McpCatalogTool[] {
  const term = query.trim().toLocaleLowerCase();
  return term ? tools.filter(tool =>
    `${tool.name} ${tool.description ?? ""}`.toLocaleLowerCase().includes(term),
  ) : tools;
}
