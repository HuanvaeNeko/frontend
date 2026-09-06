import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  ApiShapeError,
  assertEnvelopeOk,
  isAuthApiError,
  readEnvelope,
  readEnvelopeList,
  setApiShapeErrorReporter,
  unwrapEnvelope,
} from '../apiEnvelope'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** 捕获 rejection 而不吞掉类型信息；断言用。 */
const reject = async (promise: Promise<unknown>): Promise<ApiError> => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  if (!(error instanceof ApiError)) {
    throw new Error(`期望抛出 ApiError，实际是 ${String(error)}`)
  }
  return error
}

interface Devices {
  devices: { device_id: string }[]
}

// 所有用例默认静音上报器，避免 console 噪音；单独验证上报的用例自己覆盖。
beforeEach(() => setApiShapeErrorReporter(() => {}))

describe('readEnvelope —— 解包', () => {
  it('剥掉信封返回 data 本身，而不是整个信封', async () => {
    const res = json({ success: true, code: 0, data: { devices: [{ device_id: 'a' }] } })
    const data = await readEnvelope<Devices>(res, { endpoint: 'GET /devices', require: ['devices'] })
    expect(data).toEqual({ devices: [{ device_id: 'a' }] })
    // 回归护栏：返回信封而不是 data 时，下面这条会挂
    expect(data).not.toHaveProperty('success')
    expect(data).not.toHaveProperty('data')
  })

  it('data 为 null 与「没有 data 键」是两条不同的错误信息', async () => {
    // 前者是"后端合法地返回空"，后者是"前端解析错了地方"。
    // `json.data ?? json` 式的兜底会把这两件事压成同一种表现——正是要修的 bug。
    const emptyData = await reject(
      readEnvelope(json({ success: true, code: 0, data: null }), { endpoint: 'GET /x' }),
    )
    const missingData = await reject(
      readEnvelope(json({ success: true, code: 0, friends: [] }), { endpoint: 'GET /x' }),
    )

    expect(emptyData.message).toMatch(/data 为空/)
    expect(missingData.message).toMatch(/响应缺少 data 字段（收到的键：success, code, friends）/)
    expect(emptyData.message).not.toBe(missingData.message)
    expect(emptyData).toBeInstanceOf(ApiShapeError)
    expect(missingData).toBeInstanceOf(ApiShapeError)
  })

  it('缺 data 字段时抛错，而不是静默返回 undefined 被 `|| []` 吞掉', async () => {
    const res = json({ devices: [{ device_id: 'a' }] }) // 信封化之前的裸响应
    await expect(readEnvelope<Devices>(res, { endpoint: 'GET /devices' })).rejects.toBeInstanceOf(
      ApiShapeError,
    )
  })

  it('形状错误会被上报，即使调用点 catch 掉了', async () => {
    const reporter = vi.fn()
    setApiShapeErrorReporter(reporter)
    await readEnvelope(json({ nope: 1 }), { endpoint: 'GET /x' }).catch(() => null)
    expect(reporter).toHaveBeenCalledOnce()
    expect(reporter.mock.calls[0]?.[0]).toBeInstanceOf(ApiShapeError)
    expect(reporter.mock.calls[0]?.[0].endpoint).toBe('GET /x')
  })

  it('响应体不是 JSON 但 HTTP 成功时也抛形状错误', async () => {
    const res = new Response('not json at all', { status: 200 })
    await expect(readEnvelope(res, { endpoint: 'GET /x' })).rejects.toThrow(/响应不是 JSON 对象/)
  })

  it('下限档：不传 parse / require 时，标量 data 仍要报错', async () => {
    const res = json({ success: true, data: 42 })
    await expect(readEnvelope(res, { endpoint: 'GET /x' })).rejects.toThrow(
      /data 应为对象或数组，实际是 number/,
    )
  })
})

describe('readEnvelope —— require 运行时校验', () => {
  it('data 里缺必需字段时抛错，并列出实际收到的键', async () => {
    const res = json({ success: true, code: 0, data: { total: 3 } })
    await expect(
      readEnvelope<Devices>(res, { endpoint: 'GET /devices', require: ['devices'] }),
    ).rejects.toThrow(/缺少字段 devices（收到的键：total）/)
  })

  it('字段值为 null 算存在，为 undefined 算缺失', async () => {
    // null 是后端合法的"这个字段没有值"，不该被当成形状漂移
    await expect(
      readEnvelope<{ avatar_url: string | null }>(json({ success: true, data: { avatar_url: null } }), {
        endpoint: 'GET /x',
        require: ['avatar_url'],
      }),
    ).resolves.toEqual({ avatar_url: null })
  })

  it('require 下 data 不是对象时报出实际类型', async () => {
    const res = json({ success: true, data: [1, 2] })
    await expect(
      readEnvelope<Devices>(res, { endpoint: 'GET /x', require: ['devices'] }),
    ).rejects.toThrow(/data 应为对象，实际是 array/)
  })

  it('parse 档：校验器抛错时转成形状错误', async () => {
    const parser = {
      parse(input: unknown) {
        if (!input || typeof input !== 'object' || !('id' in input)) throw new Error('缺 id')
        return input as { id: string }
      },
    }
    await expect(
      readEnvelope(json({ success: true, data: { nope: 1 } }), { endpoint: 'GET /x', parse: parser }),
    ).rejects.toThrow(/data 校验失败 - 缺 id/)
    await expect(
      readEnvelope(json({ success: true, data: { id: 'a' } }), { endpoint: 'GET /x', parse: parser }),
    ).resolves.toEqual({ id: 'a' })
  })
})

describe('readEnvelope —— 失败分支', () => {
  it('HTTP 200 但 success:false 也算失败', async () => {
    const res = json({ success: false, code: 40001, message: '好友不存在' })
    const error = await reject(readEnvelope(res, { endpoint: 'POST /x' }))
    expect(error.message).toBe('好友不存在')
    expect(error.status).toBe(200)
    expect(error).not.toBeInstanceOf(ApiShapeError) // 是业务失败，不是形状漂移
  })

  it('错误文案取值顺序：message → error → details → HTTP 片段', async () => {
    const at = async (body: unknown, status = 500) =>
      (await reject(readEnvelope(json(body, status), { endpoint: 'GET /x', fallbackMessage: '失败' })))
        .message

    // 1. message 压过 error
    expect(await at({ message: 'M', error: 'E' })).toBe('M')
    // 2. 没有 message 时用 error
    expect(await at({ error: 'E' })).toBe('E')
    // 3. details 拼在后面，不覆盖前两者
    expect(await at({ message: 'M', details: { field: 'user_id' } })).toBe('M: {"field":"user_id"}')
    // 4. 只有 details 时，它也要出现在文案里——不能跳过它直接落到 HTTP 片段
    expect(await at({ details: { field: 'user_id' } })).toBe('失败: {"field":"user_id"}')
    // 5. 什么都没有才落到 HTTP + 响应体
    expect(await at({})).toBe('失败 (HTTP 500): {}')
  })

  it('非 JSON 错误响应（网关 HTML 页）保留响应体前 200 字符', async () => {
    const body = `<html>${'A'.repeat(400)}</html>`
    const res = new Response(body, { status: 502 })
    const error = await reject(
      readEnvelope(res, { endpoint: 'GET /x', fallbackMessage: '获取分片URL失败' }),
    )
    const snippet = body.slice(0, 200)
    expect(snippet).toHaveLength(200)
    expect(error.message).toBe(`获取分片URL失败 (HTTP 502): ${snippet}`)
    expect(error.message).not.toContain('</html>') // 确实截断了，不是整页塞进来
    expect(error.status).toBe(502)
  })

  it('空 body 的错误响应给出 HTTP 状态而不是空文案', async () => {
    const error = await reject(
      readEnvelope(new Response(null, { status: 504 }), {
        endpoint: 'GET /x',
        fallbackMessage: '超时',
      }),
    )
    expect(error.message).toBe('超时 (HTTP 504)')
  })

  it('status / code 保留在 ApiError 上供调用点分诊（storage 的 409 重开会话）', async () => {
    const error = await reject(
      readEnvelope(json({ success: false, code: 40901, message: '上传会话已失效' }, 409), {
        endpoint: 'POST /confirm',
      }),
    )
    expect(error.status).toBe(409)
    expect(error.code).toBe(40901)
    expect(error.endpoint).toBe('POST /confirm')
  })
})

describe('readEnvelope —— body 只读一次', () => {
  /** 带 spy 的假 Response：一旦实现里多写一次 .json() / .text()，这里立刻挂。 */
  const spied = (body: string, status: number) => {
    const text = vi.fn(() => Promise.resolve(body))
    const jsonFn = vi.fn(() => Promise.reject(new Error('实现不应调用 response.json()')))
    return {
      response: { ok: status >= 200 && status < 300, status, text, json: jsonFn } as unknown as Response,
      text,
      jsonFn,
    }
  }

  it('成功分支只读一次 body', async () => {
    const { response, text, jsonFn } = spied(JSON.stringify({ success: true, data: { a: 1 } }), 200)
    await readEnvelope(response, { endpoint: 'GET /x' })
    expect(text).toHaveBeenCalledTimes(1)
    expect(jsonFn).not.toHaveBeenCalled()
  })

  it('失败分支也只读一次 body —— 历史上这里是 `body stream already read` 的现场', async () => {
    const { response, text, jsonFn } = spied(JSON.stringify({ success: false, message: 'boom' }), 400)
    await expect(readEnvelope(response, { endpoint: 'GET /x' })).rejects.toThrow('boom')
    expect(text).toHaveBeenCalledTimes(1)
    expect(jsonFn).not.toHaveBeenCalled()
  })

  it('形状错误分支也只读一次 body', async () => {
    const { response, text, jsonFn } = spied(JSON.stringify({ friends: [] }), 200)
    await expect(readEnvelope(response, { endpoint: 'GET /x' })).rejects.toBeInstanceOf(ApiShapeError)
    expect(text).toHaveBeenCalledTimes(1)
    expect(jsonFn).not.toHaveBeenCalled()
  })

  it('真实 Response 上失败分支不会二次消费 stream', async () => {
    const res = json({ success: false, message: 'boom' }, 400)
    await expect(readEnvelope(res, { endpoint: 'GET /x' })).rejects.toThrow('boom')
    expect(res.bodyUsed).toBe(true)
  })
})

describe('readEnvelope —— legacyBare 逃生口', () => {
  it('显式开启时才接受裸响应，并且每次命中都打警告', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = await readEnvelope<Devices>(json({ devices: [] }), {
      endpoint: 'GET /devices',
      legacyBare: { until: '2026-12-31', reason: '端点尚未迁移' },
    })
    expect(data.devices).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('2026-12-31')
    expect(warn.mock.calls[0]?.[0]).toContain('端点尚未迁移')
    warn.mockRestore()
  })

  it('默认关闭：不传 legacyBare 时裸响应照样抛错', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      readEnvelope<Devices>(json({ devices: [] }), { endpoint: 'GET /devices' }),
    ).rejects.toBeInstanceOf(ApiShapeError)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('legacyBare 不影响信封已存在时的解包（有 data 就走 data）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = await readEnvelope<Devices>(json({ success: true, data: { devices: [] } }), {
      endpoint: 'GET /devices',
      legacyBare: { until: '2026-12-31', reason: '端点尚未迁移' },
    })
    expect(data).toEqual({ devices: [] })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('readEnvelopeList', () => {
  it('取出 data 下的数组字段', async () => {
    const res = json({ success: true, code: 0, data: { friends: [{ friend_id: 'a' }] } })
    const list = await readEnvelopeList<{ friend_id: string }>(res, {
      endpoint: 'GET /api/friends',
      field: 'friends',
    })
    expect(list).toEqual([{ friend_id: 'a' }])
  })

  it('field 不传时要求 data 本身就是数组', async () => {
    const res = json({ success: true, data: [1, 2, 3] })
    await expect(readEnvelopeList<number>(res, { endpoint: 'GET /x' })).resolves.toEqual([1, 2, 3])
  })

  it('字段不存在时抛错，绝不退化成 []', async () => {
    // 历史写法 `data.friends || data || []` 对这个响应稳定返回 []，UI 显示"暂无好友"
    const res = json({ success: true, code: 0, data: { items: [] } })
    await expect(
      readEnvelopeList(res, { endpoint: 'GET /api/friends', field: 'friends' }),
    ).rejects.toThrow(/data\.friends 应为数组（收到的键：items）/)
  })

  it('空数组是合法数据，不报错', async () => {
    const res = json({ success: true, data: { friends: [] } })
    await expect(
      readEnvelopeList(res, { endpoint: 'GET /api/friends', field: 'friends' }),
    ).resolves.toEqual([])
  })
})

describe('assertEnvelopeOk', () => {
  it('空 body 的 204 视为成功', async () => {
    await expect(
      assertEnvelopeOk(new Response(null, { status: 204 }), { endpoint: 'DELETE /x' }),
    ).resolves.toBeUndefined()
  })

  it('有信封但没有 data 的 200 也算成功（void 端点不要求 data）', async () => {
    await expect(
      assertEnvelopeOk(json({ success: true, code: 0 }), { endpoint: 'POST /x' }),
    ).resolves.toBeUndefined()
  })

  it('HTTP 200 + success:false 仍算失败', async () => {
    await expect(
      assertEnvelopeOk(json({ success: false, message: '已经是好友' }), { endpoint: 'POST /x' }),
    ).rejects.toThrow('已经是好友')
  })

  it('失败时抛出带状态码的 ApiError', async () => {
    const error = await reject(
      assertEnvelopeOk(json({ success: false, error: '没有权限' }, 403), { endpoint: 'DELETE /x' }),
    )
    expect(error.message).toBe('没有权限')
    expect(error.status).toBe(403)
  })
})

describe('unwrapEnvelope（FormData / WebSocket 已解析 JSON）', () => {
  it('剥信封并做 require 校验', () => {
    expect(
      unwrapEnvelope<{ file_url: string }>(
        { success: true, code: 0, data: { file_url: '/api/storage/file/a' } },
        { endpoint: 'WS message', require: ['file_url'] },
      ),
    ).toEqual({ file_url: '/api/storage/file/a' })
  })

  it('缺 data 键与 data 为 null 同样是两条不同信息', () => {
    const missing = (() => {
      try {
        unwrapEnvelope({ success: true, file_url: 'x' }, { endpoint: 'WS message' })
      } catch (e) {
        return (e as Error).message
      }
    })()
    const empty = (() => {
      try {
        unwrapEnvelope({ success: true, data: null }, { endpoint: 'WS message' })
      } catch (e) {
        return (e as Error).message
      }
    })()
    expect(missing).toMatch(/响应缺少 data 字段/)
    expect(empty).toMatch(/data 为空/)
    expect(missing).not.toBe(empty)
  })

  it('require 下 data 不是对象时抛错，不再静默放行', () => {
    // 回归护栏：旧实现写的是 `require && isRecord(payload)`，非对象直接跳过校验
    expect(() =>
      unwrapEnvelope<{ id: string }>(
        { success: true, data: 'not-an-object' },
        { endpoint: 'WS message', require: ['id'] },
      ),
    ).toThrow(/data 应为对象，实际是 string/)
  })

  it('success:false 抛 ApiError 而不是形状错误', () => {
    try {
      unwrapEnvelope({ success: false, message: '推送失败' }, { endpoint: 'WS message' })
      throw new Error('应该抛错')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect(e).not.toBeInstanceOf(ApiShapeError)
      expect((e as ApiError).message).toBe('推送失败')
    }
  })
})

describe('isAuthApiError', () => {
  it('401 / 403 的 ApiError 为真', () => {
    expect(isAuthApiError(new ApiError('x', { status: 401, endpoint: 'GET /x' }))).toBe(true)
    expect(isAuthApiError(new ApiError('x', { status: 403, endpoint: 'GET /x' }))).toBe(true)
  })

  it('其它状态码和非 ApiError 为假（apiClient 仍回落到关键词匹配）', () => {
    expect(isAuthApiError(new ApiError('x', { status: 500, endpoint: 'GET /x' }))).toBe(false)
    expect(isAuthApiError(new Error('token 已过期'))).toBe(false)
    expect(isAuthApiError('token 已过期')).toBe(false)
    expect(isAuthApiError(null)).toBe(false)
  })

  it('不含任何认证关键词的 401 也能被识别 —— 这正是 apiClient 的回归点', () => {
    const error = new ApiError('您的会话已结束，请重新开始', { status: 401, endpoint: 'GET /x' })
    expect(isAuthApiError(error)).toBe(true)
  })
})
