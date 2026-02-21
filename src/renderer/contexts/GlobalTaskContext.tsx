// File: src/renderer/contexts/GlobalTaskContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { GlobalTask } from '../types'

type GlobalTaskContextValue = {
  tasks: GlobalTask[]
  addTask: (task: Omit<GlobalTask, 'startedAt'>) => void
  updateTask: (id: string, updates: Partial<GlobalTask>) => void
  removeTask: (id: string) => void
}

const GlobalTaskContext = createContext<GlobalTaskContextValue>({
  tasks: [],
  addTask: () => {},
  updateTask: () => {},
  removeTask: () => {}
})

export function useGlobalTasks() {
  return useContext(GlobalTaskContext)
}

export function GlobalTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<GlobalTask[]>([])

  const addTask = useCallback((task: Omit<GlobalTask, 'startedAt'>) => {
    setTasks(prev => [...prev.filter(t => t.id !== task.id), { ...task, startedAt: Date.now() }])
  }, [])

  const updateTask = useCallback((id: string, updates: Partial<GlobalTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  const value = useMemo(() => ({
    tasks,
    addTask,
    updateTask,
    removeTask
  }), [tasks, addTask, updateTask, removeTask])

  return (
    <GlobalTaskContext.Provider value={value}>
      {children}
    </GlobalTaskContext.Provider>
  )
}

// Global Progress Bar Component - Always visible at bottom when tasks are running
export function GlobalProgressBar() {
  const { tasks, removeTask } = useGlobalTasks()

  if (tasks.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-black/95 border-t border-purple-500/30 backdrop-blur-sm">
      <div className="max-w-screen-xl mx-auto px-4 py-2">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-4">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Sparkles size={14} className="text-purple-400 animate-pulse flex-shrink-0" />
              <span className="text-sm text-white font-medium truncate">{task.name}</span>
              <span className="text-xs text-white/60 truncate">{task.status}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className="text-xs text-white/60 w-10 text-right">{task.progress}%</span>
              {task.progress >= 100 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}
                  className="p-1 hover:bg-white/10 rounded transition"
                  aria-label="Dismiss completed task"
                  title="Dismiss"
                >
                  <X size={12} className="text-white/60" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
