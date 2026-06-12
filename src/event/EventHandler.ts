/**
 * Event Handler - 事件处理器
 * 负责处理事件绑定和动作执行
 */

import type {
  IEventHandler,
  ActionContext,
  EvaluationContext,
} from '../types/runtime';
import type {
  Action,
  SetAction,
  CallAction,
  EmitAction,
  FetchAction,
  WebSocketAction,
  IfAction,
  ScriptAction,
  CopyAction,
} from '../types/schema';
import {
  isSetAction,
  isCallAction,
  isEmitAction,
  isFetchAction,
  isWebSocketAction,
  isIfAction,
  isScriptAction,
  isCopyAction,
} from '../types/schema';
import type { EventModifiers } from '../types/runtime';
import { resolveMethod } from '../utils/path';

/**
 * 键盘按键映射
 */
const KEY_CODES: Record<string, string[]> = {
  enter: ['Enter'],
  tab: ['Tab'],
  delete: ['Delete', 'Backspace'],
  esc: ['Escape'],
  space: [' ', 'Space'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
};

export class EventHandler implements IEventHandler {
  /**
   * WebSocket（双向通信协议）长连接实例缓存。
   * key 规则：connect 时优先使用 `id`；否则使用解析后的 URL。
   */
  private webSockets: Map<string, WebSocket> = new Map();

  /**
   * 清理所有 WebSocket 连接
   * 在组件卸载时调用，确保所有连接被正确关闭
   */
  dispose(): void {
    for (const [key, socket] of this.webSockets.entries()) {
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, 'Component unmounted');
        }
      } catch (e) {
        // 忽略关闭时的错误
        console.warn(`关闭 WebSocket 连接（key="${key}"）时出错：`, e);
      }
    }
    this.webSockets.clear();
  }

  /**
   * 解析事件名称和修饰符
   * @param eventKey 事件键，如 "click.prevent.stop" 或 "keyup.enter"
   * @returns 事件名称和修饰符
   */
  parseEventKey(eventKey: string): { eventName: string; modifiers: EventModifiers } {
    const parts = eventKey.split('.');
    const eventName = parts[0];
    const modifiers: EventModifiers = {};

    for (let i = 1; i < parts.length; i++) {
      const mod = parts[i].toLowerCase();
      (modifiers as any)[mod] = true;
    }

    return { eventName, modifiers };
  }

  /**
   * 获取事件监听器选项（用于 addEventListener）
   * @param modifiers 事件修饰符
   * @returns AddEventListenerOptions
   */
  getListenerOptions(modifiers: EventModifiers): AddEventListenerOptions {
    const options: AddEventListenerOptions = {};

    if (modifiers.capture) {
      options.capture = true;
    }
    if (modifiers.once) {
      options.once = true;
    }
    if (modifiers.passive) {
      options.passive = true;
    }

    return options;
  }

  /**
   * 检查是否有需要在 addEventListener 中处理的修饰符
   */
  hasListenerModifiers(modifiers: EventModifiers): boolean {
    return !!(modifiers.capture || modifiers.once || modifiers.passive);
  }


  /**
   * 检查键盘事件是否匹配修饰符
   */
  private checkKeyModifiers(event: KeyboardEvent, modifiers: EventModifiers): boolean {
    // 检查键盘按键
    for (const [modKey, keyCodes] of Object.entries(KEY_CODES)) {
      if ((modifiers as any)[modKey]) {
        if (!keyCodes.includes(event.key)) {
          return false;
        }
      }
    }

    // 检查系统修饰键
    if (modifiers.ctrl && !event.ctrlKey) return false;
    if (modifiers.alt && !event.altKey) return false;
    if (modifiers.shift && !event.shiftKey) return false;
    if (modifiers.meta && !event.metaKey) return false;

    return true;
  }

  /**
   * 检查鼠标事件是否匹配修饰符
   */
  private checkMouseModifiers(event: MouseEvent, modifiers: EventModifiers): boolean {
    // 检查鼠标中键
    if (modifiers.middle && event.button !== 1) return false;

    // 检查系统修饰键
    if (modifiers.ctrl && !event.ctrlKey) return false;
    if (modifiers.alt && !event.altKey) return false;
    if (modifiers.shift && !event.shiftKey) return false;
    if (modifiers.meta && !event.metaKey) return false;

    return true;
  }

  /**
   * 创建事件处理函数
   * @param action 动作或动作数组
   * @param context 动作执行上下文
   * @returns 事件处理函数
   */
  createHandler(action: Action | Action[], context: ActionContext): Function {
    return async (event?: Event) => {
      // 保存上一个 $event，支持嵌套/交错调用的栈恢复
      // 防止快速连续事件互相覆盖（竞态条件）
      const prevEvent = context.state.$event;
      // 将 $event 直接添加到原始 state 中，保持响应式
      context.state.$event = event;

      try {
        await this.executeActions(
          Array.isArray(action) ? action : [action],
          context
        );
      } finally {
        // 恢复上一个 $event，确保外层 handler 不受影响
        if (prevEvent === undefined) {
          delete context.state.$event;
        } else {
          context.state.$event = prevEvent;
        }
      }
    };
  }

  /**
   * 创建带修饰符的事件处理函数
   * @param eventKey 事件键（包含修饰符）
   * @param action 动作或动作数组
   * @param context 动作执行上下文
   * @returns 事件处理函数
   */
  createHandlerWithModifiers(
    eventKey: string,
    action: Action | Action[],
    context: ActionContext
  ): Function {
    const { modifiers } = this.parseEventKey(eventKey);

    return async (event?: Event) => {
      // 应用修饰符
      if (event) {
        // .prevent - 阻止默认行为
        if (modifiers.prevent) {
          event.preventDefault();
        }

        // .stop - 阻止事件冒泡
        if (modifiers.stop) {
          event.stopPropagation();
        }

        // .self - 只在 event.target 是当前元素时触发
        if (modifiers.self && event.target !== event.currentTarget) {
          return;
        }

        // 键盘事件修饰符检查
        if (event instanceof KeyboardEvent) {
          if (!this.checkKeyModifiers(event, modifiers)) {
            return;
          }
        }

        // 鼠标事件修饰符检查
        if (event instanceof MouseEvent) {
          if (!this.checkMouseModifiers(event, modifiers)) {
            return;
          }
        }
      }

      // 保存上一个 $event，支持嵌套/交错调用的栈恢复
      const prevEvent = context.state.$event;
      // 将 $event 直接添加到原始 state 中，保持响应式
      context.state.$event = event;

      try {
        await this.executeActions(
          Array.isArray(action) ? action : [action],
          context
        );
      } finally {
        // 恢复上一个 $event
        if (prevEvent === undefined) {
          delete context.state.$event;
        } else {
          context.state.$event = prevEvent;
        }
      }
    };
  }


  /**
   * 执行单个动作
   * @param action 动作对象
   * @param context 动作执行上下文
   */
  async executeAction(action: Action, context: ActionContext): Promise<void> {
    if (isSetAction(action)) {
      await this.executeSetAction(action, context);
    } else if (isCallAction(action)) {
      await this.executeCallAction(action, context);
    } else if (isEmitAction(action)) {
      await this.executeEmitAction(action, context);
    } else if (isFetchAction(action)) {
      await this.executeFetchAction(action, context);
    } else if (isWebSocketAction(action)) {
      await this.executeWebSocketAction(action, context);
    } else if (isIfAction(action)) {
      await this.executeIfAction(action, context);
    } else if (isScriptAction(action)) {
      await this.executeScriptAction(action, context);
    } else if (isCopyAction(action)) {
      await this.executeCopyAction(action, context);
    } else {
      console.warn('未知的动作类型（Action）：', action);
    }
  }

  private normalizeWsOp(op: WebSocketAction['op']): 'connect' | 'send' | 'close' {
    return (op || 'connect') as 'connect' | 'send' | 'close';
  }

  private async withFinally(
    action: Pick<WebSocketAction, 'then' | 'catch' | 'finally'>,
    context: ActionContext,
    run: () => Promise<void>
  ): Promise<void> {
    try {
      await run();
      if (action.then) {
        const thenActions = Array.isArray(action.then) ? action.then : [action.then];
        await this.executeActions(thenActions, context);
      }
    } catch (error) {
      if (action.catch) {
        const errorContext: ActionContext = {
          ...context,
          state: {
            ...context.state,
            $error: error,
          },
        };
        const catchActions = Array.isArray(action.catch) ? action.catch : [action.catch];
        await this.executeActions(catchActions, errorContext);
      } else {
        // 与 FetchAction（HTTP 请求动作）的行为保持一致：存在 catch 则吞掉错误，否则输出到控制台。
        console.error('WebSocketAction（WebSocket 动作）执行出错：', error);
      }
    } finally {
      if (action.finally) {
        const finallyActions = Array.isArray(action.finally) ? action.finally : [action.finally];
        await this.executeActions(finallyActions, context);
      }
    }
  }

  private parseWsMessageData(data: any, responseType: WebSocketAction['responseType']): any {
    const mode = responseType || 'auto';

    if (mode === 'text') {
      return typeof data === 'string' ? data : String(data);
    }

    if (mode === 'json') {
      if (typeof data === 'string') return JSON.parse(data);
      // 如果已经是对象（例如测试 mock），直接返回即可。
      return data;
    }

    // auto
    if (typeof data !== 'string') return data;
    const trimmed = data.trim();
    if (!trimmed) return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  private async waitForWebSocketOpen(
    socket: WebSocket,
    timeoutMs: number | undefined
  ): Promise<void> {
    if (socket.readyState === WebSocket.OPEN) return;

    await new Promise<void>((resolve, reject) => {
      let timeoutId: any;
      // 优先使用 addEventListener；如果测试 mock 只实现了 onopen/onerror 等属性，则降级为覆盖属性。
      const hasAddEventListener = typeof (socket as any).addEventListener === 'function';

      const prevOnOpen = socket.onopen;
      const prevOnError = socket.onerror;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (hasAddEventListener) {
          (socket as any).removeEventListener('open', onOpen as any);
          (socket as any).removeEventListener('error', onError as any);
        } else {
          // 还原旧的 handler（可能为 null）
          socket.onopen = prevOnOpen as any;
          socket.onerror = prevOnError as any;
        }
      };

      const onOpen = (ev?: any) => {
        cleanup();
        // 保留原有行为：如果之前已有 onopen，则继续调用它
        if (!hasAddEventListener && typeof prevOnOpen === 'function') {
          try {
            (prevOnOpen as any).call(socket, ev);
          } catch {
            // open 等待器不关心用户 handler 的异常
          }
        }
        resolve();
      };

      const onError = (ev?: any) => {
        cleanup();
        if (!hasAddEventListener && typeof prevOnError === 'function') {
          try {
            (prevOnError as any).call(socket, ev);
          } catch {
            // open 等待器不关心用户 handler 的异常
          }
        }
        reject(new Error('WebSocket 连接错误'));
      };

      if (hasAddEventListener) {
        (socket as any).addEventListener('open', onOpen as any);
        (socket as any).addEventListener('error', onError as any);
      } else {
        socket.onopen = onOpen as any;
        socket.onerror = onError as any;
      }

      if (timeoutMs && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`WebSocket 连接超时，已等待 ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }

  /**
   * 执行 WebSocketAction - 长连接 WebSocket
   */
  private async executeWebSocketAction(action: WebSocketAction, context: ActionContext): Promise<void> {
    const evalContext: EvaluationContext = {
      state: context.state,
      computed: context.computed,
      $event: context.state.$event,
      $response: context.state.$response,
      $error: context.state.$error,
    };

    const op = this.normalizeWsOp(action.op);

    const wsRaw = action.ws;
    const wsValue =
      typeof wsRaw === 'string' && context.evaluator.isTemplateExpression(wsRaw)
        ? context.evaluator.evaluateTemplate(wsRaw, evalContext)
        : wsRaw;
    const wsKeyOrUrl = String(wsValue);

    const idRaw = action.id;
    const idValue =
      typeof idRaw === 'string' && context.evaluator.isTemplateExpression(idRaw)
        ? context.evaluator.evaluateTemplate(idRaw, evalContext)
        : idRaw;
    const id = idValue !== undefined ? String(idValue) : undefined;

    const timeout = action.timeout;

    // 标准化 protocols（只对字符串/字符串数组做模板表达式求值）
    let protocols: string | string[] | undefined = action.protocols;
    if (typeof protocols === 'string' && context.evaluator.isTemplateExpression(protocols)) {
      protocols = String(context.evaluator.evaluateTemplate(protocols, evalContext));
    } else if (Array.isArray(protocols)) {
      protocols = protocols.map((p) => {
        if (typeof p === 'string' && context.evaluator.isTemplateExpression(p)) {
          return String(context.evaluator.evaluateTemplate(p, evalContext));
        }
        return String(p);
      });
    }

    await this.withFinally(action, context, async () => {
      if (op === 'connect') {
        const url = wsKeyOrUrl;
        const key = id || url;

        // 如果已有连接仍处于 CONNECTING/OPEN 则复用，否则用新连接替换。
        const existing = this.webSockets.get(key);
        if (existing && existing.readyState !== WebSocket.CLOSED) {
          // 重连/复用时需要更新回调（onOpen/onMessage/onError/onClose）。
          this.attachWebSocketHandlers(existing, action, context, key);
          await this.waitForWebSocketOpen(existing, timeout);
          return;
        }

        const socket = new WebSocket(url, protocols as any);
        this.webSockets.set(key, socket);

        this.attachWebSocketHandlers(socket, action, context, key);

        await this.waitForWebSocketOpen(socket, timeout);
      } else if (op === 'send') {
        const key = wsKeyOrUrl;
        const socket = this.webSockets.get(key);
        if (!socket) {
          throw new Error(`未找到 WebSocket 连接（key="${key}"）`);
        }

        if (socket.readyState === WebSocket.CONNECTING) {
          await this.waitForWebSocketOpen(socket, timeout);
        }

        if (socket.readyState !== WebSocket.OPEN) {
          throw new Error(`WebSocket 连接未处于打开状态（key="${key}"）`);
        }

        // 求值 message 中的模板表达式（支持嵌套对象/数组，行为类似 FetchAction）
        let message = action.message;
        if (message !== undefined) {
          if (typeof message === 'string' && context.evaluator.isTemplateExpression(message)) {
            message = context.evaluator.evaluateTemplate(message, evalContext);
          } else if (typeof message === 'object') {
            message = this.evaluateObjectExpressions(message, evalContext, context.evaluator);
          }
        }

        const sendAs = action.sendAs || (typeof message === 'string' ? 'text' : 'json');
        const payload = sendAs === 'json' ? JSON.stringify(message) : String(message ?? '');

        socket.send(payload);
      } else if (op === 'close') {
        const key = wsKeyOrUrl;
        const socket = this.webSockets.get(key);
        if (!socket) {
          // 关闭一个不存在的连接：直接忽略（no-op）
          return;
        }

        // 保留 onClose 回调可执行，但从 Map 中移除（避免重复 close）
        this.webSockets.delete(key);

        if (action.code !== undefined || action.reason !== undefined) {
          socket.close(action.code, action.reason);
        } else {
          socket.close();
        }
      }
    });
  }

  private attachWebSocketHandlers(
    socket: WebSocket,
    action: WebSocketAction,
    context: ActionContext,
    keyForCleanup?: string
  ): void {
    const responseType = action.responseType || 'auto';

    const normalizeActions = (a?: Action | Action[]) => (a ? (Array.isArray(a) ? a : [a]) : []);

    socket.onopen = async (event: any) => {
      const actions = normalizeActions(action.onOpen);
      if (actions.length === 0) return;

      const eventContext: ActionContext = {
        ...context,
        state: {
          ...context.state,
          $event: event,
        },
      };

      try {
        await this.executeActions(actions, eventContext);
      } catch (e) {
        console.error('WebSocket onOpen（连接打开回调）执行出错：', e);
      }
    };

    socket.onmessage = async (event: any) => {
      const actions = normalizeActions(action.onMessage);
      if (actions.length === 0) return;

      const parsed = this.parseWsMessageData(event?.data, responseType);

      const msgContext: ActionContext = {
        ...context,
        state: {
          ...context.state,
          $event: event,
          $response: parsed,
        },
      };

      try {
        await this.executeActions(actions, msgContext);
      } catch (e) {
        console.error('WebSocket onMessage（消息回调）执行出错：', e);
      }
    };

    socket.onerror = async (event: any) => {
      const actions = normalizeActions(action.onError);
      if (actions.length === 0) return;

      const errContext: ActionContext = {
        ...context,
        state: {
          ...context.state,
          $event: event,
          $error: event,
        },
      };

      try {
        await this.executeActions(actions, errContext);
      } catch (e) {
        console.error('WebSocket onError（错误回调）执行出错：', e);
      }
    };

    socket.onclose = async (event: any) => {
      if (keyForCleanup) {
        // 如果 key 仍存在，确保清理。
        this.webSockets.delete(keyForCleanup);
      }

      const actions = normalizeActions(action.onClose);
      if (actions.length === 0) return;

      const closeContext: ActionContext = {
        ...context,
        state: {
          ...context.state,
          $event: event,
        },
      };

      try {
        await this.executeActions(actions, closeContext);
      } catch (e) {
        console.error('WebSocket onClose（连接关闭回调）执行出错：', e);
      }
    };
  }

  /**
   * 执行多个动作（按顺序）
   * @param actions 动作数组
   * @param context 动作执行上下文
   */
  async executeActions(actions: Action[], context: ActionContext): Promise<void> {
    for (const action of actions) {
      await this.executeAction(action, context);
    }
  }

  /**
   * 执行 SetAction - 设置状态
   */
  private async executeSetAction(action: SetAction, context: ActionContext): Promise<void> {
    let value = action.value;

    // 如果值是表达式，求值
    if (typeof value === 'string' && context.evaluator.isTemplateExpression(value)) {
      const evalContext: EvaluationContext = {
        state: context.state,
        computed: context.computed,
        $event: context.state.$event,
        $response: context.state.$response,
        $error: context.state.$error,
      };
      value = context.evaluator.evaluateTemplate(value, evalContext);
    }

    context.stateManager.setState(action.set, value);
  }

  /**
   * 执行 CallAction - 调用方法
   */
  private async executeCallAction(action: CallAction, context: ActionContext): Promise<void> {
    // 使用工具函数查找方法（支持嵌套路径，如 "$methods.$nav.push"）
    const method = resolveMethod(action.call, [context.methods, context.state]);
    
    if (!method) {
      console.warn(`未找到方法（Method）"${action.call}"`);
      return;
    }

    // 处理参数中的表达式
    let args = action.args || [];
    if (args.length > 0) {
      args = args.map(arg => {
        if (typeof arg === 'string' && context.evaluator.isTemplateExpression(arg)) {
          const evalContext: EvaluationContext = {
            state: context.state,
            computed: context.computed,
            $event: context.state.$event,
          };
          return context.evaluator.evaluateTemplate(arg, evalContext);
        }
        return arg;
      });
    }

    try {
      const result = method(...args);
      // 如果方法返回 Promise，等待它完成
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      console.error(`执行方法（Method）"${action.call}" 时出错：`, error);
    }
  }

  /**
   * 执行 EmitAction - 触发事件
   */
  private async executeEmitAction(action: EmitAction, context: ActionContext): Promise<void> {
    let payload = action.payload;

    // 如果 payload 是表达式，求值
    if (typeof payload === 'string' && context.evaluator.isTemplateExpression(payload)) {
      const evalContext: EvaluationContext = {
        state: context.state,
        computed: context.computed,
        $event: context.state.$event,
      };
      payload = context.evaluator.evaluateTemplate(payload, evalContext);
    }

    context.emit(action.emit, payload);
  }


  /**
   * 执行 FetchAction - API 调用
   */
  private async executeFetchAction(action: FetchAction, context: ActionContext): Promise<void> {
    const evalContext: EvaluationContext = {
      state: context.state,
      computed: context.computed,
      $event: context.state.$event,
    };

    // 解析 URL 中的表达式
    let url = action.fetch;
    if (context.evaluator.isTemplateExpression(url)) {
      url = context.evaluator.evaluateTemplate(url, evalContext);
    }

    // 解析 method 中的表达式
    let method = action.method;
    if (method && typeof method === 'string' && context.evaluator.isTemplateExpression(method)) {
      method = context.evaluator.evaluateTemplate(method, evalContext);
    }

    // 解析查询参数中的表达式
    let params = action.params;
    if (params) {
      params = this.evaluateObjectExpressions(params, evalContext, context.evaluator);
    }

    // 解析请求体中的表达式
    let body = action.body;
    if (body !== undefined) {
      if (typeof body === 'string' && context.evaluator.isTemplateExpression(body)) {
        body = context.evaluator.evaluateTemplate(body, evalContext);
      } else if (typeof body === 'object') {
        body = this.evaluateObjectExpressions(body, evalContext, context.evaluator);
      }
    }

    // 解析请求头中的表达式
    let headers = action.headers;
    if (headers) {
      headers = this.evaluateObjectExpressions(headers, evalContext, context.evaluator);
    }

    try {
      const result = await context.fetcher.fetch(
        {
          ...action,
          fetch: url,
          method,
          params,
          body,
          headers,
        },
        evalContext
      );

      if (result.success && action.then) {
        // 成功回调 - save/restore 模式，避免 $response 竞态条件
        const prevResponse = context.state.$response;
        context.state.$response = result.response || result.data;

        try {
          const thenActions = Array.isArray(action.then) ? action.then : [action.then];
          await this.executeActions(thenActions, context);
        } finally {
          if (prevResponse === undefined) {
            delete context.state.$response;
          } else {
            context.state.$response = prevResponse;
          }
        }
      } else if (!result.success && action.catch) {
        // 错误回调 - save/restore 模式，避免 $error 竞态条件
        const prevError = context.state.$error;
        context.state.$error = result.error;

        try {
          const catchActions = Array.isArray(action.catch) ? action.catch : [action.catch];
          await this.executeActions(catchActions, context);
        } finally {
          if (prevError === undefined) {
            delete context.state.$error;
          } else {
            context.state.$error = prevError;
          }
        }
      }
    } catch (error) {
      // 网络错误等
      if (action.catch) {
        const prevError = context.state.$error;
        context.state.$error = error;

        try {
          const catchActions = Array.isArray(action.catch) ? action.catch : [action.catch];
          await this.executeActions(catchActions, context);
        } finally {
          if (prevError === undefined) {
            delete context.state.$error;
          } else {
            context.state.$error = prevError;
          }
        }
      } else {
        console.error('Fetch（网络请求）出错：', error);
      }
    } finally {
      // finally 回调 - 无论成功或失败都执行
      if (action.finally) {
        const finallyActions = Array.isArray(action.finally) ? action.finally : [action.finally];
        await this.executeActions(finallyActions, context);
      }
    }
  }

  /**
   * 执行 IfAction - 条件动作
   */
  private async executeIfAction(action: IfAction, context: ActionContext): Promise<void> {
    const evalContext: EvaluationContext = {
      state: context.state,
      computed: context.computed,
      $event: context.state.$event,
      $response: context.state.$response,
      $error: context.state.$error,
    };

    const conditionResult = context.evaluator.evaluate(action.if, evalContext);

    if (conditionResult.success && conditionResult.value) {
      // 条件为真，执行 then 分支
      const thenActions = Array.isArray(action.then) ? action.then : [action.then];
      await this.executeActions(thenActions, context);
    } else if (action.else) {
      // 条件为假，执行 else 分支
      const elseActions = Array.isArray(action.else) ? action.else : [action.else];
      await this.executeActions(elseActions, context);
    }
  }

  /**
   * 执行 ScriptAction - 自定义脚本
   * 在沙箱环境中执行 JavaScript 代码
   */
  private async executeScriptAction(action: ScriptAction, context: ActionContext): Promise<void> {
    const { script } = action;
    
    if (!script || typeof script !== 'string') {
      console.warn('ScriptAction（脚本动作）：script 必须是非空字符串');
      return;
    }

    try {
      // 合并内部方法和外部注入的方法
      // 外部方法通过 JsonRenderer 的 methods prop 注入到 state.$methods
      const stateMethodsRaw = context.state.$methods;
      // 处理可能的 Vue Proxy 包装
      const stateMethods = stateMethodsRaw && typeof stateMethodsRaw === 'object' 
        ? { ...stateMethodsRaw } 
        : {};
      
      const mergedMethods = {
        ...context.methods,
        ...stateMethods,
      };

      // 构建脚本执行上下文
      const scriptContext = {
        state: context.state,
        computed: context.computed,
        $event: context.state.$event,
        $response: context.state.$response,
        $error: context.state.$error,
        $methods: mergedMethods,
        // 提供一些常用工具函数
        console,
        JSON,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Date,
        Math,
        Promise,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      };

      // 构建参数名和参数值
      const paramNames = Object.keys(scriptContext);
      const paramValues = Object.values(scriptContext);

      // 创建异步函数并执行
      // 使用 AsyncFunction 构造器来支持 await
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      
      const fn = new AsyncFunction(...paramNames, script);
      
      await fn(...paramValues);
    } catch (error) {
      console.error('ScriptAction（脚本动作）执行出错：', error);
    }
  }

  /**
   * 执行 CopyAction - 复制文本到剪贴板
   * 优先使用现代 Clipboard API，自动降级到 execCommand 方案
   */
  private async executeCopyAction(action: CopyAction, context: ActionContext): Promise<void> {
    const evalContext: EvaluationContext = {
      state: context.state,
      computed: context.computed,
      $event: context.state.$event,
      $response: context.state.$response,
      $error: context.state.$error,
    };

    // 解析要复制的内容
    let textToCopy = action.copy;
    if (typeof textToCopy === 'string' && context.evaluator.isTemplateExpression(textToCopy)) {
      textToCopy = context.evaluator.evaluateTemplate(textToCopy, evalContext);
    }
    
    // 确保转换为字符串
    const text = textToCopy === null || textToCopy === undefined ? '' : String(textToCopy);

    try {
      await this.copyToClipboard(text);
      
      // 复制成功，执行 then 回调
      if (action.then) {
        const thenActions = Array.isArray(action.then) ? action.then : [action.then];
        await this.executeActions(thenActions, context);
      }
    } catch (error) {
      // 复制失败，执行 catch 回调
      if (action.catch) {
        const errorContext: ActionContext = {
          ...context,
          state: {
            ...context.state,
            $error: error,
          },
        };
        const catchActions = Array.isArray(action.catch) ? action.catch : [action.catch];
        await this.executeActions(catchActions, errorContext);
      } else {
        console.error('CopyAction（复制动作）执行出错：', error);
      }
    }
  }

  /**
   * 复制文本到剪贴板
   * 优先使用 Clipboard API，降级到 execCommand
   */
  private async copyToClipboard(text: string): Promise<void> {
    // 优先使用 Clipboard API（现代浏览器，需要 document 有焦点）
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Clipboard API 失败，尝试降级方案
      }
    }

    // 降级到 execCommand
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    
    // 将 textarea 插入到当前活动元素的父容器中，而不是 document.body
    // 这样在 Modal/Drawer 等使用焦点陷阱的场景下，textarea 仍在焦点陷阱范围内
    const container = document.activeElement?.parentElement || document.body;
    container.appendChild(textarea);
    
    try {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      
      const success = document.execCommand('copy');
      if (!success) {
        throw new Error('execCommand copy 失败');
      }
    } finally {
      container.removeChild(textarea);
    }
  }

  /**
   * 递归求值对象中的表达式
   */
  private evaluateObjectExpressions(
    obj: any,
    evalContext: EvaluationContext,
    evaluator: any
  ): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      if (evaluator.isTemplateExpression(obj)) {
        return evaluator.evaluateTemplate(obj, evalContext);
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.evaluateObjectExpressions(item, evalContext, evaluator));
    }

    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.evaluateObjectExpressions(value, evalContext, evaluator);
      }
      return result;
    }

    return obj;
  }
}

/**
 * 创建事件处理器实例
 */
export function createEventHandler(): EventHandler {
  return new EventHandler();
}
