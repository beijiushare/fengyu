// scripts/build-html.js
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const DOC_DIR = path.join(__dirname, "../doc");
const TEMPLATE_PATH = path.join(__dirname, "../templates/page.ejs");
const DIST_DIR = path.join(__dirname, "../dist");

// 确保模板文件夹存在
if (!fs.existsSync(path.dirname(TEMPLATE_PATH))) {
  fs.mkdirSync(path.dirname(TEMPLATE_PATH), { recursive: true });
  // 生成默认模板（首次运行用）
  const defaultTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>峰语 - <%= tag %></title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .speech { margin: 20px 0; padding: 15px; border: 1px solid #eee; border-radius: 8px; }
    .comment { margin: 10px 0 0 20px; padding: 10px; border-left: 3px solid #666; color: #555; }
    .update-time { margin-top: 30px; color: #999; font-size: 14px; }
  </style>
</head>
<body>
  <h1><%= tag %></h1>
  <% speeches.forEach(speech => { %>
    <div class="speech">
      <%= speech.content %>
    </div>
  <% }) %>
  <div class="update-time">最后更新：<%= updateTime %></div>
</body>
</html>
  `;
  fs.writeFileSync(TEMPLATE_PATH, defaultTemplate.trim(), "utf8");
}

// 步骤1：读取模板
const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

// 步骤2：遍历doc下的所有文件夹（tag）
const tagDirs = fs.existsSync(DOC_DIR) 
  ? fs.readdirSync(DOC_DIR, { withFileTypes: true })
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name)
  : [];

if (tagDirs.length === 0) {
  console.log("✅ 无doc文件夹或无标签目录，终止编译");
  process.exit(0);
}

// 步骤3：每个tag生成一个HTML文件
for (const tag of tagDirs) {
  const tagDir = path.join(DOC_DIR, tag);
  const txtFiles = fs.readdirSync(tagDir)
    .filter(file => file.endsWith(".txt"));
  
  // 读取该tag下所有TXT内容
  const speeches = [];
  for (const txtFile of txtFiles) {
    const txtPath = path.join(tagDir, txtFile);
    const content = fs.readFileSync(txtPath, "utf8");
    // 纯文本转HTML换行，保留评述分隔符样式
    const htmlContent = content
      .replace(/--- 评述(\d+) ---/g, '<div class="comment"><strong>评述$1：</strong>')
      .replace(/\n/g, "<br>")
      .replace(/<div class="comment">/g, "</div><div class=\"comment\">"); // 闭合上一个评述
    speeches.push({
      id: txtFile.replace(".txt", ""),
      content: htmlContent,
    });
  }

  // 渲染模板生成HTML
  const html = ejs.render(template, {
    tag: tag,
    speeches: speeches,
    updateTime: new Date().toLocaleString("zh-CN"),
  });

  // 写入HTML文件
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const htmlPath = path.join(DIST_DIR, `${tag}.html`);
  fs.writeFileSync(htmlPath, html, "utf8");
  console.log(`✅ 生成 ${tag}.html，共 ${speeches.length} 条言论`);
}

// 生成首页（汇总所有tag）
const indexHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>峰语汇总</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; padding: 10px; border: 1px solid #eee; border-radius: 4px; }
    a { text-decoration: none; color: #2c3e50; font-size: 18px; }
    .update-time { margin-top: 30px; color: #999; font-size: 14px; }
  </style>
</head>
<body>
  <h1>峰语汇总</h1>
  <ul>
    <% tagDirs.forEach(tag => { %>
      <li><a href="./<%= tag %>.html"><%= tag %></a></li>
    <% }) %>
  </ul>
  <div class="update-time">最后更新：<%= updateTime %></div>
</body>
</html>
`;

fs.writeFileSync(
  path.join(DIST_DIR, "index.html"),
  ejs.render(indexHtml, { tagDirs, updateTime: new Date().toLocaleString("zh-CN") }),
  "utf8"
);
console.log("✅ 生成首页 index.html");
