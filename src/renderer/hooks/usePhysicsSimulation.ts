// File: src/renderer/hooks/usePhysicsSimulation.ts
// Enhanced physics engine for the feature tree visualization with wobble and bounce

import { useRef, useEffect, useCallback } from 'react'

export interface PhysicsNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  fx: number
  fy: number
  pinned: boolean
  mass: number
  // Enhanced physics properties
  wobblePhase: number
  wobbleAmplitude: number
  scale: number
  targetScale: number
  glowIntensity: number
}

export interface PhysicsLink {
  source: string
  target: string
  strength: number
}

interface PhysicsConfig {
  gravity: number
  friction: number
  springStrength: number
  springLength: number
  repulsion: number
  centerAttraction: number
  wobbleSpeed: number
  bounceStrength: number
  maxVelocity: number
}

const DEFAULT_CONFIG: PhysicsConfig = {
  gravity: 0.02,
  friction: 0.92,
  springStrength: 0.02,
  springLength: 180,
  repulsion: 2500,
  centerAttraction: 0.0008,
  wobbleSpeed: 0.02,
  bounceStrength: 0.5,
  maxVelocity: 8
}

export function usePhysicsSimulation(
  nodes: PhysicsNode[],
  links: PhysicsLink[],
  config: Partial<PhysicsConfig> = {},
  onUpdate: (nodes: PhysicsNode[]) => void
) {
  const nodesRef = useRef<PhysicsNode[]>(nodes)
  const linksRef = useRef<PhysicsLink[]>(links)
  const configRef = useRef({ ...DEFAULT_CONFIG, ...config })
  const rafRef = useRef<number>()
  const isRunningRef = useRef(false)
  const timeRef = useRef(0)

  // Update refs when props change
  useEffect(() => {
    nodesRef.current = nodes
    linksRef.current = links
    configRef.current = { ...DEFAULT_CONFIG, ...config }
  }, [nodes, links, config])

  const simulate = useCallback(() => {
    const nodes = nodesRef.current
    const links = linksRef.current
    const cfg = configRef.current

    timeRef.current += 1

    // Apply forces
    for (const node of nodes) {
      if (node.pinned) {
        // Even pinned nodes get a gentle wobble
        node.wobblePhase += cfg.wobbleSpeed * 0.5
        continue
      }

      node.fx = 0
      node.fy = 0

      // Update wobble
      node.wobblePhase += cfg.wobbleSpeed + Math.random() * 0.005
      const wobbleOffset = Math.sin(node.wobblePhase) * node.wobbleAmplitude

      // Scale animation
      node.scale += (node.targetScale - node.scale) * 0.1

      // Glow pulse
      node.glowIntensity = 0.5 + Math.sin(node.wobblePhase * 0.5) * 0.3

      // Repulsion from other nodes with soft collision
      for (const other of nodes) {
        if (other.id === node.id) continue

        const dx = node.x - other.x
        const dy = node.y - other.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1

        // Enhanced repulsion with soft collision
        const minDist = 120
        let force = cfg.repulsion / (dist * dist)

        // Bounce effect for close nodes
        if (dist < minDist) {
          force += (minDist - dist) * cfg.bounceStrength
          // Add slight perpendicular force for more interesting motion
          node.fx += (dy / dist) * force * 0.1
          node.fy += (-dx / dist) * force * 0.1
        }

        node.fx += (dx / dist) * force
        node.fy += (dy / dist) * force
      }

      // Center attraction with gentle spiral
      const spiralAngle = timeRef.current * 0.001
      const centerX = Math.cos(spiralAngle) * 50
      const centerY = Math.sin(spiralAngle) * 50
      node.fx -= (node.x - centerX) * cfg.centerAttraction
      node.fy -= (node.y - centerY) * cfg.centerAttraction

      // Subtle gravity for organic feel
      node.fy += cfg.gravity * node.mass * 0.5

      // Add wobble force
      node.fx += Math.cos(node.wobblePhase) * wobbleOffset * 0.3
      node.fy += Math.sin(node.wobblePhase * 1.3) * wobbleOffset * 0.3
    }

    // Spring forces from links with elastic bounce
    for (const link of links) {
      const source = nodes.find(n => n.id === link.source)
      const target = nodes.find(n => n.id === link.target)
      if (!source || !target) continue

      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1

      // Elastic spring with damping
      const stretch = dist - cfg.springLength
      const force = stretch * cfg.springStrength * link.strength

      // Add slight oscillation to spring
      const oscillation = Math.sin(timeRef.current * 0.05) * 0.1

      const fx = (dx / dist) * force * (1 + oscillation)
      const fy = (dy / dist) * force * (1 + oscillation)

      if (!source.pinned) {
        source.fx += fx
        source.fy += fy
      }
      if (!target.pinned) {
        target.fx -= fx
        target.fy -= fy
      }
    }

    // Apply velocity and friction with velocity capping
    for (const node of nodes) {
      if (node.pinned) continue

      node.vx = (node.vx + node.fx / node.mass) * cfg.friction
      node.vy = (node.vy + node.fy / node.mass) * cfg.friction

      // Cap velocity for stability
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
      if (speed > cfg.maxVelocity) {
        node.vx = (node.vx / speed) * cfg.maxVelocity
        node.vy = (node.vy / speed) * cfg.maxVelocity
      }

      node.x += node.vx
      node.y += node.vy
    }

    onUpdate([...nodes])

    if (isRunningRef.current) {
      rafRef.current = requestAnimationFrame(simulate)
    }
  }, [onUpdate])

  const start = useCallback(() => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    rafRef.current = requestAnimationFrame(simulate)
  }, [simulate])

  const stop = useCallback(() => {
    isRunningRef.current = false
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const setNodePosition = useCallback((id: string, x: number, y: number, pinned?: boolean) => {
    const node = nodesRef.current.find(n => n.id === id)
    if (node) {
      node.x = x
      node.y = y
      if (pinned !== undefined) node.pinned = pinned
      // Reset velocity when manually positioned
      node.vx = 0
      node.vy = 0
    }
  }, [])

  const setNodeScale = useCallback((id: string, scale: number) => {
    const node = nodesRef.current.find(n => n.id === id)
    if (node) {
      node.targetScale = scale
    }
  }, [])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return { start, stop, setNodePosition, setNodeScale }
}
