import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Input, Select, Space, message, Tag, Divider } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

interface ActivityItem {
  id: number;
  name: string;
  state: number;
  stime: number;
  etime: number;
  pc_url: string;
  pc_cover: string;
  desc: string;
  plat: number;
  mold: number;
  type: number;
}

interface ApiResponse {
  code: number;
  message: string;
  ttl: number;
  data: {
    list: ActivityItem[];
    num: number;
    size: number;
    total: number;
  };
}

interface TestResult {
  id: string;
  params: Record<string, any>;
  response: ApiResponse;
  timestamp: string;
  differences: string[];
}

const ActivityAnalyzer: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>('');

  // 基础参数配置
  const baseParams = {
    plat: '1,3',
    mold: '0',
    http: '2',
    pn: '1',
    ps: '20'
  };

  // 测试参数组合
  const testConfigs = [
    { name: '基础配置', params: { ...baseParams } },
    { name: 'plat=1', params: { ...baseParams, plat: '1' } },
    { name: 'plat=3', params: { ...baseParams, plat: '3' } },
    { name: 'plat=1,2,3', params: { ...baseParams, plat: '1,2,3' } },
    { name: 'mold=1', params: { ...baseParams, mold: '1' } },
    { name: 'mold=2', params: { ...baseParams, mold: '2' } },
    { name: 'http=1', params: { ...baseParams, http: '1' } },
    { name: 'http=3', params: { ...baseParams, http: '3' } },
    { name: 'ps=10', params: { ...baseParams, ps: '10' } },
    { name: 'ps=50', params: { ...baseParams, ps: '50' } },
    { name: 'pn=2', params: { ...baseParams, pn: '2' } },
    { name: 'pn=3', params: { ...baseParams, pn: '3' } },
    { name: '组合测试1', params: { ...baseParams, plat: '1', mold: '1', http: '1' } },
    { name: '组合测试2', params: { ...baseParams, plat: '3', mold: '2', http: '3' } },
  ];

  const fetchActivityData = async (params: Record<string, any>): Promise<ApiResponse> => {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    // 使用代理URL避免跨域问题
    const url = `/api/bilibili/x/activity/page/list?${queryString}`;
    
    try {
      const response = await axios.get(url, {
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error('请求失败:', error);
      throw error;
    }
  };

  const compareResults = (result1: TestResult, result2: TestResult): string[] => {
    const differences: string[] = [];
    
    // 比较总数
    if (result1.response.data.total !== result2.response.data.total) {
      differences.push(`总数不同: ${result1.response.data.total} vs ${result2.response.data.total}`);
    }
    
    // 比较返回数量
    if (result1.response.data.size !== result2.response.data.size) {
      differences.push(`返回数量不同: ${result1.response.data.size} vs ${result2.response.data.size}`);
    }
    
    // 比较活动列表
    const list1 = result1.response.data.list;
    const list2 = result2.response.data.list;
    
    if (list1.length !== list2.length) {
      differences.push(`列表长度不同: ${list1.length} vs ${list2.length}`);
    }
    
    // 比较前几个活动的差异
    const minLength = Math.min(list1.length, list2.length);
    for (let i = 0; i < minLength; i++) {
      const item1 = list1[i];
      const item2 = list2[i];
      
      if (item1.id !== item2.id) {
        differences.push(`第${i + 1}个活动ID不同: ${item1.id} vs ${item2.id}`);
      }
      
      if (item1.name !== item2.name) {
        differences.push(`第${i + 1}个活动名称不同: ${item1.name} vs ${item2.name}`);
      }
    }
    
    return differences;
  };

  const runAllTests = async () => {
    setLoading(true);
    const results: TestResult[] = [];
    
    for (const config of testConfigs) {
      try {
        setCurrentTest(config.name);
        const response = await fetchActivityData(config.params);
        
        const result: TestResult = {
          id: config.name,
          params: config.params,
          response,
          timestamp: new Date().toLocaleString(),
          differences: []
        };
        
        results.push(result);
        message.success(`${config.name} 测试完成`);
        
        // 添加延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        message.error(`${config.name} 测试失败: ${error}`);
      }
    }
    
    // 计算差异
    if (results.length > 1) {
      const baseResult = results[0];
      for (let i = 1; i < results.length; i++) {
        const differences = compareResults(baseResult, results[i]);
        results[i].differences = differences;
      }
    }
    
    setTestResults(results);
    setLoading(false);
    setCurrentTest('');
    message.success('所有测试完成！');
  };

  const columns = [
    {
      title: '测试名称',
      dataIndex: 'id',
      key: 'id',
      width: 150,
    },
    {
      title: '参数',
      dataIndex: 'params',
      key: 'params',
      render: (params: Record<string, any>) => (
        <div>
          {Object.entries(params).map(([key, value]) => (
            <Tag key={key} color="blue">{key}={value}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: '总数',
      dataIndex: ['response', 'data', 'total'],
      key: 'total',
      width: 80,
    },
    {
      title: '返回数量',
      dataIndex: ['response', 'data', 'size'],
      key: 'size',
      width: 100,
    },
    {
      title: '列表长度',
      dataIndex: ['response', 'data', 'list'],
      key: 'listLength',
      width: 100,
      render: (list: ActivityItem[]) => list?.length || 0,
    },
    {
      title: '差异',
      dataIndex: 'differences',
      key: 'differences',
      render: (differences: string[]) => (
        <div>
          {differences.length > 0 ? (
            differences.map((diff, index) => (
              <Tag key={index} color="red" style={{ marginBottom: 4 }}>
                {diff}
              </Tag>
            ))
          ) : (
            <Tag color="green">无差异</Tag>
          )}
        </div>
      ),
    },
    {
      title: '测试时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 150,
    },
  ];

  const activityColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '活动名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      width: 80,
      render: (state: number) => (
        <Tag color={state === 1 ? 'green' : 'red'}>
          {state === 1 ? '进行中' : '已结束'}
        </Tag>
      ),
    },
    {
      title: '平台',
      dataIndex: 'plat',
      key: 'plat',
      width: 80,
    },
    {
      title: '类型',
      dataIndex: 'mold',
      key: 'mold',
      width: 80,
    },
    {
      title: '描述',
      dataIndex: 'desc',
      key: 'desc',
      ellipsis: true,
    },
  ];

  return (
    <div className="p-6">
      <Card title="B站活动接口参数分析器" className="mb-6">
        <div className="mb-4">
          <p className="text-gray-600 mb-4">
            分析B站活动接口 <code>https://api.bilibili.com/x/activity/page/list</code> 的不同参数组合效果
          </p>
          
          <Space>
            <Button 
              type="primary" 
              icon={<SearchOutlined />}
              onClick={runAllTests}
              loading={loading}
            >
              运行所有测试
            </Button>
            
            {loading && currentTest && (
              <span className="text-blue-600">
                正在测试: {currentTest}
              </span>
            )}
          </Space>
        </div>

        <Divider />

        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">测试配置说明</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>plat (平台):</strong>
              <ul className="list-disc list-inside ml-4">
                <li>1: PC端</li>
                <li>2: 移动端</li>
                <li>3: 小程序</li>
              </ul>
            </div>
            <div>
              <strong>mold (类型):</strong>
              <ul className="list-disc list-inside ml-4">
                <li>0: 全部</li>
                <li>1: 活动</li>
                <li>2: 任务</li>
              </ul>
            </div>
            <div>
              <strong>http (协议):</strong>
              <ul className="list-disc list-inside ml-4">
                <li>1: HTTP</li>
                <li>2: HTTPS</li>
                <li>3: 自动</li>
              </ul>
            </div>
            <div>
              <strong>分页参数:</strong>
              <ul className="list-disc list-inside ml-4">
                <li>pn: 页码</li>
                <li>ps: 每页数量</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      {testResults.length > 0 && (
        <Card title="测试结果对比" className="mb-6">
          <Table 
            dataSource={testResults} 
            columns={columns} 
            rowKey="id"
            pagination={false}
            scroll={{ x: 1200 }}
          />
        </Card>
      )}

      {testResults.length > 0 && (
        <Card title="详细活动数据" className="mb-6">
          <Select
            placeholder="选择要查看的测试结果"
            style={{ width: 200, marginBottom: 16 }}
            onChange={(value) => {
              const result = testResults.find(r => r.id === value);
              if (result) {
                // 这里可以显示详细的活动列表
                console.log('选中结果:', result);
              }
            }}
          >
            {testResults.map(result => (
              <Option key={result.id} value={result.id}>
                {result.id} ({result.response.data.list.length}个活动)
              </Option>
            ))}
          </Select>
          
          {testResults[0] && (
            <Table 
              dataSource={testResults[0].response.data.list} 
              columns={activityColumns} 
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          )}
        </Card>
      )}
    </div>
  );
};

export default ActivityAnalyzer; 