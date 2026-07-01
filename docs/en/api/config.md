# Global Configuration

VSchema plugin global configuration options.

## Configuration

```typescript
import { createVSchemaPlugin } from 'vschema-ui';

app.use(createVSchemaPlugin({
  baseURL: 'https://api.example.com',
  defaultHeaders: { 'Authorization': 'Bearer token' },
  responseDataPath: 'data',
  responseFormat: {
    codeField: 'code',
    msgField: 'msg',
    dataField: 'data',
    successCode: 200,
  },
  components: { MyButton, MyCard }
}));
```

## Options

### baseURL

- Type: `string`
- Default: `''`

Base URL for API requests, concatenated with relative paths in `fetch`, `initApi`, `uiApi`.

### defaultHeaders

- Type: `Record<string, string>`
- Default: `{}`

Default headers for all API requests.

### responseDataPath

- Type: `string`
- Default: `''`

Path to response data. E.g., if backend returns `{ code: 0, data: {...} }`, set to `'data'`.

::: tip
If `responseFormat` is configured, the system will prioritize using `responseFormat.dataField` to extract data. `responseDataPath` only takes effect when the response does not contain a business status code.
:::

### responseFormat

- Type: `ResponseFormatConfig`
- Default: `{ codeField: 'code', msgField: 'msg', dataField: 'data', successCode: 200 }`

API response format configuration for customizing backend field names and success code validation.

#### responseFormat.codeField

- Type: `string`
- Default: `'code'`

Business status code field name.

#### responseFormat.msgField

- Type: `string`
- Default: `'msg'`

Response message field name.

#### responseFormat.dataField

- Type: `string`
- Default: `'data'`

Response data field name.

#### responseFormat.successCode

- Type: `number | number[]`
- Default: `200`

Business success status code. Supports single value or array (multiple success codes).

**Examples:**

```typescript
// Single success code
responseFormat: {
  successCode: 0
}

// Multiple success codes
responseFormat: {
  successCode: [0, 200]
}

// Custom field names
responseFormat: {
  codeField: 'status',
  msgField: 'message',
  dataField: 'result',
  successCode: 0
}
```

### components

- Type: `Record<string, Component>`
- Default: `{}`

Registered custom components.

### requestInterceptor

- Type: `(config: RequestConfig) => RequestConfig | Promise<RequestConfig>`
- Default: `undefined`

Request interceptor, called before each request.

```typescript
requestInterceptor: (config) => {
  config.headers['X-Request-Id'] = generateId();
  return config;
}
```

### responseInterceptor

- Type: `(response: any) => any | Promise<any>`
- Default: `undefined`

Response interceptor, called after each successful response.

```typescript
responseInterceptor: (response) => {
  console.log('Response:', response);
  return response;
}
```

### errorInterceptor

- Type: `(error: any) => any | Promise<any>`
- Default: `undefined`

Error interceptor, called when request fails or business status code indicates failure.

```typescript
errorInterceptor: (error) => {
  if (error.code === 401) {
    router.push('/login');
  }
  throw error;
}
```

### modelAdapters

- Type: `Record<string, ModelAdapter>`
- Default: `{}`

Component model-binding adapter map (component name → adapter). Overrides how a component's `model` (v-model) is bound.

By default the renderer binds `model` to a component's `value`/`modelValue` and listens to `onUpdate:value`/`onUpdate:modelValue`. When a component has special value-type requirements (e.g. naive-ui's time/date pickers require the `value` to be a timestamp or `null`; binding a string or empty string makes their internal formatter throw `RangeError: Invalid time value`), register an adapter for that component name to choose a different prop/event and the value passed when the state is empty.

::: tip Generic mechanism
The vschema-ui core is agnostic of any specific UI library's component names. `modelAdapters` is just a generic extension point; the binding policy for a specific UI library (e.g. naive-ui) is registered by the consumer.
:::

**ModelAdapter fields:**

| Field | Type | Description |
|-------|------|-------------|
| `prop` | `string` | Prop name to bind, default `'value'` |
| `event` | `string` | Update event name, default `onUpdate:${prop}` |
| `emptyValue` | `any` | Value passed to the component when the state is empty (`''`/`null`/`undefined`); defaults to the original value |
| `when` | `(value: any) => boolean` | Enable the adapter only when it returns `true`; always enabled if omitted |

**Example (naive-ui time/date pickers):**

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

With this, binding string time/date values or empty values to `NTimePicker`/`NDatePicker` no longer throws `RangeError: Invalid time value`.

## Type Definition

```typescript
/**
 * Standard API response format
 */
interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

/**
 * Response format configuration
 */
interface ResponseFormatConfig {
  /** Business status code field name, default "code" */
  codeField?: string;
  /** Message field name, default "msg" */
  msgField?: string;
  /** Data field name, default "data" */
  dataField?: string;
  /** Business success status code, default 200 */
  successCode?: number | number[];
}

/**
 * Request configuration
 */
interface RequestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  /** Response type: json (default), text, blob, arrayBuffer */
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
}

/**
 * Component model-binding adapter
 */
interface ModelAdapter {
  /** Prop name to bind, default 'value' */
  prop?: string;
  /** Update event name, default `onUpdate:${prop}` */
  event?: string;
  /** Value passed to the component when the state is empty (''/null/undefined); defaults to the original value */
  emptyValue?: any;
  /** Enable the adapter only when it returns true; always enabled if omitted */
  when?: (value: any) => boolean;
}

/**
 * Global configuration
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
