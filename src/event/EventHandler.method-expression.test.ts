/**
 * EventHandler - FetchAction method 表达式支持测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventHandler } from './EventHandler';
import { createExpressionEvaluator } from '../expression/ExpressionEvaluator';
import { createStateManager } from '../state/StateManager';
import type { ActionContext } from '../types/runtime';
import type { FetchAction } from '../types/schema';

// 创建模拟的 ActionContext
function createMockActionContext(initialState: Record<string, any> = {}): ActionContext {
  const stateManager = createStateManager();
  const state = stateManager.createState(initialState);

  return {
    state,
    computed: {},
    methods: {},
    emit: vi.fn(),
    fetcher: {
      fetch: vi.fn().mockResolvedValue({ success: true, data: {} }),
      configure: vi.fn(),
    },
    evaluator: createExpressionEvaluator(),
    stateManager,
  };
}

describe('EventHandler - FetchAction method 表达式支持', () => {
  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn();
  });

  it('应该支持 method 字段的模板表达式', async () => {
    const eventHandler = createEventHandler();
    const context = createMockActionContext({ requestMethod: 'POST' });

    // Mock fetch 响应
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { success: true } }),
    });

    // 创建带表达式的 FetchAction
    const action: FetchAction = {
      fetch: '/api/users',
      method: '{{ requestMethod }}', // 使用表达式
      body: { name: 'Test' },
    };

    // 执行 action
    await eventHandler.executeAction(action, context);

    // 验证 fetcher.fetch 被调用，且 method 为 POST
    expect(context.fetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
      }),
      expect.any(Object)
    );
  });

  it('应该支持根据条件动态切换 method', async () => {
    const eventHandler = createEventHandler();
    const context = createMockActionContext({ isEdit: true });

    // 创建带条件表达式的 FetchAction
    const action: FetchAction = {
      fetch: '/api/users/1',
      method: '{{ isEdit ? "PUT" : "POST" }}', // 根据 isEdit 决定方法
      body: { name: 'Test' },
    };

    // 执行 action
    await eventHandler.executeAction(action, context);

    // 验证 fetcher.fetch 被调用，且 method 为 PUT
    expect(context.fetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
      }),
      expect.any(Object)
    );
  });

  it('应该支持从对象中获取 method', async () => {
    const eventHandler = createEventHandler();
    const context = createMockActionContext({
      config: {
        method: 'DELETE',
        url: '/api/users/1',
      },
    });

    // 创建带对象访问表达式的 FetchAction
    const action: FetchAction = {
      fetch: '{{ config.url }}',
      method: '{{ config.method }}',
    };

    // 执行 action
    await eventHandler.executeAction(action, context);

    // 验证 fetcher.fetch 被调用，且 method 为 DELETE
    expect(context.fetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: '/api/users/1',
        method: 'DELETE',
      }),
      expect.any(Object)
    );
  });

  it('当 method 不是表达式时应该直接使用', async () => {
    const eventHandler = createEventHandler();
    const context = createMockActionContext({});

    // 创建普通的 FetchAction
    const action: FetchAction = {
      fetch: '/api/users',
      method: 'POST', // 直接指定，不是表达式
      body: { name: 'Test' },
    };

    // 执行 action
    await eventHandler.executeAction(action, context);

    // 验证 fetcher.fetch 被调用，且 method 为 POST
    expect(context.fetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
      }),
      expect.any(Object)
    );
  });

  it('当 method 未指定时应该使用默认值', async () => {
    const eventHandler = createEventHandler();
    const context = createMockActionContext({});

    // 创建不指定 method 的 FetchAction
    const action: FetchAction = {
      fetch: '/api/users',
    };

    // 执行 action
    await eventHandler.executeAction(action, context);

    // 验证 fetcher.fetch 被调用
    expect(context.fetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: '/api/users',
      }),
      expect.any(Object)
    );
  });

  it('应该支持复杂的表达式计算', async () => {
    const eventHandler = createEventHandler();
    const context = createMockActionContext({
      operations: ['GET', 'POST', 'PUT', 'DELETE'],
      index: 2,
    });

    // 创建带数组访问表达式的 FetchAction
    const action: FetchAction = {
      fetch: '/api/users/1',
      method: '{{ operations[index] }}', // 从数组中获取
    };

    // 执行 action
    await eventHandler.executeAction(action, context);

    // 验证 fetcher.fetch 被调用，且 method 为 PUT (operations[2])
    expect(context.fetcher.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
      }),
      expect.any(Object)
    );
  });
});
