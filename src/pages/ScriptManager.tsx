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
  Modal,
  InputNumber,
  Switch
} from 'antd'
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  DeleteOutlined,
  EditOutlined,
  CodeOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores'
import { executeScript } from '../services/api'
import { ScriptTask } from '../types'

const { TextArea } = Input

const ScriptManager: React.FC = () => {
  const { 
    scriptTasks, 
    addScriptTask, 
    removeScriptTask,
    updateScriptTask,
    setRunningScript,
    runningScripts,
    addMonitorHistory
  } = useAppStore()

  const [form] = Form.useForm()
  const [editingTask, setEditingTask] = useState<ScriptTask | null>(null)
  const [isModalVisible, setIsModalVisible] = useState(false)

  // 启动脚本
  const handleStartScript = async (task: ScriptTask) => {
    try {
      setRunningScript(task.id, true)
      
      const context = {
        console: console,
        fetch: fetch,
        setTimeout: setTimeout,
        setInterval: setInterval,
        clearTimeout: clearTimeout,
        clearInterval: clearInterval
      }

      const result = await executeScript(task.code, context)
      
      updateScriptTask(task.id, {
        lastRun: new Date().toISOString(),
        nextRun: new Date(Date.now() + task.interval * 1000).toISOString(),
        runCount: task.runCount + 1,
        lastResult: result
      })

      addMonitorHistory({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        data: { taskId: task.id, result },
        type: 'script'
      })

      message.success(`脚本 ${task.name} 执行成功`)
    } catch (error) {
      message.error(`脚本执行失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setRunningScript(task.id, false)
    }
  }

  // 停止脚本
  const handleStopScript = (taskId: string) => {
    setRunningScript(taskId, false)
    message.success('脚本已停止')
  }

  // 添加脚本
  const handleAddScript = (values: any) => {
    const task: ScriptTask = {
      id: Date.now().toString(),
      name: values.name,
      code: values.code,
      interval: values.interval,
      isActive: false,
      runCount: 0
    }

    addScriptTask(task)
    form.resetFields()
    message.success('脚本任务已添加')
  }

  // 编辑脚本
  const handleEditScript = (task: ScriptTask) => {
    setEditingTask(task)
    form.setFieldsValue({
      name: task.name,
      code: task.code,
      interval: task.interval
    })
    setIsModalVisible(true)
  }

  // 保存编辑
  const handleSaveEdit = (values: any) => {
    if (editingTask) {
      updateScriptTask(editingTask.id, {
        name: values.name,
        code: values.code,
        interval: values.interval
      })
      setEditingTask(null)
      setIsModalVisible(false)
      form.resetFields()
      message.success('脚本已更新')
    }
  }

  // 删除脚本
  const handleDeleteScript = (taskId: string) => {
    handleStopScript(taskId)
    removeScriptTask(taskId)
    message.success('脚本任务已删除')
  }

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '执行间隔',
      dataIndex: 'interval',
      key: 'interval',
      render: (interval: number) => `${interval}秒`
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record: ScriptTask) => (
        <Tag color={runningScripts.has(record.id) ? 'green' : 'red'}>
          {runningScripts.has(record.id) ? '运行中' : '已停止'}
        </Tag>
      )
    },
    {
      title: '执行次数',
      dataIndex: 'runCount',
      key: 'runCount',
    },
    {
      title: '最后执行',
      dataIndex: 'lastRun',
      key: 'lastRun',
      render: (lastRun: string) => lastRun ? new Date(lastRun).toLocaleString() : '从未执行'
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record: ScriptTask) => (
        <Space>
          {runningScripts.has(record.id) ? (
            <Button 
              size="small" 
              icon={<PauseCircleOutlined />}
              onClick={() => handleStopScript(record.id)}
            >
              停止
            </Button>
          ) : (
            <Button 
              size="small" 
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => handleStartScript(record)}
            >
              执行
            </Button>
          )}
          <Button 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => handleEditScript(record)}
          >
            编辑
          </Button>
          <Button 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteScript(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <h2>脚本管理</h2>
      
      <Card title="添加脚本任务" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddScript}
        >
          <Form.Item 
            name="name" 
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="脚本任务名称" />
          </Form.Item>

          <Form.Item 
            name="interval" 
            label="执行间隔(秒)"
            initialValue={60}
            rules={[{ required: true, message: '请输入执行间隔' }]}
          >
            <InputNumber min={1} max={3600} />
          </Form.Item>

          <Form.Item 
            name="code" 
            label="脚本代码"
            rules={[{ required: true, message: '请输入脚本代码' }]}
          >
            <TextArea 
              rows={8} 
              placeholder={`// 示例脚本
console.log('脚本开始执行');

// 可以在这里编写你的逻辑
const result = await fetch('https://api.example.com/data');
const data = await result.json();

console.log('获取到的数据:', data);

// 返回结果
return data;`}
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<CodeOutlined />}>
              添加脚本
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="脚本任务列表">
        <Table
          columns={columns}
          dataSource={scriptTasks}
          rowKey="id"
          pagination={false}
        />
      </Card>

      <Modal
        title="编辑脚本"
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          setEditingTask(null)
          form.resetFields()
        }}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveEdit}
        >
          <Form.Item 
            name="name" 
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item 
            name="interval" 
            label="执行间隔(秒)"
            rules={[{ required: true, message: '请输入执行间隔' }]}
          >
            <InputNumber min={1} max={3600} />
          </Form.Item>

          <Form.Item 
            name="code" 
            label="脚本代码"
            rules={[{ required: true, message: '请输入脚本代码' }]}
          >
            <TextArea rows={8} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => {
                setIsModalVisible(false)
                setEditingTask(null)
                form.resetFields()
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ScriptManager 