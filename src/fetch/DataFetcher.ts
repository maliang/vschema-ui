/**
 * Data Fetcher - 数据获取器
 * 负责处理远程 API 调用和数据转换
 */

import type {
  IDataFetcher,
  EvaluationContext,
  FetchResult,
} from '../types/runtime';
import type { GlobalConfig, RequestConfig, ResponseFormatConfig } from '../types/config';
import type { FetchAction } from '../types/schema';
import { ApiError } from '../types/errors';

/**
 * 默认响应格式配置
 */
const DEFAULT_RESPONSE_FORMAT: Required<ResponseFormatConfig> = {
  codeField: 'code',
  msgField: 'msg',
  dataField: 'data',
  successCode: 200,
};

export class DataFetcher implements IDataFetcher {
  private config: GlobalConfig = {};
  
  // Loading 状态追踪（用于外部访问）
  private loadingStates: Map<string, boolean> = new Map();

  /**
   * 配置数据获取器
   * @param config 全局配置
   */
  configure(config: GlobalConfig): void {
    this.config = { ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): GlobalConfig {
    return { ...this.config };
  }

  /**
   * 获取 loading 状态
   * @param requestId 请求标识
   */
  isLoading(requestId?: string): boolean {
    if (requestId) {
      return this.loadingStates.get(requestId) || false;
    }
    // 如果没有指定 requestId，检查是否有任何请求在进行中
    for (const loading of this.loadingStates.values()) {
      if (loading) return true;
    }
    return false;
  }

  /**
   * 执行 API 调用
   * @param action FetchAction 配置
   * @param context 求值上下文
   * @returns 请求结果
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(action: FetchAction, _context: EvaluationContext): Promise<FetchResult> {
    const requestId = this.generateRequestId();
    
    try {
      // 设置 loading 状态为 true
      this.loadingStates.set(requestId, true);

      // 构建请求配置
      let requestConfig = this.buildRequestConfig(action);

      // 执行请求拦截器
      if (this.config.requestInterceptor) {
        try {
          requestConfig = await Promise.resolve(
            this.config.requestInterceptor(requestConfig)
          );
        } catch (interceptorError) {
          // 请求拦截器错误
          this.loadingStates.set(requestId, false);
          return {
            success: false,
            error: interceptorError instanceof Error 
              ? interceptorError 
              : new Error(String(interceptorError)),
          };
        }
      }

      // 执行 HTTP 请求
      const response = await this.executeRequest(requestConfig);

      // 处理响应
      return await this.handleResponse(response, requestId, requestConfig.responseType);
    } catch (error) {
      // 处理错误
      return await this.handleError(error, requestId);
    }
  }

  /**
   * 构建请求配置
   */
  private buildRequestConfig(action: FetchAction): RequestConfig {
    // 构建完整 URL
    let url = action.fetch;
    // 如果指定了 ignoreBaseURL，则不添加 baseURL
    if (this.config.baseURL && !action.ignoreBaseURL) {
      // 如果 URL 不是绝对路径，则添加 baseURL
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        const base = this.config.baseURL.endsWith('/')
          ? this.config.baseURL.slice(0, -1)
          : this.config.baseURL;
        const path = url.startsWith('/') ? url : '/' + url;
        url = base + path;
      }
    }

    // 添加查询参数
    if (action.params && Object.keys(action.params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(action.params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    // 合并请求头
    const headers: Record<string, string> = {
      ...this.config.defaultHeaders,
      ...this.normalizeHeaders(action.headers),
    };

    // 如果有请求体且没有设置 Content-Type，默认使用 JSON
    if (action.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    return {
      url,
      method: action.method || 'GET',
      headers,
      body: action.body,
      responseType: action.responseType,
    };
  }

  /**
   * 标准化请求头（确保所有值都是字符串）
   */
  private normalizeHeaders(headers?: Record<string, any>): Record<string, string> {
    if (!headers) return {};
    
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key] = String(value);
    }
    return normalized;
  }

  /**
   * 执行 HTTP 请求
   */
  private async executeRequest(config: RequestConfig): Promise<Response> {
    const fetchOptions: RequestInit = {
      method: config.method,
      headers: config.headers,
    };

    // 添加请求体（GET 和 HEAD 请求不应该有 body）
    if (config.body !== undefined && config.method !== 'GET' && config.method !== 'HEAD') {
      fetchOptions.body = typeof config.body === 'string' 
        ? config.body 
        : JSON.stringify(config.body);
    }

    return fetch(config.url, fetchOptions);
  }

  /**
   * 获取响应格式配置（合并默认值）
   */
  private getResponseFormat(): Required<ResponseFormatConfig> {
    return {
      ...DEFAULT_RESPONSE_FORMAT,
      ...this.config.responseFormat,
    };
  }

  /**
   * 检查业务状态码是否表示成功
   * @param code 业务状态码
   */
  private isSuccessCode(code: number): boolean {
    const { successCode } = this.getResponseFormat();
    if (Array.isArray(successCode)) {
      return successCode.includes(code);
    }
    return code === successCode;
  }

  /**
   * 从响应中提取字段值
   * @param response 响应对象
   * @param field 字段名
   */
  private getResponseField(response: any, field: string): any {
    if (!response || typeof response !== 'object') {
      return undefined;
    }
    return response[field];
  }

  /**
   * 处理响应
   */
  private async handleResponse(response: Response, requestId: string, responseType?: string): Promise<FetchResult> {
    try {
      // 检查 HTTP 状态码
      if (!response.ok) {
        // HTTP 错误状态（4xx, 5xx）
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }
        
        const error = new ApiError(`HTTP ${response.status}: ${response.statusText}`, {
          status: response.status,
          response: errorData,
        });

        // 执行错误拦截器
        if (this.config.errorInterceptor) {
          try {
            await Promise.resolve(this.config.errorInterceptor(error));
          } catch (interceptorError) {
            this.loadingStates.set(requestId, false);
            return {
              success: false,
              error: interceptorError instanceof Error 
                ? interceptorError 
                : new Error(String(interceptorError)),
              status: response.status,
              response: errorData,
            };
          }
        }

        this.loadingStates.set(requestId, false);
        return {
          success: false,
          error,
          status: response.status,
          response: errorData,
        };
      }

      // 根据 responseType 解析响应体
      let data: any;
      
      if (responseType === 'blob') {
        // Blob 类型直接返回，不进行业务状态码检查
        data = await response.blob();
        this.loadingStates.set(requestId, false);
        return {
          success: true,
          data,
          status: response.status,
          response: data,
        };
      } else if (responseType === 'arrayBuffer') {
        data = await response.arrayBuffer();
        this.loadingStates.set(requestId, false);
        return {
          success: true,
          data,
          status: response.status,
          response: data,
        };
      } else if (responseType === 'text') {
        data = await response.text();
        this.loadingStates.set(requestId, false);
        return {
          success: true,
          data,
          status: response.status,
          response: data,
        };
      } else {
        // 默认 JSON 处理
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }
      }

      // 执行响应拦截器
      if (this.config.responseInterceptor) {
        try {
          data = await Promise.resolve(this.config.responseInterceptor(data));
        } catch (interceptorError) {
          this.loadingStates.set(requestId, false);
          return {
            success: false,
            error: interceptorError instanceof Error 
              ? interceptorError 
              : new Error(String(interceptorError)),
            status: response.status,
            response: data,
          };
        }
      }

      // 检查业务状态码（仅对 JSON 响应进行检查）
      if (typeof data === 'object' && data !== null) {
        const format = this.getResponseFormat();
        const businessCode = this.getResponseField(data, format.codeField);
        
        // 如果响应中包含业务状态码字段，则进行业务状态码判断
        if (businessCode !== undefined) {
          if (!this.isSuccessCode(businessCode)) {
            // 业务状态码表示失败
            const msg = this.getResponseField(data, format.msgField) || '请求失败';
            const error = new ApiError(msg, {
              code: businessCode,
              response: data,
            });

            // 执行错误拦截器
            if (this.config.errorInterceptor) {
              try {
                await Promise.resolve(this.config.errorInterceptor(error));
              } catch (interceptorError) {
                this.loadingStates.set(requestId, false);
                return {
                  success: false,
                  error: interceptorError instanceof Error 
                    ? interceptorError 
                    : new Error(String(interceptorError)),
                  status: response.status,
                  response: data,
                };
              }
            }

            this.loadingStates.set(requestId, false);
            return {
              success: false,
              error,
              status: response.status,
              response: data,
            };
          }

          // 业务成功，提取 data 字段
          const extractedData = this.getResponseField(data, format.dataField);
          this.loadingStates.set(requestId, false);
          return {
            success: true,
            data: extractedData,
            status: response.status,
            response: data,
          };
        }
      }

      // 无业务状态码的情况，使用 responseDataPath 提取数据
      const extractedData = this.extractData(data);

      this.loadingStates.set(requestId, false);
      return {
        success: true,
        data: extractedData,
        status: response.status,
        response: data,  // 完整响应，供 $response 使用
      };
    } catch (parseError) {
      this.loadingStates.set(requestId, false);
      return {
        success: false,
        error: parseError instanceof Error 
          ? parseError 
          : new Error('Failed to parse response'),
        status: response.status,
      };
    }
  }

  /**
   * 处理错误
   */
  private async handleError(error: unknown, requestId: string): Promise<FetchResult> {
    const normalizedError = error instanceof Error 
      ? error 
      : new Error(String(error));

    // 执行错误拦截器
    if (this.config.errorInterceptor) {
      try {
        await Promise.resolve(this.config.errorInterceptor(normalizedError));
      } catch (interceptorError) {
        this.loadingStates.set(requestId, false);
        return {
          success: false,
          error: interceptorError instanceof Error 
            ? interceptorError 
            : new Error(String(interceptorError)),
        };
      }
    }

    this.loadingStates.set(requestId, false);
    return {
      success: false,
      error: normalizedError,
    };
  }

  /**
   * 根据 responseDataPath 提取数据
   */
  private extractData(data: any): any {
    if (!this.config.responseDataPath || !data) {
      return data;
    }

    const path = this.config.responseDataPath;
    const parts = path.split('.');
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * 生成唯一的请求 ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 清理所有 loading 状态
   */
  clearLoadingStates(): void {
    this.loadingStates.clear();
  }
}

/**
 * 创建数据获取器实例
 */
export function createDataFetcher(config?: GlobalConfig): DataFetcher {
  const fetcher = new DataFetcher();
  if (config) {
    fetcher.configure(config);
  }
  return fetcher;
}
