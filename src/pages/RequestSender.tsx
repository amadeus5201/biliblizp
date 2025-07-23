import React, { useState } from 'react'
import { 
  Card, 
  Form, 
  Input, 
  Select, 
  Button, 
  Space, 
  Divider,
  message,
  Table,
  Tag
} from 'antd'
import { SendOutlined, ClearOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores'
import { sendApiRequest } from '../services/api'

const { Option } = Select
const { TextArea } = Input

const RequestSender: React.FC = () => {
  const { 
    currentRequest, 
    setCurrentRequest, 
    setLastResponse, 
    addRequestHistory,
    requestHistory 
  } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSendRequest = async () => {
    try {
      setLoading(true)
      const response = await sendApiRequest({
        url: currentRequest.url,
        method: currentRequest.method,
        headers: currentRequest.headers,
        body: currentRequest.body ? JSON.parse(currentRequest.body) : undefined
      })

      setLastResponse(response)
      addRequestHistory(response)
      message.success('请求发送成功！')
    } catch (error) {
      message.error(`请求失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setCurrentRequest({
      url: '',
      method: 'GET',
      headers: {},
      body: ''
    })
    form.resetFields()
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp: string) => new Date(timestamp).toLocaleString()
    },
    {
      title: '方法',
      dataIndex: 'method',
      key: 'method',
      render: (method: string) => <Tag color="blue">{method}</Tag>
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Tag color={status >= 200 && status < 300 ? 'green' : 'red'}>
          {status}
        </Tag>
      )
    }
  ]

  return (
    <div>
      <h2>API请求发送器</h2>
      
      <Card title="发送请求" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={currentRequest}
          onValuesChange={(_, values) => setCurrentRequest(values)}
        >
          <Form.Item label="请求URL" name="url" rules={[{ required: true, message: '请输入URL' }]}>
            <Input placeholder="https://api.example.com/endpoint" />
          </Form.Item>

          <Form.Item label="请求方法" name="method">
            <Select>
              <Option value="GET">GET</Option>
              <Option value="POST">POST</Option>
              <Option value="PUT">PUT</Option>
              <Option value="DELETE">DELETE</Option>
            </Select>
          </Form.Item>

          <Form.Item label="请求头 (JSON格式)" name="headers">
            <TextArea 
              rows={4} 
              placeholder='{"Content-Type": "application/json", "Authorization": "Bearer token"}'
            />
          </Form.Item>

          <Form.Item label="请求体 (JSON格式)" name="body">
            <TextArea 
              rows={6} 
              placeholder='{"key": "value"}'
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                icon={<SendOutlined />}
                onClick={handleSendRequest}
                loading={loading}
              >
                发送请求
              </Button>
              <Button 
                icon={<ClearOutlined />}
                onClick={handleClear}
              >
                清空
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card title="请求历史">
        <Table
          columns={columns}
          dataSource={requestHistory.map((item, index) => ({
            ...item,
            key: index,
            timestamp: new Date().toISOString()
          }))}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  )
}

export default RequestSender 