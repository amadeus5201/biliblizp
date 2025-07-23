// 测试taskId提取逻辑
const testHtml = `
{
  "EraTasklistPc": [{
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

// 测试提取逻辑 - 使用更精确的正则表达式
const eraTasklistPattern = /"EraTasklistPc":\s*\[[^\]]*"tasklist":\s*\[([\s\S]*?)\]/;
const eraTasklistMatch = testHtml.match(eraTasklistPattern);

if (eraTasklistMatch) {
  const tasklistContent = eraTasklistMatch[1];
  console.log('找到tasklist内容长度:', tasklistContent.length);
  
  // 在tasklist中查找btnBehavior包含sharePage的任务
  const taskPattern = /"btnBehavior":\s*\[[^\]]*"sharePage"[^\]]*\][\s\S]*?"taskId":\s*"([^"]+)"/;
  const taskMatch = tasklistContent.match(taskPattern);
  
  if (taskMatch) {
    const taskId = taskMatch[1];
    console.log('提取到taskId:', taskId);
  } else {
    console.log('未找到包含sharePage的任务');
    console.log('tasklist内容片段:', tasklistContent.substring(0, 200));
  }
} else {
  console.log('未找到EraTasklistPc.tasklist');
} 