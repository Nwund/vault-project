// File: src/renderer/components/FeatureTree/FeatureTree.tsx
// Simple grid-based roadmap visualization

import React, { useState, useMemo } from 'react'
import {
  ZoomIn, ZoomOut, Maximize2,
  Search, GitBranch, X, Sparkles
} from 'lucide-react'
import {
  INITIAL_FEATURES,
  type FeatureNode,
  type FeatureStatus,
  type FeatureCategory
} from './featureData'
import { RoadmapParticles } from '../ParticlesBackground'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_COLORS: Record<FeatureStatus, string[]> = {
  active: ['#10b981', '#34d399'],
  disabled: ['#f59e0b', '#fbbf24'],
  'in-progress': ['#3b82f6', '#60a5fa'],
  planned: ['#8b5cf6', '#a78bfa'],
  broken: ['#ef4444', '#f87171'],
  idea: ['#ec4899', '#f472b6']
}

const CATEGORY_COLORS: Record<FeatureCategory, string> = {
  core: '#ec4899',
  ui: '#06b6d4',
  ai: '#8b5cf6',
  media: '#f97316',
  social: '#10b981',
  settings: '#6366f1',
  experimental: '#f43f5e'
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function FeatureCard({
  feature,
  isSelected,
  onClick
}: {
  feature: FeatureNode
  isSelected: boolean
  onClick: () => void
}) {
  const colors = STATUS_COLORS[feature.status]
  const categoryColor = CATEGORY_COLORS[feature.category]

  return (
    <div
      onClick={onClick}
      className={`
        relative p-4 rounded-xl cursor-pointer transition-all duration-200
        hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20
        ${isSelected ? 'ring-2 ring-white shadow-lg shadow-purple-500/30' : ''}
      `}
      style={{
        background: `linear-gradient(135deg, ${colors[0]}dd, ${colors[1]}aa)`,
      }}
    >
      {/* Category dot */}
      <div
        className="absolute top-2 right-2 w-3 h-3 rounded-full border border-white/30"
        style={{ backgroundColor: categoryColor }}
      />

      {/* Name */}
      <h3 className="font-semibold text-white text-sm mb-1 pr-4">
        {feature.name}
      </h3>

      {/* Status */}
      <p className="text-white/60 text-xs capitalize mb-2">
        {feature.status} • {feature.category}
      </p>

      {/* Progress bar */}
      <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/70 rounded-full transition-all"
          style={{ width: `${feature.progress}%` }}
        />
      </div>
      <p className="text-white/50 text-[10px] mt-1">{feature.progress}%</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function FeatureTree() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showParticles, setShowParticles] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FeatureStatus | 'all'>('all')

  // Group features by parent
  const { rootFeatures, childrenByParent } = useMemo(() => {
    const roots: FeatureNode[] = []
    const children: Record<string, FeatureNode[]> = {}

    for (const feature of INITIAL_FEATURES) {
      if (!feature.parentId) {
        roots.push(feature)
      } else {
        if (!children[feature.parentId]) {
          children[feature.parentId] = []
        }
        children[feature.parentId].push(feature)
      }
    }

    // Sort roots by status
    const statusOrder = ['active', 'in-progress', 'disabled', 'planned', 'idea', 'broken']
    roots.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status))

    return { rootFeatures: roots, childrenByParent: children }
  }, [])

  // Filter features
  const filteredFeatures = useMemo(() => {
    let features = INITIAL_FEATURES

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      features = features.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.description.toLowerCase().includes(query) ||
        f.tags.some(t => t.toLowerCase().includes(query))
      )
    }

    if (filterStatus !== 'all') {
      features = features.filter(f => f.status === filterStatus)
    }

    return new Set(features.map(f => f.id))
  }, [searchQuery, filterStatus])

  const selectedFeature = INITIAL_FEATURES.find(f => f.id === selectedNode)

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 relative overflow-hidden">
      {/* Particles */}
      <RoadmapParticles enabled={showParticles} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 p-4 bg-black/40 backdrop-blur-xl border-b border-white/10 z-20">
        <div className="flex items-center gap-2 text-white">
          <GitBranch className="w-5 h-5 text-purple-400" />
          <span className="font-bold text-lg">Roadmap</span>
          <span className="text-xs text-white/40 ml-2">{INITIAL_FEATURES.length} features</span>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search features..."
            className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white
                       placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 w-48"
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FeatureStatus | 'all')}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="in-progress">In Progress</option>
          <option value="planned">Planned</option>
          <option value="idea">Ideas</option>
          <option value="broken">Broken</option>
        </select>

        {/* Particles toggle */}
        <button
          onClick={() => setShowParticles(p => !p)}
          className={`p-2 rounded-lg transition-all ${
            showParticles ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-white/50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Render each root with its children */}
          {rootFeatures.map(root => {
            const children = childrenByParent[root.id] || []
            const isRootVisible = filteredFeatures.has(root.id)
            const visibleChildren = children.filter(c => filteredFeatures.has(c.id))

            if (!isRootVisible && visibleChildren.length === 0) return null

            return (
              <div key={root.id} className="space-y-4">
                {/* Root feature as section header */}
                {isRootVisible && (
                  <div
                    className="flex items-center gap-4 cursor-pointer group"
                    onClick={() => setSelectedNode(root.id)}
                  >
                    <div
                      className={`
                        px-4 py-2 rounded-xl transition-all
                        group-hover:scale-105 group-hover:shadow-lg
                        ${selectedNode === root.id ? 'ring-2 ring-white' : ''}
                      `}
                      style={{
                        background: `linear-gradient(135deg, ${STATUS_COLORS[root.status][0]}, ${STATUS_COLORS[root.status][1]})`
                      }}
                    >
                      <h2 className="font-bold text-white">{root.name}</h2>
                      <p className="text-white/60 text-xs">{root.progress}% complete</p>
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-transparent" />
                    <span className="text-white/40 text-sm">{visibleChildren.length} sub-features</span>
                  </div>
                )}

                {/* Children grid */}
                {visibleChildren.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pl-8">
                    {visibleChildren.map(child => (
                      <FeatureCard
                        key={child.id}
                        feature={child}
                        isSelected={selectedNode === child.id}
                        onClick={() => setSelectedNode(child.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Features without parents that aren't roots */}
          {filteredFeatures.size === 0 && (
            <div className="text-center text-white/40 py-20">
              No features match your search
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-center gap-6 p-3 bg-black/40 border-t border-white/10 z-20">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => {
          const count = INITIAL_FEATURES.filter(f => f.status === status).length
          return (
            <div key={status} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
              />
              <span className="text-white/60 text-xs capitalize">{status}: {count}</span>
            </div>
          )
        })}
      </div>

      {/* Detail Panel */}
      {selectedFeature && (
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-black/90 backdrop-blur-xl border-l border-white/10 z-30 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3
                  className="font-bold text-xl"
                  style={{
                    background: `linear-gradient(135deg, ${STATUS_COLORS[selectedFeature.status][0]}, ${STATUS_COLORS[selectedFeature.status][1]})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}
                >
                  {selectedFeature.name}
                </h3>
                <p className="text-sm text-white/40 capitalize mt-1">
                  {selectedFeature.category} • {selectedFeature.status}
                </p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-white/70 mb-6 leading-relaxed">{selectedFeature.description}</p>

            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/50">Progress</span>
                <span className="text-white/70 font-medium">{selectedFeature.progress}%</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${selectedFeature.progress}%`,
                    background: `linear-gradient(90deg, ${STATUS_COLORS[selectedFeature.status][0]}, ${STATUS_COLORS[selectedFeature.status][1]})`
                  }}
                />
              </div>
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap gap-2 mb-6">
              <span
                className="text-xs font-medium px-3 py-1.5 rounded-full capitalize"
                style={{
                  background: `${STATUS_COLORS[selectedFeature.status][0]}25`,
                  color: STATUS_COLORS[selectedFeature.status][0]
                }}
              >
                {selectedFeature.status}
              </span>
              <span
                className="text-xs font-medium px-3 py-1.5 rounded-full capitalize"
                style={{
                  background: `${CATEGORY_COLORS[selectedFeature.category]}25`,
                  color: CATEGORY_COLORS[selectedFeature.category]
                }}
              >
                {selectedFeature.category}
              </span>
            </div>

            {/* Notes */}
            {selectedFeature.notes && (
              <div className="mb-6">
                <div className="text-xs text-white/50 mb-2 font-medium">Notes</div>
                <p className="text-sm text-white/60 bg-white/5 rounded-xl p-4 border border-white/5">
                  {selectedFeature.notes}
                </p>
              </div>
            )}

            {/* Tags */}
            {selectedFeature.tags.length > 0 && (
              <div className="mb-6">
                <div className="text-xs text-white/50 mb-2 font-medium">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {selectedFeature.tags.map((tag, i) => (
                    <span key={i} className="text-xs text-purple-400 bg-purple-500/15 rounded-lg px-2.5 py-1">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Code locations */}
            {selectedFeature.codeLocations.length > 0 && (
              <div>
                <div className="text-xs text-white/50 mb-2 font-medium">Code Locations</div>
                <div className="space-y-2">
                  {selectedFeature.codeLocations.map((loc, i) => (
                    <div key={i} className="text-xs text-cyan-400 font-mono bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                      {loc}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default FeatureTree
