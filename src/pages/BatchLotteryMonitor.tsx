import React, { useState, useRef, useEffect } from 'react';
import { Card, Form, Input, Button, Space, Table, message, Alert, Tag, Modal, Popconfirm, Row, Col, Statistic } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, PlusOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';

interface Winner {
  name: string;
  ctime: number;
  award: string;
  icon: string;
}

interface MonitorTask {
  id: string;
  name: string;
  b23url: string;
  sid?: string;
  realUrl?: string;
  taskId?: string;
  counter?: string;
  monitoring: boolean;
  winners: Winner[];
  lastCheck: number | null;
  checkCount: number;
  status: string;
  error?: string;
  timerRef?: any;
  lotteryHistory: LotteryRecord[];
  lotteryTimes?: any; // 抽奖次数信息
}

interface LotteryRecord {
  timestamp: number;
  type: 'success' | 'insufficient' | 'error' | 'activity_ended' | 'lottery_api_error';
  message: string;
  data?: any;
}

const BatchLotteryMonitor: React.FC = () => {
  const [form] = Form.useForm();
  const [tasks, setTasks] = useState<MonitorTask[]>([]);
  const [globalMonitoring, setGlobalMonitoring] = useState(false);
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
  const [selectedTask, setSelectedTask] = useState<MonitorTask | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [lotteryResultJson, setLotteryResultJson] = useState<string>('');
  const [lotteryResultVisible, setLotteryResultVisible] = useState(false);

  const monitoringRef = useRef<boolean>(false);
  // 添加防重复调用机制
  const processingTasks = useRef<Set<string>>(new Set());

  // 读取cookie文件
  const readCookie = async (): Promise<{ cookie: string, csrf: string }> => {
    try {
      const response = await fetch('/cookie.txt');
      const cookieText = await response.text();
      // 提取实际的cookie值（去除注释）
      const lines = cookieText.split('\n');
      const cookieLine = lines.find(line => line.includes('=') && !line.startsWith('#'));
      if (cookieLine) {
        const cookie = cookieLine.trim();
        
        // 从cookie中提取csrf token (bili_jct)
        const csrfMatch = cookie.match(/bili_jct=([^;]+)/);
        const csrf = csrfMatch ? csrfMatch[1] : '';
        
        if (!csrf) {
          throw new Error('cookie中缺少bili_jct参数');
        }
        
        return { cookie, csrf };
      }
      throw new Error('未找到有效的cookie');
    } catch (error) {
      console.error('读取cookie失败:', error);
      throw new Error('无法读取cookie文件');
    }
  };

  // 解析b23.tv短链，获取真实URL、sid和taskId
  const parseB23 = async (url: string): Promise<{ realUrl: string, sid: string, taskId?: string, counter?: string }> => {
    const resp = await fetch('http://localhost:5177/api/parse-b23', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!resp.ok) throw new Error('短链解析失败');
    const { realUrl, sid, taskId, counter } = await resp.json();
    return { realUrl, sid, taskId, counter };
  };

  // 添加监控任务
  const addTask = async () => {
    const values = form.getFieldsValue();
    if (!values.b23url || !values.name) {
      message.error('请输入任务名称和B站链接');
      return;
    }

    const newTask: MonitorTask = {
      id: Date.now().toString(),
      name: values.name,
      b23url: values.b23url,
      monitoring: false,
      winners: [],
      lastCheck: null,
      checkCount: 0,
      status: '未开始',
      lotteryHistory: []
    };

          try {
        setTasks(prev => [...prev, { ...newTask, status: '解析中...' }]);
        const { realUrl, sid, taskId, counter } = await parseB23(values.b23url);
        
        // 更新任务状态为就绪
        setTasks(prev => prev.map(task => 
          task.id === newTask.id 
            ? { ...task, realUrl, sid, taskId, counter, status: '就绪' }
            : task
        ));
        
        // 如果成功解析到taskId和counter，自动发送积分
        if (taskId && counter) {
          console.log(`任务解析完成，自动发送积分: taskId=${taskId}, counter=${counter}`);
          
          const updatedTask = { ...newTask, realUrl, sid, taskId, counter };
          const result = await performSendPoints(updatedTask);
          
          // 更新任务的积分发送历史
          setTasks(prev => prev.map(t => 
            t.id === newTask.id 
              ? { 
                  ...t, 
                  realUrl, sid, taskId, counter, 
                  status: '就绪',
                  lotteryHistory: [...t.lotteryHistory, result]
                }
              : t
          ));
          
          // 显示积分发送结果
          if (result.type === 'success') {
            message.success(`任务"${newTask.name}"积分发送成功！`);
          } else {
            message.warning(`任务"${newTask.name}"积分发送失败: ${result.message}`);
          }
        }
        
        form.resetFields();
        message.success('任务添加成功');
      } catch (error: any) {
      setTasks(prev => prev.map(task => 
        task.id === newTask.id 
          ? { ...task, status: '解析失败', error: error.message }
          : task
      ));
      message.error(error.message || '解析失败');
    }
  };

  // 删除监控任务
  const removeTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
    message.success('任务已删除');
  };

  // 开始全局监控 - 同步顺序执行
  const startGlobalMonitor = () => {
    console.log('开始全局监控...');
    
    // 先清理所有现有的定时器
    setTasks(prev => {
      prev.forEach(task => {
        if (task.timerRef) {
          console.log(`清理任务"${task.name}"的旧定时器`);
          clearInterval(task.timerRef);
        }
      });
      return prev;
    });
    
    setGlobalMonitoring(true);
    monitoringRef.current = true;
    
    // 延迟启动定时器，确保状态更新完成
    setTimeout(() => {
      setTasks(prev => {
        const updatedTasks = prev.map(task => ({ ...task, monitoring: true, status: '监控中', checkCount: 0 }));
        
        // 获取可监控的任务
        const monitoringTasks = updatedTasks.filter(task => task.monitoring && task.sid);
        
        console.log(`找到 ${monitoringTasks.length} 个可监控的任务，开始同步顺序执行`);
        
        if (monitoringTasks.length === 0) {
          console.log('没有可监控的任务');
          return updatedTasks;
        }
        
        // 创建递归函数，按顺序执行所有任务，完成后立即开始下一轮
        const executeMonitoringCycle = async () => {
          // 检查监控状态
          if (!monitoringRef.current) {
            console.log('监控已停止，退出执行');
            return;
          }
          
          console.log('开始新一轮监控循环...');
          
          // 按顺序执行每个任务，间隔100毫秒
          for (let i = 0; i < monitoringTasks.length; i++) {
            const task = monitoringTasks[i];
            
            // 再次检查监控状态
            if (!monitoringRef.current) {
              console.log('监控过程中检测到停止信号，中断执行');
              return;
            }
            
            // 只执行正在监控的任务
            if (!task.monitoring) {
              console.log(`任务"${task.name}"已停止监控，跳过执行`);
              continue;
            }
            
            console.log(`执行任务"${task.name}" (${i + 1}/${monitoringTasks.length})`);
            setCurrentTime(Math.floor(Date.now() / 1000));
            
            try {
              // 1. 获取中奖名单
              const resp = await fetch('http://localhost:5177/api/lottery-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sid: task.sid })
              });
              
              if (!resp.ok) throw new Error('接口请求失败');
              const data = await resp.json();
              

            
              if (data.code === 0 && Array.isArray(data.data) && data.data.length > 0) {
                // 取最新的中奖者（数组第一个元素）
                const latestWinner = data.data[0];
                const winner = {
                  name: latestWinner.name,
                  ctime: latestWinner.ctime,
                  award: latestWinner.award_info?.name || '',
                  icon: latestWinner.award_info?.icon || ''
                };
                
                setTasks(prev => {
                  const updatedTasks = prev.map(t => 
                    t.id === task.id 
                      ? { 
                          ...t, 
                          winners: [winner], // 只保存最新的中奖者
                          lastCheck: Math.floor(Date.now() / 1000),
                          checkCount: t.checkCount + 1,
                                                  status: '监控中',
                        error: undefined
                        }
                      : t
                  );
                  
                  // 检查是否有新的中奖者（时间不同）
                  const currentTask = prev.find(t => t.id === task.id);
                  if (currentTask && currentTask.winners.length > 0) {
                    const currentWinner = currentTask.winners[0];
                    if (winner.ctime !== currentWinner.ctime) {
                      console.log(`任务"${task.name}"发现新的中奖者：${winner.name}，时间：${new Date(winner.ctime * 1000).toLocaleString()}`);
                      message.success(`任务"${task.name}"发现新的中奖者：${winner.name}！`);
                      // 检查是否需要自动抽奖
                      checkAndPerformLottery(task, winner);
                    } else {
                      console.log(`任务"${task.name}"中奖者时间相同，不触发抽奖`);
                    }
                  } else if (currentTask && currentTask.winners.length === 0) {
                    console.log(`任务"${task.name}"首次发现中奖者：${winner.name}，时间：${new Date(winner.ctime * 1000).toLocaleString()}`);
                    message.success(`任务"${task.name}"发现中奖者：${winner.name}！`);
                    // 检查是否需要自动抽奖
                    checkAndPerformLottery(task, winner);
                  }
                  
                  return updatedTasks;
                });
              } else if (data.code === 0 && Array.isArray(data.data) && data.data.length === 0) {
                // 如果没有中奖者，清空中奖列表
                setTasks(prev => prev.map(t => 
                  t.id === task.id 
                    ? { 
                        ...t, 
                        winners: [], 
                        lastCheck: Math.floor(Date.now() / 1000),
                        checkCount: t.checkCount + 1,
                        status: '监控中',
                        error: undefined
                      }
                    : t
                ));
              } else if (data.code === 170003) {
                // 活动已结束
                console.log(`任务"${task.name}"活动已结束`);
                setTasks(prev => prev.map(t => 
                  t.id === task.id 
                    ? { 
                        ...t, 
                        monitoring: false,
                        status: '活动已结束',
                        error: undefined
                      }
                    : t
                ));
              }
            } catch (error: any) {
              console.error(`任务"${task.name}"请求失败:`, error);
              setTasks(prev => prev.map(t => 
                t.id === task.id 
                  ? { ...t, status: '请求失败', error: error.message }
                  : t
              ));
            }
            
            // 如果不是最后一个任务，等待500毫秒再执行下一个
            if (i < monitoringTasks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          // 检查是否还有正在监控的任务
          const activeTasks = monitoringTasks.filter(task => task.monitoring);
          if (activeTasks.length === 0) {
            console.log('所有任务都已停止监控，结束监控循环');
            return;
          }
          
          console.log(`完成一轮监控循环，还有${activeTasks.length}个任务在监控中，等待2秒后开始下一轮`);
          
          // 完成所有任务后，等待2秒再开始下一轮（递归调用）
          setTimeout(executeMonitoringCycle, 2000);
        };
        
        // 启动第一轮监控循环
        executeMonitoringCycle();
        
        // 将执行函数引用存储到第一个任务中，以便后续清理
        setTasks(prev => prev.map(t => 
          t.id === monitoringTasks[0]?.id 
            ? { ...t, timerRef: executeMonitoringCycle }
            : t
        ));
        
        return updatedTasks;
      });
    }, 100); // 延迟100ms确保状态更新完成
  };

  // 执行抽奖（指定次数）
  const performLotteryWithTimes = async (task: MonitorTask, num: number): Promise<LotteryRecord> => {
    try {
      if (!task.sid) throw new Error('缺少sid，无法执行抽奖');
      
      const requestBody = { sid: task.sid, num };
      const requestUrl = 'http://localhost:5177/api/lottery-do';
      const requestHeaders = { 'Content-Type': 'application/json' };
      
      console.log('=== 执行抽奖请求详细信息 ===');
      console.log('请求URL:', requestUrl);
      console.log('请求Headers:', requestHeaders);
      console.log('请求Body:', requestBody);
      console.log('任务信息:', {
        id: task.id,
        name: task.name,
        sid: task.sid,
        b23url: task.b23url
      });
      console.log('========================');
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody)
      });
      
      console.log('=== 抽奖响应信息 ===');
      console.log('响应状态:', response.status, response.statusText);
      console.log('响应Headers:', Object.fromEntries(response.headers.entries()));
      
      const data = await response.json();
      console.log('响应Body:', data);
      console.log('==================');
      
      if (data.code === 0) {
        return {
          timestamp: Math.floor(Date.now() / 1000),
          type: 'success',
          message: `抽奖成功，使用了${num}次机会`,
          data: data.data
        };
      } else if (data.code === 170415) {
        return {
          timestamp: Math.floor(Date.now() / 1000),
          type: 'insufficient',
          message: '剩余抽奖次数不足',
          data: data
        };
      } else if (data.code === 170003) {
        return {
          timestamp: Math.floor(Date.now() / 1000),
          type: 'activity_ended',
          message: '活动已结束',
          data: data
        };
      } else if (data.code === -400 && data.message.includes('Type')) {
        return {
          timestamp: Math.floor(Date.now() / 1000),
          type: 'lottery_api_error',
          message: '抽奖接口异常，停止监控',
          data: data
        };
      } else {
        return {
          timestamp: Math.floor(Date.now() / 1000),
          type: 'error',
          message: `抽奖失败: ${data.message}`,
          data: data
        };
      }
    } catch (error: any) {
      console.error('=== 抽奖请求异常 ===');
      console.error('错误信息:', error);
      console.error('错误堆栈:', error.stack);
      console.error('==================');
      
      return {
        timestamp: Math.floor(Date.now() / 1000),
        type: 'error',
        message: `抽奖请求失败: ${error.message}`,
        data: error
      };
    }
  };

  // 执行抽奖（默认1次）
  const performLottery = async (task: MonitorTask): Promise<LotteryRecord> => {
    return performLotteryWithTimes(task, 1);
  };

  // 执行积分发送
  const performSendPoints = async (task: MonitorTask): Promise<LotteryRecord> => {
    try {
      if (!task.taskId || !task.counter) {
        throw new Error('缺少taskId或counter，无法执行积分发送');
      }
      
      console.log(`执行积分发送: taskId=${task.taskId}, counter=${task.counter}`);
      
      // 通过本地后端代理请求
      const response = await fetch('http://localhost:5177/api/send-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activity: task.taskId,
          business: task.counter
        })
      });
      
      const data = await response.json();
      
      if (data.code === 0) {
        // 积分发送成功
        return {
          timestamp: Math.floor(Date.now() / 1000),
          type: 'success',
          message: '积分发送成功',
          data: data.data
        };
      } else {
        // 其他错误
        return {
          timestamp: Math.floor(Date.now() / 1000),
          type: 'error',
          message: `积分发送失败: ${data.message}`,
          data: data
        };
      }
    } catch (error: any) {
      return {
        timestamp: Math.floor(Date.now() / 1000),
        type: 'error',
        message: `积分发送请求失败: ${error.message}`,
        data: error
      };
    }
  };

  // 手动发送积分
  const handleSendPoints = async (task: MonitorTask) => {
    console.log(`手动发送积分: taskId=${task.taskId}, counter=${task.counter}`);
    
    const result = await performSendPoints(task);
    
    // 更新任务的积分发送历史
    setTasks(prev => prev.map(t => 
      t.id === task.id 
        ? { 
            ...t, 
            lotteryHistory: [...t.lotteryHistory, result]
          }
        : t
    ));
    
    // 显示结果
    if (result.type === 'success') {
      message.success(`任务"${task.name}"积分发送成功！`);
    } else {
      message.error(`任务"${task.name}"积分发送失败: ${result.message}`);
    }
  };

  // 检查是否需要自动抽奖
  const checkAndPerformLottery = async (task: MonitorTask, latestWinner: Winner) => {
    // 防重复调用机制
    if (processingTasks.current.has(task.id)) {
      console.log(`任务"${task.name}"正在处理中，跳过重复调用`);
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const timeDiff = now - latestWinner.ctime;
    
    console.log(`任务"${task.name}"检查抽奖条件:`);
    console.log(`- 当前时间: ${now} (${new Date(now * 1000).toLocaleString()})`);
    console.log(`- 中奖时间: ${latestWinner.ctime} (${new Date(latestWinner.ctime * 1000).toLocaleString()})`);
    console.log(`- 时间差: ${timeDiff}秒`);
    console.log(`- 是否在5分钟内: ${timeDiff <= 300}`);

    if (timeDiff <= 300) {
      console.log(`任务"${task.name}"检测到5分钟内中奖记录，获取抽奖次数`);
      
      // 标记任务正在处理
      processingTasks.current.add(task.id);
      
      try {
        // 1. 先查抽奖次数
        const timesResp = await fetch('http://localhost:5177/api/lottery-mytimes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sid: task.sid })
        });
        if (!timesResp.ok) {
          message.error('获取抽奖次数失败');
          return;
        }
        const timesData = await timesResp.json();
        console.log(`任务"${task.name}"抽奖次数响应:`, timesData);
        
        if (timesData.code !== 0 || !timesData.data) {
          message.error('获取抽奖次数失败: ' + (timesData.message || '未知错误'));
          return;
        }
        
        // 使用times字段作为剩余抽奖次数
        const remainTimes = timesData.data.times || 0;
        console.log(`任务"${task.name}"剩余抽奖次数: ${remainTimes}`);
        
        // 2. 没有次数就停止监控但保留在列表中
        if (remainTimes <= 0) {
          message.warning(`任务"${task.name}"抽奖次数为0，停止监控`);
          setTasks(prev => prev.map(t => 
            t.id === task.id 
              ? { 
                  ...t, 
                  monitoring: false, 
                  status: '抽奖次数不足',
                  lotteryTimes: timesData.data
                }
              : t
          ));
          return;
        }

        // 3. 有次数就一次性全部抽
        console.log(`任务"${task.name}"执行抽奖，次数: ${remainTimes}`);
        const lotteryResult = await performLotteryWithTimes(task, remainTimes);
        
        // 显示抽奖结果JSON
        const resultJson = JSON.stringify(lotteryResult.data, null, 2);
        setLotteryResultJson(resultJson);
        setLotteryResultVisible(true);
        
        // 不管抽奖结果如何，都停止监控
        setTasks(prev => prev.map(t => 
          t.id === task.id 
            ? { 
                ...t, 
                monitoring: false, 
                status: '已执行抽奖',
                lotteryHistory: [...t.lotteryHistory, lotteryResult],
                lotteryTimes: timesData.data
              }
            : t
        ));
        
        // 显示抽奖结果消息
        if (lotteryResult.type === 'success') {
          message.success(`任务"${task.name}"抽奖完成！使用了${remainTimes}次抽奖机会`);
        } else {
          message.warning(`任务"${task.name}"抽奖完成：${lotteryResult.message}`);
        }
      } catch (error: any) {
        console.error(`任务"${task.name}"自动抽奖流程失败:`, error);
        message.error(`任务"${task.name}"自动抽奖流程失败: ${error.message}`);
      } finally {
        // 处理完成后移除标记
        processingTasks.current.delete(task.id);
      }
    } else {
      console.log(`任务"${task.name}"中奖记录时间差为${timeDiff}秒，超过5分钟，不触发抽奖`);
    }
  };

  // 停止全局监控
  const stopGlobalMonitor = () => {
    console.log('停止全局监控...');
    setGlobalMonitoring(false);
    monitoringRef.current = false;
    
    // 更新任务状态，停止监控
    setTasks(prev => {
      return prev.map(task => ({ 
        ...task, 
        monitoring: false, 
        status: '已停止', 
        timerRef: undefined 
      }));
    });
    
    message.success('已停止所有监控任务');
  };

  // 查看任务详情
  const showTaskDetail = (task: MonitorTask) => {
    setSelectedTask(task);
    setDetailModalVisible(true);
  };

  // 批量添加任务
  const addBatchTasks = async (links: Array<{ name: string, b23url: string }>) => {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const newTask: MonitorTask = {
        id: Date.now().toString() + i.toString() + Math.random().toString(36).substr(2, 9),
        name: link.name,
        b23url: link.b23url,
        monitoring: false,
        winners: [],
        lastCheck: null,
        checkCount: 0,
        status: '解析中...',
        lotteryHistory: []
      };

      setTasks(prev => [...prev, newTask]);

              try {
          const { realUrl, sid, taskId, counter } = await parseB23(link.b23url);
          
          // 更新任务状态为就绪
          setTasks(prev => prev.map(task => 
            task.id === newTask.id 
              ? { ...task, realUrl, sid, taskId, counter, status: '就绪' }
              : task
          ));
          
          // 如果成功解析到taskId和counter，自动发送积分
          if (taskId && counter) {
            console.log(`批量任务解析完成，自动发送积分: taskId=${taskId}, counter=${counter}`);
            
            const updatedTask = { ...newTask, realUrl, sid, taskId, counter };
            const result = await performSendPoints(updatedTask);
            
            // 更新任务的积分发送历史
            setTasks(prev => prev.map(t => 
              t.id === newTask.id 
                ? { 
                    ...t, 
                    realUrl, sid, taskId, counter, 
                    status: '就绪',
                    lotteryHistory: [...t.lotteryHistory, result]
                  }
                : t
            ));
            
            // 显示积分发送结果
            if (result.type === 'success') {
              message.success(`任务"${newTask.name}"积分发送成功！`);
            } else {
              message.warning(`任务"${newTask.name}"积分发送失败: ${result.message}`);
            }
          }
        } catch (error: any) {
        setTasks(prev => prev.map(task => 
          task.id === newTask.id 
            ? { ...task, status: '解析失败', error: error.message }
            : task
        ));
      }
    }
  };

  // 检查localStorage中的批量链接
  useEffect(() => {
    const batchLinks = localStorage.getItem('batchMonitorLinks');
    if (batchLinks) {
      try {
        const links = JSON.parse(batchLinks);
        if (Array.isArray(links) && links.length > 0) {
          addBatchTasks(links);
          // 清除localStorage中的链接
          localStorage.removeItem('batchMonitorLinks');
          message.success(`成功添加 ${links.length} 个批量监控任务`);
        }
      } catch (error) {
        console.error('解析批量链接失败:', error);
      }
    }
  }, []);

  // 页面卸载时清理所有定时器
  useEffect(() => {
    return () => {
      console.log('页面卸载，清理所有定时器');
      setTasks(prev => {
        prev.forEach(task => {
          if (task.timerRef) {
            clearInterval(task.timerRef);
          }
        });
        return prev;
      });
    };
  }, []);

  // 任务列表列定义
  const taskColumns = [
    { 
      title: '任务名称', 
      dataIndex: 'name', 
      key: 'name',
      render: (text: string, record: MonitorTask) => (
        <Space>
          <span>{text}</span>
          {record.error && <Tag color="red">错误</Tag>}
        </Space>
      )
    },
    { 
      title: 'B站链接', 
      dataIndex: 'b23url', 
      key: 'b23url',
      render: (text: string) => (
        <div style={{ fontSize: '12px', color: '#666', wordBreak: 'break-all', maxWidth: '200px' }}>
          <a href={text} target="_blank" rel="noopener noreferrer" style={{ color: '#1890ff' }}>
            {text}
          </a>
          <Button 
            type="text" 
            size="small" 
            onClick={() => {
              navigator.clipboard.writeText(text);
              message.success('链接已复制到剪贴板');
            }}
            style={{ marginLeft: 4, fontSize: '10px' }}
          >
            复制
          </Button>
        </div>
      )
    },
    {
      title: '参数信息',
      key: 'params',
      render: (_: any, record: MonitorTask) => (
        <div style={{ fontSize: '11px' }}>
          <div>lottery_id: {record.sid || '-'}</div>
          <div>taskId: {record.taskId || '-'}</div>
          <div>counter: {record.counter || '-'}</div>
        </div>
      )
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string, record: MonitorTask) => (
        <Tag color={record.monitoring ? 'green' : 'default'}>{status}</Tag>
      )
    },
    { 
      title: '最新中奖者', 
      dataIndex: 'winners', 
      key: 'winnerCount',
      render: (winners: Winner[]) => (
        winners.length > 0 ? (
          <Tag color="blue">{winners[0].name}</Tag>
        ) : (
          <Tag color="default">暂无中奖者</Tag>
        )
      )
    },
    { 
      title: '检查次数', 
      dataIndex: 'checkCount', 
      key: 'checkCount',
      render: (checkCount: number, record: MonitorTask) => (
        record.monitoring ? <Tag color="purple">{checkCount}</Tag> : '-'
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: MonitorTask) => (
        <Space>
          <Button 
            type="text" 
            icon={<EyeOutlined />} 
            onClick={() => showTaskDetail(record)}
            size="small"
          >
            详情
          </Button>
          <Popconfirm
            title="确定要删除这个任务吗？"
            onConfirm={() => removeTask(record.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // 中奖者列表列定义
  const winnerColumns = [
    { title: '昵称', dataIndex: 'name', key: 'name' },
    { 
      title: '奖品', 
      dataIndex: 'award', 
      key: 'award', 
      render: (text: string, record: Winner) => (
        <Space>
          {record.icon && <img src={record.icon} alt="icon" style={{ width: 32, height: 32 }} />}
          {text}
        </Space>
      ) 
    },
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
        let color = '#52c41a';
        let text = '';
        
        if (diff < 60) {
          text = `${diff}秒`;
          color = '#52c41a';
        } else if (diff < 3600) {
          text = `${minutes}分${seconds}秒`;
          color = '#faad14';
        } else {
          const hours = Math.floor(diff / 3600);
          const remainingMinutes = Math.floor((diff % 3600) / 60);
          const remainingSeconds = diff % 60;
          text = `${hours}小时${remainingMinutes}分${remainingSeconds}秒`;
          color = '#ff4d4f';
        }
        
        return <Tag color={color}>{text}</Tag>;
      }
    }
  ];

  // 统计信息
  const monitoringTasks = tasks.filter(task => task.monitoring).length;
  const totalTasks = tasks.length;

  return (
    <div>
      <h2>批量中奖监控</h2>
      <Alert
        message="支持同时监控多个抽奖活动，可以批量管理所有监控任务。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* 统计信息 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总任务数" value={totalTasks} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="监控中" value={monitoringTasks} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="有中奖者的任务" value={tasks.filter(t => t.winners.length > 0).length} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="全局状态" value={globalMonitoring ? '运行中' : '已停止'} valueStyle={{ color: globalMonitoring ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      {/* 添加任务 */}
      <Card title="添加监控任务" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item label="任务名称" name="name" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="给这个监控任务起个名字" style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label="B站链接" name="b23url" rules={[{ required: true, message: '请输入B站链接' }]}>
            <Input placeholder="https://b23.tv/xxxxxx 或 https://www.bilibili.com/blackboard/..." style={{ width: 300 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<PlusOutlined />} onClick={addTask}>
              添加任务
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 全局控制 */}
      <Card title="全局控制" style={{ marginBottom: 16 }}>
        <Space>
          {!globalMonitoring ? (
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />} 
              onClick={startGlobalMonitor}
              disabled={tasks.filter(t => t.status === '就绪' || t.status === '已停止').length === 0}
            >
              开始全部监控
            </Button>
          ) : (
            <Button 
              danger 
              icon={<PauseCircleOutlined />} 
              onClick={stopGlobalMonitor}
            >
              停止全部监控
            </Button>
          )}
          <Tag color={globalMonitoring ? 'green' : 'default'}>
            {globalMonitoring ? '全局监控运行中' : '全局监控已停止'}
          </Tag>
          {globalMonitoring && (
            <Tag color="blue">🔄 连续顺序执行，任务间隔500ms，轮次间隔2秒</Tag>
          )}
          <Tag color="orange">可监控任务: {tasks.filter(t => t.status === '就绪' || t.status === '已停止').length}</Tag>
          <Button
            type="dashed"
            size="small"
            onClick={() => {
              const monitoringTasks = tasks.filter(t => t.monitoring && t.timerRef);
              console.log('当前监控任务状态:', monitoringTasks.map(t => ({
                name: t.name,
                timerRef: t.timerRef,
                monitoring: t.monitoring,
                sid: t.sid,
                status: t.status
              })));
              message.info(`当前有 ${monitoringTasks.length} 个任务正在监控，全局状态: ${globalMonitoring}`);
            }}
          >
            调试状态
          </Button>
          <Button
            type="dashed"
            size="small"
            onClick={() => {
              const readyTasks = tasks.filter(t => t.status === '就绪' || t.status === '已停止');
              console.log('可监控任务:', readyTasks.map(t => ({
                name: t.name,
                sid: t.sid,
                status: t.status
              })));
              message.info(`有 ${readyTasks.length} 个任务可以开始监控`);
            }}
          >
            检查任务
          </Button>
        </Space>
      </Card>

      {/* 任务列表 */}
      <Card title={`监控任务列表 (${tasks.length} 个任务)`}>
        <Table 
          columns={taskColumns} 
          dataSource={tasks} 
          rowKey="id" 
          pagination={false}
          size="small"
        />
      </Card>

      {/* 任务详情模态框 */}
      <Modal
        title={`任务详情: ${selectedTask?.name}`}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedTask && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <p><strong>任务名称:</strong> {selectedTask.name}</p>
                  <p><strong>B站链接:</strong> 
                    <a href={selectedTask.b23url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
                      {selectedTask.b23url}
                    </a>
                    <Button 
                      type="text" 
                      size="small" 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedTask.b23url);
                        message.success('链接已复制到剪贴板');
                      }}
                      style={{ marginLeft: 8 }}
                    >
                      复制
                    </Button>
                  </p>
                  <p><strong>真实URL:</strong> 
                    {selectedTask.realUrl ? (
                      <>
                        <a href={selectedTask.realUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
                          {selectedTask.realUrl}
                        </a>
                        <Button 
                          type="text" 
                          size="small" 
                          onClick={() => {
                            navigator.clipboard.writeText(selectedTask.realUrl!);
                            message.success('真实URL已复制到剪贴板');
                          }}
                          style={{ marginLeft: 8 }}
                        >
                          复制
                        </Button>
                      </>
                    ) : (
                      '未解析'
                    )}
                  </p>
                </Col>
                <Col span={12}>
                  <p><strong>状态:</strong> <Tag color={selectedTask.monitoring ? 'green' : 'default'}>{selectedTask.status}</Tag></p>
                  <p><strong>检查次数:</strong> {selectedTask.checkCount}</p>
                  <p><strong>最后检查:</strong> {selectedTask.lastCheck ? new Date(selectedTask.lastCheck * 1000).toLocaleString() : '未检查'}</p>
                  {selectedTask.lotteryTimes && (
                    <p><strong>抽奖次数:</strong> 
                      <Tag color="blue">
                        剩余: {selectedTask.lotteryTimes.times || 0} | 
                        类型: {selectedTask.lotteryTimes.lottery_type || '-'} | 
                        积分: {selectedTask.lotteryTimes.points || 0}
                      </Tag>
                    </p>
                  )}
                </Col>
              </Row>
              {selectedTask.error && (
                <Alert message={selectedTask.error} type="error" style={{ marginTop: 8 }} />
              )}
            </Card>
            
            <Card title={`最新中奖者信息`} size="small">
              <Table 
                columns={winnerColumns} 
                dataSource={selectedTask.winners} 
                rowKey={(_, index) => index?.toString() || '0'} 
                pagination={{ pageSize: 10 }}
                size="small"
              />
            </Card>
            
            <Card title={`抽奖历史记录`} size="small" style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <Space>
                  <Button 
                    type="primary" 
                    size="small"
                    onClick={() => handleSendPoints(selectedTask)}
                    disabled={!selectedTask.taskId || !selectedTask.counter}
                  >
                    发送积分
                  </Button>
                  <Tag color="blue">taskId: {selectedTask.taskId || '未获取'}</Tag>
                  <Tag color="green">counter: {selectedTask.counter || '未获取'}</Tag>
                </Space>
              </div>
              <Table 
                columns={[
                  { 
                    title: '时间', 
                    dataIndex: 'timestamp', 
                    key: 'timestamp',
                    render: (timestamp: number) => new Date(timestamp * 1000).toLocaleString()
                  },
                  { 
                    title: '类型', 
                    dataIndex: 'type', 
                    key: 'type',
                    render: (type: string) => {
                      const color = type === 'success' ? 'green' : type === 'insufficient' ? 'orange' : 'red';
                      const text = type === 'success' ? '成功' : type === 'insufficient' ? '次数不足' : '失败';
                      return <Tag color={color}>{text}</Tag>;
                    }
                  },
                  { 
                    title: '消息', 
                    dataIndex: 'message', 
                    key: 'message' 
                  }
                ]} 
                dataSource={selectedTask.lotteryHistory} 
                rowKey={(_, index) => index?.toString() || '0'} 
                pagination={{ pageSize: 5 }}
                size="small"
              />
            </Card>
          </div>
        )}
      </Modal>

      {/* 抽奖结果JSON模态框 */}
      <Modal
        title="抽奖结果JSON"
        open={lotteryResultVisible}
        onCancel={() => setLotteryResultVisible(false)}
        footer={[
          <Button key="copy" onClick={() => {
            navigator.clipboard.writeText(lotteryResultJson);
            message.success('JSON已复制到剪贴板');
          }}>
            复制JSON
          </Button>,
          <Button key="close" onClick={() => setLotteryResultVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
          <pre style={{ 
            backgroundColor: '#f5f5f5', 
            padding: '12px', 
            borderRadius: '4px',
            fontSize: '12px',
            lineHeight: '1.4'
          }}>
            {lotteryResultJson}
          </pre>
        </div>
      </Modal>
    </div>
  );
};

export default BatchLotteryMonitor; 