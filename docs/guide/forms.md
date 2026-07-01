# 表单绑定

VSchema 支持 `model` 属性实现双向数据绑定，类似 Vue 的 `v-model`。

## 基础用法

### 文本输入

```json
{
  "data": { "username": "" },
  "com": "input",
  "model": "username",
  "props": { "placeholder": "请输入用户名" }
}
```

### 嵌套路径

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
      "props": { "placeholder": "用户名" }
    },
    {
      "com": "input",
      "model": "form.password",
      "props": { "type": "password", "placeholder": "密码" }
    }
  ]
}
```

## 修饰符

VSchema 支持三种修饰符，可以追加在绑定路径后面：

| 修饰符 | 说明 | 示例 |
|--------|------|------|
| `.trim` | 自动去除首尾空格 | `"username.trim"` |
| `.number` | 自动转换为数字 | `"age.number"` |
| `.lazy` | 使用 change 事件而非 input 事件 | `"content.lazy"` |

### 单个修饰符

```json
{
  "data": { "username": "", "age": 0 },
  "com": "div",
  "children": [
    {
      "com": "input",
      "model": "username.trim",
      "props": { "placeholder": "用户名（自动去除空格）" }
    },
    {
      "com": "input",
      "model": "age.number",
      "props": { "type": "number", "placeholder": "年龄" }
    }
  ]
}
```

### 组合修饰符

修饰符可以组合使用：

```json
{
  "com": "input",
  "model": "price.trim.number",
  "props": { "placeholder": "价格" }
}
```

```json
{
  "com": "textarea",
  "model": "content.trim.lazy",
  "props": { "placeholder": "内容（失焦时更新）" }
}
```

## 带参数的 v-model

对于支持多个 v-model 的组件（如 `v-model:visible`、`v-model:columns`），使用对象格式：

### 基础用法

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

### 多个 v-model

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

### modelValue 作为默认 v-model

在对象格式中，`modelValue` 表示默认的 `v-model`：

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

等价于 Vue 模板中的：
```vue
<MyComponent v-model="inputValue" v-model:visible="visible" />
```

### 带修饰符

对象格式同样支持修饰符：

```json
{
  "com": "NInput",
  "model": {
    "value": "username.trim"
  }
}
```

## 不同输入类型

### 文本域

```json
{
  "com": "textarea",
  "model": "content",
  "props": { "rows": 5 }
}
```

### 复选框

```json
{
  "data": { "agreed": false },
  "com": "input",
  "model": "agreed",
  "props": { "type": "checkbox" }
}
```

### 单选按钮

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
        "男"
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
        "女"
      ]
    }
  ]
}
```

### 下拉选择

```json
{
  "data": { "city": "" },
  "com": "select",
  "model": "city",
  "children": [
    { "com": "option", "props": { "value": "" }, "children": "请选择" },
    { "com": "option", "props": { "value": "beijing" }, "children": "北京" },
    { "com": "option", "props": { "value": "shanghai" }, "children": "上海" }
  ]
}
```

### 动态选项

```json
{
  "data": {
    "selectedCity": "",
    "cities": [
      { "value": "beijing", "label": "北京" },
      { "value": "shanghai", "label": "上海" },
      { "value": "guangzhou", "label": "广州" }
    ]
  },
  "com": "select",
  "model": "selectedCity",
  "children": [
    { "com": "option", "props": { "value": "" }, "children": "请选择城市" },
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

## 表单验证

### 基础验证

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
          "then": { "set": "errors.email", "value": "邮箱格式不正确" },
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

### 实时验证

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
      "props": { "type": "password", "placeholder": "密码" }
    },
    {
      "com": "div",
      "if": "password",
      "children": "密码强度: {{ passwordStrength }}"
    },
    {
      "com": "input",
      "model": "confirmPassword",
      "props": { "type": "password", "placeholder": "确认密码" }
    },
    {
      "com": "div",
      "if": "confirmPassword && !passwordMatch",
      "props": { "class": "error" },
      "children": "两次密码不一致"
    }
  ]
}
```

## 完整表单示例

### 登录表单

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
        { "com": "label", "children": "用户名" },
        {
          "com": "input",
          "model": "form.username",
          "props": { "placeholder": "请输入用户名" }
        }
      ]
    },
    {
      "com": "div",
      "props": { "class": "form-group" },
      "children": [
        { "com": "label", "children": "密码" },
        {
          "com": "input",
          "model": "form.password",
          "props": { "type": "password", "placeholder": "请输入密码" }
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
            " 记住我"
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
      "children": "{{ loading ? '登录中...' : '登录' }}"
    }
  ]
}
```

### 注册表单

```json
{
  "data": {
    "form": {
      "username": "",
      "email": "",
      "password": "",
      "confirmPassword": ""
    },
    "errors": {},
    "loading": false
  },
  "computed": {
    "isUsernameValid": "form.username.length >= 3",
    "isEmailValid": "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email)",
    "isPasswordValid": "form.password.length >= 6",
    "isPasswordMatch": "form.password === form.confirmPassword",
    "canSubmit": "isUsernameValid && isEmailValid && isPasswordValid && isPasswordMatch && !loading"
  },
  "methods": {
    "validateField": {
      "script": "/* 字段验证逻辑 */"
    },
    "handleSubmit": [
      { "set": "loading", "value": true },
      {
        "fetch": "/api/register",
        "method": "POST",
        "body": "{{ form }}",
        "then": { "emit": "register-success" },
        "catch": { "set": "errors.submit", "value": "{{ $error.message }}" },
        "finally": { "set": "loading", "value": false }
      }
    ]
  },
  "com": "form",
  "events": { "submit.prevent": { "call": "handleSubmit" } },
  "children": [
    {
      "com": "div",
      "children": [
        { "com": "label", "children": "用户名" },
        { "com": "input", "model": "form.username" },
        {
          "com": "span",
          "if": "form.username && !isUsernameValid",
          "props": { "class": "error" },
          "children": "用户名至少3个字符"
        }
      ]
    },
    {
      "com": "div",
      "children": [
        { "com": "label", "children": "邮箱" },
        { "com": "input", "model": "form.email", "props": { "type": "email" } },
        {
          "com": "span",
          "if": "form.email && !isEmailValid",
          "props": { "class": "error" },
          "children": "邮箱格式不正确"
        }
      ]
    },
    {
      "com": "div",
      "children": [
        { "com": "label", "children": "密码" },
        { "com": "input", "model": "form.password", "props": { "type": "password" } },
        {
          "com": "span",
          "if": "form.password && !isPasswordValid",
          "props": { "class": "error" },
          "children": "密码至少6个字符"
        }
      ]
    },
    {
      "com": "div",
      "children": [
        { "com": "label", "children": "确认密码" },
        { "com": "input", "model": "form.confirmPassword", "props": { "type": "password" } },
        {
          "com": "span",
          "if": "form.confirmPassword && !isPasswordMatch",
          "props": { "class": "error" },
          "children": "两次密码不一致"
        }
      ]
    },
    {
      "com": "button",
      "props": { "type": "submit", "disabled": "{{ !canSubmit }}" },
      "children": "{{ loading ? '注册中...' : '注册' }}"
    }
  ]
}
```

## 组件专属绑定（modelAdapters）

某些第三方组件对 `model` 绑定的值类型有特殊要求，直接用默认的 `value` 绑定会出错。典型例子是 naive-ui 的时间/日期选择器：`NTimePicker`/`NDatePicker` 的 `value` 必须是**时间戳或 `null`**，若把字符串（如 `"09:00:00"`）或空串绑到 `value`，其内部会抛出 `RangeError: Invalid time value`。

对这类组件，应在插件初始化时通过 [`modelAdapters`](/api/config#modeladapters) 注册绑定策略，让它改用组件支持字符串的 prop（naive-ui picker 用 `formatted-value`），并把空值转为 `null`：

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

注册后，schema 里就能像普通字段一样绑定字符串时间/日期：

```json
{
  "data": { "form": { "time": "" } },
  "com": "NTimePicker",
  "model": "form.time",
  "props": { "format": "HH:mm:ss" }
}
```

::: tip 提示
存储的字符串需与组件的 `format`/`value-format` 一致。例如 `NTimePicker` 默认 `format` 为 `HH:mm:ss`，若只存 `"09:00"` 请同时设置 `format`/`value-format` 为 `HH:mm`。
:::

## 与 UI 组件库配合

### Element Plus

```json
{
  "com": "ElForm",
  "props": { "model": "{{ form }}", "labelWidth": "100px" },
  "children": [
    {
      "com": "ElFormItem",
      "props": { "label": "用户名" },
      "children": [
        { "com": "ElInput", "model": "form.username" }
      ]
    },
    {
      "com": "ElFormItem",
      "props": { "label": "城市" },
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

::: tip 提示
使用 UI 组件库时，需要先通过 `createVSchemaPlugin` 或 `createVSchema` 注册组件。
:::
