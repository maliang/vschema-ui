/**
 * Expression Evaluator - 表达式求值器
 * 负责解析和求值 {{ }} 模板语法中的表达式
 */

import type {
  IExpressionEvaluator,
  EvaluationContext,
  EvaluationResult,
  ValidationResult,
} from '../types';

/**
 * 危险关键字列表 - 用于安全检查
 */
const DANGEROUS_KEYWORDS = [
  'eval',
  'Function',
  'constructor',
  'prototype',
  '__proto__',
  'window',
  'document',
  'globalThis',
  'global',
  'process',
  'require',
  'import',
  'module',
  'exports',
  'this',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'alert',
  'confirm',
  'prompt',
  'location',
  'history',
  'navigator',
  // 新增的危险关键字
  'Reflect',
  'Proxy',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'Atomics',
  'DataView',
  'Blob',
  'File',
  'FileReader',
  'URL',
  'URLSearchParams',
  'FormData',
  'Headers',
  'Request',
  'Response',
  'EventSource',
  'BroadcastChannel',
  'MessageChannel',
  'MessagePort',
  'crypto',
  'Crypto',
  'SubtleCrypto',
  'TextEncoder',
  'TextDecoder',
  'performance',
  'PerformanceObserver',
  'MutationObserver',
  'IntersectionObserver',
  'ResizeObserver',
];

/**
 * 危险模式正则 - 用于检测潜在的代码注入
 */
const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bnew\s+Function\b/,
  /\bconstructor\s*\(/,
  /\bconstructor\s*\[/,
  /\[\s*['"]constructor['"]\s*\]/,
  /\b__proto__\b/,
  /\bprototype\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bglobalThis\b/,
  /\bglobal\b/,
  /\bprocess\b/,
  /\brequire\s*\(/,
  /\bimport\s*\(/,
  /\bthis\b/,  // 禁止 this 访问
  /\bwith\s*\(/,  // 禁止 with 语句
];

/**
 * 模板表达式正则 - 匹配 {{ expression }}
 */
const TEMPLATE_REGEX = /\{\{\s*([\s\S]*?)\s*\}\}/g;

/**
 * LRU 缓存类 - 用于缓存已编译的表达式函数
 * 使用 Map 的插入顺序特性实现简单的 LRU 策略
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移动到末尾（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // 如果已存在，先删除（为了更新顺序）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最早的条目（Map 的第一个元素）
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * 表达式编译缓存 - 使用 LRU 策略
 * key: expression + paramNames 的组合
 * value: 编译后的函数
 */
const expressionCache = new LRUCache<string, Function>(1000);

export class ExpressionEvaluator implements IExpressionEvaluator {
  /**
   * 解析模板字符串，提取所有表达式
   * @param template 模板字符串，如 "Hello {{ name }}, you have {{ count }} messages"
   * @returns 表达式数组
   */
  parseTemplate(template: string): string[] {
    const expressions: string[] = [];
    let match: RegExpExecArray | null;

    // 重置正则状态
    TEMPLATE_REGEX.lastIndex = 0;

    while ((match = TEMPLATE_REGEX.exec(template)) !== null) {
      expressions.push(match[1].trim());
    }

    return expressions;
  }

  /**
   * 检查表达式是否包含模板语法
   */
  isTemplateExpression(value: any): boolean {
    if (typeof value !== 'string') return false;
    // 重置正则状态
    TEMPLATE_REGEX.lastIndex = 0;
    const result = TEMPLATE_REGEX.test(value);
    // 重置正则状态以避免影响后续调用
    TEMPLATE_REGEX.lastIndex = 0;
    return result;
  }


  /**
   * 求值模板字符串，替换所有 {{ }} 表达式
   * @param template 模板字符串
   * @param context 求值上下文
   * @returns 替换后的字符串或求值结果
   */
  evaluateTemplate(template: string, context: EvaluationContext): any {
    // 重置正则状态
    TEMPLATE_REGEX.lastIndex = 0;

    // 检查是否是纯表达式（整个字符串就是一个 {{ }} 表达式，不包含其他内容）
    const trimmed = template.trim();
    // 使用更精确的正则：只匹配不包含 }} 的内容
    const pureExprMatch = /^\{\{\s*([^}]*(?:\}(?!\})[^}]*)*)\s*\}\}$/.exec(trimmed);
    if (pureExprMatch && !trimmed.includes('}}{{') && trimmed.indexOf('{{') === trimmed.lastIndexOf('{{')) {
      // 纯表达式，直接返回求值结果（保持类型）
      const result = this.evaluate(pureExprMatch[1].trim(), context);
      return result.success ? result.value : undefined;
    }

    // 混合模板，替换所有表达式为字符串
    TEMPLATE_REGEX.lastIndex = 0;
    return template.replace(TEMPLATE_REGEX, (_, expr) => {
      const result = this.evaluate(expr.trim(), context);
      if (!result.success) {
        return '';
      }
      return result.value === undefined || result.value === null
        ? ''
        : String(result.value);
    });
  }

  /**
   * 验证表达式语法
   * @param expression 表达式字符串
   * @returns 验证结果
   */
  validateSyntax(expression: string): ValidationResult {
    // 安全检查
    const securityCheck = this.checkSecurity(expression);
    if (!securityCheck.valid) {
      return securityCheck;
    }

    // 语法检查 - 尝试解析为函数体
    try {
      // 使用 Function 构造器检查语法（不执行）
      new Function('return ' + expression);
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        errors: [`Syntax error: ${(e as Error).message}`],
      };
    }
  }

  /**
   * 安全检查 - 检测危险代码
   */
  private checkSecurity(expression: string): ValidationResult {
    // 检查危险关键字
    for (const keyword of DANGEROUS_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(expression)) {
        return {
          valid: false,
          errors: [`Security violation: "${keyword}" is not allowed in expressions`],
        };
      }
    }

    // 检查危险模式
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(expression)) {
        return {
          valid: false,
          errors: [`Security violation: dangerous pattern detected in expression`],
        };
      }
    }

    return { valid: true };
  }


  /**
   * 求值表达式
   * @param expression 表达式字符串
   * @param context 求值上下文
   * @returns 求值结果
   */
  evaluate(expression: string, context: EvaluationContext): EvaluationResult {
    // 空表达式
    if (!expression || expression.trim() === '') {
      return { success: true, value: undefined };
    }

    // 安全检查
    const securityCheck = this.checkSecurity(expression);
    if (!securityCheck.valid) {
      return {
        success: false,
        error: securityCheck.errors?.[0] || 'Security violation',
      };
    }

    try {
      // 构建上下文对象
      const evalContext = this.buildEvalContext(context);

      // 创建安全的求值函数
      const fn = this.createEvalFunction(expression, Object.keys(evalContext));

      // 执行求值
      const value = fn(...Object.values(evalContext));

      return { success: true, value };
    } catch (e) {
      return {
        success: false,
        error: `Expression error: ${(e as Error).message}`,
      };
    }
  }

  /**
   * 构建求值上下文对象
   */
  private buildEvalContext(context: EvaluationContext): Record<string, any> {
    const evalContext: Record<string, any> = {};

    // 添加状态属性到顶层
    if (context.state && typeof context.state === 'object') {
      Object.assign(evalContext, context.state);
    }

    // 添加计算属性到顶层
    if (context.computed && typeof context.computed === 'object') {
      for (const [key, value] of Object.entries(context.computed)) {
        // 计算属性可能是 ComputedRef，需要取 .value
        evalContext[key] = value && typeof value === 'object' && 'value' in value
          ? (value as any).value
          : value;
      }
    }

    // 添加特殊变量
    if (context.$event !== undefined) {
      evalContext.$event = context.$event;
    }
    if (context.$item !== undefined) {
      evalContext.$item = context.$item;
    }
    if (context.$index !== undefined) {
      evalContext.$index = context.$index;
    }
    if (context.$response !== undefined) {
      evalContext.$response = context.$response;
    }
    if (context.$error !== undefined) {
      evalContext.$error = context.$error;
    }
    if (context.$parent !== undefined) {
      evalContext.$parent = context.$parent;
    }
    if (context.$props !== undefined) {
      evalContext.$props = context.$props;
    }

    // 添加一些安全的内置函数和对象
    evalContext.Math = Math;
    evalContext.Date = Date;
    evalContext.JSON = JSON;
    evalContext.Array = Array;
    evalContext.Object = Object;
    evalContext.String = String;
    evalContext.Number = Number;
    evalContext.Boolean = Boolean;
    evalContext.parseInt = parseInt;
    evalContext.parseFloat = parseFloat;
    evalContext.isNaN = isNaN;
    evalContext.isFinite = isFinite;
    evalContext.encodeURI = encodeURI;
    evalContext.decodeURI = decodeURI;
    evalContext.encodeURIComponent = encodeURIComponent;
    evalContext.decodeURIComponent = decodeURIComponent;

    return evalContext;
  }


  /**
   * 创建安全的求值函数（带 LRU 缓存）
   */
  private createEvalFunction(expression: string, paramNames: string[]): Function {
    // 构建缓存 key
    const params = paramNames.join(', ');
    const cacheKey = `${params}::${expression}`;

    // 检查缓存（LRU 缓存会自动更新访问顺序）
    const cached = expressionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 使用 Function 构造器创建求值函数
    // 这比 eval 更安全，因为它在独立的作用域中执行
    try {
      const fn = new Function(params, `"use strict"; return (${expression});`);

      // 存入 LRU 缓存（自动处理容量限制）
      expressionCache.set(cacheKey, fn);

      return fn;
    } catch (e) {
      throw new Error(`Invalid expression syntax: ${(e as Error).message}`);
    }
  }

  /**
   * 求值表达式，失败时返回默认值
   * @param expression 表达式字符串
   * @param context 求值上下文
   * @param defaultValue 默认值
   * @returns 求值结果或默认值
   */
  evaluateWithDefault<T>(
    expression: string,
    context: EvaluationContext,
    defaultValue: T
  ): T {
    const result = this.evaluate(expression, context);
    if (!result.success) {
      return defaultValue;
    }
    return result.value as T;
  }

  /**
   * 检查表达式是否安全
   * @param expression 表达式字符串
   * @returns 是否安全
   */
  isSafe(expression: string): boolean {
    return this.checkSecurity(expression).valid;
  }

  /**
   * 清除表达式编译缓存
   * 当应用动态生成大量表达式时调用，防止内存泄漏
   */
  clearCache(): void {
    expressionCache.clear();
  }
}

/**
 * 创建表达式求值器实例
 */
export function createExpressionEvaluator(): ExpressionEvaluator {
  return new ExpressionEvaluator();
}

/**
 * 检查表达式是否包含危险代码
 * @param expression 表达式字符串
 * @returns 是否安全
 */
export function isExpressionSafe(expression: string): boolean {
  // 检查危险关键字
  for (const keyword of DANGEROUS_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`);
    if (regex.test(expression)) {
      return false;
    }
  }

  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(expression)) {
      return false;
    }
  }

  return true;
}
