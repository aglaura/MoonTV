'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import { DoubanItem, DoubanResult } from '@/lib/types'

export default function DoubanPage() {
  const [data, setData] = useState<DoubanItem[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // ✅ 改成可寫的 ref
  const loadingRef = useRef<HTMLDivElement | null>(null)

  const fetchData = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const res = await fetch(`/api/douban?page=${page}`)
      const result: DoubanResult = await res.json()
      if (result.code === 0) {
        setData((prev) => [...prev, ...result.list])
        if (result.list.length === 0) {
          setHasMore(false)
        } else {
          setPage((prev) => prev + 1)
        }
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, loading, hasMore])

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!loadingRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchData()
        }
      },
      { threshold: 1.0 }
    )
    observer.observe(loadingRef.current)
    return () => {
      if (loadingRef.current) {
        observer.unobserve(loadingRef.current)
      }
    }
  }, [fetchData])

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">豆瓣熱映</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {data.map((item) => (
          <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-2">
            <Image
              src={item.poster}
              alt={item.title}
              width={200}
              height={300}
              className="w-full h-auto rounded-md"
            />
            <div className="mt-2 text-sm font-medium line-clamp-2">{item.title}</div>
            {item.original_title && (
              <div
                className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 break-words"
                title={item.original_title}
              >
                {item.original_title}
              </div>
            )}
            <div className="text-xs text-gray-500">{item.year}</div>
            <div className="text-xs text-yellow-500">⭐ {item.rate}</div>
          </div>
        ))}
      </div>

      {/* 加載更多 */}
      {hasMore && (
        <div
          ref={(el) => {
            if (el && el.offsetParent !== null) {
              loadingRef.current = el // ✅ 現在不會再報錯
            }
          }}
          className="flex justify-center mt-12 py-8"
        >
          {loading && <span className="text-gray-500">載入中...</span>}
        </div>
      )}
    </div>
  )
}
