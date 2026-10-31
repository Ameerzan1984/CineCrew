"use client";

import { useState } from "react";
import { filterMcpTools, type McpCatalogTool } from "../lib/mcp-tool-catalog";

export default function McpToolCatalog({ tools, ar }: { tools: McpCatalogTool[]; ar: boolean }) {
  const [query, setQuery] = useState("");
  const visible = filterMcpTools(tools, query);
  return <details className="mcp-catalog">
    <summary>{ar ? "استعراض أدوات MCP ومخططات الإدخال" : "Browse MCP tools and input schemas"}</summary>
    <p className="connection-note">{ar
      ? "تعرض هذه القائمة ما أعلنه الحساب عند آخر فحص. وجود الأداة لا يثبت توفر نموذج أو تكلفة أو صلاحية تنفيذ."
      : "This list contains what the account advertised at its last check. A listing does not verify model access, price, or permission to execute."}</p>
    <label>{ar ? "ابحث في أسماء الأدوات وأوصافها" : "Search tool names and descriptions"}
      <input type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />
    </label>
    <p role="status">{visible.length} / {tools.length}</p>
    {visible.length ? <ul>{visible.map(tool => <li key={tool.name}><details>
      <summary>{tool.name}</summary>
      {tool.description && <p>{tool.description}</p>}
      <strong>{ar ? "مخطط الإدخال المعلن" : "Advertised input schema"}</strong>
      {tool.inputSchema ? <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
        : <p>{ar ? "لم يُحفظ مخطط لهذه الأداة؛ أعد الربط لتحديث البيانات." : "No schema is saved for this tool; reconnect to refresh metadata."}</p>}
    </details></li>)}</ul> : <p>{ar ? "لا توجد أدوات مطابقة." : "No matching tools."}</p>}
  </details>;
}
