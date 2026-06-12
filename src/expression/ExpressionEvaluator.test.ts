/**
 * Expression Evaluator Property-Based Tests
 * 表达式求值器属性测试
 *
 * Property 11: 表达式求值安全性
 * Property 13: 表达式求值一致性
 * Property 14: 表达式错误处理
 *
 * 验证: 需求 6.4, 8.1, 8.3, 8.4
 */

import { describe, it, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { createExpressionEvaluator } from './ExpressionEvaluator';
import type { EvaluationContext } from '../types';

// 创建测试用的求值器实例
const evaluator = createExpressionEvaluator();

// 创建基础上下文
function createContext(state: Record<string, any> = {}): EvaluationContext {
  return {
    state,
    computed: {},
  };
}

describe('ExpressionEvaluator - Unit Tests', () => {
  describe('parseTemplate', () => {
    it('should extract expressions from template', () => {
      const template = 'Hello {{ name }}, you have {{ count }} messages';
      const expressions = evaluator.parseTemplate(template);
      expect(expressions).toEqual(['name', 'count']);
    });

    it('should handle empty template', () => {
      expect(evaluator.parseTemplate('')).toEqual([]);
    });

    it('should handle template without expressions', () => {
      expect(evaluator.parseTemplate('Hello World')).toEqual([]);
    });
  });

  describe('evaluate - basic operations', () => {
    it('should evaluate arithmetic expressions', () => {
      const context = createContext({ a: 10, b: 5 });
      expect(evaluator.evaluate('a + b', context).value).toBe(15);
      expect(evaluator.evaluate('a - b', context).value).toBe(5);
      expect(evaluator.evaluate('a * b', context).value).toBe(50);
      expect(evaluator.evaluate('a / b', context).value).toBe(2);
    });

    it('should evaluate comparison expressions', () => {
      const context = createContext({ a: 10, b: 5 });
      expect(evaluator.evaluate('a > b', context).value).toBe(true);
      expect(evaluator.evaluate('a < b', context).value).toBe(false);
      expect(evaluator.evaluate('a >= 10', context).value).toBe(true);
      expect(evaluator.evaluate('b <= 5', context).value).toBe(true);
      expect(evaluator.evaluate('a === 10', context).value).toBe(true);
      expect(evaluator.evaluate('a !== b', context).value).toBe(true);
    });

    it('should evaluate logical expressions', () => {
      const context = createContext({ a: true, b: false });
      expect(evaluator.evaluate('a && b', context).value).toBe(false);
      expect(evaluator.evaluate('a || b', context).value).toBe(true);
      expect(evaluator.evaluate('!b', context).value).toBe(true);
    });

    it('should access nested properties', () => {
      const context = createContext({
        user: { profile: { name: 'John', age: 30 } },
      });
      expect(evaluator.evaluate('user.profile.name', context).value).toBe('John');
      expect(evaluator.evaluate('user.profile.age', context).value).toBe(30);
    });
  });


  describe('evaluateTemplate', () => {
    it('should evaluate pure expression and preserve type', () => {
      const context = createContext({ count: 42 });
      expect(evaluator.evaluateTemplate('{{ count }}', context)).toBe(42);
    });

    it('should evaluate mixed template as string', () => {
      const context = createContext({ name: 'World', count: 5 });
      expect(evaluator.evaluateTemplate('Hello {{ name }}, {{ count }} items', context))
        .toBe('Hello World, 5 items');
    });
  });
});

/**
 * Property 11: 表达式求值安全性
 * *对于任意*包含危险代码（如 eval、Function 构造器、window 访问）的表达式，
 * Expression_Evaluator 应拒绝执行并返回错误。
 *
 * **验证: 需求 6.4**
 */
describe('Property 11: Expression Evaluation Security', () => {
  // 危险表达式生成器
  const dangerousExpressionArbitrary = fc.oneof(
    // eval 调用
    fc.constant('eval("alert(1)")'),
    fc.constant('eval("console.log(1)")'),
    // Function 构造器
    fc.constant('Function("return 1")()'),
    fc.constant('new Function("return 1")()'),
    // window 访问
    fc.constant('window.location'),
    fc.constant('window.document'),
    // document 访问
    fc.constant('document.cookie'),
    fc.constant('document.body'),
    // globalThis 访问
    fc.constant('globalThis.eval'),
    // constructor 访问
    fc.constant('"".constructor'),
    fc.constant('[].constructor'),
    // __proto__ 访问
    fc.constant('{}.__proto__'),
    fc.constant('[].__proto__'),
    // prototype 访问
    fc.constant('Object.prototype'),
    fc.constant('Array.prototype'),
    // process 访问 (Node.js)
    fc.constant('process.env'),
    // require 调用
    fc.constant('require("fs")'),
    // import 调用
    fc.constant('import("fs")'),
    // this 访问
    fc.constant('this.constructor'),
    // setTimeout/setInterval
    fc.constant('setTimeout(() => {}, 0)'),
    fc.constant('setInterval(() => {}, 1000)'),
    // fetch
    fc.constant('fetch("/api")'),
    // localStorage
    fc.constant('localStorage.getItem("key")'),
  );

  test.prop([dangerousExpressionArbitrary], { numRuns: 100 })(
    'should reject dangerous expressions',
    (expr) => {
      const context = createContext({});
      const result = evaluator.evaluate(expr, context);

      // 危险表达式应该返回失败
      expect(result.success).toBe(false);
      // 错误信息应该包含 security 相关内容
      expect(result.error?.toLowerCase()).toContain('security');
    }
  );

  // 额外的单元测试确保特定危险模式被阻止
  it('should block eval calls', () => {
    const result = evaluator.evaluate('eval("1+1")', createContext({}));
    expect(result.success).toBe(false);
  });

  it('should block Function constructor', () => {
    const result = evaluator.evaluate('new Function("return 1")()', createContext({}));
    expect(result.success).toBe(false);
  });

  it('should block window access', () => {
    const result = evaluator.evaluate('window.location', createContext({}));
    expect(result.success).toBe(false);
  });

  it('should block constructor access via bracket notation', () => {
    const result = evaluator.evaluate('""["constructor"]', createContext({}));
    expect(result.success).toBe(false);
  });
});


/**
 * Property 13: 表达式求值一致性
 * *对于任意*有效的表达式和状态上下文，相同的表达式和状态应产生相同的求值结果。
 *
 * **验证: 需求 8.1, 8.3**
 */
describe('Property 13: Expression Evaluation Consistency', () => {
  // 安全表达式生成器
  const safeExpressionArbitrary = fc.oneof(
    // 算术表达式
    fc.tuple(fc.integer(), fc.integer()).map(([a, b]) => ({
      expr: `a + b`,
      state: { a, b },
      expected: a + b,
    })),
    fc.tuple(fc.integer(), fc.integer({ min: 1 })).map(([a, b]) => ({
      expr: `a * b`,
      state: { a, b },
      expected: a * b,
    })),
    // 比较表达式
    fc.tuple(fc.integer(), fc.integer()).map(([a, b]) => ({
      expr: `a > b`,
      state: { a, b },
      expected: a > b,
    })),
    fc.tuple(fc.integer(), fc.integer()).map(([a, b]) => ({
      expr: `a === b`,
      state: { a, b },
      expected: a === b,
    })),
    // 逻辑表达式
    fc.tuple(fc.boolean(), fc.boolean()).map(([a, b]) => ({
      expr: `a && b`,
      state: { a, b },
      expected: a && b,
    })),
    fc.tuple(fc.boolean(), fc.boolean()).map(([a, b]) => ({
      expr: `a || b`,
      state: { a, b },
      expected: a || b,
    })),
    // 字符串操作
    fc.tuple(fc.string(), fc.string()).map(([a, b]) => ({
      expr: `a + b`,
      state: { a, b },
      expected: a + b,
    })),
    // 三元表达式
    fc.tuple(fc.boolean(), fc.integer(), fc.integer()).map(([cond, a, b]) => ({
      expr: `cond ? a : b`,
      state: { cond, a, b },
      expected: cond ? a : b,
    })),
  );

  test.prop([safeExpressionArbitrary], { numRuns: 100 })(
    'should produce consistent results for same expression and state',
    ({ expr, state, expected }) => {
      const context = createContext(state);

      // 执行两次求值
      const result1 = evaluator.evaluate(expr, context);
      const result2 = evaluator.evaluate(expr, context);

      // 两次结果应该相同
      expect(result1.success).toBe(result2.success);
      expect(result1.value).toEqual(result2.value);

      // 结果应该与预期一致
      expect(result1.success).toBe(true);
      expect(result1.value).toEqual(expected);
    }
  );

  // 嵌套属性访问一致性
  test.prop(
    [
      fc.record({
        name: fc.string(),
        age: fc.integer({ min: 0, max: 150 }),
      }),
    ],
    { numRuns: 100 }
  )(
    'should consistently access nested properties',
    (profile) => {
      const context = createContext({ user: { profile } });

      const nameResult1 = evaluator.evaluate('user.profile.name', context);
      const nameResult2 = evaluator.evaluate('user.profile.name', context);

      expect(nameResult1.value).toBe(nameResult2.value);
      expect(nameResult1.value).toBe(profile.name);

      const ageResult1 = evaluator.evaluate('user.profile.age', context);
      const ageResult2 = evaluator.evaluate('user.profile.age', context);

      expect(ageResult1.value).toBe(ageResult2.value);
      expect(ageResult1.value).toBe(profile.age);
    }
  );
});


/**
 * Property 14: 表达式错误处理
 * *对于任意*包含语法错误的表达式，Expression_Evaluator 应返回错误结果和默认值，
 * 而不是抛出异常。
 *
 * **验证: 需求 8.4**
 */
describe('Property 14: Expression Error Handling', () => {
  // 语法错误表达式生成器 - 只包含真正的语法错误
  const syntaxErrorExpressionArbitrary = fc.oneof(
    // 不匹配的括号
    fc.constant('(a + b'),
    fc.constant('a + b)'),
    fc.constant('((a + b)'),
    // 不完整的表达式（真正的语法错误）
    fc.constant('a +'),
    fc.constant('a *'),
    fc.constant('a /'),
    fc.constant('a %'),
    fc.constant('a &&'),
    fc.constant('a ||'),
    fc.constant('a ==='),
    fc.constant('a !=='),
    fc.constant('a >'),
    fc.constant('a <'),
    // 不匹配的引号
    fc.constant('"hello'),
    fc.constant("'world"),
    // 不完整的三元表达式
    fc.constant('a ? b'),
    fc.constant('a ? : c'),
    // 不完整的数组/对象
    fc.constant('[1, 2,'),
    fc.constant('{a:'),
  );

  test.prop([syntaxErrorExpressionArbitrary], { numRuns: 100 })(
    'should return error result for syntax errors without throwing',
    (expr) => {
      const context = createContext({ a: 1, b: 2, c: 3 });

      // 不应该抛出异常
      let result;
      expect(() => {
        result = evaluator.evaluate(expr, context);
      }).not.toThrow();

      // 应该返回失败结果
      expect(result!.success).toBe(false);
      // 应该有错误信息
      expect(result!.error).toBeDefined();
      expect(typeof result!.error).toBe('string');
    }
  );

  // 测试 evaluateWithDefault 方法
  test.prop([syntaxErrorExpressionArbitrary, fc.anything()], { numRuns: 100 })(
    'should return default value for syntax errors',
    (expr, defaultValue) => {
      const context = createContext({ a: 1, b: 2, c: 3 });

      // 不应该抛出异常
      let result;
      expect(() => {
        result = evaluator.evaluateWithDefault(expr, context, defaultValue);
      }).not.toThrow();

      // 应该返回默认值
      expect(result).toEqual(defaultValue);
    }
  );

  // 测试 validateSyntax 方法
  test.prop([syntaxErrorExpressionArbitrary], { numRuns: 100 })(
    'validateSyntax should detect syntax errors',
    (expr) => {
      const result = evaluator.validateSyntax(expr);

      // 应该返回无效
      expect(result.valid).toBe(false);
      // 应该有错误信息
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    }
  );

  // 单元测试：未定义变量 - 应该返回错误
  it('should handle undefined variables as error', () => {
    const context = createContext({});
    const result = evaluator.evaluate('undefinedVar', context);

    // 未定义变量应该返回错误
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // 单元测试：空表达式
  it('should handle empty expression', () => {
    const context = createContext({});
    const result = evaluator.evaluate('', context);

    expect(result.success).toBe(true);
    expect(result.value).toBeUndefined();
  });

  // 单元测试：空白表达式
  it('should handle whitespace-only expression', () => {
    const context = createContext({});
    const result = evaluator.evaluate('   ', context);

    expect(result.success).toBe(true);
    expect(result.value).toBeUndefined();
  });
});

// 额外的辅助方法测试
describe('ExpressionEvaluator - Helper Methods', () => {
  describe('isSafe', () => {
    it('should return true for safe expressions', () => {
      expect(evaluator.isSafe('a + b')).toBe(true);
      expect(evaluator.isSafe('user.name')).toBe(true);
      expect(evaluator.isSafe('items.length')).toBe(true);
    });

    it('should return false for dangerous expressions', () => {
      expect(evaluator.isSafe('eval("1")')).toBe(false);
      expect(evaluator.isSafe('window.location')).toBe(false);
      expect(evaluator.isSafe('document.cookie')).toBe(false);
    });
  });
});
