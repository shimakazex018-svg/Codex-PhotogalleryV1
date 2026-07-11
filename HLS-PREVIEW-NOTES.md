# 视频分段加载预研

当前项目默认继续使用普通 MP4 播放，并保留 HTTP Range。浏览器播放 MP4、拖动进度条时，会通过 Range 请求分段读取文件，不会要求一次性下载完整视频。

## 当前结论

- 普通视频继续使用 `/photos/...mp4`。
- 服务端已经支持 `Accept-Ranges: bytes` 和 `206 Partial Content`。
- 不在网站启动或刷新目录时自动转码 HLS，避免阻塞服务。
- HLS 只作为手动生成的可选方案。

## HLS 文件位置

默认目录：

```text
data\hls
```

可用环境变量覆盖：

```text
HLS_DIR=D:\gallery-hls
```

服务端会静态提供：

```text
/hls/<id>/index.m3u8
/hls/<id>/segment_00000.ts
```

## 手动生成 HLS

示例：

```powershell
.\make-hls.ps1 -VideoPath "E:\A_秀人\某模特\某作品\video.mp4"
```

如果没有设置 `FFMPEG_PATH`，脚本会尝试使用系统 PATH 里的 `ffmpeg`。

生成成功后脚本会输出：

```text
/hls/<id>/index.m3u8
```

## 后续接入方式

浏览器原生通常不能稳定播放 HLS，尤其是 Windows Chrome/Edge。正式接入前端时建议：

- 使用 `hls.js` 播放 `.m3u8`。
- 只对手动标记的大视频提供 HLS 播放入口。
- 普通 MP4 播放路径保持不变。

## 风险

- HLS 会额外占用磁盘空间。
- `-c copy` 不重新编码，速度快，但源视频编码如果不适合 HLS，兼容性可能有限。
- 需要更高兼容性时再使用转码参数，例如 H.264/AAC，但耗时和磁盘占用会明显增加。
