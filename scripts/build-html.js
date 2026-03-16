const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

// 核心配置
const DOC_DIR = path.join(__dirname, "../doc");
const TEMPLATE_DIR = path.join(__dirname, "../templates");
const PAGE_TEMPLATE_PATH = path.join(TEMPLATE_DIR, "page.ejs"); // 分篇模板
const INDEX_TEMPLATE_PATH = path.join(TEMPLATE_DIR, "index.ejs"); // 主页模板
const DIST_DIR = path.join(__dirname, "../dist");

// 工具函数：处理换行规则（单换行忽略，双换行换段）
function formatContent(content) {
  if (!content) return "无内容";
  // 步骤1：将\r\n统一为\n
  let formatted = content.replace(/\r\n/g, "\n");
  // 步骤2：双换行替换为</p><p>（换段）
  formatted = formatted.replace(/\n\n+/g, "</p><p>");
  // 步骤3：单换行直接移除
  formatted = formatted.replace(/\n/g, "");
  // 步骤4：包裹外层p标签
  return `<p>${formatted}</p>`;
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
    const txtFiles = fs.readdirSync(tagDir)
      .filter(file => file.endsWith(".txt"));
    
    // 处理每个TXT文件（拆分言论和评论）
    const speeches = [];
    for (const txtFile of txtFiles) {
      const txtPath = path.join(tagDir, txtFile);
      const content = fs.readFileSync(txtPath, "utf8");
      
      // 拆分：双换行分隔言论和评论（第一个块是言论，后面都是评论）
      const contentBlocks = content.split(/\n\n+/);
      const mainContent = formatContent(contentBlocks[0]);
      const comments = contentBlocks.slice(1).map(block => formatContent(block));
      
      speeches.push({
        id: txtFile.replace(".txt", ""),
        mainContent: mainContent,
        comments: comments
      });
    }

    // 渲染模板
    const html = ejs.render(pageTemplate, {
      tag: tag,
      tags: tags, // 所有标签（用于侧边目录）
      speeches: speeches,
      updateTime: new Date().toLocaleString("zh-CN")
    });

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

  // 渲染模板
  const html = ejs.render(indexTemplate, {
    tags: tags,
    tagCount: tagCount,
    updateTime: new Date().toLocaleString("zh-CN")
  });

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
