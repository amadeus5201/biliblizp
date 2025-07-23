import React, { useState, useEffect } from 'react'
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Space, 
  Table, 
  Tag,
  message,
  Switch,
  InputNumber
} from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores'
import { startProductMonitor } from '../services/api'
import { ProductMonitorConfig } from '../types'

const ProductMonitor: React.FC = () => {
  const { 
    productMonitors, 
    addProductMonitor, 
    removeProductMonitor,
    updateProductData,
    addMonitorHistory,
    productData 
  } = useAppStore()

  const [form] = Form.useForm()
  const [monitors, setMonitors] = useState<Map<string, () => void>>(new Map())

  // 启动监控
  const handleStartMonitor = (config: ProductMonitorConfig) => {
    const stopMonitor = startProductMonitor(
      config.apiUrl,
      config.productId,
      config.interval * 1000, // 转换为毫秒
      (data) => {
        updateProductData(config.productId, data)
        addMonitorHistory({
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          data,
          type: 'product'
        })
      }
    )

    setMonitors(prev => new Map(prev.set(config.productId, stopMonitor)))
    message.success(`开始监控商品 ${config.productId}`)
  }

  // 停止监控
  const handleStopMonitor = (productId: string) => {
    const stopMonitor = monitors.get(productId)
    if (stopMonitor) {
      stopMonitor()
      setMonitors(prev => {
        const newMap = new Map(prev)
        newMap.delete(productId)
        return newMap
      })
      message.success(`停止监控商品 ${productId}`)
    }
  }

  // 添加新监控
  const handleAddMonitor = async (values: any) => {
    const config: ProductMonitorConfig = {
      apiUrl: values.apiUrl,
      productId: values.productId,
      interval: values.interval,
      isActive: true
    }

    addProductMonitor(config)
    handleStartMonitor(config)
    form.resetFields()
    message.success('监控任务已添加')
  }

  // 删除监控
  const handleDeleteMonitor = (productId: string) => {
    handleStopMonitor(productId)
    removeProductMonitor(productId)
    message.success('监控任务已删除')
  }

  const columns = [
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
    },
    {
      title: 'API地址',
      dataIndex: 'apiUrl',
      key: 'apiUrl',
      ellipsis: true
    },
    {
      title: '轮询间隔',
      dataIndex: 'interval',
      key: 'interval',
      render: (interval: number) => `${interval}秒`
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record: ProductMonitorConfig) => (
        <Tag color={monitors.has(record.productId) ? 'green' : 'red'}>
          {monitors.has(record.productId) ? '运行中' : '已停止'}
        </Tag>
      )
    },
    {
      title: '最新数据',
      key: 'latestData',
      render: (_, record: ProductMonitorConfig) => {
        const data = productData[record.productId]
        return data ? (
          <div style={{ fontSize: '12px' }}>
            <div>库存: {data.stock || 'N/A'}</div>
            <div>价格: {data.price || 'N/A'}</div>
          </div>
        ) : '暂无数据'
      }
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record: ProductMonitorConfig) => (
        <Space>
          {monitors.has(record.productId) ? (
            <Button 
              size="small" 
              icon={<PauseCircleOutlined />}
              onClick={() => handleStopMonitor(record.productId)}
            >
              停止
            </Button>
          ) : (
            <Button 
              size="small" 
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleStartMonitor(record)}
            >
              启动
            </Button>
          )}
          <Button 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteMonitor(record.productId)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <h2>商品监控</h2>
      
      <Card title="添加监控任务" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={handleAddMonitor}
        >
          <Form.Item 
            name="apiUrl" 
            label="API地址"
            rules={[{ required: true, message: '请输入API地址' }]}
          >
            <Input placeholder="https://api.example.com/product" style={{ width: 300 }} />
          </Form.Item>

          <Form.Item 
            name="productId" 
            label="商品ID"
            rules={[{ required: true, message: '请输入商品ID' }]}
          >
            <Input placeholder="商品ID" style={{ width: 150 }} />
          </Form.Item>

          <Form.Item 
            name="interval" 
            label="轮询间隔(秒)"
            initialValue={5}
            rules={[{ required: true, message: '请输入轮询间隔' }]}
          >
            <InputNumber min={1} max={3600} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              添加监控
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="监控任务列表">
        <Table
          columns={columns}
          dataSource={productMonitors}
          rowKey="productId"
          pagination={false}
        />
      </Card>
    </div>
  )
}

export default ProductMonitor 