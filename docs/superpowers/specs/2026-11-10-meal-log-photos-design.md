# 饭局日志照片 V1 设计

## 目标

在现有“留话”功能中增加图片，支持家庭成员从手机相册选择或调用相机拍照，并在日志列表和详情中查看。

## 范围

### V1 包含

- 每顿饭最多 3 张照片。
- 支持相册选择和拍照。
- 选择后先在本地预览，可删除后再保存。
- 上传前尽量压缩，单张照片限制 2 MB。
- 照片保存在服务器本地数据目录，不接入 COS。
- 日志列表显示照片数量，日志详情显示缩略图。
- 删除照片或整顿饭时同步删除服务器文件。
- 仅已绑定且登录的家庭成员可以上传和查看。

### V1 不包含

- 视频。
- 图片说明文字或单独排序。
- 公开分享链接。
- 云端对象存储和 CDN。
- 多张原图、无损上传。

## 用户流程

1. 用户在日志页点击“留话”。
2. 进入“这顿留句话”页面，输入文字并选择照片。
3. 用户可以选择从相册选择、拍照或删除本地照片。
4. 点击保存后先保存文字日志，再上传照片。
5. 返回日志页，饭局卡片显示照片数量。
6. 点击“详情”可查看饭局菜品和照片缩略图。
7. 点击缩略图可全屏预览。

## 前端设计

保留日志页现有的“详情 / 留话 / 删”操作顺序：

- “留话”改为跳转到新页面 `pages/log-edit/log-edit`。
- 日志列表显示“有照片 N 张”。
- 月历饭局查询增加 `photo_count`，避免日志页逐顿额外请求。
- 详情底部面板新增照片区域。

新页面包含：

1. 饭局标题和日期。
2. 多行文字输入。
3. 已选照片缩略图网格。
4. “拍照”和“从相册选择”入口。
5. 每张本地照片右上角删除按钮。
6. “保存”按钮。

### 选图与压缩

- 使用 `uni.chooseImage`。
- `sourceType` 为 `['album', 'camera']`。
- `sizeType` 为 `['compressed']`。
- 根据剩余名额限制选择数量。
- 本地选择后检查文件大小；超过 2 MB 时使用 `uni.compressImage` 压缩。
- 压缩后仍超过 2 MB 的照片不允许上传，并提示用户重新选择。

### 上传方式

V1 使用 JSON + Base64 上传，避免引入 multipart 解析依赖：

```text
POST /meals/:id/log/photos
{
  "mimeType": "image/jpeg",
  "data": "<base64>"
}
```

限制：

- 每张解码后的原始数据不超过 2 MB。
- 单次上传请求体限制为 3 MB。
- 每顿饭最多 3 张。
- 只允许 `image/jpeg`、`image/png`、`image/webp`。
- 后端检查文件头，不能只相信前端 MIME。

## 后端设计

### 数据表 `meal_log_photo`

```sql
CREATE TABLE IF NOT EXISTS meal_log_photo (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_meal_log_photo_meal
ON meal_log_photo(meal_id);
```

### 文件存储

照片保存到：

```text
$DATA_DIR/uploads/log-photos/
```

文件名使用随机值，例如：

```text
<32-byte-random>.jpg
```

不使用原始文件名，避免路径穿越和隐私泄露。

### 接口

#### 获取照片列表

```text
GET /meals/:id/log/photos
```

返回照片元数据：

```json
{
  "ok": true,
  "data": {
    "photos": [
      {
        "id": "photo-id",
        "url": "/media/log-photos/random-file.jpg",
        "mimeType": "image/jpeg",
        "sizeBytes": 800000,
        "createdAt": "2026-11-10T00:00:00.000Z",
        "createdBy": "成员名"
      }
    ]
  }
}
```

#### 上传照片

```text
POST /meals/:id/log/photos
```

- 需要已登录成员。
- 校验 Base64、尺寸、MIME 文件头。
- 上传请求体超过 3 MB 时直接拒绝，不进入 Base64 解码。
- 保存文件后写入数据库。
- 如果数据库写入失败，删除刚保存的文件。

#### 删除照片

```text
DELETE /meals/:id/log/photos/:photoId
```

- 上传者本人或主厨可以删除。
- 删除数据库记录后删除文件。

#### 图片读取

```text
GET /media/log-photos/:fileName
```

- 仅允许读取 `$DATA_DIR/uploads/log-photos/` 下的随机文件名。
- 返回正确 `Content-Type`。
- 设置私有缓存头，不使用 public CDN 缓存。
- 文件名本身为不可预测随机值。

### 删除级联

- 删除单张照片：删除记录和对应文件。
- 删除整顿饭：
  - 先读取该饭局的所有照片文件名；
  - 删除照片记录；
  - 删除相册文件；
  - 删除菜谱引用和历史日志。

如果文件删除失败，数据库记录仍要清理，并记录服务端日志；不能因单张文件缺失阻塞整顿饭删除。

## 权限

- 所有已登录家庭成员可以查看照片和上传照片。
- 照片删除：上传者本人或主厨。
- 饭局删除：仅主厨，沿用现有权限。
- 成员必须登录后才能通过照片列表接口取得图片 URL。
- 图片文件读取不要求 Authorization，因为小程序 `<image>` 组件无法附加 Bearer Header；文件使用不可预测的随机文件名。

## 错误处理

- 超过 3 张：`PHOTO_LIMIT_EXCEEDED`
- 超过 2 MB：`PHOTO_TOO_LARGE`
- 不支持的类型：`PHOTO_TYPE_UNSUPPORTED`
- 文件头与 MIME 不符：`PHOTO_INVALID_CONTENT`
- 照片不存在：`PHOTO_NOT_FOUND`
- 上传失败时保留用户本地照片，允许重试。

## 测试

### 后端

- 上传合法 JPEG/PNG/WebP。
- 拒绝超过 2 MB 的图片。
- 拒绝伪造 MIME。
- 每顿饭第 4 张上传被拒绝。
- 获取照片列表返回正确 URL。
- 上传者本人可以删除照片。
- 其他家人不能删除非本人照片。
- 主厨可以删除任意照片。
- 删除饭局时照片记录和文件一起清理。

### 小程序

- 拍照和相册入口调用正确参数。
- 最多只能选择剩余名额。
- 超过 2 MB 时不进入上传队列。
- 本地照片可以删除。
- 上传失败时保留本地照片并显示错误。
- 日志列表显示照片数量。
- 详情显示照片缩略图并支持预览。

## 部署与兼容

- 现有 Docker 数据目录已挂载 `./data:/app/data`，照片可以随数据目录持久化。
- 需要确保 `data/uploads/log-photos` 可写。
- 备份脚本需要同时覆盖 SQLite 和上传目录。
- 微信小程序真机使用拍照/相册能力时，需要在微信公众平台完善隐私协议声明。


