/**
 * JSON Schema type definitions for Vue JSON Renderer
 */

/**
 * Set action - modifies state at a given path
 */
export interface SetAction {
  set: string;
  value: any;
}

/**
 * Call action - invokes a method
 */
export interface CallAction {
  call: string;
  args?: any[];
}

/**
 * Emit action - triggers an event
 */
export interface EmitAction {
  emit: string;
  payload?: any;
}

/**
 * Script action - executes custom JavaScript code
 * 脚本动作 - 执行自定义 JavaScript 代码
 * 
 * 可用变量:
 * - state: 当前状态对象
 * - computed: 计算属性对象
 * - $event: 事件对象（如果有）
 * - $response: API 响应数据（如果有）
 * - $error: 错误对象（如果有）
 * - $methods: 外部注入的方法对象
 */
export interface ScriptAction {
  /** JavaScript 代码字符串，支持 async/await */
  script: string;
}

/**
 * Fetch（网络请求）动作 - 发起 API（应用程序编程接口）调用
 */
export interface FetchAction {
  fetch: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | string; // 支持表达式
  headers?: Record<string, any>;
  /** 查询参数（GET 请求） */
  params?: Record<string, any>;
  body?: any;
  /** 响应类型：json（默认）、text、blob、arrayBuffer */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
  then?: Action | Action[];
  catch?: Action | Action[];
  /** 无论成功或失败都执行的回调 */
  finally?: Action | Action[];
  /** 是否忽略全局 baseURL */
  ignoreBaseURL?: boolean;
}

export type WebSocketOp = 'connect' | 'send' | 'close';

/**
 * WebSocket（双向通信协议）动作 - 长连接管理
 *
 * - op=connect: 创建（或复用）连接并绑定回调（callback，回调函数）
 * - op=send: 向已存在的连接发送消息
 * - op=close: 关闭连接
 */
export interface WebSocketAction {
  /** URL（connect 时）或连接 key（send/close 时；如果 connect 使用了 id） */
  ws: string;
  /** 操作类型（op）；默认 connect */
  op?: WebSocketOp;
  /** 可选连接 key；connect 时设置后，后续 op 通过 ws 引用该 key */
  id?: string;
  /** WebSocket protocols（子协议） */
  protocols?: string | string[];
  /** 连接打开超时（毫秒） */
  timeout?: number;

  /** op=send 的消息内容（payload，负载） */
  message?: any;
  /** op=send 的消息序列化方式 */
  sendAs?: 'text' | 'json';

  /** onMessage 收到消息时，如何解析 event.data */
  responseType?: 'text' | 'json' | 'auto';

  /** 连接生命周期回调（callback，回调函数） */
  onOpen?: Action | Action[];
  onMessage?: Action | Action[];
  onError?: Action | Action[];
  onClose?: Action | Action[];

  /** 流程回调（每次 op 触发一次；类似 FetchAction 的 then/catch/finally） */
  then?: Action | Action[];
  catch?: Action | Action[];
  finally?: Action | Action[];

  /** op=close 的关闭参数 */
  code?: number;
  reason?: string;
}

/**
 * API 配置对象 - 用于 initApi 和 uiApi 的完整配置
 * API configuration object for initApi and uiApi
 */
export interface ApiConfigObject {
  /** 请求 URL，支持模板表达式（如 {{ userId }}） */
  url: string;
  /** HTTP 方法，默认 GET */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 请求头 */
  headers?: Record<string, any>;
  /** 请求体 */
  body?: any;
  /** 成功回调动作 */
  then?: Action | Action[];
  /** 失败回调动作 */
  catch?: Action | Action[];
  /** 是否忽略全局 baseURL，用于本地 mock 请求等场景 */
  ignoreBaseURL?: boolean;
}

/**
 * API 配置 - 支持字符串简写（仅 URL）或完整对象配置
 * API configuration - supports string shorthand (URL only) or full object config
 */
export type ApiConfig = string | ApiConfigObject;

/**
 * 条件动作 - 根据条件执行动作
 */
export interface IfAction {
  if: string;
  then: Action | Action[];
  else?: Action | Action[];
}

/**
 * Copy 动作 - 复制文本到剪贴板
 * 
 * 优先使用现代 Clipboard API，自动降级到 execCommand 方案
 */
export interface CopyAction {
  /** 要复制的内容，支持模板表达式 {{ }} */
  copy: string;
  /** 复制成功回调 */
  then?: Action | Action[];
  /** 复制失败回调，可通过 $error 访问错误信息 */
  catch?: Action | Action[];
}

/**
 * 所有动作类型的联合类型（union）
 */
export type Action = SetAction | CallAction | EmitAction | FetchAction | WebSocketAction | IfAction | ScriptAction | CopyAction;


/**
 * Watch configuration for state watchers
 */
export interface WatchConfig {
  handler: Action | Action[];
  immediate?: boolean;
  deep?: boolean;
}

/**
 * Slot content definition - supports both simple and scoped slots
 * 插槽内容定义 - 支持简单插槽和作用域插槽
 */
export interface SlotDefinition {
  /** Slot content nodes */
  content: JsonNode[];
  /** Scoped slot props binding name (e.g., "slotProps" to access slot props as slotProps.xxx) */
  slotProps?: string;
}

/**
 * JSON Node - the core schema definition for components
 */
export interface JsonNode {
  // === Component Rendering ===
  /** Component type (HTML tag or registered component name) */
  com?: string;
  /** Props to pass to the component */
  props?: Record<string, any>;
  /** Child nodes or text content */
  children?: JsonNode[] | string;
  /** Event handlers */
  events?: Record<string, Action | Action[]>;
  /** 
   * Slot definitions - supports two formats:
   * 1. Simple: { "slotName": [JsonNode[]] } - for default and named slots
   * 2. Scoped: { "slotName": { content: JsonNode[], slotProps: "propsName" } } - for scoped slots
   */
  slots?: Record<string, JsonNode[] | SlotDefinition>;

  // === Directives ===
  /** Conditional rendering (v-if) */
  if?: string;
  /** Show/hide (v-show) */
  show?: string;
  /** Loop directive "item in items" or "(item, index) in items" */
  for?: string;
  /** Key for loop items */
  key?: string;
  /**
   * 双向绑定 (v-model)
   * 
   * 支持两种格式：
   * 1. 字符串：简单 v-model，如 "username" 或 "username.trim.lazy"
   * 2. 对象：带参数的 v-model:xxx，键为参数名（modelValue 表示默认 v-model）
   *    如 { "modelValue": "data.trim", "columns": "tableColumns" }
   * 
   * 支持的修饰符（追加在路径后）：
   * - .trim: 自动去除首尾空格
   * - .number: 自动转换为数字
   * - .lazy: 使用 change 事件而非 input 事件
   */
  model?: string | Record<string, string>;
  /** Template ref */
  ref?: string;

  // === Data and Logic ===
  /** Reactive data definition */
  data?: Record<string, any>;
  /** Computed properties */
  computed?: Record<string, string>;
  /** Watchers */
  watch?: Record<string, WatchConfig | Action>;
  /** Methods */
  methods?: Record<string, Action | Action[]>;

  // === Lifecycle Hooks ===
  /** Mounted lifecycle hook */
  onMounted?: Action | Action[];
  /** Unmounted lifecycle hook */
  onUnmounted?: Action | Action[];
  /** Updated lifecycle hook */
  onUpdated?: Action | Action[];

  // === API Configuration ===
  /** 初始化数据 API - 组件挂载时请求，返回数据与 data 合并 */
  initApi?: ApiConfig;
  /** 动态 UI API - 组件挂载时请求，返回 JsonNode 替换 children */
  uiApi?: ApiConfig;
}

/**
 * Type guards for action types
 */
export function isSetAction(action: Action): action is SetAction {
  return typeof action === 'object' && action !== null && 'set' in action;
}

export function isCallAction(action: Action): action is CallAction {
  return typeof action === 'object' && action !== null && 'call' in action;
}

export function isEmitAction(action: Action): action is EmitAction {
  return typeof action === 'object' && action !== null && 'emit' in action;
}

export function isFetchAction(action: Action): action is FetchAction {
  return typeof action === 'object' && action !== null && 'fetch' in action;
}

export function isWebSocketAction(action: Action): action is WebSocketAction {
  return typeof action === 'object' && action !== null && 'ws' in action;
}

export function isIfAction(action: Action): action is IfAction {
  return typeof action === 'object' && action !== null && 'if' in action && 'then' in action;
}

export function isScriptAction(action: Action): action is ScriptAction {
  return typeof action === 'object' && action !== null && 'script' in action;
}

export function isCopyAction(action: Action): action is CopyAction {
  return typeof action === 'object' && action !== null && 'copy' in action;
}

/**
 * Type guard for scoped slot definition
 */
export function isSlotDefinition(slot: JsonNode[] | SlotDefinition): slot is SlotDefinition {
  return !Array.isArray(slot) && 'content' in slot;
}
