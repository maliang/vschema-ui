# Form Binding

VSchema supports `model` property for two-way data binding, similar to Vue's `v-model`.

## Basic Usage

### Text Input

```json
{
  "data": { "username": "" },
  "com": "input",
  "model": "username",
  "props": { "placeholder": "Enter username" }
}
```

### Nested Path

```json
{
  "data": {
    "form": {
      "username": "",
      "password": ""
    }
  },
  "com": "div",
  "children": [
    {
      "com": "input",
      "model": "form.username",
      "props": { "placeholder": "Username" }
    },
    {
      "com": "input",
      "model": "form.password",
      "props": { "type": "password", "placeholder": "Password" }
    }
  ]
}
```

## Modifiers

VSchema supports three modifiers that can be appended to the binding path:

| Modifier | Description | Example |
|----------|-------------|---------|
| `.trim` | Automatically trim whitespace | `"username.trim"` |
| `.number` | Automatically convert to number | `"age.number"` |
| `.lazy` | Use change event instead of input | `"content.lazy"` |

### Single Modifier

```json
{
  "data": { "username": "", "age": 0 },
  "com": "div",
  "children": [
    {
      "com": "input",
      "model": "username.trim",
      "props": { "placeholder": "Username (auto-trimmed)" }
    },
    {
      "com": "input",
      "model": "age.number",
      "props": { "type": "number", "placeholder": "Age" }
    }
  ]
}
```

### Combined Modifiers

Modifiers can be combined:

```json
{
  "com": "input",
  "model": "price.trim.number",
  "props": { "placeholder": "Price" }
}
```

```json
{
  "com": "textarea",
  "model": "content.trim.lazy",
  "props": { "placeholder": "Content (updates on blur)" }
}
```

## v-model with Arguments

For components supporting multiple v-models (like `v-model:visible`, `v-model:columns`), use object format:

### Basic Usage

```json
{
  "data": { "showModal": false },
  "com": "NModal",
  "model": {
    "show": "showModal"
  },
  "children": [...]
}
```

### Multiple v-models

```json
{
  "data": {
    "tableColumns": [...],
    "selectedKeys": []
  },
  "com": "TableColumnSetting",
  "model": {
    "columns": "tableColumns",
    "checkedKeys": "selectedKeys"
  }
}
```

### modelValue as Default v-model

In object format, `modelValue` represents the default `v-model`:

```json
{
  "data": { "inputValue": "", "visible": true },
  "com": "MyComponent",
  "model": {
    "modelValue": "inputValue",
    "visible": "visible"
  }
}
```

Equivalent to Vue template:
```vue
<MyComponent v-model="inputValue" v-model:visible="visible" />
```

### With Modifiers

Object format also supports modifiers:

```json
{
  "com": "NInput",
  "model": {
    "value": "username.trim"
  }
}
```

## Different Input Types

### Textarea

```json
{
  "com": "textarea",
  "model": "content",
  "props": { "rows": 5 }
}
```

### Checkbox

```json
{
  "data": { "agreed": false },
  "com": "input",
  "model": "agreed",
  "props": { "type": "checkbox" }
}
```

### Radio Buttons

```json
{
  "data": { "gender": "" },
  "com": "div",
  "children": [
    {
      "com": "label",
      "children": [
        {
          "com": "input",
          "model": "gender",
          "props": { "type": "radio", "value": "male" }
        },
        "Male"
      ]
    },
    {
      "com": "label",
      "children": [
        {
          "com": "input",
          "model": "gender",
          "props": { "type": "radio", "value": "female" }
        },
        "Female"
      ]
    }
  ]
}
```

### Select

```json
{
  "data": { "city": "" },
  "com": "select",
  "model": "city",
  "children": [
    { "com": "option", "props": { "value": "" }, "children": "Select" },
    { "com": "option", "props": { "value": "ny" }, "children": "New York" },
    { "com": "option", "props": { "value": "la" }, "children": "Los Angeles" }
  ]
}
```

### Dynamic Options

```json
{
  "data": {
    "selectedCity": "",
    "cities": [
      { "value": "ny", "label": "New York" },
      { "value": "la", "label": "Los Angeles" },
      { "value": "sf", "label": "San Francisco" }
    ]
  },
  "com": "select",
  "model": "selectedCity",
  "children": [
    { "com": "option", "props": { "value": "" }, "children": "Select a city" },
    {
      "for": "city in cities",
      "key": "{{ city.value }}",
      "com": "option",
      "props": { "value": "{{ city.value }}" },
      "children": "{{ city.label }}"
    }
  ]
}
```

## Form Validation

### Basic Validation

```json
{
  "data": {
    "form": { "email": "" },
    "errors": {}
  },
  "computed": {
    "isEmailValid": "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email)",
    "canSubmit": "form.email && isEmailValid"
  },
  "com": "div",
  "children": [
    {
      "com": "input",
      "model": "form.email",
      "props": {
        "type": "email",
        "class": "{{ errors.email ? 'error' : '' }}"
      },
      "events": {
        "blur": {
          "if": "!isEmailValid && form.email",
          "then": { "set": "errors.email", "value": "Invalid email format" },
          "else": { "set": "errors.email", "value": "" }
        }
      }
    },
    {
      "com": "span",
      "if": "errors.email",
      "props": { "class": "error-message" },
      "children": "{{ errors.email }}"
    }
  ]
}
```

### Real-time Validation

```json
{
  "data": {
    "password": "",
    "confirmPassword": ""
  },
  "computed": {
    "passwordStrength": "password.length < 6 ? 'weak' : password.length < 10 ? 'medium' : 'strong'",
    "passwordMatch": "password === confirmPassword"
  },
  "com": "div",
  "children": [
    {
      "com": "input",
      "model": "password",
      "props": { "type": "password", "placeholder": "Password" }
    },
    {
      "com": "div",
      "if": "password",
      "children": "Password strength: {{ passwordStrength }}"
    },
    {
      "com": "input",
      "model": "confirmPassword",
      "props": { "type": "password", "placeholder": "Confirm password" }
    },
    {
      "com": "div",
      "if": "confirmPassword && !passwordMatch",
      "props": { "class": "error" },
      "children": "Passwords do not match"
    }
  ]
}
```

## Complete Form Examples

### Login Form

```json
{
  "data": {
    "form": {
      "username": "",
      "password": "",
      "remember": false
    },
    "loading": false,
    "error": ""
  },
  "computed": {
    "canSubmit": "form.username && form.password && !loading"
  },
  "methods": {
    "handleSubmit": [
      { "set": "loading", "value": true },
      { "set": "error", "value": "" },
      {
        "fetch": "/api/login",
        "method": "POST",
        "body": "{{ form }}",
        "then": { "emit": "login-success", "payload": "{{ $response }}" },
        "catch": { "set": "error", "value": "{{ $error.message }}" },
        "finally": { "set": "loading", "value": false }
      }
    ]
  },
  "com": "form",
  "events": { "submit.prevent": { "call": "handleSubmit" } },
  "children": [
    {
      "com": "div",
      "if": "error",
      "props": { "class": "alert alert-error" },
      "children": "{{ error }}"
    },
    {
      "com": "div",
      "props": { "class": "form-group" },
      "children": [
        { "com": "label", "children": "Username" },
        {
          "com": "input",
          "model": "form.username",
          "props": { "placeholder": "Enter username" }
        }
      ]
    },
    {
      "com": "div",
      "props": { "class": "form-group" },
      "children": [
        { "com": "label", "children": "Password" },
        {
          "com": "input",
          "model": "form.password",
          "props": { "type": "password", "placeholder": "Enter password" }
        }
      ]
    },
    {
      "com": "div",
      "props": { "class": "form-group" },
      "children": [
        {
          "com": "label",
          "children": [
            { "com": "input", "model": "form.remember", "props": { "type": "checkbox" } },
            " Remember me"
          ]
        }
      ]
    },
    {
      "com": "button",
      "props": {
        "type": "submit",
        "disabled": "{{ !canSubmit }}"
      },
      "children": "{{ loading ? 'Logging in...' : 'Login' }}"
    }
  ]
}
```

## Component-specific Binding (modelAdapters)

Some third-party components have special requirements for the value type bound via `model`, and the default `value` binding will fail. A typical example is naive-ui's time/date pickers: the `value` of `NTimePicker`/`NDatePicker` must be a **timestamp or `null`**. Binding a string (e.g. `"09:00:00"`) or an empty string to `value` makes their internal formatter throw `RangeError: Invalid time value`.

For such components, register a binding policy via [`modelAdapters`](/en/api/config#modeladapters) when installing the plugin, so it uses the prop that accepts strings (naive-ui pickers use `formatted-value`) and coerces empty values to `null`:

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

After registration, you can bind string time/date values just like any other field in the schema:

```json
{
  "data": { "form": { "time": "" } },
  "com": "NTimePicker",
  "model": "form.time",
  "props": { "format": "HH:mm:ss" }
}
```

::: tip Note
The stored string must match the component's `format`/`value-format`. For example, `NTimePicker` defaults `format` to `HH:mm:ss`; if you only store `"09:00"`, also set `format`/`value-format` to `HH:mm`.
:::

## Using with UI Libraries

### Element Plus

```json
{
  "com": "ElForm",
  "props": { "model": "{{ form }}", "labelWidth": "100px" },
  "children": [
    {
      "com": "ElFormItem",
      "props": { "label": "Username" },
      "children": [
        { "com": "ElInput", "model": "form.username" }
      ]
    },
    {
      "com": "ElFormItem",
      "props": { "label": "City" },
      "children": [
        {
          "com": "ElSelect",
          "model": "form.city",
          "children": [
            {
              "for": "city in cities",
              "com": "ElOption",
              "props": { "label": "{{ city.label }}", "value": "{{ city.value }}" }
            }
          ]
        }
      ]
    }
  ]
}
```

::: tip Note
When using UI libraries, register components first via `createVSchemaPlugin` or `createVSchema`.
:::
