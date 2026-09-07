# groups 模块迁移 · 批 2 报告（补写）

commit `8ee9115`（`fix(groups): 二十个形状不变的端点接入信封解包层`）。

> 本文件是补写的：上一位实现者声称写过，但仓库里从未存在过这个文件（其余
> 四批的报告都在，唯独这份不在）。以下内容全部由 `git show 8ee9115` 的实际
> diff 反推，不是誊抄提交信息——凡是 diff 里看不出依据的地方，都直接写"看
> 不出来"，不编理由。本次没有找到 `scratchpad/groups-plan.md`（提交信息与
> 代码注释引用过这份计划文档，但当前检出里不存在），所以"计划"相关的结论
> 全部是从 diff 里的 `⚠️` 注释反推，不是对照原始计划核实的。

## 1. 转换范围：20 个"形状不变"的方法

`groups.ts` 里改用 `readEnvelope` / `readEnvelopeList` / `assertEnvelopeOk`
（均来自 `@/lib/apiEnvelope`）的方法，按用到的解包方式分三组：

**`readEnvelopeList`（3 个，`data` 直接是数组或挂在一个字段上）**
- `getMyGroups` — 不传 `field`：`data` 本身就是 `MyGroup[]`（doc:113-129）。
- `getInvitations` — `field: 'invitations'`：`data` 是对象，数组挂在
  `invitations` 字段（doc:1146-1170）。
- `getNotices` — `field: 'notices'`：同上模式，数组挂在 `notices` 字段
  （doc:1416-1444）。

**`readEnvelope` + 专用 `Parser`（3 个，`data` 是对象、需要逐字段校验）**
- `getMembers` — `groupMembersResponse`：`data` 是 `{ members, total }`，
  `arr()` 校验 `members` 是数组，`num()` 校验 `total` 是数字。注释里说明
  为什么不能用 `readEnvelopeList`（拿不到同级的 `total`）也不能用
  `require: ['members','total']`（`require` 认 `null` 为"存在"，会把
  `TypeError` 推迟到调用点的 `.map()`）。
- `muteMember` — `muteMemberResponse`：`data` 是 `SuccessResponse` 之外还带
  `muted_until` 的对象；注释强调 `data.success` 不是信封的 `success`，
  不要顺手当判据读出来。
- `createNotice` — `createNoticeResponse`：`data` 是 `{ id, published_at }`，
  旧代码 `return result.data` 在 body 没有 `data` 时会静默 `resolve` 成
  `undefined`，新代码逐字段用 `str()` 校验，拿不到就抛。

**`assertEnvelopeOk`（14 个，纯粹的成功/失败判断，不消费 `data`）**
`updateGroup`、`updateGroupNickname`、`disbandGroup`、`leaveGroup`、
`removeMember`、`transferOwner`、`setAdmin`、`removeAdmin`、`unmuteMember`、
`approveJoinRequest`、`rejectJoinRequest`、`declineInvitation`、
`updateNotice`、`deleteNotice`。

3 + 3 + 14 = 20，和提交信息里的"二十个方法"对上。

## 2. 顺手修的一个真 bug

`getMembers` 旧代码：`data.total || members.length || 0`。`total` 传合法值
`0`（比如成员真的一个都没有）会被 `||` 短路成 `members.length`。新代码直接
用 `num()` 校验后的 `data.total`，不再猜。`groups.test.ts` 里有一条独立测试
专门钉住这一点（"total:0 是合法值，不能被 members.length 顶替——这是真 bug
不是风格问题"）。

## 3. 头像字段补基址（4 个）

在 api 出口用 `absoluteAvatar()`（`toAbsoluteApiUrl` 的本模块包装，`null`/
空串统一归一成 `null`）处理：
- `MyGroup.group_avatar_url`（`getMyGroups`）
- `GroupMember.user_avatar_url`（`getMembers`）
- `GroupInvitation.group_avatar_url`（`getInvitations`）
- `GroupInvitation.inviter_avatar_url`（`getInvitations`）——这个字段文档
  写了（doc:1183）但旧接口类型定义里根本没有这个字段，本批补上。

另外 `GroupMember.user_nickname` 从 `string` 改成 `string | null`——diff 里
标注这是"同文档同族推断"（本端点自己没有独立字段表，只有一份样例），不是
直接对着字段表证实的。

## 4. 非 api 层的改动

- **403 分诊**：`approveJoinRequest`/`rejectJoinRequest` 返回 403 时（
  `admin_can_approve=false`，管理员被拒），响应文案是通用"权限不足"，只能
  按状态码分诊，不能 match 文案。`GroupManagement.tsx` 新增
  `describeApprovalError()`，用 `err instanceof ApiError && err.status === 403`
  判断。
- **leaveGroup / disbandGroup 补 try/catch**：`GroupManagement.tsx` 里这两个
  `AlertDialogAction` 的 `onClick` 之前是裸调用，失败时弹窗静默关闭、没有
  任何反馈。本批补上 try/catch + toast。
- **六个吞异常调用点改三态**（loading / 空 / 失败），这是本批标题里说的
  "接入信封解包层"之外的另一条主线，也是本次补测试的对象：
  1. `GroupManagement.loadMembers` → `membersError`
  2. `GroupManagement.loadNotices` → `noticesError`
  3. `GroupManagement.loadJoinRequests` → `requestsError`
  4. `GroupList.loadInvitations` → `invitesError`（本次提交自带 3 个测试，
     见 `GroupList.test.tsx`）
  5-6. `groupStore.selectGroup` 里两处 `.catch(console.error)` 改成
     `.catch(() => {})`，依赖 `loadGroupMembers`/`loadGroupNotices` 把失败
     写进新增的 `selectionError` 字段并 rethrow，由 `GroupList.tsx` 的
     `useEffect` 消费成 toast（`selectionError` 不复用共享的 `error`，
     因为 `error` 被 `createGroup`/`searchGroups`/`updateGroup` 共用，
     两边都消费会对同一次失败弹两次 toast——注释原话）。

## 5. 明确不动的 9 个方法，以及"计划外发现"的三处

diff 里每个跳过的方法都有 `⚠️` 注释说明原因，可以分两类：

**纯粹的批次边界（6 个，"这是下一批的活"）**
- `createGroup`、`getGroupDetail` — 批 3（`join_mode` 要整体换成
  `join_approval_required` + 八字段策略）
- `inviteMembers` — 批 4（`results[]` 逐条结果要落地到 UI）
- `applyToJoin` — 批 4（`source` 改必填，`data` 换成
  `ApplyJoinResponse{status,message}`）
- `acceptInvitation` — 批 4（accept 后是否真入群要看目标群的
  `join_approval_required`，属于调用点语义改动）
- `getJoinRequests` — 批 4（全模块唯一没有响应样例的列表端点，文档里
  `invitations`/`notices`/`my` 三个先例形状互相矛盾，类比推不出真实形状，
  留到批 4 先打一次真实请求钉住形状）

**端点已被后端删除（3 个，与"批次边界"性质不同）**
这三个不是"轮不到这一批改"，而是**目标端点在实现期间被发现已经不存在**：
- `searchGroups` — 该端点已于 2026-08-17 整套删除，替代端点在 discovery
  模块（批 6）
- `uploadGroupAvatar` — 该端点已于 2026-08-28 删除，群头像改走 storage
  统一预签名分片直传（批 5）
- `updateJoinMode` — 该端点已于 2026-08-17 整套删除（migration 043），
  批 3 换成 `updateJoinPolicy` → `PUT /{id}/join-policy`

如果最初的批次计划是按"20 个形状不变端点 + 若干条形状变了的"划的清单，
这三个很可能是原计划里"形状不变、这批该转"的候选，实现时才发现端点已经
不存在，只能延后给替换它们的那一批直接处理。**这个推断本身没有
`scratchpad/groups-plan.md` 可以对照**（当前检出里没有这份文件），是从
diff 把这 3 处和另外 6 处"批次边界"注释分开归类得出的，仅供参考。

## 6. 提交信息里报告的变异测试

提交信息原话："变异测试验证：还原猜测链、去掉头像补基址、去掉
`assertEnvelopeOk` 均导致对应测试失败。"字面上点名了三类：

1. 还原五路猜测链（如 `getMyGroups` 的
   `result.data?.groups || result.data || result.groups || result || []`）
2. 去掉头像补基址（`absoluteAvatar()` 那 4 个字段）
3. 去掉 `assertEnvelopeOk`

`groups.test.ts` 里还有第 4 类有专门测试但 commit 正文没点名的："total:0 是
合法值，不能被 `members.length` 顶替"这条——从测试标题和内容看，这明显是
配套一次"还原 `data.total || members.length || 0`"的变异探针写的，但由于
`scratchpad/groups-plan.md` 不在当前检出里，**我无法确认原作者是否真的对
这条也跑过变异测试**，只能说测试本身存在且命中了这个具体 bug。

## 7. 发现的一处 diff 自相矛盾

`groups.test.ts` 里 `describe('groupsApi 的 11 个"档 A" void 端点：
assertEnvelopeOk', ...)` 这个 describe 标题写的是 **11 个**，但它内部的
`cases` 数组实际列了 **14 个**（`updateGroup`、`updateGroupNickname`、
`disbandGroup`、`leaveGroup`、`removeMember`、`transferOwner`、`setAdmin`、
`removeAdmin`、`unmuteMember`、`approveJoinRequest`、`rejectJoinRequest`、
`declineInvitation`、`updateNotice`、`deleteNotice`），每个跑 3 条子测试，
14×3=42。这个数字（14）也和本报告第 1 节里数出的"用 `assertEnvelopeOk`
的方法数"完全一致。看起来是 describe 标题在中途加了 3 个 case 之后没有
跟着改，字面意思上不影响测试正确性（`for` 循环按数组实际长度生成用例），
纯粹是标题文本和内容不符，记录在这里以免以后被这句话误导。

另外，本次补测试的过程中还发现同一份检出里**没有找到"其余四批"的报告
文件**（任务描述里提到"其余四批的报告都在"）——`scratchpad/` 目录在补写
本报告之前根本不存在，`git log --all` 里也从未有任何 `scratchpad/*` 文件
被提交过。不确定这是本仓库的正常情况（报告本来就是 gitignore 掉、只存在
于原作者本机）还是环境差异，如实记录，不代表本报告内容有误。

## 8. 本次关闭的测试缺口

批 2 把"六个吞异常调用点"改成了三态渲染，但截至本次工作开始，六个里只有
`GroupList.loadInvitations` 有测试（`GroupList.test.tsx` 的 3 个用例）。
本次新增：

- `src/features/chat/components/sidebar/__tests__/GroupManagement.test.tsx`
  （新文件，12 个用例）：`loadMembers`/`loadNotices`/`loadJoinRequests`
  三个调用点，每个覆盖 loading / 失败 / 真空 / 成功四种状态，核心断言是
  "失败态绝不能渲染成和空态一样的文案"。
- `src/features/chat/components/sidebar/__tests__/GroupList.test.tsx`
  （追加 2 个用例）：`groupStore.selectGroup` 失败 → `selectionError` →
  `useEffect` 消费成 toast 这条链路，断言 toast 只弹一次、
  `clearSelectionError` 被调用、连续两次独立失败各弹一次而不是被"吃掉"。

全部通过 mock `groupStore`/`groupsApi` 调用边界（不 mock 到信封解包内部）
的方式驱动，遵循 `GroupList.test.tsx` 既有的测试纪律。5 处变异探针（删
`setMembersError`、删 `setNoticesError`、把 `requestsError` 的三态渲染折叠
成两态、删 `clearSelectionError()` 调用、从 `useEffect` 依赖数组去掉
`selectionError`）逐一验证：新增测试在探针存在时全部转红，探针撤销后恢复
全绿。Vitest 总数 272 → 286（新增 14 个）。

## 9. 本次工作中发现但未修的问题（超出批 2 范围）

`GroupManagement.tsx` 挂载时的 `useEffect(() => { loadGroupInfo(); loadMembers();
loadNotices(); if (isAdmin) loadJoinRequests() }, [groupId])`
（这段代码不在 8ee9115 的 diff 里，是更早就存在的）：`isAdmin` 在这个
effect 闭包里取的是**挂载那一刻**的值，而挂载时 `members` 必然是空数组
（`getMembers` 还没返回），所以 `isAdmin` 恒为 `false`——`loadJoinRequests()`
在正常使用中永远不会被这个 effect 自动调用，无论真实用户是不是管理员。
唯一能触发它的是"加入申请"面板里手动点击的"刷新"按钮（本次
`requestsError` 三个测试就是靠点这个按钮触发的，没有依赖挂载时的自动
加载）。这看起来是一个真实的产品 bug（管理员打开加入申请标签页时列表
不会自动加载），但不属于批 2 改动范围，未做修改，如实报告。
