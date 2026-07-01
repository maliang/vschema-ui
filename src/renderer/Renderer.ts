/**
 * Renderer - 渲染器核心
 * 负责将 JSON Schema 渲染为 Vue 组件树
 */

import {
  h,
  reactive,
  computed,
  defineComponent,
  createTextVNode,
  onMounted,
  onUnmounted,
  onUpdated,
  ref,
  Fragment,
  type VNode,
  type Component,
  type ComputedRef,
  type Ref,
  withDirectives,
  vShow,
} from 'vue';
import type { JsonNode, Action, SlotDefinition, ApiConfig, ApiConfigObject, FetchAction } from '../types/schema';
import { isSlotDefinition as checkSlotDefinition } from '../types/schema';
import type { ModelAdapter } from '../types/config';
import type {
  IComponentRegistry,
  EvaluationContext,
  ActionContext,
  RuntimeContext,
  IStateManager,
} from '../types/runtime';
import { ExpressionEvaluator } from '../expression/ExpressionEvaluator';
import { StateManager } from '../state/StateManager';
import { EventHandler } from '../event/EventHandler';
import { DataFetcher } from '../fetch/DataFetcher';
import { ComponentRegistry } from '../registry/ComponentRegistry';
import { setByPath } from '../utils/path';

/**
 * 错误占位符组件 - 用于显示未知组件错误
 */
const ErrorPlaceholder = defineComponent({
  name: 'ErrorPlaceholder',
  props: {
    componentName: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    return () =>
      h(
        'div',
        {
          style: {
            padding: '8px 12px',
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '4px',
            color: '#dc2626',
            fontSize: '14px',
          },
        },
        [
          h('strong', {}, `[未知组件: ${props.componentName}]`),
          props.message ? h('p', { style: { margin: '4px 0 0 0' } }, props.message) : null,
        ]
      );
  },
});

/**
 * 渲染器配置选项
 */
export interface RendererOptions {
  /** 组件注册表 */
  registry?: IComponentRegistry;
  /** 表达式求值器 */
  evaluator?: ExpressionEvaluator;
  /** 事件处理器 */
  eventHandler?: EventHandler;
  /** 数据获取器 */
  fetcher?: DataFetcher;
  /** 组件模型绑定适配器表（通用机制，具体 UI 库策略由消费方注册） */
  modelAdapters?: Record<string, ModelAdapter>;
}


/**
 * 渲染器类
 */
export class Renderer {
  private registry: IComponentRegistry;
  private evaluator: ExpressionEvaluator;
  private eventHandler: EventHandler;
  private fetcher: DataFetcher;
  private modelAdapters: Record<string, ModelAdapter>;

  constructor(options: RendererOptions = {}) {
    this.registry = options.registry || new ComponentRegistry();
    this.evaluator = options.evaluator || new ExpressionEvaluator();
    this.eventHandler = options.eventHandler || new EventHandler();
    this.fetcher = options.fetcher || new DataFetcher();
    this.modelAdapters = options.modelAdapters || {};
  }

  /**
   * 获取组件注册表
   */
  getRegistry(): IComponentRegistry {
    return this.registry;
  }

  /**
   * 获取表达式求值器
   */
  getEvaluator(): ExpressionEvaluator {
    return this.evaluator;
  }

  /**
   * 渲染 JSON 节点为 Vue 组件
   * @param node JSON 节点定义
   * @param parentContext 父级运行时上下文
   * @returns Vue 组件
   */
  render(node: JsonNode, parentContext?: RuntimeContext): Component {
    const renderer = this;

    return defineComponent({
      name: 'JsonRendererNode',
      // 允许任意事件透传
      emits: null as any,
      setup(_, { emit }) {
        // 为每个组件创建独立的 EventHandler 实例
        // 这样每个组件可以独立管理自己的 WebSocket 连接
        const componentEventHandler = new EventHandler();
        
        // 创建状态管理器
        const stateManager = new StateManager(renderer.evaluator);
        
        // 创建响应式数据 - 使用 stateManager 的状态作为唯一数据源
        if (node.data) {
          stateManager.createState(node.data);
        }
        
        // 创建当前节点的运行时上下文，使用 stateManager 的状态
        const runtimeContext = renderer.createRuntimeContext(node, parentContext, stateManager);

        // 创建 $loading 响应式状态（用于 initApi）
        const $loading: Ref<boolean> = ref(false);
        // 将 $loading 注入到 runtimeContext.state 中
        // 使用 Object.defineProperty + configurable:false 防止 SetAction 覆盖
        Object.defineProperty(runtimeContext.state, '$loading', {
          get: () => $loading.value,
          set: (val: boolean) => { $loading.value = val; },
          enumerable: true,
          configurable: false,
        });

        // 创建 $uiLoading 响应式状态（用于 uiApi）
        const $uiLoading: Ref<boolean> = ref(false);
        // 将 $uiLoading 注入到 runtimeContext.state 中
        Object.defineProperty(runtimeContext.state, '$uiLoading', {
          get: () => $uiLoading.value,
          set: (val: boolean) => { $uiLoading.value = val; },
          enumerable: true,
          configurable: false,
        });

        // 创建 dynamicChildren 响应式状态（用于存储 uiApi 返回的动态子节点）
        const dynamicChildren: Ref<JsonNode[] | null> = ref(null);

        // 创建动作执行上下文
        const actionContext = renderer.createActionContext(
          runtimeContext,
          stateManager,
          emit,
          componentEventHandler
        );

        // 设置监听器
        if (node.watch) {
          stateManager.createWatchers(node.watch, runtimeContext.state, actionContext);
        }

        // 创建方法
        if (node.methods) {
          for (const [name, action] of Object.entries(node.methods)) {
            runtimeContext.methods[name] = componentEventHandler.createHandler(
              action,
              actionContext
            );
          }
        }

        // 设置生命周期钩子（包括 initApi 和 uiApi 处理）
        renderer.setupLifecycleHooks(node, actionContext, stateManager, componentEventHandler, $loading, $uiLoading, dynamicChildren);

        return () => {
          return renderer.renderNode(node, runtimeContext, actionContext, dynamicChildren);
        };
      },
    });
  }

  /**
   * 设置生命周期钩子
   * @param node JSON 节点定义
   * @param actionContext 动作执行上下文
   * @param stateManager 状态管理器（用于清理）
   * @param eventHandler 事件处理器（用于清理 WebSocket 连接）
   * @param $loading initApi 的 loading 状态引用
   * @param $uiLoading uiApi 的 loading 状态引用
   * @param dynamicChildren uiApi 返回的动态子节点引用
   */
  private setupLifecycleHooks(
    node: JsonNode,
    actionContext: ActionContext,
    stateManager: IStateManager,
    eventHandler: EventHandler,
    $loading: Ref<boolean>,
    $uiLoading: Ref<boolean>,
    dynamicChildren: Ref<JsonNode[] | null>
  ): void {
    // onMounted 钩子
    onMounted(async () => {
      // 1. 执行 initApi（如果存在）
      if (node.initApi) {
        await this.executeInitApi(node.initApi, actionContext, eventHandler, $loading);
      }

      // 2. 执行 uiApi（如果存在，在 initApi 完成后执行）
      if (node.uiApi) {
        await this.executeUiApi(node.uiApi, actionContext, eventHandler, $uiLoading, dynamicChildren);
      }

      // 3. 执行用户定义的 onMounted 动作
      if (node.onMounted) {
        await this.executeLifecycleActions(node.onMounted, actionContext, eventHandler);
      }
    });

    // onUpdated 钩子
    if (node.onUpdated) {
      onUpdated(async () => {
        await this.executeLifecycleActions(node.onUpdated!, actionContext, eventHandler);
      });
    }

    // onUnmounted 钩子 - 同时清理状态管理器和 WebSocket 连接
    onUnmounted(() => {
      // 先执行用户定义的 onUnmounted 动作
      // 用 try/finally 确保清理逻辑不被用户代码抛出的异常中断
      try {
        if (node.onUnmounted) {
          this.executeLifecycleActions(node.onUnmounted, actionContext, eventHandler);
        }
      } finally {
        // 清理状态管理器（停止监听器等）
        stateManager.dispose();
        // 清理 WebSocket 连接
        eventHandler.dispose();
      }
    });
  }

  /**
   * 执行生命周期动作
   * @param actions 动作或动作数组
   * @param context 动作执行上下文
   * @param eventHandler 事件处理器
   */
  private async executeLifecycleActions(
    actions: Action | Action[],
    context: ActionContext,
    eventHandler: EventHandler
  ): Promise<void> {
    const actionArray = Array.isArray(actions) ? actions : [actions];
    await eventHandler.executeActions(actionArray, context);
  }

  /**
   * 执行 initApi 请求
   * 在组件挂载时调用，获取初始数据并合并到 state 中
   * @param apiConfig API 配置（字符串或对象）
   * @param actionContext 动作执行上下文
   * @param eventHandler 事件处理器
   * @param $loading loading 状态引用
   */
  private async executeInitApi(
    apiConfig: ApiConfig,
    actionContext: ActionContext,
    eventHandler: EventHandler,
    $loading: Ref<boolean>
  ): Promise<void> {
    // 设置 loading 状态为 true
    $loading.value = true;

    try {
      // 规范化 API 配置
      const normalizedConfig = normalizeApiConfig(apiConfig);

      // 创建求值上下文
      const evalContext: EvaluationContext = {
        state: actionContext.state,
        computed: actionContext.computed,
      };

      // 解析 URL 模板表达式
      const resolvedUrl = resolveUrlTemplate(
        normalizedConfig.url,
        this.evaluator,
        evalContext
      );

      // 构建 FetchAction
      const fetchAction: FetchAction = {
        fetch: resolvedUrl,
        method: normalizedConfig.method,
        headers: normalizedConfig.headers,
        body: normalizedConfig.body,
        ignoreBaseURL: normalizedConfig.ignoreBaseURL,
      };

      // 调用 DataFetcher 执行请求
      const result = await this.fetcher.fetch(fetchAction, evalContext);

      if (result.success && result.data !== undefined) {
        // 成功时合并数据到 state（仅当返回对象时）
        // 如果返回数组，不进行合并，由 then 回调处理
        if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
          Object.assign(actionContext.state, result.data);
        }

        // 执行 then 回调（如果有）
        if (normalizedConfig.then) {
          // 添加 $response 到原始 state 中（保持响应式）
          actionContext.state.$response = result.response || result.data;

          const thenActions = Array.isArray(normalizedConfig.then)
            ? normalizedConfig.then
            : [normalizedConfig.then];
          await eventHandler.executeActions(thenActions, actionContext);

          // 清理 $response
          delete actionContext.state.$response;
        }
      } else {
        // 失败时执行 catch 回调（如果有）
        if (normalizedConfig.catch) {
          // 添加 $error 到原始 state 中
          actionContext.state.$error = result.error;

          const catchActions = Array.isArray(normalizedConfig.catch)
            ? normalizedConfig.catch
            : [normalizedConfig.catch];
          await eventHandler.executeActions(catchActions, actionContext);
          
          // 清理 $error
          delete actionContext.state.$error;
        }
      }
    } catch (error) {
      // 网络错误等异常情况
      const normalizedConfig = normalizeApiConfig(apiConfig);
      if (normalizedConfig.catch) {
        // 添加 $error 到原始 state 中
        actionContext.state.$error = error;

        const catchActions = Array.isArray(normalizedConfig.catch)
          ? normalizedConfig.catch
          : [normalizedConfig.catch];
        await eventHandler.executeActions(catchActions, actionContext);
        
        // 清理 $error
        delete actionContext.state.$error;
      } else {
        console.error('initApi error:', error);
      }
    } finally {
      // 无论成功或失败，都重置 loading 状态
      $loading.value = false;
    }
  }

  /**
   * 执行 uiApi 请求
   * 在组件挂载时调用（在 initApi 之后），获取动态 UI 结构
   * @param apiConfig API 配置（字符串或对象）
   * @param actionContext 动作执行上下文
   * @param eventHandler 事件处理器
   * @param $uiLoading loading 状态引用
   * @param dynamicChildren 动态子节点引用
   */
  private async executeUiApi(
    apiConfig: ApiConfig,
    actionContext: ActionContext,
    eventHandler: EventHandler,
    $uiLoading: Ref<boolean>,
    dynamicChildren: Ref<JsonNode[] | null>
  ): Promise<void> {
    // 设置 loading 状态为 true
    $uiLoading.value = true;

    try {
      // 规范化 API 配置
      const normalizedConfig = normalizeApiConfig(apiConfig);

      // 创建求值上下文
      const evalContext: EvaluationContext = {
        state: actionContext.state,
        computed: actionContext.computed,
      };

      // 解析 URL 模板表达式
      const resolvedUrl = resolveUrlTemplate(
        normalizedConfig.url,
        this.evaluator,
        evalContext
      );

      // 构建 FetchAction
      const fetchAction: FetchAction = {
        fetch: resolvedUrl,
        method: normalizedConfig.method,
        headers: normalizedConfig.headers,
        body: normalizedConfig.body,
        ignoreBaseURL: normalizedConfig.ignoreBaseURL,
      };

      // 调用 DataFetcher 执行请求
      const result = await this.fetcher.fetch(fetchAction, evalContext);

      if (result.success && result.data) {
        // 成功时设置 dynamicChildren
        // 支持返回单个 JsonNode 对象或 JsonNode 数组
        const data = result.data;
        if (Array.isArray(data)) {
          dynamicChildren.value = data as JsonNode[];
        } else {
          // 单个对象包装为数组
          dynamicChildren.value = [data as JsonNode];
        }

        // 执行 then 回调（如果有）
        if (normalizedConfig.then) {
          const successContext: ActionContext = {
            ...actionContext,
            state: {
              ...actionContext.state,
              $response: result.response || result.data,
            },
          };

          const thenActions = Array.isArray(normalizedConfig.then)
            ? normalizedConfig.then
            : [normalizedConfig.then];
          await eventHandler.executeActions(thenActions, successContext);
        }
      } else {
        // 失败时保持原有 children（dynamicChildren 保持为 null）
        // 执行 catch 回调（如果有）
        if (normalizedConfig.catch) {
          const errorContext: ActionContext = {
            ...actionContext,
            state: {
              ...actionContext.state,
              $error: result.error,
            },
          };

          const catchActions = Array.isArray(normalizedConfig.catch)
            ? normalizedConfig.catch
            : [normalizedConfig.catch];
          await eventHandler.executeActions(catchActions, errorContext);
        }
      }
    } catch (error) {
      // 网络错误等异常情况，保持原有 children
      const normalizedConfig = normalizeApiConfig(apiConfig);
      if (normalizedConfig.catch) {
        const errorContext: ActionContext = {
          ...actionContext,
          state: {
            ...actionContext.state,
            $error: error,
          },
        };

        const catchActions = Array.isArray(normalizedConfig.catch)
          ? normalizedConfig.catch
          : [normalizedConfig.catch];
        await eventHandler.executeActions(catchActions, errorContext);
      } else {
        console.error('uiApi error:', error);
      }
    } finally {
      // 无论成功或失败，都重置 loading 状态
      $uiLoading.value = false;
    }
  }


  /**
   * 创建运行时上下文
   * 支持嵌套数据作用域，子节点可以有独立数据，并通过 $parent 访问父级上下文
   */
  private createRuntimeContext(
    node: JsonNode,
    parentContext?: RuntimeContext,
    stateManager?: StateManager
  ): RuntimeContext {
    // 使用 stateManager 的状态，或创建新的响应式状态
    const state = stateManager ? stateManager.getState() : reactive(node.data ? { ...node.data } : {});

    // 创建计算属性
    const computedRefs: Record<string, ComputedRef> = {};
    if (node.computed) {
      for (const [key, expression] of Object.entries(node.computed)) {
        computedRefs[key] = computed(() => {
          const evalContext: EvaluationContext = {
            state,
            computed: computedRefs,
            $parent: parentContext
              ? this.buildParentEvalContext(parentContext)
              : undefined,
          };
          const result = this.evaluator.evaluate(expression, evalContext);
          return result.success ? result.value : undefined;
        });
      }
    }

    return {
      state,
      computed: computedRefs,
      methods: {},
      refs: {},
      $parent: parentContext,
    };
  }

  /**
   * 构建父级求值上下文
   * 递归构建完整的作用域链，支持多层嵌套访问
   */
  private buildParentEvalContext(context: RuntimeContext): EvaluationContext {
    // 将计算属性的 ComputedRef 转换为实际值
    const computedValues: Record<string, any> = {};
    if (context.computed) {
      for (const [key, ref] of Object.entries(context.computed)) {
        computedValues[key] = ref.value;
      }
    }

    const evalContext: EvaluationContext = {
      state: context.state,
      computed: computedValues,
      $item: context.$item,
      $index: context.$index,
    };

    // 递归构建父级链
    if (context.$parent) {
      evalContext.$parent = this.buildParentEvalContext(context.$parent);
    }

    return evalContext;
  }

  /**
   * 创建动作执行上下文
   */
  private createActionContext(
    runtimeContext: RuntimeContext,
    stateManager: IStateManager,
    emit: (event: string, ...args: any[]) => void,
    eventHandler?: EventHandler
  ): ActionContext {
    return {
      state: runtimeContext.state,
      computed: runtimeContext.computed,
      methods: runtimeContext.methods,
      emit: (event: string, payload?: any) => emit(event, payload),
      fetcher: this.fetcher,
      evaluator: this.evaluator,
      stateManager: stateManager,
      eventHandler: eventHandler,
    };
  }

  /**
   * 渲染单个节点
   * @param node JSON 节点定义
   * @param runtimeContext 运行时上下文
   * @param actionContext 动作执行上下文
   * @param dynamicChildren 可选的动态子节点（来自 uiApi）
   */
  private renderNode(
    node: JsonNode,
    runtimeContext: RuntimeContext,
    actionContext: ActionContext,
    dynamicChildren?: Ref<JsonNode[] | null>
  ): VNode | VNode[] | null {
    // 创建求值上下文
    const evalContext: EvaluationContext = {
      state: runtimeContext.state,
      computed: runtimeContext.computed,
      $item: runtimeContext.$item,
      $index: runtimeContext.$index,
      $parent: runtimeContext.$parent
        ? this.buildParentEvalContext(runtimeContext.$parent)
        : undefined,
    };

    // 处理 v-if 条件渲染
    if (node.if !== undefined) {
      const conditionResult = this.evaluator.evaluate(node.if, evalContext);
      if (!conditionResult.success || !conditionResult.value) {
        return null;
      }
    }

    // 处理 v-for 循环渲染
    if (node.for) {
      return this.renderForLoop(node, runtimeContext, actionContext, evalContext);
    }

    // 渲染单个组件（传递 dynamicChildren）
    return this.renderComponent(node, runtimeContext, actionContext, evalContext, dynamicChildren);
  }


  /**
   * 渲染组件
   * @param node JSON 节点定义
   * @param runtimeContext 运行时上下文
   * @param actionContext 动作执行上下文
   * @param evalContext 求值上下文
   * @param dynamicChildren 可选的动态子节点（来自 uiApi）
   */
  private renderComponent(
    node: JsonNode,
    runtimeContext: RuntimeContext,
    actionContext: ActionContext,
    evalContext: EvaluationContext,
    dynamicChildren?: Ref<JsonNode[] | null>
  ): VNode | null {
    const componentName = node.com;

    // 如果没有组件名，可能是纯逻辑节点，渲染子节点
    if (!componentName) {
      const children = this.renderChildrenAsVNodes(node, runtimeContext, actionContext, evalContext, dynamicChildren);
      if (children && children.length > 0) {
        // 返回第一个子节点或包装在 fragment 中
        return children.length === 1 ? children[0] : h(Fragment, null, children);
      }
      return null;
    }

    // 解析组件
    const component = this.resolveComponent(componentName);

    // 处理 props
    const props = this.resolveProps(node.props, evalContext);

    // 如果是错误占位符，添加组件名
    if (component === ErrorPlaceholder) {
      props.componentName = componentName;
    }

    // 处理事件
    const eventHandlers = this.resolveEvents(node.events, actionContext);

    // 处理 v-model（支持字符串或对象格式）
    if (node.model) {
      const inputType = node.props?.type;
      // 原生 HTML 标签（resolveComponent 返回字符串）才绑定原生 onInput/onChange；
      // Vue 组件（如 naive-ui 的 NInputNumber）仅依赖 onUpdate:value/onUpdate:modelValue，
      // 避免内部原生 input 事件冒泡把原始字符串写回 state 导致无法输入。
      const isNativeTag = typeof component === 'string';

      if (typeof node.model === 'string') {
        // 字符串格式：简单 v-model
        const modelHandlers = this.resolveModel(node.model, runtimeContext, evalContext, inputType, isNativeTag, componentName);
        Object.assign(props, modelHandlers.props);
        Object.assign(eventHandlers, modelHandlers.events);
      } else {
        // 对象格式：带参数的 v-model:xxx
        for (const [arg, path] of Object.entries(node.model)) {
          if (arg === 'modelValue') {
            // modelValue 作为默认 v-model 处理
            const modelHandlers = this.resolveModel(path, runtimeContext, evalContext, inputType, isNativeTag, componentName);
            Object.assign(props, modelHandlers.props);
            Object.assign(eventHandlers, modelHandlers.events);
          } else {
            // 其他参数作为 v-model:xxx 处理
            const modelHandlers = this.resolveModelWithArg(arg, path, runtimeContext, evalContext);
            Object.assign(props, modelHandlers.props);
            Object.assign(eventHandlers, modelHandlers.events);
          }
        }
      }
    }

    // 合并 props 和事件处理器
    const allProps = { ...props, ...eventHandlers };

    // 渲染子节点（传递 dynamicChildren）
    const children = this.renderChildrenAsVNodes(node, runtimeContext, actionContext, evalContext, dynamicChildren);

    // 处理插槽
    const slots = this.resolveSlots(node.slots, runtimeContext, actionContext, evalContext);

    // 创建 VNode
    let vnode: VNode;
    
    // 合并 slots 和 children
    // 如果有 children 但没有 default 插槽，将 children 作为 default 插槽
    const finalSlots: Record<string, () => VNode[]> = {};
    
    if (slots) {
      Object.assign(finalSlots, slots);
    }
    
    // 如果有 children 且没有 default 插槽，添加 default 插槽
    if (children && children.length > 0 && !finalSlots.default) {
      finalSlots.default = () => children;
    }
    
    if (Object.keys(finalSlots).length > 0) {
      // 有插槽时使用插槽形式
      if (typeof component === 'string') {
        // 原生 HTML 标签，直接传递 children（如果有 default 插槽）
        vnode = h(component, allProps, finalSlots.default ? finalSlots.default() : undefined);
      } else {
        // 自定义组件，使用函数形式的插槽
        vnode = h(component, allProps, finalSlots);
      }
    } else {
      vnode = h(component, allProps);
    }

    // 处理 v-show
    if (node.show !== undefined) {
      const showResult = this.evaluator.evaluate(node.show, evalContext);
      const showValue = showResult.success ? showResult.value : true;
      vnode = withDirectives(vnode, [[vShow, showValue]]);
    }

    return vnode;
  }

  /**
   * 解析组件
   */
  private resolveComponent(name: string): Component | string {
    // 检查是否为 HTML 原生标签
    if (this.registry.isNativeTag(name)) {
      return name;
    }

    // 检查是否为已注册的自定义组件
    const customComponent = this.registry.get(name);
    if (customComponent) {
      return customComponent;
    }

    // 未知组件，返回错误占位符
    return ErrorPlaceholder;
  }


  /**
   * 解析 props
   */
  private resolveProps(
    props: Record<string, any> | undefined,
    evalContext: EvaluationContext
  ): Record<string, any> {
    if (!props) return {};

    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(props)) {
      resolved[key] = this.resolveValue(value, evalContext);
    }

    return resolved;
  }

  /**
   * 递归解析值中的模板表达式
   * 支持字符串、数组、嵌套对象中的模板表达式
   */
  private resolveValue(value: any, evalContext: EvaluationContext): any {
    if (typeof value === 'string') {
      // 字符串：检查是否为模板表达式
      if (this.evaluator.isTemplateExpression(value)) {
        return this.evaluator.evaluateTemplate(value, evalContext);
      }
      return value;
    }

    if (Array.isArray(value)) {
      // 数组：递归解析每个元素
      return value.map(item => this.resolveValue(item, evalContext));
    }

    if (value !== null && typeof value === 'object') {
      // 对象：递归解析每个属性
      const resolved: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolveValue(v, evalContext);
      }
      return resolved;
    }

    // 其他类型（number, boolean, null, undefined）直接返回
    return value;
  }

  /**
   * 解析事件处理器
   */
  private resolveEvents(
    events: Record<string, Action | Action[]> | undefined,
    actionContext: ActionContext
  ): Record<string, Function> {
    if (!events) return {};

    const handlers: Record<string, Function> = {};
    // 使用 actionContext 中的 eventHandler，如果没有则回退到 Renderer 级别的
    const eventHandler = actionContext.eventHandler || this.eventHandler;

    for (const [eventKey, action] of Object.entries(events)) {
      const { eventName } = eventHandler.parseEventKey(eventKey);
      // 转换为 Vue 的 onXxx 格式
      const handlerKey = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
      handlers[handlerKey] = eventHandler.createHandlerWithModifiers(
        eventKey,
        action,
        actionContext
      );
    }

    return handlers;
  }

  /**
   * 解析 v-model 双向绑定（支持修饰符）
   * 
   * 支持的修饰符：
   * - .trim: 自动去除首尾空格
   * - .number: 自动转换为数字
   * - .lazy: 使用 change 事件而非 input 事件
   * 
   * 格式：path 或 path.modifier1.modifier2
   * 例如：username.trim 或 age.number 或 content.trim.lazy
   */
  private resolveModel(
    modelExpression: string,
    runtimeContext: RuntimeContext,
    evalContext: EvaluationContext,
    inputType?: string,
    isNativeTag: boolean = true,
    componentName?: string
  ): { props: Record<string, any>; events: Record<string, Function> } {
    // 确保 modelExpression 是字符串
    if (typeof modelExpression !== 'string') {
      console.warn('resolveModel: modelExpression 应为字符串，收到:', typeof modelExpression, modelExpression);
      return { props: {}, events: {} };
    }
    
    // 解析修饰符
    const { path: modelPath, modifiers } = this.parseModelModifiers(modelExpression);
    
    // 获取当前值
    const currentValue = this.evaluator.evaluate(modelPath, evalContext);
    const value = currentValue.success ? currentValue.value : '';

    // 组件模型绑定适配器（通用机制，核心不感知任何具体 UI 库/组件名）：
    // 某些组件对 value 类型有特殊要求（如时间/日期选择器的 value 必须是时间戳|null，
    // 空串或字符串会导致其内部格式化抛错）。消费方可通过 config.modelAdapters 为组件名
    // 注册适配器，指定改用哪个 prop/event，以及状态为空时应传入组件的值。
    const adapter = componentName ? this.modelAdapters[componentName] : undefined;
    if (adapter && (!adapter.when || adapter.when(value))) {
      const isEmpty = value === '' || value === null || value === undefined;
      const prop = adapter.prop || 'value';
      const event = adapter.event || `onUpdate:${prop}`;
      const boundValue = isEmpty && 'emptyValue' in adapter ? adapter.emptyValue : value;
      return {
        props: { [prop]: boundValue },
        events: {
          [event]: (newValue: any) => {
            this.setStateByPath(runtimeContext.state, modelPath, newValue ?? '');
          },
        },
      };
    }

    // checkbox 特殊处理
    if (inputType === 'checkbox') {
      return {
        props: {
          checked: !!value,
        },
        events: {
          onChange: (event: Event) => {
            const target = event.target as HTMLInputElement;
            this.setStateByPath(runtimeContext.state, modelPath, target.checked);
          },
        },
      };
    }

    // 值转换函数
    const transformValue = (val: any): any => {
      let result = val;
      if (modifiers.trim && typeof result === 'string') {
        result = result.trim();
      }
      if (modifiers.number) {
        const num = parseFloat(result);
        result = isNaN(num) ? result : num;
      }
      return result;
    };

    // 根据 lazy 修饰符决定使用哪个事件
    const events: Record<string, Function> = {};

    // 仅原生 HTML 标签（input/textarea/select）才绑定原生 DOM 事件；
    // Vue 组件统一走下面的 onUpdate:modelValue / onUpdate:value，
    // 避免组件内部原生 input 事件冒泡导致的值类型错乱（如 NInputNumber 无法输入）。
    if (isNativeTag) {
      if (modifiers.lazy) {
        // lazy 模式：使用 change 事件
        events.onChange = (event: Event | any) => {
          const newValue = event?.target?.value ?? event;
          this.setStateByPath(runtimeContext.state, modelPath, transformValue(newValue));
        };
      } else {
        // 默认模式：使用 input 事件
        events.onInput = (event: Event | any) => {
          const newValue = event?.target?.value ?? event;
          this.setStateByPath(runtimeContext.state, modelPath, transformValue(newValue));
        };
      }
    }

    // 兼容 Vue 组件的 update 事件
    events['onUpdate:modelValue'] = (newValue: any) => {
      this.setStateByPath(runtimeContext.state, modelPath, transformValue(newValue));
    };
    events['onUpdate:value'] = (newValue: any) => {
      this.setStateByPath(runtimeContext.state, modelPath, transformValue(newValue));
    };

    return {
      props: {
        value: value,
        modelValue: value,
      },
      events,
    };
  }

  /**
   * 解析 model 表达式中的修饰符
   * @param expression 表达式，如 "username.trim.lazy"
   * @returns 路径和修饰符对象
   */
  private parseModelModifiers(expression: string): {
    path: string;
    modifiers: { trim?: boolean; number?: boolean; lazy?: boolean };
  } {
    const knownModifiers = ['trim', 'number', 'lazy'];
    const parts = expression.split('.');
    
    // 从后往前找修饰符
    const modifiers: { trim?: boolean; number?: boolean; lazy?: boolean } = {};
    let pathParts = [...parts];
    
    while (pathParts.length > 1) {
      const last = pathParts[pathParts.length - 1];
      if (knownModifiers.includes(last)) {
        (modifiers as any)[last] = true;
        pathParts.pop();
      } else {
        break;
      }
    }
    
    return {
      path: pathParts.join('.'),
      modifiers,
    };
  }

  /**
   * 解析带参数的 v-model:xxx 双向绑定（支持修饰符）
   * @param arg 参数名，如 columns、visible
   * @param modelExpression 绑定表达式，支持修饰符如 "path.trim"
   * @param runtimeContext 运行时上下文
   * @param evalContext 求值上下文
   */
  private resolveModelWithArg(
    arg: string,
    modelExpression: string,
    runtimeContext: RuntimeContext,
    evalContext: EvaluationContext
  ): { props: Record<string, any>; events: Record<string, Function> } {
    // 确保 modelExpression 是字符串
    if (typeof modelExpression !== 'string') {
      console.warn('resolveModelWithArg: modelExpression 应为字符串，收到:', typeof modelExpression, modelExpression);
      return { props: {}, events: {} };
    }
    
    // 解析修饰符
    const { path: modelPath, modifiers } = this.parseModelModifiers(modelExpression);
    
    // 获取当前值
    const currentValue = this.evaluator.evaluate(modelPath, evalContext);
    const value = currentValue.success ? currentValue.value : undefined;

    // 值转换函数
    const transformValue = (val: any): any => {
      let result = val;
      if (modifiers.trim && typeof result === 'string') {
        result = result.trim();
      }
      if (modifiers.number) {
        const num = parseFloat(result);
        result = isNaN(num) ? result : num;
      }
      return result;
    };

    // 构建事件名：update:xxx -> onUpdate:xxx
    const eventName = `onUpdate:${arg}`;

    return {
      props: {
        [arg]: value,
      },
      events: {
        [eventName]: (newValue: any) => {
          this.setStateByPath(runtimeContext.state, modelPath, transformValue(newValue));
        },
      },
    };
  }


  /**
   * 渲染子节点为 VNode 数组
   * 支持嵌套数据：如果子节点定义了 data/state，则创建独立的运行时上下文
   * 特殊处理：如果子节点同时有 for 和 data，需要先处理 for 循环
   * @param node JSON 节点定义
   * @param runtimeContext 运行时上下文
   * @param actionContext 动作执行上下文
   * @param evalContext 求值上下文
   * @param dynamicChildren 可选的动态子节点（来自 uiApi，优先级高于 node.children）
   */
  private renderChildrenAsVNodes(
    node: JsonNode,
    runtimeContext: RuntimeContext,
    actionContext: ActionContext,
    evalContext: EvaluationContext,
    dynamicChildren?: Ref<JsonNode[] | null>
  ): VNode[] | null {
    // 如果有 dynamicChildren，优先使用它
    const childrenSource = dynamicChildren?.value ?? node.children;
    
    if (!childrenSource) return null;

    // 文本内容
    if (typeof childrenSource === 'string') {
      let text: string;
      if (this.evaluator.isTemplateExpression(childrenSource)) {
        const result = this.evaluator.evaluateTemplate(childrenSource, evalContext);
        text = result === undefined || result === null ? '' : String(result);
      } else {
        text = childrenSource;
      }
      return [createTextVNode(text)];
    }

    // 子节点数组
    const childVNodes: VNode[] = [];
    for (const child of childrenSource) {
      // 先在父级上下文中检查 v-if 条件
      // 这样即使子节点有独立 data，也能正确响应父级状态的条件
      if (child.if !== undefined) {
        const conditionResult = this.evaluator.evaluate(child.if, evalContext);
        if (!conditionResult.success || !conditionResult.value) {
          // 条件为 false，跳过此子节点
          continue;
        }
      }

      // 检查子节点是否有 for 循环
      // 如果有 for 循环，需要先在当前上下文中处理循环，然后为每个循环项创建独立组件
      if (child.for) {
        // 有 for 循环，使用 renderNode 处理（它会调用 renderForLoop）
        const childVNode = this.renderNode(child, runtimeContext, actionContext);
        if (childVNode !== null) {
          if (Array.isArray(childVNode)) {
            childVNodes.push(...childVNode);
          } else {
            childVNodes.push(childVNode);
          }
        }
      } else if (child.data || child.computed || child.watch || child.methods || 
          child.onMounted || child.onUnmounted || child.onUpdated) {
        // 子节点有独立数据但没有 for 循环，渲染为独立组件
        // 注意：if 条件已经在上面检查过了，需要从子节点中移除 if
        // 否则子组件内部会再次检查 if 条件，但此时上下文已经是子组件的状态
        const childWithoutIf: JsonNode = child.if !== undefined 
          ? { ...child, if: undefined } 
          : child;
        const ChildComponent = this.render(childWithoutIf, runtimeContext);
        childVNodes.push(h(ChildComponent));
      } else {
        // 子节点没有独立数据，直接渲染
        const childVNode = this.renderNode(child, runtimeContext, actionContext);
        if (childVNode !== null) {
          if (Array.isArray(childVNode)) {
            childVNodes.push(...childVNode);
          } else {
            childVNodes.push(childVNode);
          }
        }
      }
    }

    return childVNodes.length > 0 ? childVNodes : null;
  }

  /**
   * 渲染 v-for 循环
   */
  private renderForLoop(
    node: JsonNode,
    runtimeContext: RuntimeContext,
    actionContext: ActionContext,
    evalContext: EvaluationContext
  ): VNode[] {
    const forExpression = node.for!;
    const { itemName, indexName, listExpression } = this.parseForExpression(forExpression);

    // 求值列表表达式
    const listResult = this.evaluator.evaluate(listExpression, evalContext);
    if (!listResult.success || !Array.isArray(listResult.value)) {
      console.warn(`v-for expression "${listExpression}" did not evaluate to an array`);
      return [];
    }

    const list = listResult.value;
    const vnodes: VNode[] = [];

    for (let index = 0; index < list.length; index++) {
      const item = list[index];

      // 创建不带 for 的节点副本
      const nodeWithoutFor: JsonNode = { ...node };
      delete nodeWithoutFor.for;

      // 检查节点是否有独立数据
      const hasOwnData = nodeWithoutFor.data || nodeWithoutFor.computed || 
                          nodeWithoutFor.watch || nodeWithoutFor.methods ||
                          nodeWithoutFor.onMounted || nodeWithoutFor.onUnmounted || 
                          nodeWithoutFor.onUpdated;

      if (hasOwnData) {
        // 节点有独立数据，需要作为独立组件渲染
        // 将循环变量和父级数据都注入到子组件数据中
        const wrappedNode: JsonNode = {
          ...nodeWithoutFor,
          data: {
            // 先复制父级数据（这样子组件可以访问父级的数据）
            ...runtimeContext.state,
            // 然后是子组件自己的数据
            ...nodeWithoutFor.data,
            // 最后是循环变量（优先级最高）
            [itemName]: item,
            ...(indexName ? { [indexName]: index } : {}),
          },
        };
        
        const ChildComponent = this.render(wrappedNode, runtimeContext);
        const vnode = h(ChildComponent);
        
        // 处理 key
        if (node.key) {
          const keyEvalContext: EvaluationContext = {
            state: { ...runtimeContext.state, [itemName]: item, ...(indexName ? { [indexName]: index } : {}) },
            computed: runtimeContext.computed,
            $item: item,
            $index: index,
          };
          const keyResult = this.evaluator.evaluateTemplate(node.key, keyEvalContext);
          (vnode as any).key = keyResult;
        } else {
          (vnode as any).key = index;
        }
        vnodes.push(vnode);
      } else {
        // 节点没有独立数据，直接渲染
        const itemContext: RuntimeContext = {
          ...runtimeContext,
          state: {
            ...runtimeContext.state,
            [itemName]: item,
            ...(indexName ? { [indexName]: index } : {}),
          },
          $item: item,
          $index: index,
        };

        const itemEvalContext: EvaluationContext = {
          state: itemContext.state,
          computed: runtimeContext.computed,
          $item: item,
          $index: index,
          $parent: evalContext.$parent,
        };

        // 渲染循环项
        const vnode = this.renderComponent(
          nodeWithoutFor,
          itemContext,
          {
            ...actionContext,
            state: itemContext.state,
          },
          itemEvalContext
        );

        if (vnode) {
          // 处理 key
          if (node.key) {
            const keyResult = this.evaluator.evaluateTemplate(node.key, itemEvalContext);
            (vnode as any).key = keyResult;
          } else {
            (vnode as any).key = index;
          }
          vnodes.push(vnode);
        }
      }
    }

    return vnodes;
  }


  /**
   * 解析 v-for 表达式
   * 支持格式: "item in items" 或 "(item, index) in items"
   */
  private parseForExpression(expression: string): {
    itemName: string;
    indexName?: string;
    listExpression: string;
  } {
    // 匹配 "(item, index) in items" 格式
    const tupleMatch = expression.match(/^\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s+in\s+(.+)$/);
    if (tupleMatch) {
      return {
        itemName: tupleMatch[1],
        indexName: tupleMatch[2],
        listExpression: tupleMatch[3].trim(),
      };
    }

    // 匹配 "item in items" 格式
    const simpleMatch = expression.match(/^\s*(\w+)\s+in\s+(.+)$/);
    if (simpleMatch) {
      return {
        itemName: simpleMatch[1],
        listExpression: simpleMatch[2].trim(),
      };
    }

    // 无法解析，返回默认值
    console.warn(`Invalid v-for expression: "${expression}"`);
    return {
      itemName: 'item',
      listExpression: expression,
    };
  }

  /**
   * 解析插槽
   * 支持三种插槽类型：
   * 1. 默认插槽 (default)
   * 2. 命名插槽 (named slots)
   * 3. 作用域插槽 (scoped slots) - 可以接收组件传递的 props
   */
  private resolveSlots(
    slots: Record<string, JsonNode[] | SlotDefinition> | undefined,
    runtimeContext: RuntimeContext,
    actionContext: ActionContext,
    _evalContext: EvaluationContext
  ): Record<string, (slotProps?: any) => VNode[]> | null {
    if (!slots) return null;

    const resolvedSlots: Record<string, (slotProps?: any) => VNode[]> = {};

    for (const [slotName, slotContent] of Object.entries(slots)) {
      // 检查是否为作用域插槽定义
      if (checkSlotDefinition(slotContent)) {
        // 作用域插槽
        const slotDef = slotContent as SlotDefinition;
        resolvedSlots[slotName] = (slotProps?: any) => {
          const vnodes: VNode[] = [];
          
          // 创建包含作用域插槽 props 的上下文
          const scopedContext: RuntimeContext = {
            ...runtimeContext,
            state: {
              ...runtimeContext.state,
              // 如果指定了 slotProps 名称，将插槽 props 绑定到该名称
              ...(slotDef.slotProps && slotProps ? { [slotDef.slotProps]: slotProps } : {}),
            },
          };
          
          const scopedActionContext: ActionContext = {
            ...actionContext,
            state: scopedContext.state,
          };
          
          for (const slotNode of slotDef.content) {
            const vnode = this.renderNode(slotNode, scopedContext, scopedActionContext);
            if (vnode !== null) {
              if (Array.isArray(vnode)) {
                vnodes.push(...vnode);
              } else {
                vnodes.push(vnode);
              }
            }
          }
          return vnodes;
        };
      } else {
        // 简单插槽（默认插槽或命名插槽）
        const slotNodes = slotContent as JsonNode[];
        resolvedSlots[slotName] = () => {
          const vnodes: VNode[] = [];
          for (const slotNode of slotNodes) {
            const vnode = this.renderNode(slotNode, runtimeContext, actionContext);
            if (vnode !== null) {
              if (Array.isArray(vnode)) {
                vnodes.push(...vnode);
              } else {
                vnodes.push(vnode);
              }
            }
          }
          return vnodes;
        };
      }
    }

    return Object.keys(resolvedSlots).length > 0 ? resolvedSlots : null;
  }

  /**
   * 通过路径设置状态值
   */
  private setStateByPath(state: any, path: string, value: any): void {
    setByPath(state, path, value);
  }
}

/**
 * 创建渲染器实例
 */
export function createRenderer(options?: RendererOptions): Renderer {
  return new Renderer(options);
}

/**
 * 规范化 API 配置
 * 将字符串简写转换为完整对象格式
 * @param config API 配置（字符串或对象）
 * @returns 规范化后的 API 配置对象
 */
export function normalizeApiConfig(config: ApiConfig): ApiConfigObject {
  if (typeof config === 'string') {
    return { url: config, method: 'GET' };
  }
  return {
    url: config.url,
    method: config.method || 'GET',
    headers: config.headers,
    body: config.body,
    then: config.then,
    catch: config.catch,
    ignoreBaseURL: config.ignoreBaseURL,
  };
}

/**
 * 处理 URL 中的模板表达式
 * 将 {{ expr }} 格式的表达式替换为求值结果
 * @param url URL 字符串，可能包含模板表达式
 * @param evaluator 表达式求值器
 * @param evalContext 求值上下文
 * @returns 替换后的 URL 字符串
 * @example
 * resolveUrlTemplate('/api/users/{{ userId }}', evaluator, { state: { userId: 123 } })
 * // 返回: '/api/users/123'
 */
export function resolveUrlTemplate(
  url: string,
  evaluator: ExpressionEvaluator,
  evalContext: EvaluationContext
): string {
  // 匹配 {{ expr }} 格式的模板表达式
  return url.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr) => {
    const result = evaluator.evaluate(expr, evalContext);
    if (result.success) {
      // 对 URL 参数进行编码，确保特殊字符被正确处理
      const value = result.value;
      if (value === null || value === undefined) {
        return '';
      }
      return encodeURIComponent(String(value));
    }
    // 表达式求值失败，返回空字符串
    return '';
  });
}
