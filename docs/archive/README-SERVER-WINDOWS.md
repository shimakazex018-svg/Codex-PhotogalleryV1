# Windows 11 服务器迁移说明

## 1. 复制整个文件夹

把整个 `photo-gallery-site` 文件夹复制到服务器指定目录，例如：

```text
<deployment-root>
```

不要只复制网页文件，必须保留这些内容：

```text
photo-gallery-site
├─ server.js
├─ index.html
├─ app.js
├─ styles.css
├─ data
└─ photos
```

## 2. 安装 Node.js

服务器需要安装 Node.js。安装后打开命令行，输入：

```cmd
node -v
```

能显示版本号就可以。

## 3. 设置图片来源

默认图片来源是当前网站目录里的：

```text
photo-gallery-site\photos
```

如果你要把图片放在别的磁盘，例如：

```text
<media-root>
```

打开 `start-server-48101.cmd`，修改这一行：

```cmd
set "PHOTOS_DIR=%~dp0photos"
```

改成：

```cmd
set "PHOTOS_DIR=<media-root>"
```

图片目录结构仍然保持：

```text
<media-root>
└─ 模特名
   ├─ cover.jpg
   └─ 作品标题
      ├─ cover.jpg
      ├─ 001.jpg
      └─ video.mp4
```

## 4. 端口号

服务器端口已经在 `start-server-48101.cmd` 里设置为：

```cmd
set "PORT=48101"
```

启动后访问：

```text
http://服务器IP:48101
```

如果只在服务器本机访问，也可以用：

```text
http://localhost:48101
```

## 5. 启动网站

双击运行：

```text
start-server-48101.cmd
```

注意：这个窗口不能关闭。关闭后网站会停止。

## 6. 设置开机自动启动

推荐使用 Windows 任务计划程序：

1. 打开“任务计划程序”。
2. 点击“创建基本任务”。
3. 名称填写：`Photo Gallery Site`。
4. 触发器选择：“计算机启动时”或“用户登录时”。
5. 操作选择：“启动程序”。
6. 程序选择：`start-server-48101.cmd`。
7. 起始于填写网站目录，例如：

```text
<deployment-root>
```

保存后，服务器开机或登录时会自动启动网站。

## 7. 防火墙

如果其它电脑要访问：

```text
http://服务器IP:48101
```

需要在 Windows 防火墙里放行 TCP 端口 `48101`。

## 8. 可配置项

`server.js` 支持这些环境变量：

```text
PORT       网站端口，默认 5177
HOST       监听地址，默认 0.0.0.0
PHOTOS_DIR 图片来源目录，默认 ./photos
DATA_DIR   数据文件目录，默认 ./data
HLS_DIR    HLS 分段文件目录，默认 ./data/hls
FFMPEG_PATH ffmpeg 路径，用于视频封面、缩略图和手动 HLS 生成
FFPROBE_PATH ffprobe 路径，用于读取视频时长、分辨率和编码
```

一般只需要改 `start-server-48101.cmd`，不需要改 `server.js`。
