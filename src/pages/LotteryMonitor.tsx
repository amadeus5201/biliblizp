import React, { useState, useRef, useEffect } from 'react';
import { Card, Form, Input, Button, Space, Table, message, Alert, Tag } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';

interface Winner {
  name: string;
  ctime: number;
  award: string;
  icon: string;
}

const LotteryMonitor: React.FC = () => {
  const [form] = Form.useForm();
  const [monitoring, setMonitoring] = useState(false);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const timerRef = useRef<any>(null);
  const [status, setStatus] = useState('未开始');
  const [checkCount, setCheckCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  // 解析b23.tv短链，获取真实URL和sid
  const parseB23 = async (url: string): Promise<{ realUrl: string, sid: string }> => {
    const resp = await fetch('http://localhost:5177/api/parse-b23', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!resp.ok) throw new Error('短链解析失败');
    const { realUrl, sid } = await resp.json();
    return { realUrl, sid };
  };

  // 轮询中奖名单接口
  const startMonitor = async () => {
    setStatus('解析短链...');
    setWinners([]);
    const b23url = form.getFieldValue('b23url');
    if (!b23url) {
      message.error('请输入b23.tv短链');
      return;
    }
    try {
      const { realUrl, sid } = await parseB23(b23url);
      if (!sid) {
        message.error('未能提取到sid(lottery_id)参数');
        setStatus('参数提取失败');
        return;
      }
      setStatus('开始监控...');
      setMonitoring(true);
      setCheckCount(0);
      timerRef.current = setInterval(async () => {
        setCheckCount(prev => prev + 1);
        setCurrentTime(Math.floor(Date.now() / 1000));
        try {
          const resp = await fetch('http://localhost:5177/api/lottery-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid })
          });
          if (!resp.ok) throw new Error('接口请求失败');
          const data = await resp.json();
          if (data.code === 0 && Array.isArray(data.data)) {
            const now = Math.floor(Date.now() / 1000);
            console.log('接口返回数据:', data.data);
            console.log('数据长度:', data.data.length);
            
            // 显示所有中奖记录，不再过滤时间
            const allWinners = data.data.map((item: any) => ({
              name: item.name,
              ctime: item.ctime,
              award: item.award_info?.name || '',
              icon: item.award_info?.icon || ''
            }));
            
            setWinners(allWinners);
            console.log('设置中奖记录:', allWinners);
            
            if (allWinners.length > 0) {
              message.success(`获取到 ${allWinners.length} 条中奖记录！`);
            }
            setLastCheck(now);
          } else {
            console.log('接口返回异常:', data);
          }
        } catch (e) {
          console.error('监控请求失败:', e);
          setStatus('接口请求失败');
        }
      }, 1000);
    } catch (e: any) {
      message.error(e.message || '解析失败');
      setStatus('失败');
    }
  };

  const stopMonitor = () => {
    setMonitoring(false);
    setStatus('已停止');
    setCheckCount(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const columns = [
    { title: '昵称', dataIndex: 'name', key: 'name' },
    { title: '奖品', dataIndex: 'award', key: 'award', render: (text: string, record: Winner) => (
      <Space>
        {record.icon && <img src={record.icon} alt="icon" style={{ width: 32, height: 32 }} />}
        {text}
      </Space>
    ) },
    {
      title: '中奖时间',
      dataIndex: 'ctime',
      key: 'ctime',
      render: (ctime: number) => {
        const d = new Date(ctime * 1000);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    },
    { 
      title: '时间差', 
      dataIndex: 'ctime', 
      key: 'timeDiff', 
      render: (ctime: number) => {
        const diff = currentTime - ctime;
        if (diff < 0) {
          return <Tag color="red">时间错误</Tag>;
        }
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        let color = '#52c41a'; // 绿色
        let text = '';
        
        if (diff < 60) {
          text = `${diff}秒`;
          color = '#52c41a'; // 绿色 - 1分钟内
        } else if (diff < 3600) {
          text = `${minutes}分${seconds}秒`;
          color = '#faad14'; // 橙色 - 1小时内
        } else {
          const hours = Math.floor(diff / 3600);
          const remainingMinutes = Math.floor((diff % 3600) / 60);
          const remainingSeconds = diff % 60;
          text = `${hours}小时${remainingMinutes}分${remainingSeconds}秒`;
          color = '#ff4d4f'; // 红色 - 超过1小时
        }
        
        return (
          <Tag color={color}>
            {text}
          </Tag>
        );
      }
    }
  ];

  // 自动从URL参数填充b23url并自动开始监控
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const b23url = params.get('b23url');
    if (b23url) {
      form.setFieldsValue({ b23url });
      setTimeout(() => startMonitor(), 500);
    }
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <h2>中奖名单监控</h2>
      <Alert
        message="输入b23.tv短链，自动监控中奖名单接口，发现新中奖自动触发回调。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Card title="监控设置" style={{ marginBottom: 24 }}>
        <Form form={form} layout="inline">
          <Form.Item label="b23.tv短链" name="b23url" rules={[{ required: true, message: '请输入b23.tv短链' }]}> 
            <Input placeholder="https://b23.tv/xxxxxx" style={{ width: 300 }} />
          </Form.Item>
          <Form.Item>
            {!monitoring ? (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={startMonitor}>开始监控</Button>
            ) : (
              <Button danger icon={<PauseCircleOutlined />} onClick={stopMonitor}>停止监控</Button>
            )}
          </Form.Item>
          <Form.Item>
            <Tag color={monitoring ? 'green' : 'default'}>{status}</Tag>
            {monitoring && <Tag color="blue">检查次数: {checkCount}</Tag>}
            <Tag color="purple">记录数: {winners.length}</Tag>
          </Form.Item>
        </Form>
      </Card>
      <Card title={`最新中奖名单 (${winners.length} 条记录)`}>
        <Table columns={columns} dataSource={winners} rowKey={(_, index) => index?.toString() || '0'} pagination={{ pageSize: 10 }} />
        {lastCheck && <div style={{ marginTop: 8, color: '#888' }}>上次检查时间：{new Date(lastCheck * 1000).toLocaleString()}</div>}
        {monitoring && <div style={{ marginTop: 8, color: '#52c41a' }}>🔄 每秒扫描中... (已检查 {checkCount} 次)</div>}
      </Card>
    </div>
  );
};

export default LotteryMonitor; 