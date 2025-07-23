import React, { useState } from 'react'
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Space, 
  Table, 
  message,
  List,
  Typography,
  Alert,
  Modal,
  Image,
  Spin
} from 'antd'
import { 
  SearchOutlined,
  AppstoreOutlined,
  ReloadOutlined,
  EyeOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores'

const { TextArea } = Input

interface LinkItem {
  text: string
  href: string
}

interface CaptchaInfo {
  hasCaptcha: boolean
  captchaType?: 'text' | 'click'
  captchaText?: string
  captchaImageUrl?: string
  captchaError?: string
  captchaPrompt?: string
  message?: string
}

// 扩展Window接口以包含handleCaptchaResult属性
declare global {
  interface Window {
    handleCaptchaResult?: (success: boolean) => void
  }
}

const BilibiliLinkAnalyzer: React.FC = () => {
  const { addMonitorHistory } = useAppStore()
  const [links, setLinks] = useState<LinkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const [batchModalVisible, setBatchModalVisible] = useState(false)
  const [selectedLinks, setSelectedLinks] = useState<LinkItem[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [processedUrls, setProcessedUrls] = useState<Set<string>>(new Set())
  
  // 验证码相关状态
  const [captchaModalVisible, setCaptchaModalVisible] = useState(false)
  const [currentCaptchaInfo, setCurrentCaptchaInfo] = useState<CaptchaInfo | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string>('')
  const [manualCaptchaText, setManualCaptchaText] = useState<string>('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [clickedPoints, setClickedPoints] = useState<Array<{x: number, y: number}>>([])

  // 解析多个链接
  const parseUrls = (urlText: string): string[] => {
    return urlText
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0)
      .filter(url => url.startsWith('http://') || url.startsWith('https://'))
  }

  // 去重链接
  const deduplicateLinks = (newLinks: LinkItem[], existingLinks: LinkItem[]): LinkItem[] => {
    const existingHrefs = new Set(existingLinks.map(link => link.href))
    return newLinks.filter(link => !existingHrefs.has(link.href))
  }

  // 处理验证码的函数
  const handleCaptcha = async (captchaInfo: CaptchaInfo, url: string): Promise<boolean> => {
    setCurrentCaptchaInfo(captchaInfo)
    setCurrentUrl(url)
    setManualCaptchaText(captchaInfo.captchaText || '')
    setClickedPoints([])
    setCaptchaModalVisible(true)
    
    // 等待用户处理验证码
    return new Promise((resolve) => {
      // 这里通过全局变量来处理异步结果
      window.handleCaptchaResult = (success: boolean) => {
        setCaptchaModalVisible(false)
        resolve(success)
      }
    })
  }

  // 重新OCR识别验证码
  const handleReOcr = async () => {
    if (!currentCaptchaInfo?.captchaImageUrl) {
      message.error('没有验证码图片URL')
      return
    }
    
    setOcrLoading(true)
    try {
      const response = await fetch('http://localhost:5177/api/ocr-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: currentCaptchaInfo.captchaImageUrl })
      })
      
      const result = await response.json()
      if (result.success) {
        setManualCaptchaText(result.captchaText || '')
        message.success('验证码重新识别成功')
      } else {
        message.error(result.message || '验证码识别失败')
      }
    } catch (error) {
      message.error('OCR服务调用失败')
    } finally {
      setOcrLoading(false)
    }
  }

  // 处理图片点击事件
  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (currentCaptchaInfo?.captchaType !== 'click') return
    
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    
    // 转换为图片相对坐标（百分比）
    const imgWidth = event.currentTarget.naturalWidth
    const imgHeight = event.currentTarget.naturalHeight
    const relativeX = (x / rect.width) * 100
    const relativeY = (y / rect.height) * 100
    
    setClickedPoints(prev => [...prev, { x: relativeX, y: relativeY }])
    message.success(`已点击位置 (${relativeX.toFixed(1)}%, ${relativeY.toFixed(1)}%)`)
  }

  // 清除点击记录
  const clearClickedPoints = () => {
    setClickedPoints([])
    message.info('已清除点击记录')
  }

  // 确认验证码
  const confirmCaptcha = () => {
    if (currentCaptchaInfo?.captchaType === 'click') {
      if (clickedPoints.length === 0) {
        message.error('请先点击验证码图片中的指定元素')
        return
      }
      message.success(`已确认点击验证码，共点击 ${clickedPoints.length} 个位置`)
    } else {
      if (!manualCaptchaText.trim()) {
        message.error('请输入验证码')
        return
      }
      message.success('验证码已确认')
    }
    
    window.handleCaptchaResult?.(true)
  }

  // 跳过验证码
  const skipCaptcha = () => {
    message.warning('已跳过验证码处理')
    window.handleCaptchaResult?.(false)
  }

  // 访问单个链接并抓取真实内容
  const handleAccessSingleLink = async (url: string): Promise<LinkItem[]> => {
    try {
      // 请求后端代理获取HTML
      const resp = await fetch('http://localhost:5177/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      if (!resp.ok) throw new Error('后端代理请求失败')
      const result = await resp.json()
      
      // 检查是否包含验证码
      if (result.hasCaptcha) {
        console.log('检测到验证码:', result.message)
        
        // 处理验证码
        const captchaHandled = await handleCaptcha(result, url)
        if (!captchaHandled) {
          console.log('验证码处理失败或用户取消')
          return []
        }
        
        // 验证码处理成功后，重新请求页面
        message.info('验证码已处理，重新获取页面内容...')
        const retryResp = await fetch('http://localhost:5177/api/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        })
        if (!retryResp.ok) throw new Error('重新请求失败')
        const retryResult = await retryResp.json()
        
        if (retryResult.hasCaptcha) {
          message.error('验证码处理失败，请重试')
          return []
        }
        
        result.html = retryResult.html
      }
      
      const { html } = result
      
      // 解析HTML正文和所有超链接
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      
      // 尝试多种正文选择器
      let contentNode = doc.querySelector('.opus-content')
      if (!contentNode) contentNode = doc.querySelector('.article-content')
      if (!contentNode) contentNode = doc.querySelector('.main-content')
      if (!contentNode) contentNode = doc.querySelector('.content')
      if (!contentNode) contentNode = doc.body
      
      // 提取正文内所有a标签链接，只保留bilibili.com和b23.tv域名
      const aTags = Array.from(contentNode.querySelectorAll('a'))
      const allLinks: LinkItem[] = aTags
        .map(a => {
          // 获取a标签后面紧跟的文本或span等内容
          let extra = '';
          let next = a.nextSibling;
          while (next && (next.nodeType === 3 || (next.nodeType === 1 && ['SPAN', 'B', 'I'].includes(next.nodeName)))) {
            if (next.nodeType === 3) {
              extra += next.textContent?.trim() || '';
            } else if (next.nodeType === 1) {
              extra += (next as HTMLElement).innerText.trim();
            }
            next = next.nextSibling;
          }
          return {
            text: (a.innerText.trim() + (extra ? ' ' + extra : '')).trim(),
            href: a.href
          };
        })
        .filter(l => l.href.includes('bilibili.com') || l.href.includes('b23.tv'))
      
      return allLinks
    } catch (error) {
      console.error(`访问链接失败 ${url}:`, error)
      return []
    }
  }

  // 访问多个链接并抓取真实内容
  const handleAccessLinks = async (urlText: string) => {
    setLoading(true)
    setLinks([])
    setProcessedUrls(new Set())
    
    try {
      const urls = parseUrls(urlText)
      if (urls.length === 0) {
        message.error('请输入有效的链接')
        return
      }
      
      message.info(`开始处理 ${urls.length} 个链接...`)
      
      let allLinks: LinkItem[] = []
      let processedCount = 0
      
      for (const url of urls) {
        setProcessedUrls(prev => new Set([...prev, url]))
        processedCount++
        
        message.info(`正在处理第 ${processedCount}/${urls.length} 个链接: ${url}`)
        
        const links = await handleAccessSingleLink(url)
        const newLinks = deduplicateLinks(links, allLinks)
        allLinks = [...allLinks, ...newLinks]
        
        // 更新当前结果
        setLinks([...allLinks])
      }
      
      message.success(`处理完成！共提取到 ${allLinks.length} 个不重复的B站相关链接`)
    } catch (error) {
      message.error(`处理失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  // 检查链接是否可以监控
  const isMonitorableLink = (url: string): boolean => {
    return url.includes('b23.tv') || 
           url.includes('bilibili.com/blackboard/') ||
           url.includes('bilibili.com/blackboard/era');
  };

  // 批量添加到监控
  const handleBatchAddToMonitor = () => {
    const monitorableLinks = links.filter(link => isMonitorableLink(link.href))
    if (monitorableLinks.length === 0) {
      message.warning('没有找到可监控的B站链接')
      return
    }
    setSelectedLinks(monitorableLinks)
    setBatchModalVisible(true)
  }

  // 处理多选变化
  const handleSelectionChange = (selectedKeys: React.Key[], selectedRows: LinkItem[]) => {
    setSelectedRowKeys(selectedKeys)
    setSelectedLinks(selectedRows)
  }

  // 批量添加选中的链接到监控
  const handleAddSelectedToMonitor = () => {
    const monitorableSelectedLinks = selectedLinks.filter(link => isMonitorableLink(link.href))
    if (monitorableSelectedLinks.length === 0) {
      message.warning('请选择可监控的B站链接')
      return
    }
    setSelectedLinks(monitorableSelectedLinks)
    setBatchModalVisible(true)
  }

  // 确认批量添加
  const confirmBatchAdd = () => {
    // 将选中的链接存储到localStorage，供批量监控页面使用
    const existingLinks = JSON.parse(localStorage.getItem('batchMonitorLinks') || '[]')
    const newLinks = selectedLinks.map(link => ({
      name: link.text || `监控任务_${Date.now()}`,
      b23url: link.href
    }))
    const allLinks = [...existingLinks, ...newLinks]
    localStorage.setItem('batchMonitorLinks', JSON.stringify(allLinks))
    
    message.success(`成功添加 ${selectedLinks.length} 个链接到批量监控`)
    setBatchModalVisible(false)
    
    // 跳转到批量监控页面
    window.location.href = '/batch-lottery-monitor'
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'text',
      key: 'text',
      render: (text: string) => <span style={{ wordBreak: 'break-all' }}>{text}</span>
    },
    {
      title: '链接地址',
      dataIndex: 'href',
      key: 'href',
      render: (href: string) => (
        <Space>
          <a href={href} target="_blank" rel="noopener noreferrer">{href}</a>
          <Button
            size="small"
            type="link"
            onClick={() => {
              navigator.clipboard.writeText(href)
              message.success('链接已复制')
            }}
          >
            复制
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => window.open(href, '_blank')}
          >
            访问
          </Button>
          {isMonitorableLink(href) && (
            <Button
              size="small"
              type="link"
              onClick={() => {
                // 通过localStorage传递单个链接到批量监控页面
                const singleLink = [{
                  name: `监控任务_${Date.now()}`,
                  b23url: href
                }];
                localStorage.setItem('batchMonitorLinks', JSON.stringify(singleLink));
                window.location.href = '/batch-lottery-monitor';
              }}
            >
              监控
            </Button>
          )}
        </Space>
      )
    }
  ]

  return (
    <div>
      <h2>B站链接分析器</h2>
      <Alert
        message="使用说明"
        description="支持同时输入多个B站链接（每行一个），系统会自动抓取每个链接的正文内容并提取所有超链接，自动去重后展示为'标题+链接地址'表格。如遇到验证码，系统会自动识别并提示确认。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Card title="添加链接" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item 
            label="多个链接（每行一个）" 
            name="multipleUrls"
            extra="支持同时输入多个链接，系统会自动去重处理"
          >
            <TextArea
              rows={6}
              placeholder={`https://www.bilibili.com/opus/1066883469929349129
https://www.bilibili.com/blackboard/era
https://www.bilibili.com/blackboard/activity-xxx`}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={() => {
                  const urls = form.getFieldValue('multipleUrls')
                  if (urls) handleAccessLinks(urls)
                }}
                loading={loading}
              >
                批量分析
              </Button>
              <Button
                onClick={() => {
                  form.setFieldsValue({ multipleUrls: '' })
                  setLinks([])
                  setProcessedUrls(new Set())
                }}
              >
                清空
              </Button>
            </Space>
          </Form.Item>
        </Form>
        
        {/* 处理进度显示 */}
        {processedUrls.size > 0 && (
          <Alert
            message={`正在处理中... 已处理 ${processedUrls.size} 个链接`}
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>
      <Card 
        title="正文内所有超链接（标题+链接地址）"
        extra={
          links.length > 0 && (
            <Space>
              <Button
                type="primary"
                icon={<AppstoreOutlined />}
                onClick={handleBatchAddToMonitor}
                disabled={!links.some(link => isMonitorableLink(link.href))}
              >
                全部添加到监控
              </Button>
              <Button
                type="default"
                icon={<AppstoreOutlined />}
                onClick={handleAddSelectedToMonitor}
                disabled={selectedRowKeys.length === 0 || !selectedLinks.some(link => isMonitorableLink(link.href))}
              >
                选中添加到监控 ({selectedRowKeys.length})
              </Button>
            </Space>
          )
        }
      >
        <Table
          columns={columns}
          dataSource={links}
          rowKey={(record) => record.href + record.text}
          pagination={{ pageSize: 20 }}
          rowSelection={{
            selectedRowKeys,
            onChange: handleSelectionChange,
            getCheckboxProps: (record) => ({
              disabled: !isMonitorableLink(record.href),
              name: record.text,
            }),
          }}
        />
      </Card>

      {/* 批量添加确认模态框 */}
      <Modal
        title="批量添加到监控"
        open={batchModalVisible}
        onOk={confirmBatchAdd}
        onCancel={() => setBatchModalVisible(false)}
        okText="确认添加"
        cancelText="取消"
      >
        <p>即将添加以下 {selectedLinks.length} 个可监控的B站链接到批量监控：</p>
        <List
          size="small"
          dataSource={selectedLinks}
          renderItem={(item) => (
            <List.Item>
              <div style={{ width: '100%' }}>
                <div><strong>{item.text || '无标题'}</strong></div>
                <div style={{ fontSize: '12px', color: '#666' }}>{item.href}</div>
              </div>
            </List.Item>
          )}
        />
      </Modal>

      {/* 验证码处理模态框 */}
      <Modal
        title="验证码处理"
        open={captchaModalVisible}
        onOk={confirmCaptcha}
        onCancel={skipCaptcha}
        okText="确认验证码"
        cancelText="跳过"
        width={600}
      >
        {currentCaptchaInfo && (
          <div>
            <Alert
              message={currentCaptchaInfo.message || '检测到验证码'}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            {currentCaptchaInfo.captchaImageUrl && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Image
                  src={currentCaptchaInfo.captchaImageUrl}
                  alt="验证码图片"
                  style={{ maxWidth: '100%', maxHeight: '200px' }}
                  fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhHj+LhCLHmNoYGRg+gwM6vsKQwP7JwPD1jxFhQwMDA8MfJiDEqSYDw78PAwHc4N+QixpHgPjv9gMDAcGBiYF9j///+8f///v7///f8MDAwMfJiDzQOAgQBw5NfWxJjFAAAAVmVYSWZNTQAqAAAACAABh2kABAAAAAEAAAAaAAAAAAADkoYABwAAABIAAABEoAIABAAAAAEAAADCoAMABAAAAAEAAADDAAAAAEFTQ0lJAAAAU2NyZWVuc2hvdHl1T3IAAAALXRFWHRDb21tZW50AENyZWF0ZWQgd2l0aCBHSU1QV4EOFwAAHHaVRYdFhNTDpjb20uYWRvYmUueG1wADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDcuMi1jMDAwIDc5LjFiNjVhNzliNCwgMjAyMi8wNi8xMy0xODo0NTo0MyAgICAgICAgIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIKICAgIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIKICAgIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIKICAgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpFNTE3OEEyQTg5QjIxMUUyQjdCNDhDNjU5NzM0NTY5QyIKICAgeG1wTU06RG9jdW1lbnRJRD0iYWRvYmU6ZG9jaWQ6cGhvdG9zaG9wOjIyYzFkOTZiLTRjMGItYzQ0Ny1iMjM1LTQ2MTY5ZWM5ZjI5YyIKICAgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOjEyMzQ1Njc4LTg5QjItMTFFMi1CN0I0OEM2NTk3MzQ1NjlDIgogICBkYzpmb3JtYXQ9ImltYWdlL3BuZyIKICAgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMyIKICAgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjQuMCAoTWFjaW50b3NoKSIKICAgeG1wOkNyZWF0ZURhdGU9IjIwMjQtMDEtMjJUMTU6NDc6NDgrMDg6MDAiCiAgIHhtcDpNb2RpZnlEYXRlPSIyMDI0LTAxLTIyVDE1OjUxOjI5KzA4OjAwIgogICB4bXA6TWV0YWRhdGFEYXRlPSIyMDI0LTAxLTIyVDE1OjUxOjI5KzA4OjAwIj4KICA8eG1wTU06SGlzdG9yeT4KICAgPHJkZjpTZXE+CiAgICA8cmRmOmxpCiAgICAgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIgogICAgIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6MTIzNDU2NzgtODlCMi0xMUUyLUI3QjQ4QzY1OTczNDU2OUMiCiAgICAgc3RFdnQ6d2hlbj0iMjAyNC0wMS0yMlQxNTo0Nzo0OCswODowMCIKICAgICBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjQuMCAoTWFjaW50b3NoKSIvPgogICA8cmRmOmxpCiAgICAgc3RFdnQ6YWN0aW9uPSJzYXZlZCIKICAgICBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOkU1MTc4QTJBODlCMjExRTJCN0I0OEM2NTk3MzQ1NjlDIgogICAgIHN0RXZ0OndoZW49IjIwMjQtMDEtMjJUMTU6NTE6MjkrMDg6MDAiCiAgICAgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI0LjAgKE1hY2ludG9zaCkiCiAgICAgc3RFdnQ6Y2hhbmdlZD0iLyIvPgogIDwvcmRmOlNlcT4KIDwveG1wTU06SGlzdG9yeT4KIDwvcmRmOkRlc2NyaXB0aW9uPgogPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KPD94cGFja2V0IGVuZD0iciI/PgH//v38+/r5+Pf29fTz8vHw7+7t7Ovq6ejn5uXk4+Lh4N/e3dzb2tnY19bV1NPS0dDPzs3My8rJyMfGxcTDwsHAv769vLu6ubi3trW0s7KxsK+urayrqqmop6alpKOioaCfnp2cm5qZmJeWlZSTkpGQj46NjIuKiYiHhoWEg4KBgH9+fXx7enl4d3Z1dHNycXBvbm1sa2ppaGdmZWRjYmFgX15dXFtaWVhXVlVUU1JRUE9OTUxLSklIR0ZFRENCQUA/Pj08Ozo5ODc2NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
                />
              </div>
            )}
            
            <div style={{ marginBottom: 16 }}>
              <label>验证码识别结果：</label>
              <Input
                value={manualCaptchaText}
                onChange={(e) => setManualCaptchaText(e.target.value)}
                placeholder="请输入验证码"
                style={{ marginTop: 8 }}
              />
            </div>
            
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReOcr}
                loading={ocrLoading}
              >
                重新识别
              </Button>
              <Button
                icon={<EyeOutlined />}
                onClick={() => currentCaptchaInfo.captchaImageUrl && window.open(currentCaptchaInfo.captchaImageUrl, '_blank')}
              >
                查看大图
              </Button>
            </Space>
            
            {currentCaptchaInfo.captchaError && (
              <Alert
                message="OCR识别失败"
                description={currentCaptchaInfo.captchaError}
                type="error"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default BilibiliLinkAnalyzer 