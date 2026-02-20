# API 配置文档（2026-02-20）

本文档基于 `../backend/README.md` 与各子文档同步，描述当前前端项目 API 配置、端点清单和接入状态。

## 1. 基础配置

- 默认 API：`https://api.huanvae.cn`
- 默认 WebSocket：`wss://api.huanvae.cn`
- 覆盖方式：

```bash
NEXT_PUBLIC_API_URL=https://api.huanvae.cn
NEXT_PUBLIC_WS_URL=wss://api.huanvae.cn
```

实现位置：
- `/Users/i/Code/huanvae/frontend/src/lib/apiConfig.ts`

## 2. 前端 API 客户端总览

| 领域 | 客户端文件 |
| --- | --- |
| 通用鉴权与重试 | `/Users/i/Code/huanvae/frontend/src/api/apiClient.ts` |
| 认证 | `/Users/i/Code/huanvae/frontend/src/api/auth.ts` |
| 资料 | `/Users/i/Code/huanvae/frontend/src/api/profile.ts` |
| 好友 | `/Users/i/Code/huanvae/frontend/src/api/friends.ts` |
| 私聊消息 | `/Users/i/Code/huanvae/frontend/src/api/messages.ts` |
| 群聊管理 | `/Users/i/Code/huanvae/frontend/src/api/groups.ts` |
| 群消息 | `/Users/i/Code/huanvae/frontend/src/api/groupMessages.ts` |
| 文件存储 | `/Users/i/Code/huanvae/frontend/src/api/storage.ts` |
| WebRTC | `/Users/i/Code/huanvae/frontend/src/api/webrtc.ts` |
| 诊断 | `/Users/i/Code/huanvae/frontend/src/api/diagnostic.ts` |
| 低代码 | `/Users/i/Code/huanvae/frontend/src/api/lowcode.ts` |

统一导出：
- `/Users/i/Code/huanvae/frontend/src/api/index.ts`

## 3. 后端端点清单（同步版）

### 3.1 认证

| 方法 | 路径 |
| --- | --- |
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| POST | `/api/auth/refresh` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/devices` |
| DELETE | `/api/auth/devices/{id}` |

### 3.2 个人资料

| 方法 | 路径 |
| --- | --- |
| GET | `/api/profile` |
| PUT | `/api/profile` |
| PUT | `/api/profile/password` |
| POST | `/api/profile/avatar` |

### 3.3 好友

| 方法 | 路径 |
| --- | --- |
| POST | `/api/friends/requests` |
| GET | `/api/friends/requests/pending` |
| GET | `/api/friends/requests/sent` |
| POST | `/api/friends/requests/approve` |
| POST | `/api/friends/requests/reject` |
| GET | `/api/friends` |
| POST | `/api/friends/remove` |

### 3.4 私聊消息

| 方法 | 路径 |
| --- | --- |
| POST | `/api/messages` |
| GET | `/api/messages` |
| DELETE | `/api/messages/delete` |
| POST | `/api/messages/recall` |
| POST | `/api/messages/sync` |

### 3.5 群聊管理

| 方法 | 路径 |
| --- | --- |
| POST | `/api/groups` |
| GET | `/api/groups/my` |
| GET | `/api/groups/search` |
| GET | `/api/groups/{id}` |
| PUT | `/api/groups/{id}` |
| POST | `/api/groups/{id}/avatar` |
| PUT | `/api/groups/{id}/nickname` |
| DELETE | `/api/groups/{id}` |
| PUT | `/api/groups/{id}/join_mode` |
| GET | `/api/groups/{id}/members` |
| POST | `/api/groups/{id}/invite` |
| POST | `/api/groups/{id}/leave` |
| DELETE | `/api/groups/{id}/members/{uid}` |
| POST | `/api/groups/{id}/transfer` |
| POST | `/api/groups/{id}/admins` |
| DELETE | `/api/groups/{id}/admins/{uid}` |
| POST | `/api/groups/{id}/mute` |
| DELETE | `/api/groups/{id}/mute/{uid}` |
| POST | `/api/groups/{id}/invite_codes` |
| GET | `/api/groups/{id}/invite_codes` |
| DELETE | `/api/groups/{id}/invite_codes/{cid}` |
| POST | `/api/groups/join_by_code` |
| POST | `/api/groups/{id}/apply` |
| GET | `/api/groups/{id}/requests` |
| POST | `/api/groups/{id}/requests/{rid}/approve` |
| POST | `/api/groups/{id}/requests/{rid}/reject` |
| GET | `/api/groups/invitations` |
| POST | `/api/groups/invitations/{rid}/accept` |
| POST | `/api/groups/invitations/{rid}/decline` |
| POST | `/api/groups/{id}/notices` |
| GET | `/api/groups/{id}/notices` |
| PUT | `/api/groups/{id}/notices/{nid}` |
| DELETE | `/api/groups/{id}/notices/{nid}` |

### 3.6 群消息

| 方法 | 路径 |
| --- | --- |
| POST | `/api/group_messages` |
| GET | `/api/group_messages` |
| DELETE | `/api/group_messages/delete` |
| POST | `/api/group_messages/recall` |

### 3.7 文件存储

| 方法 | 路径 |
| --- | --- |
| POST | `/api/storage/upload/request` |
| POST | `/api/storage/upload/confirm` |
| GET | `/api/storage/file/{uuid}` |
| POST | `/api/storage/file/{uuid}/presigned_url` |
| POST | `/api/storage/file/{uuid}/presigned_url/extended` |
| GET | `/api/storage/files` |
| POST | `/api/storage/friends_file/{uuid}/presigned_url` |

### 3.8 WebRTC

| 方法 | 路径 |
| --- | --- |
| GET | `/api/webrtc/ice_servers` |
| POST | `/api/webrtc/rooms` |
| POST | `/api/webrtc/rooms/{room_id}/join` |
| WS | `/ws/webrtc/rooms/{room_id}?token=...` |

### 3.9 低代码

| 方法 | 路径 |
| --- | --- |
| GET | `/api/lowcode/operators` |
| GET | `/api/lowcode/operators/{id}` |
| POST | `/api/lowcode/workflows` |
| GET | `/api/lowcode/workflows` |
| GET | `/api/lowcode/workflows/{id}` |
| PUT | `/api/lowcode/workflows/{id}` |
| DELETE | `/api/lowcode/workflows/{id}` |
| POST | `/api/lowcode/workflows/{id}/validate` |
| GET | `/api/lowcode/workflows/{id}/export` |
| POST | `/api/lowcode/workflows/validate` |
| POST | `/api/lowcode/execute` |
| GET | `/api/lowcode/executions/{id}` |
| POST | `/api/lowcode/category_config` |
| GET | `/api/lowcode/category_config` |
| DELETE | `/api/lowcode/category_config` |
| POST | `/api/lowcode/category_config/validate` |
| GET | `/api/lowcode/category_config/operators` |
| POST | `/api/lowcode/workflow_config/execute` |
| POST | `/api/lowcode/workflow_config/validate` |
| POST | `/api/lowcode/workflow_config/import` |

### 3.10 诊断

| 方法 | 路径 |
| --- | --- |
| POST | `/api/diagnostic/report/friend-permission` |
| GET | `/api/admin/diagnostic/statistics` |
| GET | `/api/admin/diagnostic/error-logs` |
| GET | `/api/admin/diagnostic/reports` |
| GET | `/api/admin/diagnostic/reports/{id}` |
| PUT | `/api/admin/diagnostic/reports/{id}/status` |
| GET | `/api/admin/diagnostic/reports/{id}/file` |

## 4. 前端接入状态矩阵

| 领域 | 状态 | 说明 |
| --- | --- | --- |
| auth | 已接入 | 登录/注册/刷新/设备管理完整可用 |
| profile | 已接入 | 资料、密码、头像已接入 |
| friends | 已接入 | 请求、审批、删除、列表已接入 |
| messages | 已接入 | 普通消息 + `sync` 已接入 |
| groups | 已接入 | 大部分管理能力已有封装 |
| group_messages | 已接入 | 发送、查询、删除、撤回已接入 |
| storage | 已接入 | upload request/confirm + 预签名能力已接入 |
| webrtc | 已接入 | ICE/创建/加入/信令已接入 |
| diagnostic | 已接入 | 用户上报 + 管理员查询接口已封装 |
| lowcode | 新增接入 | 新增 `lowcodeApi` 完整基础封装 |

## 5. 与旧文档差异（重点）

- 群路由参数统一使用下划线命名：`join_mode`、`join_by_code`、`invite_codes`。
- 私聊消息新增 `POST /api/messages/sync`。
- 存储上传流程已明确为预签名直传 + `upload/confirm`。
- WebSocket 系统通知类型补齐：`group_info_updated`、`group_avatar_updated`。
- 新增低代码与管理员诊断接口到前端 API 层。

## 6. 维护规则

1. 以后端 `../backend/README.md` 为端点真值来源。
2. 每次新增后端接口需同时更新：
   - `src/api/*.ts`
   - `src/api/index.ts`
   - 本文档与 `docs/API_QUICK_REF.md`
3. 破坏性变更必须在 `docs/CHANGELOG.md` 标明影响范围。

