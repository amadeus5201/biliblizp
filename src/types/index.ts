// API请求相关类型
export interface ApiRequest {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: any
}

export interface ApiResponse {
  data: any
  status: number
  statusText: string
  headers: Record<string, string>
}

// 商品监控相关类型
export interface ProductMonitorConfig {
  apiUrl: string
  productId: string
  interval: number // 轮询间隔（秒）
  isActive: boolean
}

export interface ProductData {
  id: string
  name: string
  stock: number
  price: number
  lastUpdate: string
}

// 脚本任务相关类型
export interface ScriptTask {
  id: string
  name: string
  code: string
  interval: number // 执行间隔（秒）
  isActive: boolean
  lastRun?: string
  nextRun?: string
  runCount: number
  lastResult?: any
}

// 监控历史记录
export interface MonitorHistory {
  id: string
  timestamp: string
  data: any
  type: 'product' | 'script' | 'request'
} 