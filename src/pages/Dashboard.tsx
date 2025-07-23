import React from 'react'
import { Card, Row, Col, Statistic, List, Tag } from 'antd'
import { 
  SendOutlined, 
  MonitorOutlined, 
  CodeOutlined,
  ClockCircleOutlined 
} from '@ant-design/icons'
import { useAppStore } from '../stores'

const Dashboard: React.FC = () => {
  const { 
    requestHistory, 
    productMonitors, 
    scriptTasks, 
    monitorHistory 
  } = useAppStore()

  const activeMonitors = productMonitors.filter(m => m.isActive).length
  const activeScripts = scriptTasks.filter(s => s.isActive).length
  const recentRequests = requestHistory.length
  const recentHistory = monitorHistory.slice(0, 5)

  return (
    <div>
      <h2>系统概览</h2>
      
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃监控"
              value={activeMonitors}
              prefix={<MonitorOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃脚本"
              value={activeScripts}
              prefix={<CodeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="最近请求"
              value={recentRequests}
              prefix={<SendOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="监控记录"
              value={monitorHistory.length}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 最近活动 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card title="最近监控记录" size="small">
            <List
              size="small"
              dataSource={recentHistory}
              renderItem={(item) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Tag color={
                        item.type === 'product' ? 'blue' : 
                        item.type === 'script' ? 'green' : 'orange'
                      }>
                        {item.type === 'product' ? '商品监控' : 
                         item.type === 'script' ? '脚本执行' : 'API请求'}
                      </Tag>
                      <span style={{ fontSize: '12px', color: '#999' }}>
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: '12px', color: '#666' }}>
                      {JSON.stringify(item.data).substring(0, 100)}...
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="活跃监控任务" size="small">
            <List
              size="small"
              dataSource={productMonitors.filter(m => m.isActive)}
              renderItem={(monitor) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>商品ID: {monitor.productId}</span>
                      <Tag color="green">运行中</Tag>
                    </div>
                    <div style={{ marginTop: 4, fontSize: '12px', color: '#666' }}>
                      {monitor.apiUrl} - 间隔: {monitor.interval}秒
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard 