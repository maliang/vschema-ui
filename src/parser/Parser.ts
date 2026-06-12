/**
 * JSON Schema Parser for Vue JSON Renderer
 * 解析和验证 JSON Schema，将其转换为 JsonNode 结构
 */

import type { JsonNode, Action, WatchConfig } from '../types/schema';
import type { IParser, ParseResult, ParseError, ValidationResult } from '../types/runtime';

/**
 * 有效的 JsonNode 属性列表
 */
const VALID_NODE_KEYS = new Set([
  // 组件渲染
  'com', 'props', 'children', 'events', 'slots',
  // 指令
  'if', 'show', 'for', 'key', 'model', 'ref',
  // 数据和逻辑
  'data', 'computed', 'watch', 'methods',
  // 生命周期
  'onMounted', 'onUnmounted', 'onUpdated',
  // API 配置
  'initApi', 'uiApi'
]);

/**
 * 有效的 Action 类型
 */
const ACTION_TYPES = ['set', 'call', 'emit', 'fetch', 'if', 'script', 'ws', 'copy'] as const;

/**
 * 有效的 HTTP 方法
 */
const VALID_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

const VALID_WS_OPS = ['connect', 'send', 'close'] as const;
const VALID_WS_SEND_AS = ['text', 'json'] as const;
const VALID_WS_RESPONSE_TYPES = ['text', 'json', 'auto'] as const;

/**
 * Parser 类 - 实现 JSON Schema 的解析、验证和序列化
 */
export class Parser implements IParser {
  private errors: ParseError[] = [];

  /**
   * 解析 JSON 字符串或对象为 JsonNode
   * @param json - JSON 字符串或对象
   * @returns 解析结果
   */
  parse(json: string | object): ParseResult {
    this.errors = [];

    // 处理字符串输入
    if (typeof json === 'string') {
      try {
        const parsed = JSON.parse(json);
        return this.parseObject(parsed);
      } catch (e) {
        const error = e as SyntaxError;
        // 尝试从错误消息中提取位置信息
        const posMatch = error.message.match(/position\s+(\d+)/i);
        const position = posMatch ? parseInt(posMatch[1], 10) : undefined;
        const { line, column } = position !== undefined 
          ? this.getLineAndColumn(json, position) 
          : { line: undefined, column: undefined };

        this.errors.push({
          path: '',
          message: `JSON 解析错误: ${error.message}`,
          line,
          column
        });

        return {
          success: false,
          errors: this.errors
        };
      }
    }

    // 处理对象输入
    return this.parseObject(json);
  }

  /**
   * 解析对象为 JsonNode
   */
  private parseObject(obj: any): ParseResult {
    if (obj === null || obj === undefined) {
      this.errors.push({
        path: '',
        message: '输入不能为 null 或 undefined'
      });
      return { success: false, errors: this.errors };
    }

    if (typeof obj !== 'object' || Array.isArray(obj)) {
      this.errors.push({
        path: '',
        message: '根节点必须是一个对象'
      });
      return { success: false, errors: this.errors };
    }

    const node = this.validateNode(obj, '');

    if (this.errors.length > 0) {
      return {
        success: false,
        node,
        errors: this.errors
      };
    }

    return {
      success: true,
      node
    };
  }

  /**
   * 验证并转换节点
   */
  private validateNode(obj: any, path: string): JsonNode {
    const node: JsonNode = {};

    // 检查未知属性
    for (const key of Object.keys(obj)) {
      if (!VALID_NODE_KEYS.has(key)) {
        this.errors.push({
          path: path ? `${path}.${key}` : key,
          message: `未知属性 "${key}"`
        });
      }
    }

    // 验证 com（组件类型）
    if (obj.com !== undefined) {
      if (typeof obj.com !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'com'),
          message: 'com 必须是字符串'
        });
      } else {
        node.com = obj.com;
      }
    }

    // 验证 props
    if (obj.props !== undefined) {
      if (typeof obj.props !== 'object' || obj.props === null || Array.isArray(obj.props)) {
        this.errors.push({
          path: this.joinPath(path, 'props'),
          message: 'props 必须是一个对象'
        });
      } else {
        node.props = obj.props;
      }
    }

    // 验证 children
    if (obj.children !== undefined) {
      node.children = this.validateChildren(obj.children, this.joinPath(path, 'children'));
    }

    // 验证 events
    if (obj.events !== undefined) {
      node.events = this.validateEvents(obj.events, this.joinPath(path, 'events'));
    }

    // 验证 slots
    if (obj.slots !== undefined) {
      node.slots = this.validateSlots(obj.slots, this.joinPath(path, 'slots'));
    }

    // 验证指令
    this.validateDirectives(obj, node, path);

    // 验证状态和逻辑
    this.validateStateAndLogic(obj, node, path);

    // 验证生命周期钩子
    this.validateLifecycleHooks(obj, node, path);

    // 验证 API 配置
    this.validateApiConfig(obj, node, path);

    return node;
  }

  /**
   * 验证 children
   */
  private validateChildren(children: any, path: string): JsonNode[] | string | undefined {
    if (typeof children === 'string') {
      return children;
    }

    if (Array.isArray(children)) {
      return children.map((child, index) => {
        if (typeof child === 'object' && child !== null) {
          return this.validateNode(child, `${path}[${index}]`);
        } else if (typeof child === 'string') {
          // 字符串子节点转换为文本节点
          return { com: 'span', children: child } as JsonNode;
        } else {
          this.errors.push({
            path: `${path}[${index}]`,
            message: '子节点必须是对象或字符串'
          });
          return {};
        }
      });
    }

    this.errors.push({
      path,
      message: 'children 必须是字符串或数组'
    });
    return undefined;
  }

  /**
   * 验证 events
   */
  private validateEvents(events: any, path: string): Record<string, Action | Action[]> | undefined {
    if (typeof events !== 'object' || events === null || Array.isArray(events)) {
      this.errors.push({
        path,
        message: 'events 必须是一个对象'
      });
      return undefined;
    }

    const result: Record<string, Action | Action[]> = {};

    for (const [eventName, handler] of Object.entries(events)) {
      const eventPath = this.joinPath(path, eventName);
      const validatedHandler = this.validateActionOrActions(handler, eventPath);
      if (validatedHandler !== undefined) {
        result[eventName] = validatedHandler;
      }
    }

    return result;
  }

  /**
   * 验证 slots
   * 支持两种格式：
   * 1. 简单格式: { "slotName": [JsonNode[]] }
   * 2. 作用域插槽格式: { "slotName": { content: JsonNode[], slotProps: "propsName" } }
   */
  private validateSlots(slots: any, path: string): Record<string, JsonNode[] | { content: JsonNode[]; slotProps?: string }> | undefined {
    if (typeof slots !== 'object' || slots === null || Array.isArray(slots)) {
      this.errors.push({
        path,
        message: 'slots 必须是一个对象'
      });
      return undefined;
    }

    const result: Record<string, JsonNode[] | { content: JsonNode[]; slotProps?: string }> = {};

    for (const [slotName, content] of Object.entries(slots)) {
      const slotPath = this.joinPath(path, slotName);
      
      // 检查是否为作用域插槽格式
      if (typeof content === 'object' && content !== null && !Array.isArray(content) && 'content' in content) {
        // 作用域插槽格式
        const scopedSlot = content as { content?: any; slotProps?: any };
        
        if (!Array.isArray(scopedSlot.content)) {
          this.errors.push({
            path: this.joinPath(slotPath, 'content'),
            message: '作用域插槽的 content 必须是数组'
          });
          continue;
        }
        
        if (scopedSlot.slotProps !== undefined && typeof scopedSlot.slotProps !== 'string') {
          this.errors.push({
            path: this.joinPath(slotPath, 'slotProps'),
            message: 'slotProps 必须是字符串'
          });
          continue;
        }
        
        const validatedContent = scopedSlot.content.map((node: any, index: number) => {
          if (typeof node === 'object' && node !== null) {
            return this.validateNode(node, `${slotPath}.content[${index}]`);
          }
          this.errors.push({
            path: `${slotPath}.content[${index}]`,
            message: '插槽内容项必须是对象'
          });
          return {};
        });
        
        result[slotName] = {
          content: validatedContent,
          ...(scopedSlot.slotProps ? { slotProps: scopedSlot.slotProps } : {}),
        };
      } else if (Array.isArray(content)) {
        // 简单插槽格式
        result[slotName] = content.map((node, index) => {
          if (typeof node === 'object' && node !== null) {
            return this.validateNode(node, `${slotPath}[${index}]`);
          }
          this.errors.push({
            path: `${slotPath}[${index}]`,
            message: '插槽内容项必须是对象'
          });
          return {};
        });
      } else {
        this.errors.push({
          path: slotPath,
          message: '插槽内容必须是数组或作用域插槽对象 { content: [], slotProps?: string }'
        });
      }
    }

    return result;
  }

  /**
   * 验证指令
   */
  private validateDirectives(obj: any, node: JsonNode, path: string): void {
    // if 指令
    if (obj.if !== undefined) {
      if (typeof obj.if !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'if'),
          message: 'if 必须是字符串表达式'
        });
      } else {
        node.if = obj.if;
      }
    }

    // show 指令
    if (obj.show !== undefined) {
      if (typeof obj.show !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'show'),
          message: 'show 必须是字符串表达式'
        });
      } else {
        node.show = obj.show;
      }
    }

    // for 指令
    if (obj.for !== undefined) {
      if (typeof obj.for !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'for'),
          message: 'for 必须是字符串表达式'
        });
      } else {
        node.for = obj.for;
      }
    }

    // key 指令
    if (obj.key !== undefined) {
      if (typeof obj.key !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'key'),
          message: 'key 必须是字符串表达式'
        });
      } else {
        node.key = obj.key;
      }
    }

    // model 指令
    if (obj.model !== undefined) {
      if (typeof obj.model === 'string') {
        node.model = obj.model;
      } else if (typeof obj.model === 'object' && obj.model !== null && !Array.isArray(obj.model)) {
        // 对象格式：{ "modelValue": "data.trim", "columns": "cols" }
        const validObj: Record<string, string> = {};
        for (const [key, value] of Object.entries(obj.model)) {
          if (typeof value !== 'string') {
            this.errors.push({
              path: this.joinPath(path, `model.${key}`),
              message: 'model 对象中各字段的值必须是字符串路径'
            });
          } else {
            validObj[key] = value;
          }
        }
        node.model = validObj;
      } else {
        this.errors.push({
          path: this.joinPath(path, 'model'),
          message: 'model 必须是字符串或对象 { key: path }'
        });
      }
    }

    // ref 指令
    if (obj.ref !== undefined) {
      if (typeof obj.ref !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'ref'),
          message: 'ref 必须是字符串'
        });
      } else {
        node.ref = obj.ref;
      }
    }
  }

  /**
   * 验证数据和逻辑
   */
  private validateStateAndLogic(obj: any, node: JsonNode, path: string): void {
    // data
    if (obj.data !== undefined) {
      if (typeof obj.data !== 'object' || obj.data === null || Array.isArray(obj.data)) {
        this.errors.push({
          path: this.joinPath(path, 'data'),
          message: 'data 必须是一个对象'
        });
      } else {
        node.data = obj.data;
      }
    }

    // computed
    if (obj.computed !== undefined) {
      if (typeof obj.computed !== 'object' || obj.computed === null || Array.isArray(obj.computed)) {
        this.errors.push({
          path: this.joinPath(path, 'computed'),
          message: 'computed 必须是一个对象'
        });
      } else {
        const computedPath = this.joinPath(path, 'computed');
        for (const [key, value] of Object.entries(obj.computed)) {
          if (typeof value !== 'string') {
            this.errors.push({
              path: this.joinPath(computedPath, key),
              message: '计算属性表达式必须是字符串'
            });
          }
        }
        node.computed = obj.computed;
      }
    }

    // watch
    if (obj.watch !== undefined) {
      node.watch = this.validateWatch(obj.watch, this.joinPath(path, 'watch'));
    }

    // methods
    if (obj.methods !== undefined) {
      node.methods = this.validateMethods(obj.methods, this.joinPath(path, 'methods'));
    }
  }

  /**
   * 验证 watch 配置
   */
  private validateWatch(watch: any, path: string): Record<string, WatchConfig | Action> | undefined {
    if (typeof watch !== 'object' || watch === null || Array.isArray(watch)) {
      this.errors.push({
        path,
        message: 'watch 必须是一个对象'
      });
      return undefined;
    }

    const result: Record<string, WatchConfig | Action> = {};

    for (const [key, value] of Object.entries(watch)) {
      const watchPath = this.joinPath(path, key);

      if (this.isWatchConfig(value)) {
        // WatchConfig 格式
        const config: WatchConfig = {
          handler: this.validateActionOrActions(value.handler, this.joinPath(watchPath, 'handler'))!
        };
        if (value.immediate !== undefined) {
          config.immediate = Boolean(value.immediate);
        }
        if (value.deep !== undefined) {
          config.deep = Boolean(value.deep);
        }
        result[key] = config;
      } else {
        // 直接是 Action
        const action = this.validateActionOrActions(value, watchPath);
        if (action !== undefined) {
          result[key] = action as Action;
        }
      }
    }

    return result;
  }

  /**
   * 检查是否为 WatchConfig 格式
   */
  private isWatchConfig(value: any): value is { handler: any; immediate?: boolean; deep?: boolean } {
    return typeof value === 'object' && value !== null && 'handler' in value;
  }

  /**
   * 验证 methods
   */
  private validateMethods(methods: any, path: string): Record<string, Action | Action[]> | undefined {
    if (typeof methods !== 'object' || methods === null || Array.isArray(methods)) {
      this.errors.push({
        path,
        message: 'methods 必须是一个对象'
      });
      return undefined;
    }

    const result: Record<string, Action | Action[]> = {};

    for (const [name, actions] of Object.entries(methods)) {
      const methodPath = this.joinPath(path, name);
      const validated = this.validateActionOrActions(actions, methodPath);
      if (validated !== undefined) {
        result[name] = validated;
      }
    }

    return result;
  }

  /**
   * 验证生命周期钩子
   */
  private validateLifecycleHooks(obj: any, node: JsonNode, path: string): void {
    const hooks = ['onMounted', 'onUnmounted', 'onUpdated'] as const;

    for (const hook of hooks) {
      if (obj[hook] !== undefined) {
        const validated = this.validateActionOrActions(obj[hook], this.joinPath(path, hook));
        if (validated !== undefined) {
          node[hook] = validated;
        }
      }
    }
  }

  /**
   * 验证 API 配置（initApi 和 uiApi）
   * 支持字符串格式（仅 URL）或对象格式（完整配置）
   */
  private validateApiConfig(obj: any, node: JsonNode, path: string): void {
    const validateOne = (key: 'initApi' | 'uiApi', value: any) => {
      if (value === undefined) return;

      if (typeof value === 'string') {
        // 字符串格式：仅 URL
        if (!value.trim()) {
          this.errors.push({
            path: this.joinPath(path, key),
            message: `${key} 字符串不能为空`
          });
          return;
        }
        node[key] = value;
        return;
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 对象格式：完整配置
        if (typeof value.url !== 'string' || !value.url.trim()) {
          this.errors.push({
            path: this.joinPath(path, `${key}.url`),
            message: 'url 是必需的字符串'
          });
          return;
        }

        const validated: any = { url: value.url };

        if (value.method !== undefined) {
          if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(value.method)) {
            this.errors.push({
              path: this.joinPath(path, `${key}.method`),
              message: 'method 必须是 GET, POST, PUT, DELETE 或 PATCH'
            });
          } else {
            validated.method = value.method;
          }
        }

        if (value.headers !== undefined) {
          if (typeof value.headers !== 'object' || value.headers === null || Array.isArray(value.headers)) {
            this.errors.push({
              path: this.joinPath(path, `${key}.headers`),
              message: 'headers 必须是一个对象'
            });
          } else {
            validated.headers = value.headers;
          }
        }

        if (value.body !== undefined) {
          validated.body = value.body;
        }

        if (value.ignoreBaseURL !== undefined) {
          if (typeof value.ignoreBaseURL !== 'boolean') {
            this.errors.push({
              path: this.joinPath(path, `${key}.ignoreBaseURL`),
              message: 'ignoreBaseURL 必须是布尔值'
            });
          } else {
            validated.ignoreBaseURL = value.ignoreBaseURL;
          }
        }

        if (value.then !== undefined) {
          validated.then = this.validateActionOrActions(value.then, this.joinPath(path, `${key}.then`));
        }

        if (value.catch !== undefined) {
          validated.catch = this.validateActionOrActions(value.catch, this.joinPath(path, `${key}.catch`));
        }

        node[key] = validated;
        return;
      }

      this.errors.push({
        path: this.joinPath(path, key),
        message: `${key} 必须是字符串（URL）或对象 { url, method?, ... }`
      });
    };

    validateOne('initApi', obj.initApi);
    validateOne('uiApi', obj.uiApi);
  }

  /**
   * 验证单个 Action 或 Action 数组
   */
  private validateActionOrActions(value: any, path: string): Action | Action[] | undefined {
    if (Array.isArray(value)) {
      return value.map((action, index) => 
        this.validateAction(action, `${path}[${index}]`)
      ).filter((a): a is Action => a !== undefined);
    }

    return this.validateAction(value, path);
  }

  /**
   * 验证单个 Action
   */
  private validateAction(action: any, path: string): Action | undefined {
    if (typeof action !== 'object' || action === null) {
      this.errors.push({
        path,
        message: 'Action 必须是一个对象'
      });
      return undefined;
    }

    // 检测 Action 类型
    const actionType = ACTION_TYPES.find(type => type in action);

    if (!actionType) {
      this.errors.push({
        path,
        message: `无效的 Action，必须包含以下属性之一: ${ACTION_TYPES.join(', ')}`
      });
      return undefined;
    }

    switch (actionType) {
      case 'set':
        return this.validateSetAction(action, path);
      case 'call':
        return this.validateCallAction(action, path);
      case 'emit':
        return this.validateEmitAction(action, path);
      case 'fetch':
        return this.validateFetchAction(action, path);
      case 'if':
        return this.validateIfAction(action, path);
      case 'script':
        return this.validateScriptAction(action, path);
      case 'ws':
        return this.validateWsAction(action, path);
      case 'copy':
        return this.validateCopyAction(action, path);
    }
  }

  /**
   * 验证 SetAction
   */
  private validateSetAction(action: any, path: string): Action | undefined {
    if (typeof action.set !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'set'),
        message: 'set 必须是字符串（状态路径）'
      });
      return undefined;
    }

    return {
      set: action.set,
      value: action.value
    };
  }

  /**
   * 验证 CallAction
   */
  private validateCallAction(action: any, path: string): Action | undefined {
    if (typeof action.call !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'call'),
        message: 'call 必须是字符串（方法名）'
      });
      return undefined;
    }

    const result: any = { call: action.call };
    
    if (action.args !== undefined) {
      if (!Array.isArray(action.args)) {
        this.errors.push({
          path: this.joinPath(path, 'args'),
          message: 'args 必须是数组'
        });
      } else {
        result.args = action.args;
      }
    }

    return result;
  }

  /**
   * 验证 EmitAction
   */
  private validateEmitAction(action: any, path: string): Action | undefined {
    if (typeof action.emit !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'emit'),
        message: 'emit 必须是字符串（事件名）'
      });
      return undefined;
    }

    const result: any = { emit: action.emit };
    
    if (action.payload !== undefined) {
      result.payload = action.payload;
    }

    return result;
  }

  /**
   * 验证 FetchAction
   */
  private validateFetchAction(action: any, path: string): Action | undefined {
    if (typeof action.fetch !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'fetch'),
        message: 'fetch 必须是字符串（URL）'
      });
      return undefined;
    }

    const result: any = { fetch: action.fetch };

    // 验证 method
    if (action.method !== undefined) {
      if (!VALID_HTTP_METHODS.includes(action.method)) {
        this.errors.push({
          path: this.joinPath(path, 'method'),
          message: `method 必须是以下之一: ${VALID_HTTP_METHODS.join(', ')}`
        });
      } else {
        result.method = action.method;
      }
    }

    // 验证 headers
    if (action.headers !== undefined) {
      if (typeof action.headers !== 'object' || action.headers === null || Array.isArray(action.headers)) {
        this.errors.push({
          path: this.joinPath(path, 'headers'),
          message: 'headers 必须是一个对象'
        });
      } else {
        result.headers = action.headers;
      }
    }

    // body 可以是任意值
    if (action.body !== undefined) {
      result.body = action.body;
    }

    // 验证 then
    if (action.then !== undefined) {
      result.then = this.validateActionOrActions(action.then, this.joinPath(path, 'then'));
    }

    // 验证 catch
    if (action.catch !== undefined) {
      result.catch = this.validateActionOrActions(action.catch, this.joinPath(path, 'catch'));
    }

    // 验证 finally
    if (action.finally !== undefined) {
      result.finally = this.validateActionOrActions(action.finally, this.joinPath(path, 'finally'));
    }

    // 验证 ignoreBaseURL
    if (action.ignoreBaseURL !== undefined) {
      if (typeof action.ignoreBaseURL !== 'boolean') {
        this.errors.push({
          path: this.joinPath(path, 'ignoreBaseURL'),
          message: 'ignoreBaseURL 必须是布尔值'
        });
      } else {
        result.ignoreBaseURL = action.ignoreBaseURL;
      }
    }

    return result;
  }

  /**
   * 验证 ScriptAction
   */
  private validateScriptAction(action: any, path: string): Action | undefined {
    if (typeof action.script !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'script'),
        message: 'script 必须是字符串（JavaScript 代码）'
      });
      return undefined;
    }

    return { script: action.script };
  }

  /**
   * 验证 CopyAction
   */
  private validateCopyAction(action: any, path: string): Action | undefined {
    if (typeof action.copy !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'copy'),
        message: 'copy 必须是字符串（要复制的内容）'
      });
      return undefined;
    }

    const result: any = { copy: action.copy };

    // 验证 then
    if (action.then !== undefined) {
      result.then = this.validateActionOrActions(action.then, this.joinPath(path, 'then'));
    }

    // 验证 catch
    if (action.catch !== undefined) {
      result.catch = this.validateActionOrActions(action.catch, this.joinPath(path, 'catch'));
    }

    return result;
  }

  /**
   * 验证 WebSocketAction
   */
  private validateWsAction(action: any, path: string): Action | undefined {
    if (typeof action.ws !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'ws'),
        message: 'ws 必须是字符串（URL 或连接 key）'
      });
      return undefined;
    }

    const result: any = { ws: action.ws };

    if (action.op !== undefined) {
      if (!VALID_WS_OPS.includes(action.op)) {
        this.errors.push({
          path: this.joinPath(path, 'op'),
          message: `op 必须是以下之一: ${VALID_WS_OPS.join(', ')}`
        });
      } else {
        result.op = action.op;
      }
    }

    if (action.id !== undefined) {
      if (typeof action.id !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'id'),
          message: 'id 必须是字符串'
        });
      } else {
        result.id = action.id;
      }
    }

    if (action.protocols !== undefined) {
      const p = action.protocols;
      if (typeof p === 'string') {
        result.protocols = p;
      } else if (Array.isArray(p) && p.every((x: any) => typeof x === 'string')) {
        result.protocols = p;
      } else {
        this.errors.push({
          path: this.joinPath(path, 'protocols'),
          message: 'protocols 必须是字符串或字符串数组'
        });
      }
    }

    if (action.timeout !== undefined) {
      if (typeof action.timeout !== 'number') {
        this.errors.push({
          path: this.joinPath(path, 'timeout'),
          message: 'timeout 必须是数字（毫秒）'
        });
      } else {
        result.timeout = action.timeout;
      }
    }

    // message 可以是任意值
    if (action.message !== undefined) {
      result.message = action.message;
    }

    if (action.sendAs !== undefined) {
      if (!VALID_WS_SEND_AS.includes(action.sendAs)) {
        this.errors.push({
          path: this.joinPath(path, 'sendAs'),
          message: `sendAs 必须是以下之一: ${VALID_WS_SEND_AS.join(', ')}`
        });
      } else {
        result.sendAs = action.sendAs;
      }
    }

    if (action.responseType !== undefined) {
      if (!VALID_WS_RESPONSE_TYPES.includes(action.responseType)) {
        this.errors.push({
          path: this.joinPath(path, 'responseType'),
          message: `responseType 必须是以下之一: ${VALID_WS_RESPONSE_TYPES.join(', ')}`
        });
      } else {
        result.responseType = action.responseType;
      }
    }

    // callbacks
    if (action.onOpen !== undefined) {
      result.onOpen = this.validateActionOrActions(action.onOpen, this.joinPath(path, 'onOpen'));
    }
    if (action.onMessage !== undefined) {
      result.onMessage = this.validateActionOrActions(action.onMessage, this.joinPath(path, 'onMessage'));
    }
    if (action.onError !== undefined) {
      result.onError = this.validateActionOrActions(action.onError, this.joinPath(path, 'onError'));
    }
    if (action.onClose !== undefined) {
      result.onClose = this.validateActionOrActions(action.onClose, this.joinPath(path, 'onClose'));
    }

    if (action.then !== undefined) {
      result.then = this.validateActionOrActions(action.then, this.joinPath(path, 'then'));
    }
    if (action.catch !== undefined) {
      result.catch = this.validateActionOrActions(action.catch, this.joinPath(path, 'catch'));
    }
    if (action.finally !== undefined) {
      result.finally = this.validateActionOrActions(action.finally, this.joinPath(path, 'finally'));
    }

    if (action.code !== undefined) {
      if (typeof action.code !== 'number') {
        this.errors.push({
          path: this.joinPath(path, 'code'),
          message: 'code 必须是数字'
        });
      } else {
        result.code = action.code;
      }
    }

    if (action.reason !== undefined) {
      if (typeof action.reason !== 'string') {
        this.errors.push({
          path: this.joinPath(path, 'reason'),
          message: 'reason 必须是字符串'
        });
      } else {
        result.reason = action.reason;
      }
    }

    return result;
  }

  /**
   * 验证 IfAction
   */
  private validateIfAction(action: any, path: string): Action | undefined {
    if (typeof action.if !== 'string') {
      this.errors.push({
        path: this.joinPath(path, 'if'),
        message: 'if 必须是字符串（条件表达式）'
      });
      return undefined;
    }

    if (action.then === undefined) {
      this.errors.push({
        path: this.joinPath(path, 'then'),
        message: 'IfAction 必须包含 then 属性'
      });
      return undefined;
    }

    const result: any = {
      if: action.if,
      then: this.validateActionOrActions(action.then, this.joinPath(path, 'then'))
    };

    if (action.else !== undefined) {
      result.else = this.validateActionOrActions(action.else, this.joinPath(path, 'else'));
    }

    return result;
  }

  /**
   * 验证 JsonNode 结构
   * @param node - 要验证的节点
   * @returns 验证结果
   */
  validate(node: JsonNode): ValidationResult {
    this.errors = [];
    this.validateNode(node, '');

    return {
      valid: this.errors.length === 0,
      errors: this.errors.map(e => `${e.path ? `[${e.path}] ` : ''}${e.message}`)
    };
  }

  /**
   * 将 JsonNode 序列化为 JSON 字符串
   * @param node - 要序列化的节点
   * @returns JSON 字符串
   */
  serialize(node: JsonNode): string {
    return JSON.stringify(this.cleanNode(node), null, 2);
  }

  /**
   * 清理节点，移除 undefined 值
   */
  private cleanNode(node: JsonNode): any {
    const result: any = {};

    for (const [key, value] of Object.entries(node)) {
      if (value === undefined) continue;

      if (key === 'children' && Array.isArray(value)) {
        result[key] = value.map(child => 
          typeof child === 'object' ? this.cleanNode(child) : child
        );
      } else if (key === 'slots' && typeof value === 'object') {
        result[key] = {};
        for (const [slotName, slotContent] of Object.entries(value as Record<string, any>)) {
          // 检查是否为作用域插槽格式
          if (Array.isArray(slotContent)) {
            // 简单插槽格式
            result[key][slotName] = slotContent.map(n => this.cleanNode(n));
          } else if (typeof slotContent === 'object' && slotContent !== null && 'content' in slotContent) {
            // 作用域插槽格式
            result[key][slotName] = {
              content: slotContent.content.map((n: JsonNode) => this.cleanNode(n)),
              ...(slotContent.slotProps ? { slotProps: slotContent.slotProps } : {}),
            };
          }
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 递归清理嵌套对象
        result[key] = this.cleanObject(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 清理普通对象
   */
  private cleanObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanObject(item));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = this.cleanObject(value);
      }
    }
    return result;
  }

  /**
   * 连接路径
   */
  private joinPath(base: string, key: string): string {
    return base ? `${base}.${key}` : key;
  }

  /**
   * 根据字符位置计算行号和列号
   */
  private getLineAndColumn(text: string, position: number): { line: number; column: number } {
    const lines = text.substring(0, position).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }
}

/**
 * 创建 Parser 实例
 */
export function createParser(): IParser {
  return new Parser();
}
