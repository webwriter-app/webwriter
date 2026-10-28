export type DistributionPermission =
  | "edit"
  | "move"
  | "delete"
  | "duplicate"
  | "style"

export type DistributionScope = "individual" | "group" | "all"

export interface DistributionItem {
  id: string
  label: string
  html: string
}

export interface DistributionConfig {
  version: 1
  target: string
  scope: DistributionScope
  permissions: DistributionPermission[]
  add: string[]
  items: DistributionItem[]
}

export const distributionTarget: "ww-distribute"
export const distributionPermissions: readonly DistributionPermission[]
export function isDistributionPermission(value: unknown): value is DistributionPermission
export function validateDistributionConfig(value: unknown): DistributionConfig
export function encodeDistributionConfig(config: DistributionConfig): string
export function decodeDistributionConfig(data: string): DistributionConfig | null
export function emptyDistributionConfig(target: string): DistributionConfig
