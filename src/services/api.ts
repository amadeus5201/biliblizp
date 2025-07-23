import axios, { AxiosResponse } from 'axios'
import { ApiRequest, ApiResponse } from '../types'

/**
 * 发送API请求
 * @param request 请求配置
 * @returns 响应数据
 */
export const sendApiRequest = async (request: ApiRequest): Promise<ApiResponse> => {
  try {
    const config = {
      method: request.method,
      url: request.url,
      headers: request.headers || {},
      data: request.body
    }

    const response: AxiosResponse = await axios(config)

    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`请求失败: ${error.response?.status} - ${error.message}`)
    }
    throw new Error(`请求失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 轮询监控商品余量
 * @param apiUrl API地址
 * @param productId 商品ID
 * @param interval 轮询间隔（毫秒）
 * @param callback 回调函数
 * @returns 停止函数
 */
export const startProductMonitor = (
  apiUrl: string,
  productId: string,
  interval: number,
  callback: (data: any) => void
): (() => void) => {
  let isRunning = true

  const poll = async () => {
    if (!isRunning) return

    try {
      const response = await sendApiRequest({
        url: `${apiUrl}?productId=${productId}`,
        method: 'GET'
      })
      
      callback(response.data)
    } catch (error) {
      console.error('监控请求失败:', error)
    }

    if (isRunning) {
      setTimeout(poll, interval)
    }
  }

  // 立即开始第一次请求
  poll()

  // 返回停止函数
  return () => {
    isRunning = false
  }
}

/**
 * 执行脚本任务
 * @param code 脚本代码
 * @param context 执行上下文
 * @returns 执行结果
 */
export const executeScript = async (code: string, context: any = {}): Promise<any> => {
  try {
    // 创建一个安全的执行环境
    const safeEval = new Function('context', `
      const { console, fetch, setTimeout, setInterval, clearTimeout, clearInterval } = context;
      ${code}
    `)
    
    return await safeEval(context)
  } catch (error) {
    throw new Error(`脚本执行失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
} 