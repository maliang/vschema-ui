/**
 * Error type definitions for Vue JSON Renderer
 */

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // Parse errors
  PARSE_INVALID_JSON = 'PARSE_001',
  PARSE_INVALID_SCHEMA = 'PARSE_002',
  PARSE_MISSING_REQUIRED = 'PARSE_003',

  // Render errors
  RENDER_UNKNOWN_COMPONENT = 'RENDER_001',
  RENDER_INVALID_PROPS = 'RENDER_002',
  RENDER_SLOT_ERROR = 'RENDER_003',

  // Expression errors
  EXPR_SYNTAX_ERROR = 'EXPR_001',
  EXPR_UNDEFINED_VARIABLE = 'EXPR_002',
  EXPR_SECURITY_VIOLATION = 'EXPR_003',

  // State errors
  STATE_INVALID_PATH = 'STATE_001',
  STATE_TYPE_MISMATCH = 'STATE_002',

  // API errors
  API_NETWORK_ERROR = 'API_001',
  API_RESPONSE_ERROR = 'API_002',
  API_MAPPING_ERROR = 'API_003',
}

/**
 * JSON Renderer error structure
 */
export interface JsonRendererError {
  code: ErrorCode;
  message: string;
  path?: string;
  details?: any;
}

/**
 * Custom error class for JSON Renderer
 */
export class JsonRendererException extends Error {
  public readonly code: ErrorCode;
  public readonly path?: string;
  public readonly details?: any;

  constructor(error: JsonRendererError) {
    super(error.message);
    this.name = 'JsonRendererException';
    this.code = error.code;
    this.path = error.path;
    this.details = error.details;
  }

  toJSON(): JsonRendererError {
    return {
      code: this.code,
      message: this.message,
      path: this.path,
      details: this.details,
    };
  }
}

/**
 * API 错误类 - 用于 HTTP 请求和业务逻辑错误
 * 替代 DataFetcher 中 (error as any).status / .code / .response 的用法
 */
export class ApiError extends Error {
  /** HTTP 状态码 */
  public readonly status?: number;
  /** 业务状态码 */
  public readonly code?: number | string;
  /** 原始响应数据 */
  public readonly response?: any;

  constructor(message: string, options?: { status?: number; code?: number | string; response?: any }) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.code = options?.code;
    this.response = options?.response;
  }
}

/**
 * Create a parse error
 */
export function createParseError(
  message: string,
  path?: string,
  details?: any
): JsonRendererError {
  return {
    code: ErrorCode.PARSE_INVALID_SCHEMA,
    message,
    path,
    details,
  };
}

/**
 * Create a render error
 */
export function createRenderError(
  message: string,
  path?: string,
  details?: any
): JsonRendererError {
  return {
    code: ErrorCode.RENDER_UNKNOWN_COMPONENT,
    message,
    path,
    details,
  };
}

/**
 * Create an expression error
 */
export function createExpressionError(
  message: string,
  code: ErrorCode = ErrorCode.EXPR_SYNTAX_ERROR,
  details?: any
): JsonRendererError {
  return {
    code,
    message,
    details,
  };
}
