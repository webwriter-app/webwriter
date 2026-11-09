export type DistributionPermission =
  | "edit"
  | "move"
  | "delete"
  | "duplicate"
  | "style"
  | "insert"

export type DistributionScope = "individual" | "group" | "all"

export interface DistributionItem {
  id: string
  label: string
  html: string
}

export interface DistributionConfig {
  version: 1
  scope: DistributionScope
  /** Requested participants per group; omitted for existing session-defined groups. */
  groupSize?: number
  /** Defaults to visible. A hidden element's entire subtree is private to the host. */
  view?: boolean
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
export function emptyDistributionConfig(): DistributionConfig
export function supportsDistribution(tag: string, namespace: string | null): boolean
export function distributionInstruction(data: string): DistributionConfig | null
export function distributionTextInstruction(tag: string, namespace: string | null, text: string): {config: DistributionConfig, text: string} | null
