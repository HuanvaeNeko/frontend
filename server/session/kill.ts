import { closeSessionSockets } from '../ws/registry'
import type { SessionStore } from './store'

/**
 * 会话死亡的唯一出口：删行 + 关掉该会话名下所有 WS（code 1000）。
 *
 * 登出、非业务 401、刷新时上游 401（SessionDead）三处都走这里。分成两步各自
 * 调用的话，日后一定有一处只做一半——浏览器那条 /ws 还开着、界面显示「已连接」，
 * 而用户实际已被登出（spec §4.4 第 3/6 步、§4.6）。
 */
export function killSession(store: SessionStore, id: string): void {
  store.delete(id)
  closeSessionSockets(id)
}
