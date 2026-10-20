# LiquidGlassCursor V0.1

一个面向 Windows 10 的静态透明玻璃鼠标指针原型。当前版本实现 **Crystal Refraction Arrow（水晶折光箭头）**：保留经典左上箭头轮廓，并加入冷白透明主体、深蓝灰描边、左上镜面高光、冰蓝折光和局部晶面。

本版本只生成原生静态 `.cur` 文件，不捕获桌面、不运行常驻程序、不修改注册表，也不会自动替换系统指针。

## 项目结构

```text
LiquidGlassCursor/
├─ assets/arrow.svg       # 64×64 逻辑坐标的可编辑 SVG 母版
├─ scripts/build.py       # SVG → 多尺寸 PNG、32px CUR、预览图
├─ scripts/preview.py     # 多背景实际尺寸与放大检查预览
├─ tests/test_cursor.py   # unittest 自动化验收
├─ output/                # 构建输出
├─ requirements.txt       # 项目依赖
└─ README.md
```

## 环境准备

项目使用工作区内的 `.venv`，不要全局安装依赖。以下命令均在项目根目录的 VS Code PowerShell 终端中运行。

```powershell
# 如果 .venv 已存在，直接安装依赖
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

如果重新克隆后没有 `.venv`：

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 构建

```powershell
.\.venv\Scripts\python.exe .\scripts\build.py
```

构建会生成：

- `output/arrow_32.png`
- `output/arrow_48.png`
- `output/arrow_64.png`
- `output/arrow_32.cur`
- `output/preview.png`

其中 `arrow_32.cur` 使用 RGBA PNG 作为 CUR 图像载荷，以保留真正的 Alpha 透明度。Hotspot 为 `(1, 1)`，对应箭头左上尖端。

仅重新生成预览：

```powershell
.\.venv\Scripts\python.exe .\scripts\preview.py
```

## 测试

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

测试检查 PNG 尺寸、RGBA/Alpha、32px 轮廓占用、CUR 文件头、尺寸、Hotspot 和内嵌 PNG。若运行环境为 Windows，还会使用系统 `LoadImageW` 尝试实际加载 CUR 文件。

## 查看预览

打开 `output/preview.png`。四个区域分别展示白色、深色、彩色渐变和文字/棋盘格复杂背景。每个区域左侧为 **实际 32×32 像素**，右侧为明确标注的 **8 倍像素放大检查图**。

## Windows 10 手动安装

1. 按 `Win + R`，输入 `control mouse` 并回车。
2. 打开“指针”选项卡。
3. 在“自定义”列表中选择“正常选择”。
4. 点击“浏览”，选择本项目的 `output\arrow_32.cur`。
5. 点击“应用”。建议先点击“另存为”，把当前组合保存为一个新方案。

本项目目前只提供普通箭头，不包含忙碌、文本选择、链接选择、缩放等完整指针角色。

## 恢复系统指针

1. 再次打开 `control mouse` →“指针”。
2. 在“方案”下拉框选择 `Windows 默认(系统方案)`。
3. 点击“应用”和“确定”。

若只想恢复普通箭头，也可在“正常选择”项目上点击“使用默认值”。

## 编辑设计

直接修改 `assets/arrow.svg`。SVG 使用统一的 `0 0 64 64` 逻辑坐标，构建脚本会通过 resvg 分别渲染为 32、48、64 像素。为保证点击位置不偏移，修改箭头尖端位置时也应同步调整 `scripts/build.py` 中的 `HOTSPOT_LOGICAL`。

## 当前限制

- 当前效果是静态透明叠色，不具备实时背景折射或动态材质。
- 32px 下可用的高光和晶面细节非常有限，过多细节会转化为噪点。
- 只生成普通选择箭头，没有完整 Windows 指针主题，也没有高 DPI 多图 CUR。
- SVG 到不同尺寸采用同一设计缩放，尚未针对 32/48/64px 分别进行像素级光学修正。

## 后续升级方向

1. 为 32、48、64px 分别建立光学修正版，并生成多分辨率 CUR。
2. 增加完整指针角色（链接、文本、忙碌、调整大小）并统一材质语言。
3. 在独立实验分支探索桌面采样、实时折射与 Shader 动效，同时保留当前原生静态 CUR 作为轻量模式。
