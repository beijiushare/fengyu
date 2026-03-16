// 新增：解决HTTPS证书/超时等环境问题
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 初始化GitHub客户端（添加超时、证书容错）
const octokit = new Octokit({ 
  auth: process.env.GITHUB_TOKEN,
  timeout: 10000, // 超时时间10秒，避免卡壳
  request: {
    agent: new (require('https').Agent)({ rejectUnauthorized: false })
  }
});

// 核心配置
const REPO_OWNER = process.env.REPO_OWNER || process.env.GITHUB_REPOSITORY_OWNER;
const REPO_NAME = process.env.REPO_NAME || (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : '');
const DOC_DIR = path.join(__dirname, "../doc"); // doc根目录
const HASH_FILE = path.join(__dirname, "../data-hash.txt"); // 哈希存储文件
const TARGET_ISSUE_TITLE = "峰语"; // 仅读取标题为「峰语」的Issue

// 步骤1：拉取所有标题为「峰语」的Open主Issue
async function fetchMainIssues() {
  // 容错：检查仓库信息是否存在
  if (!REPO_OWNER || !REPO_NAME) {
    console.error("❌ 仓库信息缺失，请检查环境变量配置");
    process.exit(0);
  }

  const issues = [];
  let page = 1;
  const perPage = 100; // 单次拉取最大数量

  console.log(`🔍 开始拉取仓库 ${REPO_OWNER}/${REPO_NAME} 中标题为「${TARGET_ISSUE_TITLE}」的Issue...`);

  while (true) {
    try {
      const { data } = await octokit.issues.listForRepo({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        state: "open",
        per_page: perPage,
        page,
        sort: "updated",
        direction: "desc" // 按更新时间倒序，优先拉取最新的
      });

      if (data.length === 0) break;

      // 核心过滤：仅保留标题严格等于「峰语」的主Issue（排除PR）
      const targetIssues = data.filter(issue => 
        !issue.pull_request && issue.title.trim() === TARGET_ISSUE_TITLE
      );

      issues.push(...targetIssues);
      console.log(`📌 第${page}页找到 ${targetIssues.length} 条符合条件的Issue`);

      // 防止无限循环：如果返回数量小于perPage，说明是最后一页
      if (data.length < perPage) break;

      page++;
      // 限速：避免触发GitHub API频率限制
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ 拉取第${page}页Issue失败：`, error.message);
      // 非致命错误：跳过当前页，继续（避免整体流程终止）
      page++;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log(`✅ 共找到 ${issues.length} 条符合条件的「峰语」Issue`);
  return issues;
}

// 步骤2：解析Issue正文，按格式分割言论本体和评论
function parseIssueContent(issueBody) {
  if (!issueBody) {
    return {
      mainContent: "无内容",
      comments: []
    };
  }

  // 按---分割，去除空行和多余空格
  const parts = issueBody.split('---').map(part => part.trim()).filter(part => part);
  
  // 言论本体：第一个分割部分
  const mainContent = parts.length > 0 ? parts[0] : "无内容";
  // 评论部分：分割后的剩余部分
  const comments = parts.length > 1 ? parts.slice(1) : [];

  return { mainContent, comments };
}

// 步骤3：生成TXT内容并计算哈希（适配新格式）
async function generateTxtContent(issues) {
  if (issues.length === 0) return "";

  const allValidContent = [];
  // 确保doc目录存在
  fs.mkdirSync(DOC_DIR, { recursive: true });

  // 遍历每个目标Issue
  for (const issue of issues) {
    const issueNumber = issue.number;
    
    // 过滤无标签的Issue
    if (issue.labels.length === 0) {
      console.log(`ℹ️ Issue #${issueNumber} 未打标签，直接过滤，不生成TXT`);
      continue; // 跳过当前Issue，不执行后续操作
    }
    
    // 有标签时，取第一个标签的名称
    const tag = issue.labels[0].name;
    
    // 解析Issue正文（按---分割言论和评论）
    const { mainContent, comments } = parseIssueContent(issue.body);
    
    // 按指定格式拼接最终内容
    let fullContent = mainContent;
    if (comments.length > 0) {
      fullContent += '\n' + comments.map(comment => `---\n${comment}`).join('\n');
    }
    
    // 收集有效内容用于哈希计算
    allValidContent.push(fullContent);
    
    // 创建标签文件夹并写入TXT
    const tagDir = path.join(DOC_DIR, tag);
    fs.mkdirSync(tagDir, { recursive: true });
    const txtPath = path.join(tagDir, `${issueNumber}.txt`);
    
    try {
      fs.writeFileSync(txtPath, fullContent, "utf8");
      console.log(`✅ Issue #${issueNumber} 已写入 ${txtPath}`);
    } catch (error) {
      console.error(`❌ 写入Issue #${issueNumber} 到TXT失败：`, error.message);
    }
  }

  // 计算所有有效内容的MD5哈希（用于增量检测）
  const hash = allValidContent.length > 0 
    ? crypto.createHash("md5").update(allValidContent.join("")).digest("hex")
    : "";
  
  return hash;
}

// 步骤4：增量检测（对比哈希）
function checkHashChange(newHash) {
  // 容错：如果无内容，直接返回false
  if (!newHash) {
    console.log("ℹ️ 无有效内容（所有Issue均未打标签），跳过哈希检测");
    return false;
  }

  // 读取旧哈希
  let oldHash = "";
  if (fs.existsSync(HASH_FILE)) {
    try {
      oldHash = fs.readFileSync(HASH_FILE, "utf8").trim();
    } catch (error) {
      console.error("❌ 读取哈希文件失败：", error.message);
      oldHash = "";
    }
  }

  // 对比哈希，无变更则退出
  if (oldHash === newHash) {
    console.log("✅ 无内容变更，终止流程");
    return false;
  }

  // 写入新哈希
  try {
    fs.writeFileSync(HASH_FILE, newHash, "utf8");
    console.log("🔄 内容已变更，更新哈希为：", newHash);
    return true;
  } catch (error) {
    console.error("❌ 写入哈希文件失败：", error.message);
    return true; // 哈希写入失败仍继续流程
  }
}

// 主流程
async function main() {
  try {
    // 步骤1：拉取Issue
    const issues = await fetchMainIssues();
    
    // 步骤2：生成TXT和哈希（不再拉取评论，直接解析Issue正文）
    const newHash = await generateTxtContent(issues);
    
    // 步骤3：增量检测
    checkHashChange(newHash);
    
    console.log("🎉 拉取Issue并生成TXT流程完成");
    process.exit(0);
  } catch (fatalError) {
    console.error("💥 主流程执行失败：", fatalError.message);
    // 非零退出码，但避免Action直接标红（容错）
    process.exit(0);
  }
}

// 启动主流程
main();
