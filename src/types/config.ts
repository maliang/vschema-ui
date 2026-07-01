/**
 * Configuration type definitions for Vue JSON Renderer
 */

import type { Component } from 'vue';

/**
 * Request configuration for API calls
 */
export interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  /** 响应类型：json（默认）、text、blob、arrayBuffer */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
}

/**
 * 标准 API 响应格式定义
 * Standard API response format definition
 * 
 * 默认格式: { code, msg, data }
 */
export interface ApiResponse<T = any> {
  /** 业务状态码 */
  code: number;
  /** 响应消息 */
  msg: string;
  /** 响应数据 */
  data: T;
}

/**
 * API 响应格式配置
 * 用于自定义后端返回的字段名称
 */
export interface ResponseFormatConfig {
  /** 业务状态码字段名，默认 "code" */
  codeField?: string;
  /** 消息字段名，默认 "msg" */
  msgField?: string;
  /** 数据字段名，默认 "data" */
  dataField?: string;
  /** 业务成功状态码，默认 200 */
  successCode?: number | number[];
}

/**
 * 组件模型绑定适配器（通用机制，不含任何具体 UI 库/组件名）
 *
 * 用于覆盖某个组件的 v-model 默认绑定方式。默认情况下渲染器把 model 绑到
 * `value`/`modelValue` 并监听 `onUpdate:value`/`onUpdate:modelValue`。
 * 当某些组件对值的类型有特殊要求（例如时间/日期选择器的 value 必须是时间戳|null，
 * 空串或字符串会导致内部格式化报错）时，消费方可为该组件名注册适配器，
 * 指定改用哪个 prop/event，以及状态为空时应传入组件的值。
 */
export interface ModelAdapter {
  /** 绑定的 prop 名，默认 'value'（同时也会作为 modelValue 的替代） */
  prop?: string;
  /** 更新事件名，默认 `onUpdate:${prop}` */
  event?: string;
  /** 当状态值为空（''/null/undefined）时传给组件的值，默认沿用原值（通常为 ''） */
  emptyValue?: any;
  /** 仅当该断言返回 true 时才启用此适配器；不设则总是启用 */
  when?: (value: any) => boolean;
}

/**
 * Global configuration for the JSON Renderer plugin
 */
export interface GlobalConfig {
  /** Default path to extract data from API responses (e.g., "data" or "data.result") */
  responseDataPath?: string;

  /** 
   * API 响应格式配置
   * 用于配置后端返回数据的字段映射和成功码判断
   */
  responseFormat?: ResponseFormatConfig;

  /** Request interceptor - called before each request */
  requestInterceptor?: (
    config: RequestConfig
  ) => RequestConfig | Promise<RequestConfig>;

  /** Response interceptor - called after each successful response */
  responseInterceptor?: (response: any) => any | Promise<any>;

  /** Error interceptor - called when a request fails */
  errorInterceptor?: (error: any) => any | Promise<any>;

  /** Base URL for all API requests */
  baseURL?: string;

  /** Default headers for all API requests */
  defaultHeaders?: Record<string, string>;

  /**
   * 组件模型绑定适配器表：组件名 -> 适配器。
   * 通用机制，具体 UI 库（如 naive-ui）的组件绑定策略由消费方注册。
   */
  modelAdapters?: Record<string, ModelAdapter>;
}

/**
 * Plugin installation options
 */
export interface PluginOptions extends GlobalConfig {
  /** Custom components to register */
  components?: Record<string, Component>;
}
