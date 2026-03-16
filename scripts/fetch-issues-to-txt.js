// scripts/fetch-issues-to-txt.js
const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 初始化GitHub客户端
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const DOC_DIR = path.join(__dirname, "../doc"); // doc根目录
const HASH_FILE = path.join(__dirname, "../data-hash.txt"); // 哈希存储文件
const TARGET_ISSUE_TITLE = "峰语"; // 仅读取标题为「峰语」的Issue

// 步骤1：拉取所有标题为「峰语」的Open主Issue
async function fetchMainIssues() {
  const issues = [];
  let page = 1;
  while (true) {
    const { data } = await octokit.issues.listForRepo({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      state: "open",
      per_page: 100,
      page,
    });
    if (data.length === 0) break;
    // 核心过滤：仅保留标题严格等于「峰语」的主Issue（排除PR）
    const targetIssues = data.filter(issue => 
      !issue.pull_request && issue.title.trim() === TARGET_ISSUE_TITLE
    );
    issues.push(...targetIssues);
    page++;
  }
  return issues;
}

// 步骤2：拉取单个Issue的所有回复（评述）
async function fetchIssueComments(issueNumber) {
  const comments = [];
  let page = 1;
  while (true) {
    const { data } = await octokit.issues.listComments({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: issueNumber,
      per_page: 100,
      page,
    });
    if (data.length === 0) break;
    comments.push(...data);
    page++;
  }
  return comments;
}

// 步骤3：生成TXT内容并计算哈希
async function generateTxtContent(issues) {
  const allContent = [];
  // 遍历每个目标Issue
  for (const issue of issues) {
    const issueNumber = issue.number;
    // 获取Issue的标签（对应文件夹），默认"篇章-未分类"
    const tag = issue.labels.length > 0 
      ? issue.labels[0].name 
      : "篇章-未分类";
    // 主言论内容（标题+正文）
    const mainContent = `${issue.title}\n\n${issue.body || ""}`;
    // 拉取回复（评述）
    const comments = await fetchIssueComments(issueNumber);
    const commentContent = comments.map(comment => 
      `\n\n--- 评述${comment.id} --- \n${comment.body || ""}`
    ).join("");
    // 合并内容
    const fullContent = mainContent + commentContent;
    allContent.push(fullContent);
    // 创建文件夹并写入TXT
    const tagDir = path.join(DOC_DIR, tag);
    fs.mkdirSync(tagDir, { recursive: true });
    const txtPath = path.join(tagDir, `${issueNumber}.txt`);
    fs.writeFileSync(txtPath, fullContent, "utf8");
  }
  // 计算所有内容的MD5哈希（用于增量检测）
  const hash = crypto.createHash("md5")
    .update(allContent.join(""))
    .digest("hex");
  return hash;
}

// 步骤4：增量检测（对比哈希）
function checkHashChange(newHash) {
  // 读取旧哈希
  let oldHash = "";
  if (fs.existsSync(HASH_FILE)) {
    oldHash = fs.readFileSync(HASH_FILE, "utf8").trim();
  }
  // 对比哈希，无变更则退出
  if (oldHash === newHash) {
    console.log("✅ 无内容变更，终止流程");
    process.exit(0);
  }
  // 写入新哈希
  fs.writeFileSync(HASH_FILE, newHash, "utf8");
  console.log("🔄 内容已变更，更新哈希为：", newHash);
}

// 主流程
async function main() {
  try {
    console.log("🔍 开始拉取标题为「峰语」的Issue数据...");
    const issues = await fetchMainIssues();
    console.log(`📌 找到 ${issues.length} 条符合条件的Issue`);
    if (issues.length === 0) {
      console.log("✅ 无符合条件的Issue，终止流程");
      process.exit(0);
    }
    const newHash = await generateTxtContent(issues);
    checkHashChange(newHash);
    console.log("✅ TXT文件生成完成");
  } catch (error) {
    console.error("❌ 执行失败：", error.message);
    process.exit(1);
  }
}

main();
