/**
 * 手写一份最小但**合法**的 PDF 1.4（单页、Helvetica、带正确 xref 偏移）。
 *
 * 聊天里的 PDF 文件消息与「我的文件」都会被前端的 react-pdf 预览器真正解析，随便塞一段
 * 字节只能验到"加载失败"那一条分支。标准 14 字体里没有中文字形，所以正文只写 ASCII；
 * 中文留在文件名上，那才是 UI 真正展示的地方。
 */
export function makePdf(title: string, lines: readonly string[]): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const body = [
    'BT',
    '/F1 22 Tf',
    '72 730 Td',
    `(${esc(title)}) Tj`,
    '/F1 12 Tf',
    '0 -36 Td',
    ...lines.flatMap((line) => [`(${esc(line)}) Tj`, '0 -18 Td']),
    'ET',
  ].join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    `<< /Title (${esc(title)}) /Producer (huanvae fake-backend) >>`,
  ]

  // 全部是 ASCII，字符串长度就是字节偏移
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
