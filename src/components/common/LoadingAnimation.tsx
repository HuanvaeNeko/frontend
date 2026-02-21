'use client'

import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function LoadingAnimation() {
  return (
    <div className="relative flex app-min-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.12),transparent_35%),radial-gradient(circle_at_80%_0%,hsl(186_90%_45%/0.14),transparent_40%),radial-gradient(circle_at_50%_100%,hsl(142_72%_40%/0.08),transparent_35%)]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10"
      >
        <Card className="w-[320px] border-border/80 bg-card shadow-lg ">
          <CardContent className="flex flex-col items-center gap-5 py-8">
            <motion.div
              className="relative"
              animate={{ rotate: [0, 3, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="absolute inset-0 scale-125 rounded-2xl bg-primary/20 blur-xl" />
              <img src="/logo.svg" alt="Huanvae Chat" className="relative h-20 w-20" />
            </motion.div>

            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Huanvae Chat</h1>
              <p className="text-sm text-muted-foreground">正在准备工作台...</p>
            </div>

            <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载中
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
