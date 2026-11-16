import { nothing, type TemplateResult } from "lit";
import { type WidgetOptionValue, type WidgetOptionState, type WidgetActionState, type WidgetOptionGroupState } from "./widget-options";
export declare function renderWidgetOptionField(option: WidgetOptionState, dispatch: (name: string, value: WidgetOptionValue) => void, fieldScope?: string, editor?: {
    label: TemplateResult;
    safeColor: (value: string) => string;
}): typeof nothing | TemplateResult<1>;
export declare function renderWidgetOptions(options: WidgetOptionState[], actions: WidgetActionState[], groups: readonly WidgetOptionGroupState[], renderField: (option: WidgetOptionState) => TemplateResult | typeof nothing, renderActions: (actions: WidgetActionState[]) => TemplateResult | typeof nothing): typeof nothing | TemplateResult<1>;
