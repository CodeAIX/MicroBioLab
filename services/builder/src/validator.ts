import { parse } from "@babel/parser";

export interface ValidationResult { imports: string[]; warnings: string[] }
export class ValidationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "ValidationError"; }
}

const allowedImports = new Set(["react"]);
const nodeModules = new Set(["fs", "child_process", "net", "tls", "http", "https", "os", "path", "cluster", "worker_threads"]);
const blockedCalls = new Set(["fetch", "eval", "require"]);
const blockedConstructors = new Set(["Function", "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker"]);

type NodeLike = { type?: string; [key: string]: unknown };

export function validateJsx(source: string): ValidationResult {
  let ast: NodeLike;
  try {
    ast = parse(source, { sourceType: "module", plugins: ["jsx"], errorRecovery: false }) as unknown as NodeLike;
  } catch (error) {
    throw new ValidationError("JSX_PARSE_ERROR", `JSX 语法解析失败：${(error as Error).message}`);
  }
  const imports = new Set<string>();
  let defaultExports = 0;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const item = node as NodeLike;
    if (item.type === "ImportDeclaration") {
      const sourceValue = (item.source as { value?: unknown } | undefined)?.value;
      if (typeof sourceValue === "string") {
        imports.add(sourceValue);
        const root = sourceValue.startsWith("node:") ? sourceValue.slice(5).split("/")[0]! : sourceValue.split("/")[0]!;
        if (nodeModules.has(root)) throw new ValidationError("SECURITY_BLOCKED", `禁止导入 Node.js 模块：${sourceValue}`);
        if (!allowedImports.has(sourceValue)) throw new ValidationError("IMPORT_NOT_ALLOWED", `Dependency not allowed: ${sourceValue}`);
      }
    }
    if (item.type === "ExportDefaultDeclaration") {
      defaultExports++;
      const declarationType = (item.declaration as NodeLike | undefined)?.type;
      if (!declarationType || !["FunctionDeclaration", "ClassDeclaration", "Identifier", "ArrowFunctionExpression"].includes(declarationType)) {
        throw new ValidationError("JSX_EXPORT_INVALID", "default export 必须是 React 组件函数、类或组件标识符");
      }
    }
    if (item.type === "ImportExpression" || (item.type === "CallExpression" && (item.callee as NodeLike | undefined)?.type === "Import")) {
      throw new ValidationError("SECURITY_BLOCKED", "禁止使用动态 import()");
    }
    if (item.type === "CallExpression") {
      const callee = item.callee as NodeLike | undefined;
      if (callee?.type === "Identifier" && blockedCalls.has(String(callee.name))) throw new ValidationError("SECURITY_BLOCKED", `禁止调用 ${String(callee.name)}()`);
      if (callee?.type === "MemberExpression") {
        const objectName = String((callee.object as NodeLike | undefined)?.name ?? "");
        const propertyName = String((callee.property as NodeLike | undefined)?.name ?? "");
        if (objectName === "navigator" && ["sendBeacon", "serviceWorker"].includes(propertyName)) throw new ValidationError("SECURITY_BLOCKED", `禁止访问 navigator.${propertyName}`);
        if (["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].includes(propertyName)) throw new ValidationError("SECURITY_BLOCKED", `禁止访问网络 API：${propertyName}`);
      }
    }
    if (item.type === "MemberExpression") {
      const objectName = String((item.object as NodeLike | undefined)?.name ?? "");
      const propertyName = String((item.property as NodeLike | undefined)?.name ?? "");
      if (objectName === "navigator" && propertyName === "serviceWorker") throw new ValidationError("SECURITY_BLOCKED", "禁止访问 navigator.serviceWorker");
    }
    if (item.type === "NewExpression") {
      const name = String((item.callee as NodeLike | undefined)?.name ?? "");
      if (blockedConstructors.has(name)) throw new ValidationError("SECURITY_BLOCKED", `禁止创建 ${name}`);
    }
    for (const [key, value] of Object.entries(item)) {
      if (["loc", "start", "end", "extra"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  };
  visit(ast);
  if (defaultExports !== 1) throw new ValidationError("JSX_EXPORT_INVALID", "JSX 必须恰好包含一个 default export React 组件");
  const warnings: string[] = [];
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(source)) warnings.push("检测到允许的 Google Fonts 外部字体依赖");
  return { imports: [...imports].sort(), warnings };
}
