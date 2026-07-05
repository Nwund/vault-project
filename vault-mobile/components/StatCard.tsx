// File: vault-mobile/components/StatCard.tsx
// Reusable stats display card

import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface StatItem {
  label: string
  value: string | number
  icon?: keyof typeof Ionicons.glyphMap
  iconColor?: string
}

interface StatCardProps {
  stats: StatItem[]
}

export function StatCard({ stats }: StatCardProps) {
  return (
    <View style={styles.container}>
      {stats.map((stat, index) => (
        <View key={stat.label} style={styles.statWrapper}>
          {index > 0 && <View style={styles.divider} />}
          <View style={styles.statItem}>
            {stat.icon && (
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${stat.iconColor || '#3b82f6'}15` },
                ]}
              >
                <Ionicons
                  name={stat.icon}
                  size={18}
                  color={stat.iconColor || '#3b82f6'}
                />
              </View>
            )}
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    padding: 16,
  },
  statWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: '#27272a',
    marginHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
})
