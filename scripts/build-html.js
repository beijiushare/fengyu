const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

// 核心配置
const DOC_DIR = path.join(__dirname, "../doc");
const TEMPLATE_DIR = path.join(__dirname, "../templates");
const PAGE_TEMPLATE_PATH = path.join(TEMPLATE_DIR, "page.ejs"); // 分篇模板
const INDEX_TEMPLATE_PATH = path.join(TEMPLATE_DIR, "index.ejs"); // 主页模板
const DIST_DIR = path.join(__dirname, "../dist");

// 工具函数：中文数字转换（0-999）
function numberToChinese(num) {
  const chnNumChar = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
  const chnUnitChar = ["", "拾", "佰", "仟"];
  
  if (num === 0) return "零";
  
  let str = num.toString();
  let chnStr = "";
  let zeroFlag = false; // 零的标志
  let unitPos = 0;
  
  for (let i = str.length - 1; i >= 0; i--) {
    const digit = parseInt(str[i]);
    if (digit === 0) {
      if (zeroFlag) continue;
      zeroFlag = true;
      chnStr = chnNumChar[0] + chnStr;
    } else {
      zeroFlag = false;
      chnStr = chnNumChar[digit] + chnUnitChar[unitPos] + chnStr;
    }
    unitPos++;
  }
  
  // 去除开头的零
  chnStr = chnStr.replace(/^零+/, "");
  // 处理拾开头的情况（如11 -> 壹拾壹，而非拾壹）
  if (chnStr.startsWith("拾")) {
    chnStr = "壹" + chnStr;
  }
  
  return chnStr || "零";
}

// 工具函数：处理换行规则
function formatContent(content) {
  if (!content) return "无内容";

  // 先统一换行
  let txt = content.replace(/\r\n/g, "\n");

  // 把用户文本里的 < 和 > 转义成实体，防止被当成 HTML
  txt = txt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 再把换行变成真正的 <br>，用于渲染
  txt = txt.replace(/\n\n+/g, "<br><br>");
  txt = txt.replace(/\n/g, "<br>");

  return txt;
}

// 工具函数：获取所有标签（分篇）
function getAllTags() {
  if (!fs.existsSync(DOC_DIR)) return [];
  return fs.readdirSync(DOC_DIR, { withFileTypes: true })
    .filter(dir => dir.isDirectory())
    .map(dir => dir.name);
}

// 步骤1：检查模板文件是否存在（仅提示，不自动创建）
function checkTemplates() {
  // 创建模板目录（仅目录，不创建文件）
  fs.mkdirSync(TEMPLATE_DIR, { recursive: true });

  // 检查分篇模板
  if (!fs.existsSync(PAGE_TEMPLATE_PATH)) {
    console.error(`❌ 分篇模板文件缺失：${PAGE_TEMPLATE_PATH}`);
    console.error("请手动创建 templates/page.ejs 文件后再运行");
    process.exit(1);
  }

  // 检查主页模板
  if (!fs.existsSync(INDEX_TEMPLATE_PATH)) {
    console.error(`❌ 主页模板文件缺失：${INDEX_TEMPLATE_PATH}`);
    console.error("请手动创建 templates/index.ejs 文件后再运行");
    process.exit(1);
  }
}

// 步骤2：编译分篇HTML
function buildPageHtml(tags) {
  // 读取分篇模板
  const pageTemplate = fs.readFileSync(PAGE_TEMPLATE_PATH, "utf8");

  for (const tag of tags) {
    const tagDir = path.join(DOC_DIR, tag);
    let txtFiles = fs.readdirSync(tagDir)
      .filter(file => file.endsWith(".txt"));
    
    // 按文件名（Issue ID）数字排序
    txtFiles = txtFiles.sort((a, b) => {
      const numA = parseInt(a.replace(".txt", ""));
      const numB = parseInt(b.replace(".txt", ""));
      return numA - numB;
    });
    
    // 处理每个TXT文件（拆分言论和评论：--- 分隔）
    const speeches = [];
    for (let i = 0; i < txtFiles.length; i++) {
      const txtFile = txtFiles[i];
      const txtPath = path.join(tagDir, txtFile);
      const content = fs.readFileSync(txtPath, "utf8");
      
      // 拆分：--- 分隔言论和评论（第一个块是言论，后面都是评论）
      const contentBlocks = content.split(/---\s*/).map(block => block.trim());
      const mainContent = formatContent(contentBlocks[0]);
      const comments = contentBlocks.slice(1).filter(block => block).map(block => formatContent(block));
      
      // 生成中文数字序号（从1开始）
      const chineseNumber = numberToChinese(i + 1);
      
      speeches.push({
        id: txtFile.replace(".txt", ""),
        mainContent: mainContent,
        comments: comments,
        chineseNumber: chineseNumber // 添加中文序号
      });
    }

    const html = ejs.render(pageTemplate, {
      tag: tag,
      tags: tags, // 所有标签（用于侧边目录）
      speeches: speeches
    }); // 移除了错误的 { escape: true } 配置

    // 写入HTML文件
    fs.mkdirSync(DIST_DIR, { recursive: true });
    const htmlPath = path.join(DIST_DIR, `${tag}.html`);
    fs.writeFileSync(htmlPath, html, "utf8");
    console.log(`✅ 生成 ${tag}.html，共 ${speeches.length} 条言论`);
  }
}

// 步骤3：编译主页HTML
function buildIndexHtml(tags) {
  // 读取主页模板
  const indexTemplate = fs.readFileSync(INDEX_TEMPLATE_PATH, "utf8");

  // 统计每个标签的言论数量
  const tagCount = {};
  for (const tag of tags) {
    const tagDir = path.join(DOC_DIR, tag);
    const txtFiles = fs.readdirSync(tagDir).filter(file => file.endsWith(".txt"));
    tagCount[tag] = txtFiles.length;
  }

  // 修复：移除错误的 escape 配置
  const html = ejs.render(indexTemplate, {
    tags: tags,
    tagCount: tagCount
  }); // 移除了错误的 { escape: true } 配置

  // 写入首页
  fs.writeFileSync(path.join(DIST_DIR, "index.html"), html, "utf8");
  console.log("✅ 生成首页 index.html");
}

// 主编译流程
function main() {
  try {
    // 检查模板文件
    checkTemplates();

    // 获取所有标签
    const tags = getAllTags();
    if (tags.length === 0) {
      console.log("✅ 无标签目录，终止编译");
      process.exit(0);
    }

    // 编译分篇HTML
    buildPageHtml(tags);

    // 编译主页HTML
    buildIndexHtml(tags);

    console.log("🎉 HTML编译完成");
    process.exit(0);
  } catch (error) {
    console.error("💥 编译失败：", error.message);
    process.exit(1);
  }
}

// 启动编译
main();

// 解决HTTPS证书/超时等环境问题
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
