// 测试taskId提取逻辑
const testHtml = `
{
  "EraTasklistPc": [{
    "style": {
      "awardBgColor": "rgb(203, 56, 75)",
      "awardTxtColor": "rgba(255, 255, 255, 0.8)",
      "bgColor": "rgb(253, 252, 232)",
      "btnTxtColor": "rgba(255, 255, 255, 1)",
      "desTxtColor": "rgb(203, 56, 75)",
      "mainTxtColor": "rgb(102, 63, 56)",
      "processActiveColor": "rgb(185, 183, 184)",
      "processAwardColor": "rgba(255, 255, 255, 1)",
      "processUnActiveColor": "rgba(255, 255, 255, 1)",
      "themeColor": "rgb(228, 44, 34)",
      "width": 600
    },
    "tasklist": [{
      "accumulativeCount": 0,
      "awardName": "抽奖次数",
      "backwardsCounters": false,
      "btnBehavior": ["FINISH", "sharePage"],
      "btnTxt": "去分享",
      "can_edit": 1,
      "checkpoints": [{
        "alias": "每日分享活动页面",
        "awardname": "抽奖次数",
        "awardsid": "",
        "awardtype": 3,
        "count": 1,
        "list": [{
          "cur_value": 0,
          "limit": 1
        }],
        "status": 1,
        "ztasksid": "6ERA4wloghvn2g00"
      }],
      "counter": "6ERA1tbvcb",
      "indicators": [{
        "cur_value": 0,
        "limit": 1,
        "name": ""
      }],
      "inviteActName": "",
      "jumpLink": "",
      "jumpPosition": "",
      "periodType": 1,
      "promptText": "",
      "reserveId": "",
      "showBtn": true,
      "statisticType": 1,
      "taskAwardType": 3,
      "taskDes": "",
      "taskIcon": "",
      "taskId": "6ERA4wloghvn2g00",
      "taskName": "每日分享活动页面",
      "taskStatus": 1,
      "taskType": 1,
      "topicID": "",
      "topicName": ""
    }]
  }]
}
`;

// 测试提取逻辑
function extractTaskIdFromHtml(html) {
  console.log('开始提取taskId，页面内容长度:', html.length);
  
  // 尝试多种匹配模式
  const patterns = [
    /"EraTasklistPc":\s*\[\s*{[^}]*"tasklist":\s*(\[[\s\S]*?\])/,
    /"EraTasklistPc":\s*\[[^[]*"tasklist":\s*(\[[\s\S]*?\])/,
    /"tasklist":\s*(\[[\s\S]*?"btnBehavior":\s*\[[^\]]*"sharePage"[^\]]*\][\s\S]*?\])/
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    const match = html.match(patterns[i]);
    if (match) {
      console.log(`找到tasklist内容，模式${i+1}，长度:`, match[1].length);
      console.log('tasklist内容片段:', match[1].substring(0, 200));
      try {
        const tasklist = JSON.parse(match[1]);
        console.log('成功解析tasklist，任务数量:', tasklist.length);
        
        const shareTask = tasklist.find(task => {
          if (Array.isArray(task.btnBehavior)) {
            const hasSharePage = task.btnBehavior.includes('sharePage');
            console.log(`任务${task.taskId}的btnBehavior:`, task.btnBehavior, '包含sharePage:', hasSharePage);
            return hasSharePage;
          }
          return false;
        });
        
        if (shareTask) {
          console.log('找到包含sharePage的任务:', shareTask.taskId);
          return shareTask.taskId;
        } else {
          console.log('未找到包含sharePage的任务');
        }
      } catch (e) {
        console.log(`tasklist解析失败(模式${i+1}):`, e.message);
        console.log('尝试修复JSON...');
        
        // 尝试修复JSON - 找到最后一个完整的对象
        let fixedJson = match[1];
        let braceCount = 0;
        let lastValidPos = 0;
        
        for (let j = 0; j < fixedJson.length; j++) {
          if (fixedJson[j] === '{') braceCount++;
          if (fixedJson[j] === '}') {
            braceCount--;
            if (braceCount === 0) {
              lastValidPos = j + 1;
              break;
            }
          }
        }
        
        if (lastValidPos > 0) {
          fixedJson = fixedJson.substring(0, lastValidPos);
          console.log('修复后的JSON长度:', fixedJson.length);
          try {
            const tasklist = JSON.parse(fixedJson);
            console.log('修复后成功解析tasklist，任务数量:', tasklist.length);
            
            const shareTask = tasklist.find(task => {
              if (Array.isArray(task.btnBehavior)) {
                const hasSharePage = task.btnBehavior.includes('sharePage');
                console.log(`任务${task.taskId}的btnBehavior:`, task.btnBehavior, '包含sharePage:', hasSharePage);
                return hasSharePage;
              }
              return false;
            });
            
            if (shareTask) {
              console.log('找到包含sharePage的任务:', shareTask.taskId);
              return shareTask.taskId;
            }
          } catch (e2) {
            console.log('修复后仍然解析失败:', e2.message);
          }
        }
      }
    }
  }
  
  console.log('所有模式都未找到tasklist或解析失败');
  return null;
}

// 执行测试
const taskId = extractTaskIdFromHtml(testHtml);
console.log('最终提取结果:', taskId); 