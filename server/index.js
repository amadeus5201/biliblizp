const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 5177;

// 抽奖相关变量
let lotteryRequestInProgress = false;
let lastLotteryRequestTime = 0;

// OCR服务配置
const OCR_SERVICE_URL = 'http://192.168.31.40:9898/ocr/url/text';

// 读取cookie和csrf的函数
async function readCookie() {
  try {
    const cookiePath = path.resolve(__dirname, '../cookie.txt');
    console.log('读取cookie文件路径:', cookiePath);
    const cookieText = fs.readFileSync(cookiePath, 'utf-8');
    const lines = cookieText.split('\n');
    const cookieLine = lines.find(line => line.includes('=') && !line.startsWith('#'));
    if (cookieLine) {
      const cookie = cookieLine.trim();
      const csrfMatch = cookie.match(/bili_jct=([^;]+)/);
      const csrf = csrfMatch ? csrfMatch[1] : '';
      console.log('成功读取cookie, csrf长度:', csrf.length);
      return { cookie, csrf };
    }
    throw new Error('cookie.txt缺少有效cookie');
  } catch (err) {
    console.log('读取cookie.txt失败:', err.message);
    throw new Error('读取cookie.txt失败: ' + err.message);
  }
}

// OCR验证码识别函数
async function ocr(url) {
  return new Promise((resolve) => {
    const https = require('https');
    const querystring = require('querystring');
    
    const postData = querystring.stringify({ url });
    
    const options = {
      hostname: '192.168.31.40',
      port: 9898,
      path: '/ocr/url/text',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.body || result);
        } catch (e) {
          console.log('OCR响应解析失败:', e.message);
          resolve(null);
        }
      });
    });
    
    req.on('error', (err) => {
      console.log('OCR请求失败:', err.message);
      resolve(null);
    });
    
    req.write(postData);
    req.end();
  });
}

// 检测页面是否包含验证码
function detectCaptcha(html) {
  const captchaPatterns = [
    /依次点击/i,
    /点击验证/i,
    /点击图片/i,
    /点击.*图片/i,
    /geetest/i,
    /验证图片/i,
    /点击.*验证/i,
    /请点击/i,
    /点击.*按钮/i
  ];
  
  for (const pattern of captchaPatterns) {
    if (pattern.test(html)) {
      return true;
    }
  }
  return false;
}

// 提取验证码图片URL（点击验证码）
function extractCaptchaImageUrl(html) {
  const imagePatterns = [
    /<img[^>]*src=["']([^"']*geetest[^"']*)["'][^>]*>/i,
    /<img[^>]*src=["']([^"']*verify[^"']*)["'][^>]*>/i,
    /<img[^>]*src=["']([^"']*captcha[^"']*)["'][^>]*>/i,
    /<img[^>]*class=["'][^"']*geetest[^"']*["'][^>]*src=["']([^"']*)["'][^>]*>/i,
    /<img[^>]*id=["'][^"']*geetest[^"']*["'][^>]*src=["']([^"']*)["'][^>]*>/i,
    /<img[^>]*class=["'][^"']*verify[^"']*["'][^>]*src=["']([^"']*)["'][^>]*>/i,
    /<img[^>]*id=["'][^"']*verify[^"']*["'][^>]*src=["']([^"']*)["'][^>]*>/i,
    /<img[^>]*class=["'][^"']*captcha[^"']*["'][^>]*src=["']([^"']*)["'][^>]*>/i,
    /<img[^>]*id=["'][^"']*captcha[^"']*["'][^>]*src=["']([^"']*)["'][^>]*>/i
  ];
  
  for (const pattern of imagePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      let imageUrl = match[1];
      // 如果是相对路径，转换为绝对路径
      if (imageUrl.startsWith('/')) {
        imageUrl = 'https://www.bilibili.com' + imageUrl;
      } else if (imageUrl.startsWith('./') || imageUrl.startsWith('../')) {
        imageUrl = 'https://www.bilibili.com/' + imageUrl;
      }
      return imageUrl;
    }
  }
  return null;
}

// 提取验证码提示文字
function extractCaptchaPrompt(html) {
  const promptPatterns = [
    /依次点击([^，。！？\n]+)/i,
    /点击([^，。！？\n]+)图片/i,
    /请点击([^，。！？\n]+)/i,
    /点击([^，。！？\n]+)验证/i,
    /点击([^，。！？\n]+)按钮/i,
    /点击([^，。！？\n]+)元素/i
  ];
  
  for (const pattern of promptPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '请依次点击图片中的指定元素';
}

// 处理点击验证码的函数
async function handleClickCaptcha(html, baseUrl) {
  console.log('检测到点击验证码，开始处理...');
  
  // 提取验证码图片URL
  let captchaImageUrl = extractCaptchaImageUrl(html);
  
  if (!captchaImageUrl) {
    console.log('未能提取到验证码图片URL');
    return { success: false, error: '未能提取到验证码图片URL' };
  }
  
  // 如果是相对路径，转换为绝对路径
  if (captchaImageUrl.startsWith('/')) {
    captchaImageUrl = 'https://www.bilibili.com' + captchaImageUrl;
  } else if (!captchaImageUrl.startsWith('http')) {
    captchaImageUrl = 'https://www.bilibili.com/' + captchaImageUrl;
  }
  
  // 提取验证码提示文字
  const captchaPrompt = extractCaptchaPrompt(html);
  
  console.log('验证码图片URL:', captchaImageUrl);
  console.log('验证码提示:', captchaPrompt);
  
  return { 
    success: true, 
    captchaType: 'click',
    captchaImageUrl: captchaImageUrl,
    captchaPrompt: captchaPrompt,
    message: `检测到点击验证码：${captchaPrompt}`
  };
}

// 处理验证码的函数（修改为处理点击验证码）
async function handleCaptcha(html, baseUrl) {
  console.log('检测到验证码，开始处理...');
  
  // 判断是点击验证码还是文字验证码
  const isClickCaptcha = /依次点击|点击验证|点击图片|geetest/i.test(html);
  
  if (isClickCaptcha) {
    return await handleClickCaptcha(html, baseUrl);
  } else {
    // 原有的文字验证码处理逻辑（保留作为备用）
    console.log('检测到文字验证码，尝试OCR识别...');
    
    // 提取验证码图片URL
    let captchaImageUrl = extractCaptchaImageUrl(html);
    
    if (!captchaImageUrl) {
      console.log('未能提取到验证码图片URL');
      return { success: false, error: '未能提取到验证码图片URL' };
    }
    
    // 如果是相对路径，转换为绝对路径
    if (captchaImageUrl.startsWith('/')) {
      captchaImageUrl = 'https://www.bilibili.com' + captchaImageUrl;
    } else if (!captchaImageUrl.startsWith('http')) {
      captchaImageUrl = 'https://www.bilibili.com/' + captchaImageUrl;
    }
    
    console.log('验证码图片URL:', captchaImageUrl);
    
    // 调用OCR服务识别验证码
    try {
      const captchaText = await ocr(captchaImageUrl);
      console.log('OCR识别结果:', captchaText);
      
      if (captchaText) {
        return { 
          success: true, 
          captchaType: 'text',
          captchaText: captchaText.trim(),
          captchaImageUrl: captchaImageUrl
        };
      } else {
        return { 
          success: false, 
          captchaType: 'text',
          error: 'OCR识别失败',
          captchaImageUrl: captchaImageUrl
        };
      }
    } catch (error) {
      console.log('OCR处理失败:', error.message);
      return { 
        success: false, 
        captchaType: 'text',
        error: 'OCR处理失败: ' + error.message,
        captchaImageUrl: captchaImageUrl
      };
    }
  }
}

app.use(cors());
app.use(express.json());

// 代理抓取B站页面HTML（增加验证码处理）
app.post('/api/fetch', async (req, res) => {
  const { url } = req.body;
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: '无效的URL' });
  }
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      },
      timeout: 10000
    });
    
    const html = response.data;
    
    // 检测是否包含验证码
    if (detectCaptcha(html)) {
      console.log('检测到验证码，尝试OCR识别...');
      const captchaResult = await handleCaptcha(html, url);
      
      if (captchaResult.success) {
        // 返回验证码信息，让前端处理
        return res.json({ 
          html: html,
          hasCaptcha: true,
          captchaType: captchaResult.captchaType,
          captchaText: captchaResult.captchaText,
          captchaImageUrl: captchaResult.captchaImageUrl,
          captchaPrompt: captchaResult.captchaPrompt,
          message: captchaResult.message
        });
      } else {
        return res.json({ 
          html: html,
          hasCaptcha: true,
          captchaType: captchaResult.captchaType,
          captchaError: captchaResult.error,
          captchaImageUrl: captchaResult.captchaImageUrl,
          captchaPrompt: captchaResult.captchaPrompt,
          message: captchaResult.message
        });
      }
    }
    
    res.json({ html: html });
  } catch (error) {
    res.status(500).json({ error: error.message || '抓取失败' });
  }
});

// 新增：验证码OCR识别接口
app.post('/api/ocr-captcha', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: '缺少验证码图片URL' });
  }
  
  try {
    console.log('开始OCR识别验证码:', imageUrl);
    const captchaResult = await handleCaptcha('', imageUrl);
    
    if (captchaResult.success) {
      res.json({ 
        success: true, 
        captchaType: captchaResult.captchaType,
        captchaText: captchaResult.captchaText,
        captchaImageUrl: captchaResult.captchaImageUrl,
        captchaPrompt: captchaResult.captchaPrompt,
        message: captchaResult.message
      });
    } else {
      res.json({ 
        success: false, 
        error: captchaResult.error,
        captchaType: captchaResult.captchaType,
        message: captchaResult.message
      });
    }
  } catch (error) {
    console.log('OCR识别失败:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'OCR识别失败',
      message: 'OCR服务调用失败'
    });
  }
});

// 1. 解析B站链接，返回真实跳转URL和lottery_id
app.post('/api/parse-b23', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: '无效的URL' });
  }
  
  // 检查是否是支持的B站链接类型
  const isB23Link = url.startsWith('https://b23.tv/');
  const isBilibiliLink = url.includes('bilibili.com/blackboard/');
  
  if (!isB23Link && !isBilibiliLink) {
    return res.status(400).json({ error: '不支持的链接类型，请使用b23.tv短链接或bilibili.com/blackboard/开头的链接' });
  }
  
  try {
    console.log(`开始解析链接: ${url}`);
    
    let finalUrl = url;
    let html = '';
    
    // 如果是b23.tv链接，需要重定向解析
    if (isB23Link) {
      console.log('检测到b23.tv链接，进行重定向解析...');
      try {
        const response = await axios.get(url, {
          maxRedirects: 10,
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.bilibili.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
          },
          validateStatus: function (status) {
            return status >= 200 && status < 400;
          }
        });
        
        finalUrl = response.request.res.responseUrl || url;
        html = response.data;
        console.log(`重定向后的最终URL: ${finalUrl}`);
      } catch (error) {
        console.log('b23.tv重定向请求失败:', error.message);
        return res.status(500).json({ error: error.message || 'b23.tv链接重定向失败' });
      }
    } else {
      // 如果是直接的bilibili.com链接，直接获取页面内容
      console.log('检测到bilibili.com链接，直接获取页面内容...');
      try {
        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.bilibili.com/'
          }
        });
        
        html = response.data;
        console.log(`直接获取页面内容，长度: ${html.length}`);
      } catch (error) {
        console.log('直接链接请求失败:', error.message);
        return res.status(500).json({ error: error.message || '直接链接请求失败' });
      }
    }
    
    // 检查URL中是否包含lottery_id
    if (finalUrl.includes('lottery_id=')) {
      const match = finalUrl.match(/[?&]lottery_id=([\w\d]+)/);
      if (match) {
        const sid = match[1];
        console.log(`从URL中提取到lottery_id: ${sid}`);
        return res.json({ realUrl: finalUrl, sid });
      }
    }
    
    // 从页面内容中提取lottery_id和taskId
    console.log(`页面内容长度: ${html.length}`);
    
    // 优化taskId和counter提取逻辑 - 从EraTasklistPc.tasklist中查找btnBehavior包含sharePage的对象
    function extractTaskIdAndCounterFromHtml(html) {
      console.log('extractTaskIdAndCounterFromHtml收到的html长度:', html.length);
      
      // 多种匹配模式，确保能提取到taskId和counter
      const patterns = [
        // 模式1：直接匹配btnBehavior包含sharePage的完整对象
        /"btnBehavior":\[[^\]]*"sharePage"[^\]]*\][^}]*"taskId":"([^"]+)"[^}]*"counter":"([^"]+)"/,
        // 模式2：更宽松的匹配
        /"btnBehavior":\[[^\]]*"sharePage"[^\]]*\][^}]*?"taskId":"([^"]+)"[^}]*?"counter":"([^"]+)"/,
        // 模式3：在EraTasklist中查找
        /"EraTasklist":\[[^\]]*"btnBehavior":\[[^\]]*"sharePage"[^\]]*\][^}]*"taskId":"([^"]+)"[^}]*"counter":"([^"]+)"/
      ];
      
      for (let i = 0; i < patterns.length; i++) {
        const match = html.match(patterns[i]);
        if (match && match[1] && match[2]) {
          console.log(`模式${i+1}成功匹配到taskId: ${match[1]}, counter: ${match[2]}`);
          return { taskId: match[1], counter: match[2] };
        }
      }
      
      // 如果直接匹配失败，尝试在包含sharePage的位置附近查找taskId和counter
      console.log('直接匹配失败，尝试在附近查找...');
      const sharePageMatch = html.match(/"btnBehavior":\[[^\]]*"sharePage"[^\]]*\]/);
      if (sharePageMatch) {
        const startPos = sharePageMatch.index;
        const endPos = startPos + sharePageMatch[0].length;
        const nearbyText = html.substring(Math.max(0, startPos - 1000), endPos + 1000);
        const taskIdMatch = nearbyText.match(/"taskId":"([^"]+)"/);
        const counterMatch = nearbyText.match(/"counter":"([^"]+)"/);
        if (taskIdMatch && counterMatch) {
          console.log('在附近找到taskId:', taskIdMatch[1], 'counter:', counterMatch[1]);
          return { taskId: taskIdMatch[1], counter: counterMatch[1] };
        }
      }
      
      console.log('未找到包含sharePage的taskId和counter');
      return null;
    }

    // 提取taskId和counter
    let taskData = extractTaskIdAndCounterFromHtml(html);
    let taskId = null;
    let counter = null;
    if (taskData) {
      taskId = taskData.taskId;
      counter = taskData.counter;
      console.log(`通过结构化解析提取到taskId: ${taskId}, counter: ${counter}`);
    } else {
      console.log('从初始页面未提取到taskId和counter');
    }
    
    let sid = null;
    // 多种模式匹配lottery_id
    const lotteryPatterns = [
      /[?&]lottery_id=([\w\d]+)/,
      /lottery_id['"]?\s*[:=]\s*['"]([^'"\s]+)['"]/,
      /lottery_id['"]?\s*[:=]\s*([\w\d]+)/,
      /['"]lottery_id['"]\s*:\s*['"]([^'"\s]+)['"]/,
      /['"]lottery_id['"]\s*:\s*([\w\d]+)/,
      /lottery_id\s*=\s*['"]([^'"\s]+)['"]/,
      /lottery_id\s*=\s*([\w\d]+)/,
      /sid\s*[:=]\s*['"]([^'"\s]+)['"]/,
      /sid\s*[:=]\s*([\w\d]+)/,
      /['"]sid['"]\s*:\s*['"]([^'"\s]+)['"]/,
      /['"]sid['"]\s*:\s*([\w\d]+)/
    ];
    for (let i = 0; i < lotteryPatterns.length; i++) {
      const match = html.match(lotteryPatterns[i]);
      if (match) {
        sid = match[1];
        console.log(`从页面内容模式${i+1}中提取到lottery_id: ${sid}`);
        break;
      }
    }
    // 如果没提取到sid，尝试finalHtml
    if (!sid && typeof html === 'string') {
      for (let i = 0; i < lotteryPatterns.length; i++) {
        const match = html.match(lotteryPatterns[i]);
        if (match) {
          sid = match[1];
          console.log(`从页面内容模式${i+1}中提取到lottery_id: ${sid}`);
          break;
        }
      }
    }
    // 没有sid直接返回错误
    if (!sid) {
      return res.status(400).json({ error: '未能提取到sid（lottery_id），请检查页面结构或链接是否正确' });
    }
    
    if (sid) {
      const realUrl = `https://www.bilibili.com/blackboard/activity-${sid}.html`;
      return res.json({ realUrl, sid, taskId, counter });
    }
    
    // 如果第一次请求没有找到，尝试直接访问最终URL
    console.log('尝试直接访问最终URL获取页面内容...');
    const finalResponse = await axios.get(finalUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });
    
    const finalHtml = finalResponse.data;
    console.log(`最终页面内容长度: ${finalHtml.length}`);
    
    // 提取taskId和counter
    if (!taskId || !counter) {
      taskData = extractTaskIdAndCounterFromHtml(finalHtml);
      if (taskData) {
        taskId = taskData.taskId;
        counter = taskData.counter;
        console.log(`通过结构化解析(最终页面)提取到taskId: ${taskId}, counter: ${counter}`);
      } else {
        console.log('从最终页面也未提取到taskId和counter');
      }
    }
    
    if (sid) {
      const realUrl = `https://www.bilibili.com/blackboard/activity-${sid}.html`;
      return res.json({ realUrl, sid, taskId, counter });
    }
    
    // 输出页面内容片段用于调试
    console.log('页面内容片段:', finalHtml.substring(0, 2000));
    console.log('最终URL:', finalUrl);
    
    return res.status(500).json({ error: '未能从页面内容中提取到lottery_id' });
    
  } catch (error) {
    console.log('解析失败:', error.message);
    res.status(500).json({ error: error.message || '解析失败' });
  }
});

// 2. 代理请求中奖名单接口（只用sid）
app.post('/api/lottery-list', async (req, res) => {
  const { sid } = req.body;
  if (!sid) {
    return res.status(400).json({ error: '缺少sid参数' });
  }
  const apiUrl = `https://api.bilibili.com/x/lottery/x/win/list?sid=${sid}`;
  try {
    const resp = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.bilibili.com/'
      },
      timeout: 10000
    });
    res.json(resp.data);
  } catch (error) {
    res.status(500).json({ error: error.message || '接口请求失败' });
  }
});

// 2.5. 获取抽奖次数接口
app.post('/api/lottery-mytimes', async (req, res) => {
  console.log('收到获取抽奖次数请求:', req.body);
  const { sid } = req.body;
  if (!sid) {
    console.log('参数验证失败: sid=', sid);
    return res.status(400).json({ error: '缺少sid参数' });
  }

  // 读取本地cookie.txt
  let cookie = '';
  let csrf = '';
  try {
    const cookiePath = path.resolve(__dirname, '../cookie.txt');
    console.log('读取cookie文件路径:', cookiePath);
    const cookieText = fs.readFileSync(cookiePath, 'utf-8');
    const lines = cookieText.split('\n');
    const cookieLine = lines.find(line => line.includes('=') && !line.startsWith('#'));
    if (cookieLine) {
      cookie = cookieLine.trim();
      const csrfMatch = cookie.match(/bili_jct=([^;]+)/);
      csrf = csrfMatch ? csrfMatch[1] : '';
      console.log('成功读取cookie, csrf长度:', csrf.length);
    }
    if (!cookie || !csrf) {
      console.log('cookie验证失败: cookie长度=', cookie.length, 'csrf长度=', csrf.length);
      return res.status(400).json({ error: 'cookie.txt缺少bili_jct参数' });
    }
  } catch (err) {
    console.log('读取cookie.txt失败:', err.message);
    return res.status(500).json({ error: '读取cookie.txt失败: ' + err.message });
  }

  try {
    console.log('发送获取抽奖次数请求到B站API, 参数:', { sid, csrf: csrf.substring(0, 10) + '...' });
    const response = await axios.get(`https://api.bilibili.com/x/lottery/x/mytimes?csrf=${csrf}&sid=${sid}`, {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.bilibili.com/'
      },
      timeout: 10000
    });
    console.log('B站API响应:', response.data);
    res.json(response.data);
  } catch (error) {
    console.log('获取抽奖次数失败:', error.message);
    res.status(500).json({ error: error.message || '获取抽奖次数失败' });
  }
});

// 3. 代理自动抽奖接口（带锁机制）
app.post('/api/lottery-do', async (req, res) => {
  console.log('=== 收到抽奖请求 ===');
  console.log('请求参数:', req.body);
  
  const { sid, num = 1 } = req.body;
  
  if (!sid) {
    console.log('参数验证失败: sid=', sid);
    return res.status(400).json({ code: -1, message: '缺少sid参数' });
  }
  

  
  try {
    // 获取cookie和csrf
    const cookieData = await readCookie();
    if (!cookieData.cookie || !cookieData.csrf) {
      console.log('cookie获取失败');
      return res.status(500).json({ code: -1, message: '无法获取cookie或csrf' });
    }
    
    // 检查是否已有请求在进行中
    if (lotteryRequestInProgress) {
      console.log('请求过于频繁，拒绝处理');
      return res.status(429).json({ code: -1, message: '请求过于频繁，请稍后再试' });
    }
    
    // 设置请求锁
    lotteryRequestInProgress = true;
    
    // 确保请求间隔至少2秒
    const now = Date.now();
    if (lastLotteryRequestTime && (now - lastLotteryRequestTime) < 2000) {
      const waitTime = 2000 - (now - lastLotteryRequestTime);
      console.log(`等待${waitTime}ms后执行请求`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // 获取gaia_vtoken参数
    let gaiaVtoken = '';
    try {
      // 构造活动页面URL
      const activityUrl = `https://www.bilibili.com/blackboard/activity-${sid}.html`;
      console.log('获取gaia_vtoken，访问页面:', activityUrl);
      
      const pageResponse = await fetch(activityUrl, {
        headers: {
          'Cookie': cookieData.cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.bilibili.com/'
        }
      });
      
      if (pageResponse.ok) {
        const pageHtml = await pageResponse.text();
        
        // 尝试多种方式提取gaia_vtoken
        const vtokenPatterns = [
          /gaia_vtoken["']?\s*[:=]\s*["']([^"']+)["']/i,
          /"gaia_vtoken"\s*:\s*"([^"]+)"/i,
          /gaia_vtoken\s*=\s*["']([^"']+)["']/i,
          /window\.__INITIAL_STATE__\s*=\s*({[^}]+})/i,
          /window\.__INITIAL_STATE__\s*=\s*({.*?});/s
        ];
        
        for (const pattern of vtokenPatterns) {
          const match = pageHtml.match(pattern);
          if (match && match[1]) {
            if (pattern.toString().includes('__INITIAL_STATE__')) {
              // 如果是INITIAL_STATE，需要进一步解析
              try {
                const stateMatch = match[1].match(/"gaia_vtoken"\s*:\s*"([^"]+)"/i);
                if (stateMatch) {
                  gaiaVtoken = stateMatch[1];
                  break;
                }
              } catch (e) {
                console.log('解析INITIAL_STATE失败:', e.message);
              }
            } else {
              gaiaVtoken = match[1];
              break;
            }
          }
        }
        
        console.log('提取到的gaia_vtoken:', gaiaVtoken);
      } else {
        console.log('获取活动页面失败，状态码:', pageResponse.status);
      }
    } catch (error) {
      console.log('获取gaia_vtoken失败:', error.message);
    }
    
    console.log('=== 执行B站抽奖请求 ===');
    console.log('请求URL: https://api.bilibili.com/x/lottery/x/do');
    console.log('请求参数:', { sid, num, csrf: cookieData.csrf, gaia_vtoken: gaiaVtoken });
    
    const requestBody = new URLSearchParams({
      sid: sid,
      num: num.toString(),
      csrf: cookieData.csrf,
      gaia_vtoken: gaiaVtoken
    });
    
    console.log('请求Body:', requestBody.toString());
    
    // 调用B站抽奖接口
    const response = await fetch('https://api.bilibili.com/x/lottery/x/do', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieData.cookie,
        'Referer': 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: requestBody
    });
    
    console.log('=== B站抽奖响应 ===');
    console.log('响应状态:', response.status, response.statusText);
    console.log('响应Headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.json();
    console.log('响应Body:', data);
    console.log('==================');
    
    lastLotteryRequestTime = Date.now();
    
    // 释放请求锁
    lotteryRequestInProgress = false;
    
    res.json(data);
  } catch (error) {
    console.error('=== 抽奖请求异常 ===');
    console.error('错误信息:', error);
    console.error('错误堆栈:', error.stack);
    console.error('==================');
    
    lotteryRequestInProgress = false;
    res.status(500).json({ code: -1, message: '抽奖请求失败: ' + error.message });
  }
});

// 4. 代理积分发送接口
app.post('/api/send-points', async (req, res) => {
  const { activity, business } = req.body;
  
  if (!activity || !business) {
    return res.status(400).json({ code: -1, message: '缺少activity或business参数' });
  }
  
  try {
    // 获取cookie和csrf
    const cookieData = await readCookie();
    if (!cookieData.cookie || !cookieData.csrf) {
      return res.status(500).json({ code: -1, message: '无法获取cookie或csrf' });
    }
    
    // 生成当前时间戳
    const timestamp = Math.floor(Date.now() / 1000);
    
    console.log(`执行积分发送请求: activity=${activity}, business=${business}, timestamp=${timestamp}`);
    
    // 调用B站积分发送接口
    const response = await fetch('https://api.bilibili.com/x/activity/task/send_points', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieData.cookie,
        'Referer': 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: new URLSearchParams({
        activity: activity,
        business: business,
        csrf: cookieData.csrf,
        timestamp: timestamp.toString()
      })
    });
    
    const data = await response.json();
    console.log('积分发送响应:', data);
    
    res.json(data);
  } catch (error) {
    console.error('积分发送请求失败:', error);
    res.status(500).json({ code: -1, message: '积分发送请求失败: ' + error.message });
  }
});

app.listen(port, () => {
  console.log(`代理服务器已启动: http://localhost:${port}`);
}); 
