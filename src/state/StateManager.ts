/**
 * State Manager - 状态管理器
 * 负责创建和管理响应式状态、计算属性和监听器
 */

import { reactive, computed, watch, type ComputedRef, type Reactive, type WatchStopHandle } from 'vue';
import type {
  IStateManager,
  ActionContext,
  EvaluationContext,
} from '../types/runtime';
import type { Action, WatchConfig } from '../types/schema';
import { ExpressionEvaluator } from '../expression/ExpressionEvaluator';
import { getByPath, setByPath, resolveMethod } from '../utils/path';

export class StateManager implements IStateManager {
  private state: Reactive<any> = reactive({});
  private computedRefs: Record<string, ComputedRef> = {};
  private watchStopHandles: WatchStopHandle[] = [];
  private evaluator: ExpressionEvaluator;
  private isDisposed: boolean = false;

  constructor(evaluator?: ExpressionEvaluator) {
    this.evaluator = evaluator || new ExpressionEvaluator();
  }

  /**
   * 检查状态管理器是否已被销毁
   */
  isDestroyed(): boolean {
    return this.isDisposed;
  }

  /**
   * 创建响应式状态
   * @param definition 状态定义对象
   * @returns 响应式状态对象
   */
  createState(definition: Record<string, any>): Reactive<any> {
    // 深拷贝定义以避免修改原始对象
    const stateCopy = this.deepClone(definition);
    
    // 使用 Vue 的 reactive 创建响应式状态
    this.state = reactive(stateCopy);
    
    return this.state;
  }

  /**
   * 获取当前状态
   */
  getState(): any {
    return this.state;
  }

  /**
   * 获取计算属性
   */
  getComputed(): Record<string, ComputedRef> {
    return this.computedRefs;
  }

  /**
   * 通过路径设置状态值
   * @param path 状态路径，如 "user.name" 或 "items[0].done"
   * @param value 要设置的值
   */
  setState(path: string, value: any): void {
    setByPath(this.state, path, value);
  }

  /**
   * 通过路径获取状态值
   * @param path 状态路径
   * @returns 状态值
   */
  getByPath(path: string): any {
    return getByPath(this.state, path);
  }

  /**
   * 创建计算属性
   * @param definition 计算属性定义，键为属性名，值为表达式字符串
   * @param state 响应式状态对象
   * @returns 计算属性对象
   */
  createComputed(
    definition: Record<string, string>,
    state: any
  ): Record<string, ComputedRef> {
    const computedRefs: Record<string, ComputedRef> = {};

    for (const [key, expression] of Object.entries(definition)) {
      computedRefs[key] = computed(() => {
        // 构建求值上下文
        const context: EvaluationContext = {
          state,
          computed: computedRefs,
        };

        const result = this.evaluator.evaluate(expression, context);
        
        if (!result.success) {
          console.warn(`Computed property "${key}" evaluation failed:`, result.error);
          return undefined;
        }

        return result.value;
      });
    }

    this.computedRefs = computedRefs;
    return computedRefs;
  }

  /**
   * 创建监听器
   * @param definition 监听器定义
   * @param state 响应式状态对象
   * @param context 动作执行上下文
   */
  createWatchers(
    definition: Record<string, WatchConfig | Action>,
    state: any,
    context: ActionContext
  ): void {
    for (const [path, config] of Object.entries(definition)) {
      const watchConfig = this.normalizeWatchConfig(config);
      
      // 创建 getter 函数来获取被监听的值
      const getter = () => this.getValueByPath(state, path);

      const stopHandle = watch(
        getter,
        async (newValue, oldValue) => {
          // 执行监听器回调
          await this.executeWatchHandler(watchConfig.handler, newValue, oldValue, context);
        },
        {
          immediate: watchConfig.immediate ?? false,
          deep: watchConfig.deep ?? false,
        }
      );

      this.watchStopHandles.push(stopHandle);
    }
  }

  /**
   * 标准化监听器配置
   */
  private normalizeWatchConfig(config: WatchConfig | Action): WatchConfig {
    // 如果是 Action，包装为 WatchConfig
    if (this.isAction(config)) {
      return {
        handler: config as Action,
        immediate: false,
        deep: false,
      };
    }
    return config as WatchConfig;
  }

  /**
   * 检查是否为 Action 类型（匹配所有 8 种动作）
   */
  private isAction(config: any): boolean {
    return (
      'set' in config ||
      'call' in config ||
      'emit' in config ||
      'fetch' in config ||
      'if' in config ||
      'script' in config ||
      'ws' in config ||
      'copy' in config
    );
  }


  /**
   * 执行监听器回调
   * 如果状态管理器已被销毁，则跳过执行
   */
  private async executeWatchHandler(
    handler: Action | Action[],
    newValue: any,
    oldValue: any,
    context: ActionContext
  ): Promise<void> {
    // 检查是否已被销毁，防止在组件卸载后继续执行
    if (this.isDisposed) {
      return;
    }

    const actions = Array.isArray(handler) ? handler : [handler];

    // 创建包含新旧值的上下文
    const watchContext: ActionContext = {
      ...context,
      state: {
        ...context.state,
        $newValue: newValue,
        $oldValue: oldValue,
      },
    };

    for (const action of actions) {
      if (this.isDisposed) return;

      // 优先使用 EventHandler（支持全部 8 种动作类型）
      if (context.eventHandler) {
        await context.eventHandler.executeAction(action, watchContext);
      } else {
        // 回退：内联处理基本动作类型（兼容测试环境等无 eventHandler 的场景）
        await this.executeInlineAction(action, watchContext);
      }
    }
  }

  /**
   * 内联执行单个动作（回退方案，仅在 context.eventHandler 不可用时使用）
   * 支持最基本的动作类型：set / call / emit / if
   */
  private async executeInlineAction(action: Action, context: ActionContext): Promise<void> {
    if ('set' in action) {
      const setAction = action as { set: string; value: any };
      let value = setAction.value;
      if (typeof value === 'string' && this.evaluator.isTemplateExpression(value)) {
        value = this.evaluator.evaluateTemplate(value, { state: context.state, computed: context.computed });
      }
      context.stateManager.setState(setAction.set, value);
    } else if ('call' in action) {
      const callAction = action as { call: string; args?: any[] };
      const method = resolveMethod(callAction.call, [context.methods, context.state]);
      if (method) {
        await method(...(callAction.args || []));
      } else {
        console.warn(`Method "${callAction.call}" not found`);
      }
    } else if ('emit' in action) {
      const emitAction = action as { emit: string; payload?: any };
      context.emit(emitAction.emit, emitAction.payload);
    } else if ('if' in action && 'then' in action) {
      const ifAction = action as { if: string; then: Action | Action[]; else?: Action | Action[] };
      const conditionResult = this.evaluator.evaluate(ifAction.if, { state: context.state, computed: context.computed });
      const branch = conditionResult.success && conditionResult.value ? ifAction.then : ifAction.else;
      if (branch) {
        const branchActions = Array.isArray(branch) ? branch : [branch];
        for (const ba of branchActions) {
          await this.executeInlineAction(ba, context);
        }
      }
    }
  }

  /**
   * 通过路径获取值（支持嵌套对象和数组）
   * 用于 watch getter
   */
  private getValueByPath(obj: any, path: string): any {
    return getByPath(obj, path);
  }

  /**
   * 深拷贝对象
   * 注意：函数会被直接引用而不是拷贝
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // 函数直接返回引用
    if (typeof obj === 'function') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }

    const cloned: any = {};
    for (const key of Object.keys(obj as object)) {
      const value = (obj as any)[key];
      // 函数直接引用，不进行深拷贝
      if (typeof value === 'function') {
        cloned[key] = value;
      } else {
        cloned[key] = this.deepClone(value);
      }
    }

    return cloned;
  }

  /**
   * 清理所有监听器和副作用
   * 销毁后，所有监听器回调将不再执行
   */
  dispose(): void {
    // 设置销毁标志，防止后续回调执行
    this.isDisposed = true;

    // 停止所有监听器
    for (const stopHandle of this.watchStopHandles) {
      stopHandle();
    }
    this.watchStopHandles = [];

    // 清空计算属性引用
    this.computedRefs = {};
  }
}

/**
 * 创建状态管理器实例
 */
export function createStateManager(evaluator?: ExpressionEvaluator): StateManager {
  return new StateManager(evaluator);
}
