import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import { 
  LinkOutlined,
  ExperimentOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

// 页面组件
import BilibiliLinkAnalyzer from './pages/BilibiliLinkAnalyzer'
import ActivityAnalyzer from './pages/ActivityAnalyzer'
import BatchLotteryMonitor from './pages/BatchLotteryMonitor'

const { Header, Sider, Content } = Layout

const App: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = [
    {
      key: '/bilibili-analyzer',
      icon: <LinkOutlined />,
      label: 'B站链接分析',
    },
    {
      key: '/activity-analyzer',
      icon: <ExperimentOutlined />,
      label: '活动接口分析',
    },
    {
      key: '/batch-lottery-monitor',
      icon: <AppstoreOutlined />,
      label: '批量中奖监控',
    },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={250} theme="dark">
        <div style={{ 
          height: 32, 
          margin: 16, 
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold'
        }}>
          Bilibili 监控系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <h1 style={{ margin: 0, fontSize: '20px', color: '#1890ff' }}>
            {menuItems.find(item => item.key === location.pathname)?.label || '仪表板'}
          </h1>
        </Header>
        <Content style={{ margin: '24px', padding: '24px', background: '#fff', borderRadius: '8px' }}>
          <Routes>
            <Route path="/" element={<BilibiliLinkAnalyzer />} />
            <Route path="/bilibili-analyzer" element={<BilibiliLinkAnalyzer />} />
            <Route path="/activity-analyzer" element={<ActivityAnalyzer />} />
            <Route path="/batch-lottery-monitor" element={<BatchLotteryMonitor />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App 