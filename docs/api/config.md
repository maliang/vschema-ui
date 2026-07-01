# 全局配置

VSchema 插件的全局配置选项。

## 配置方式

```typescript
import { createVSchemaPlugin } from 'vschema-ui';

app.use(createVSchemaPlugin({
  baseURL: 'https://api.example.com',
  defaultHeaders: {
    'Authorization': 'Bearer token'
  },
  responseDataPath: 'data',
  responseFormat: {
    codeField: 'code',
    msgField: 'msg',
    dataField: 'data',
    successCode: 200,
  },
  components: {
    MyButton,
    MyCard,
  }
}));
```

## 配置项

### baseURL

- 类型：`string`
- 默认值：`''`

API 请求的基础地址，会与 `fetch`、`initApi`、`uiApi` 中的相对路径拼接。

### defaultHeaders

- 类型：`Record<string, string>`
- 默认值：`{}`

所有 API 请求的默认请求头。

### responseDataPath

- 类型：`string`
- 默认值：`''`

API 响应数据的路径。例如后端返回 `{ code: 0, data: {...} }`，设置为 `'data'` 可直接获取数据部分。

::: tip 提示
如果配置了 `responseFormat`，系统会优先使用 `responseFormat.dataField` 提取数据，`responseDataPath` 仅在响应中不包含业务状态码时生效。
:::

### responseFormat

- 类型：`ResponseFormatConfig`
- 默认值：`{ codeField: 'code', msgField: 'msg', dataField: 'data', successCode: 200 }`

API 响应格式配置，用于自定义后端返回的字段名称和成功状态码判断。

#### responseFormat.codeField

- 类型：`string`
- 默认值：`'code'`

业务状态码字段名。

#### responseFormat.msgField

- 类型：`string`
- 默认值：`'msg'`

响应消息字段名。

#### responseFormat.dataField

- 类型：`string`
- 默认值：`'data'`

响应数据字段名。

#### responseFormat.successCode

- 类型：`number | number[]`
- 默认值：`200`

业务成功状态码。支持单个值或数组（多个成功码）。

**示例：**

```typescript
// 单个成功码
responseFormat: {
  successCode: 0
}

// 多个成功码
responseFormat: {
  successCode: [0, 200]
}

// 自定义字段名
responseFormat: {
  codeField: 'status',
  msgField: 'message',
  dataField: 'result',
  successCode: 0
}
```

### components

- 类型：`Record<string, Component>`
- 默认值：`{}`

注册的自定义组件。

### requestInterceptor

- 类型：`(config: RequestConfig) => RequestConfig | Promise<RequestConfig>`
- 默认值：`undefined`

请求拦截器，在每次请求前调用。

```typescript
requestInterceptor: (config) => {
  config.headers['X-Request-Id'] = generateId();
  return config;
}
```

### responseInterceptor

- 类型：`(response: any) => any | Promise<any>`
- 默认值：`undefined`

响应拦截器，在每次成功响应后调用。

```typescript
responseInterceptor: (response) => {
  console.log('Response:', response);
  return response;
}
```

### errorInterceptor

- 类型：`(error: any) => any | Promise<any>`
- 默认值：`undefined`

错误拦截器，在请求失败或业务状态码表示失败时调用。

```typescript
errorInterceptor: (error) => {
  if (error.code === 401) {
    // 跳转登录页
    router.push('/login');
  }
  throw error;
}
```

### modelAdapters

- 类型：`Record<string, ModelAdapter>`
- 默认值：`{}`

组件模型绑定适配器表（组件名 → 适配器），用于覆盖某个组件 `model`（v-model）的默认绑定方式。

默认情况下，渲染器把 `model` 绑定到组件的 `value`/`modelValue`，并监听 `onUpdate:value`/`onUpdate:modelValue`。当某些组件对值类型有特殊要求时（例如 naive-ui 的时间/日期选择器的 `value` 必须是时间戳或 `null`，直接绑定字符串或空串会导致其内部格式化抛出 `RangeError: Invalid time value`），可为该组件名注册适配器，指定改用哪个 prop/event，以及状态为空时应传入组件的值。

::: tip 通用机制
vschema-ui 核心不感知任何具体 UI 库的组件名，`modelAdapters` 只是通用扩展点；具体 UI 库（如 naive-ui）的绑定策略由使用方注册。
:::

**ModelAdapter 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `prop` | `string` | 绑定的 prop 名，默认 `'value'` |
| `event` | `string` | 更新事件名，默认 `onUpdate:${prop}` |
| `emptyValue` | `any` | 状态值为空（`''`/`null`/`undefined`）时传给组件的值，默认沿用原值 |
| `when` | `(value: any) => boolean` | 仅当返回 `true` 时启用该适配器；不设则总是启用 |

**示例（naive-ui 时间/日期选择器）：**

```typescript
app.use(createVSchemaPlugin({
  modelAdapters: {
    NTimePicker: {
      prop: 'formatted-value',
      event: 'onUpdate:formattedValue',
      emptyValue: null,
      when: (v) => typeof v === 'string' || v == null,
    },
    NDatePicker: {
      prop: 'formatted-value',
      event: 'onUpdate:formattedValue',
      emptyValue: null,
      when: (v) => typeof v === 'string' || v == null,
    },
  },
}));
```

这样绑定字符串时间/日期或空值时，`NTimePicker`/`NDatePicker` 不会再抛出 `RangeError: Invalid time value`。

## 类型定义

```typescript
/**
 * 标准 API 响应格式
 */
interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

/**
 * 响应格式配置
 */
interface ResponseFormatConfig {
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
 * 请求配置
 */
interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  /** 响应类型：json（默认）、text、blob、arrayBuffer */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
}

/**
 * 组件模型绑定适配器
 */
interface ModelAdapter {
  /** 绑定的 prop 名，默认 'value' */
  prop?: string;
  /** 更新事件名，默认 `onUpdate:${prop}` */
  event?: string;
  /** 状态为空（''/null/undefined）时传给组件的值，默认沿用原值 */
  emptyValue?: any;
  /** 仅当返回 true 时启用该适配器；不设则总是启用 */
  when?: (value: any) => boolean;
}

/**
 * 全局配置
 */
interface GlobalConfig {
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  responseDataPath?: string;
  responseFormat?: ResponseFormatConfig;
  requestInterceptor?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  responseInterceptor?: (response: any) => any | Promise<any>;
  errorInterceptor?: (error: any) => any | Promise<any>;
  modelAdapters?: Record<string, ModelAdapter>;
  components?: Record<string, Component>;
}
