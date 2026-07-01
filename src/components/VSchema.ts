/**
 * VSchema 组件 - 可按需导入使用
 * 
 * 使用方式：
 * ```vue
 * <script setup>
 * import { VSchema } from 'vschema';
 * </script>
 * 
 * <template>
 *   <VSchema :schema="schema" />
 * </template>
 * ```
 */

import { defineComponent, h, type PropType } from 'vue';
import type { JsonNode } from '../types/schema';
import type { GlobalConfig } from '../types/config';
import { Renderer } from '../renderer/Renderer';
import { Parser } from '../parser/Parser';
import { ComponentRegistry } from '../registry/ComponentRegistry';
import { DataFetcher } from '../fetch/DataFetcher';

/**
 * 创建 VSchema 组件实例
 * 
 * @param options 配置选项
 * @returns Vue 组件
 * 
 * @example
 * ```ts
 * // 基础用法
 * import { createVSchema } from 'vschema';
 * const VSchema = createVSchema();
 * 
 * // 带配置
 * const VSchema = createVSchema({
 *   baseURL: 'https://api.example.com',
 *   components: { MyButton }
 * });
 * ```
 */
export function createVSchema(options: GlobalConfig & { 
  components?: Record<string, any> 
} = {}) {
  // 创建组件注册表
  const registry = new ComponentRegistry();
  
  // 注册自定义组件
  if (options.components) {
    registry.registerBulk(options.components);
  }

  // 创建数据获取器
  const fetcher = new DataFetcher();
  fetcher.configure(options);

  // 创建渲染器
  const renderer = new Renderer({
    registry,
    fetcher,
    modelAdapters: options.modelAdapters,
  });

  // 创建解析器
  const parser = new Parser();

  return defineComponent({
    name: 'VSchema',
    props: {
      schema: {
        type: [Object, String] as PropType<JsonNode | string>,
        required: true,
      },
      config: {
        type: Object as PropType<GlobalConfig>,
        default: undefined,
      },
      initialData: {
        type: Object as PropType<Record<string, any>>,
        default: undefined,
      },
      methods: {
        type: Object as PropType<Record<string, Function>>,
        default: undefined,
      },
    },
    emits: ['error'],
    setup(props, { emit, attrs }) {
      return () => {
        try {
          let node: JsonNode;

          // 解析 schema
          if (typeof props.schema === 'string') {
            const parseResult = parser.parse(props.schema);
            if (!parseResult.success || !parseResult.node) {
              emit('error', {
                type: 'parse',
                errors: parseResult.errors,
              });
              return h('div', {
                style: { color: 'red', padding: '8px' }
              }, `JSON 解析错误: ${parseResult.errors?.map(e => e.message).join(', ')}`);
            }
            node = parseResult.node;
          } else {
            node = props.schema as JsonNode;
          }

          // 合并初始数据和方法
          if (props.initialData || props.methods) {
            node = {
              ...node,
              data: {
                ...node.data,
                ...props.initialData,
                $methods: props.methods || {},
              },
            };
          }

          // 渲染组件
          const RenderedComponent = renderer.render(node);

          // 收集事件监听器
          const eventListeners: Record<string, any> = {};
          for (const key in attrs) {
            if (key.startsWith('on') && typeof attrs[key] === 'function') {
              eventListeners[key] = attrs[key];
            }
          }

          return h(RenderedComponent, eventListeners);
        } catch (error) {
          emit('error', {
            type: 'render',
            error,
          });
          return h('div', {
            style: { color: 'red', padding: '8px' }
          }, `渲染错误: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
    },
  });
}

/**
 * 默认 VSchema 组件实例（无配置）
 * 
 * @example
 * ```vue
 * <script setup>
 * import { VSchema } from 'vschema';
 * </script>
 * 
 * <template>
 *   <VSchema :schema="schema" />
 * </template>
 * ```
 */
export const VSchema = createVSchema();
