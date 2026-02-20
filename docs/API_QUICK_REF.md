# API 快速参考（2026 版）

基于后端文档 `../backend/README.md` 与各模块文档同步整理。

## 基础配置

```ts
const API_BASE = 'https://api.huanvae.cn'
const WS_BASE = 'wss://api.huanvae.cn'
```

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/refresh` | 刷新 Token |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/devices` | 设备列表 |
| DELETE | `/api/auth/devices/{id}` | 删除设备 |

## 个人资料

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/profile` | 获取资料 |
| PUT | `/api/profile` | 更新资料 |
| PUT | `/api/profile/password` | 修改密码 |
| POST | `/api/profile/avatar` | 上传头像 |

## 好友

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/friends/requests` | 发送好友请求 |
| GET | `/api/friends/requests/pending` | 待处理请求 |
| GET | `/api/friends/requests/sent` | 已发送请求 |
| POST | `/api/friends/requests/approve` | 同意请求 |
| POST | `/api/friends/requests/reject` | 拒绝请求 |
| GET | `/api/friends` | 好友列表 |
| POST | `/api/friends/remove` | 删除好友 |

## 私聊消息

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/messages` | 发送消息 |
| GET | `/api/messages` | 查询消息（`before_time` 分页） |
| DELETE | `/api/messages/delete` | 删除消息（个人） |
| POST | `/api/messages/recall` | 撤回消息 |
| POST | `/api/messages/sync` | 批量增量同步 |

## 群聊管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/groups` | 创建群聊 |
| GET | `/api/groups/my` | 我的群聊 |
| GET | `/api/groups/search` | 搜索群聊 |
| GET | `/api/groups/{id}` | 群详情 |
| PUT | `/api/groups/{id}` | 更新群信息 |
| POST | `/api/groups/{id}/avatar` | 上传群头像 |
| PUT | `/api/groups/{id}/nickname` | 群昵称 |
| DELETE | `/api/groups/{id}` | 解散群聊 |
| PUT | `/api/groups/{id}/join_mode` | 入群模式 |
| GET | `/api/groups/{id}/members` | 成员列表 |
| POST | `/api/groups/{id}/invite` | 邀请成员 |
| POST | `/api/groups/{id}/leave` | 退出群聊 |
| DELETE | `/api/groups/{id}/members/{uid}` | 移除成员 |
| POST | `/api/groups/{id}/transfer` | 转让群主 |
| POST | `/api/groups/{id}/admins` | 设置管理员 |
| DELETE | `/api/groups/{id}/admins/{uid}` | 取消管理员 |
| POST | `/api/groups/{id}/mute` | 禁言 |
| DELETE | `/api/groups/{id}/mute/{uid}` | 解除禁言 |
| POST | `/api/groups/{id}/invite_codes` | 生成邀请码 |
| GET | `/api/groups/{id}/invite_codes` | 邀请码列表 |
| DELETE | `/api/groups/{id}/invite_codes/{cid}` | 撤销邀请码 |
| POST | `/api/groups/join_by_code` | 邀请码入群 |
| POST | `/api/groups/{id}/apply` | 申请入群 |
| GET | `/api/groups/{id}/requests` | 入群申请列表 |
| POST | `/api/groups/{id}/requests/{rid}/approve` | 同意申请 |
| POST | `/api/groups/{id}/requests/{rid}/reject` | 拒绝申请 |
| GET | `/api/groups/invitations` | 收到的邀请 |
| POST | `/api/groups/invitations/{rid}/accept` | 接受邀请 |
| POST | `/api/groups/invitations/{rid}/decline` | 拒绝邀请 |
| POST | `/api/groups/{id}/notices` | 发布公告 |
| GET | `/api/groups/{id}/notices` | 公告列表 |
| PUT | `/api/groups/{id}/notices/{nid}` | 更新公告 |
| DELETE | `/api/groups/{id}/notices/{nid}` | 删除公告 |

## 群消息

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/group_messages` | 发送群消息 |
| GET | `/api/group_messages` | 查询群消息（`before_time` 分页） |
| DELETE | `/api/group_messages/delete` | 删除消息（个人） |
| POST | `/api/group_messages/recall` | 撤回消息 |

## 文件存储

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/storage/upload/request` | 请求上传 |
| POST | `/api/storage/upload/confirm` | 上传确认 |
| GET | `/api/storage/file/{uuid}` | UUID 访问文件 |
| POST | `/api/storage/file/{uuid}/presigned_url` | 预签名 URL |
| POST | `/api/storage/file/{uuid}/presigned_url/extended` | 扩展预签名 URL |
| GET | `/api/storage/files` | 文件列表 |
| POST | `/api/storage/friends_file/{uuid}/presigned_url` | 好友文件预签名 URL |

## WebRTC

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/webrtc/ice_servers` | 获取 ICE 服务器 |
| POST | `/api/webrtc/rooms` | 创建房间（需登录） |
| POST | `/api/webrtc/rooms/{room_id}/join` | 加入房间（可匿名） |
| WS | `/ws/webrtc/rooms/{room_id}?token=...` | WebRTC 信令 |

## 低代码

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/lowcode/operators` | 算子列表（公开） |
| GET | `/api/lowcode/operators/{id}` | 算子详情（公开） |
| POST | `/api/lowcode/workflows` | 创建流程 |
| GET | `/api/lowcode/workflows` | 流程列表 |
| GET | `/api/lowcode/workflows/{id}` | 流程详情 |
| PUT | `/api/lowcode/workflows/{id}` | 更新流程 |
| DELETE | `/api/lowcode/workflows/{id}` | 删除流程 |
| POST | `/api/lowcode/workflows/{id}/validate` | 校验流程 |
| GET | `/api/lowcode/workflows/{id}/export` | 导出流程 |
| POST | `/api/lowcode/workflows/validate` | 校验流程定义 |
| POST | `/api/lowcode/execute` | 执行流程 |
| GET | `/api/lowcode/executions/{id}` | 执行结果 |
| POST | `/api/lowcode/category_config` | 保存分类配置 |
| GET | `/api/lowcode/category_config` | 获取分类配置 |
| DELETE | `/api/lowcode/category_config` | 删除分类配置 |
| POST | `/api/lowcode/category_config/validate` | 校验分类配置 |
| GET | `/api/lowcode/category_config/operators` | 可分类算子 |
| POST | `/api/lowcode/workflow_config/execute` | 执行配置文件 |
| POST | `/api/lowcode/workflow_config/validate` | 校验配置文件 |
| POST | `/api/lowcode/workflow_config/import` | 导入配置文件 |

## 诊断（管理员）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/diagnostic/report/friend-permission` | 客户端上报好友文件权限错误 |
| GET | `/api/admin/diagnostic/statistics` | 统计信息 |
| GET | `/api/admin/diagnostic/error-logs` | 错误日志列表 |
| GET | `/api/admin/diagnostic/reports` | 诊断报告列表 |
| GET | `/api/admin/diagnostic/reports/{id}` | 诊断报告详情 |
| PUT | `/api/admin/diagnostic/reports/{id}/status` | 更新报告状态 |
| GET | `/api/admin/diagnostic/reports/{id}/file` | 原始诊断 JSON |

## 关键更新说明

- 私聊消息新增 `POST /api/messages/sync` 批量增量同步。
- 群系统使用下划线路径：`join_mode`、`join_by_code`、`invite_codes`。
- 文件上传采用预签名直传 + `upload/confirm`。
- WebSocket 系统通知已扩展到群管理事件（含禁言、管理员、群信息更新等）。
- 低代码平台端点已纳入前端 API 层。

**最后同步**：2026-02-20
