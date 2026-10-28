import type {DistributionConfig} from "./distribution.js"
export type DistributionNode = {name: string, namespace?: string, attrs?: Record<string, string>, value?: string, children?: DistributionNode[]}
export function validateDistributionChange(before: DistributionNode, after: DistributionNode, configs: DistributionConfig[], parseFragment: (html: string) => DistributionNode[]): boolean
