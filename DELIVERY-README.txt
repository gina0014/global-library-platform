# Global Library Knowledge & Information Platform — Stage8-v1.0-Prototype

可移植交付包。包含网站运行所需文件、README、CHANGELOG 与必要文档。
（已排除开发用截图、测试脚本与临时文件。）

## 运行

任选一种方式，在本目录内启动本地服务器后访问首页：

- Windows：`python -m http.server 8000`（或 `py -m http.server 8000`）
- macOS / Linux：`python3 -m http.server 8000`
- VS Code：安装 Live Server 插件后右键 `index.html` → Open with Live Server

然后浏览器访问 <http://localhost:8000/>。请勿直接双击 `index.html`（file:// 下无法读取 JSON）。

详细说明见 `README.md`，验收与已知限制见 `docs/Stage8-Final-QA-Report.md`。
