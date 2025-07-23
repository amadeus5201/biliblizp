import { create } from 'zustand'
import { ApiResponse, ProductMonitorConfig, ScriptTask, MonitorHistory } from '../types'

interface AppState {
  // 请求发送器状态
  currentRequest: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    headers: Record<string, string>
    body: string
  }
  lastResponse: ApiResponse | null
  requestHistory: ApiResponse[]

  // 商品监控状态
  productMonitors: ProductMonitorConfig[]
  productData: Record<string, any>
  monitorHistory: MonitorHistory[]

  // 脚本任务状态
  scriptTasks: ScriptTask[]
  runningScripts: Set<string>

  // 操作函数
  setCurrentRequest: (request: Partial<AppState['currentRequest']>) => void
  setLastResponse: (response: ApiResponse) => void
  addRequestHistory: (response: ApiResponse) => void
  
  addProductMonitor: (config: ProductMonitorConfig) => void
  removeProductMonitor: (id: string) => void
  updateProductData: (productId: string, data: any) => void
  addMonitorHistory: (history: MonitorHistory) => void
  
  addScriptTask: (task: ScriptTask) => void
  removeScriptTask: (id: string) => void
  updateScriptTask: (id: string, updates: Partial<ScriptTask>) => void
  setRunningScript: (id: string, running: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  currentRequest: {
    url: '',
    method: 'GET',
    headers: {},
    body: ''
  },
  lastResponse: null,
  requestHistory: [],

  productMonitors: [],
  productData: {},
  monitorHistory: [],

  scriptTasks: [],
  runningScripts: new Set(),

  // 操作函数
  setCurrentRequest: (request) => 
    set((state) => ({
      currentRequest: { ...state.currentRequest, ...request }
    })),

  setLastResponse: (response) => 
    set({ lastResponse: response }),

  addRequestHistory: (response) =>
    set((state) => ({
      requestHistory: [response, ...state.requestHistory.slice(0, 49)] // 保留最近50条
    })),

  addProductMonitor: (config) =>
    set((state) => ({
      productMonitors: [...state.productMonitors, config]
    })),

  removeProductMonitor: (id) =>
    set((state) => ({
      productMonitors: state.productMonitors.filter(m => m.productId !== id)
    })),

  updateProductData: (productId, data) =>
    set((state) => ({
      productData: { ...state.productData, [productId]: data }
    })),

  addMonitorHistory: (history) =>
    set((state) => ({
      monitorHistory: [history, ...state.monitorHistory.slice(0, 99)] // 保留最近100条
    })),

  addScriptTask: (task) =>
    set((state) => ({
      scriptTasks: [...state.scriptTasks, task]
    })),

  removeScriptTask: (id) =>
    set((state) => ({
      scriptTasks: state.scriptTasks.filter(t => t.id !== id)
    })),

  updateScriptTask: (id, updates) =>
    set((state) => ({
      scriptTasks: state.scriptTasks.map(t => 
        t.id === id ? { ...t, ...updates } : t
      )
    })),

  setRunningScript: (id, running) =>
    set((state) => ({
      runningScripts: running 
        ? new Set([...state.runningScripts, id])
        : new Set([...state.runningScripts].filter(scriptId => scriptId !== id))
    }))
})) 