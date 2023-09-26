ValueDefinition = head:Statement tail:(";" @value:Statement)* ";"? _ {
	return Object.fromEntries([head, ...tail])
}

Statement = _ name:(Type/Literal) _ "=" _ expression:Expression _ {
	return [name, expression]
}

Expression = Alternation/Subset/Conjunction/Sequence/Group/SimpleExpression

Group = &_ "[" _ expression:Expression _ "]" quantifier:Quantifier? &_ {
	return {...expression, ...(quantifier ?? {min: expression.min ?? 1, max: expression.max ?? 1}), raw: text()}
}

Alternation = &_ head:(Subset/Conjunction/Sequence/Group/SimpleExpression) tail:(_ "|" _ @value:(Subset/Conjunction/Sequence/Group/SimpleExpression))+ &_ {
	return {type: "Alternation", content: [head, ...tail], min: 1, max: 1, raw: text()}
}

Subset = &_ head:(Conjunction/Sequence/Group/SimpleExpression) tail:(_ "||" _ @value:(Conjunction/Sequence/Group/SimpleExpression))+ &_ {
	return {type: "Subset", content: [head, ...tail], min: 1, max: 1, raw: text()}
}

Conjunction = &_ head:(Sequence/Group/SimpleExpression) tail:(_ "&&" _ @value:(Sequence/Group/SimpleExpression))+ &_ {
	return {type: "Conjunction", content: [head, ...tail], min: 1, max: 1, raw: text()}
}

Sequence = _ head:(Group/SimpleExpression) tail:(_ @value:(Group/SimpleExpression))+ _ {
	return {type: "Sequence", content: [head, ...tail], min: 1, max: 1, raw: text()}
}

SimpleExpression = &_ content:(Type/Literal) quantifier:Quantifier? &_ {
	return {type: "SimpleExpression", content, ...(quantifier ?? {min: 1, max: 1}), raw: text()}
}

Label = "?<" literal:Literal ">" {
	return literal
}

Literal = $([_a-zA-Z][-_a-zA-Z0-9]*/[()/,])

Type = "<" $([_a-zA-Z][-_a-zA-Z0-9]*) ">" {
	return text()
}
  
Asterisk = "*" {
	return {min: 0, max: Number.POSITIVE_INFINITY}
}

Plus = "+" {
	return {min: 1, max: Number.POSITIVE_INFINITY}
}

Question = "?" {
	return {min: 0, max: 1}
}

Hash = "#" {
	return {min: 1, max: Number.POSITIVE_INFINITY, separator: ","}
}

Paragraph = "§" {
	return {min: 1, max: Number.POSITIVE_INFINITY, separator: "/"}
}

Exclamation = "!" {
	return {min: 1, max: 1, nonEmpty: true}
}

SingleQuantifier = "{"valStr:([0-9]+)"}" {
	let min, max; min = max = parseInt(valStr.join(""))
    min === 0 && max === 0? error("Both min and max can't be 0 at the same time"): null
	return {min, max}
}

DoubleQuantifier = '{' _ minStr:([0-9]+)',' _ maxStr:([0-9]+) _ '}' {
    let min = parseInt(minStr.join(""))
    let max = parseInt(maxStr.join(""))
    min > max? error("min must be less than or equal to max"): null
    min === 0 && max === 0? error("Both min and max can't be 0 at the same time"): null
	return {min, max}
}

Quantifier = Asterisk / Plus / Question / Exclamation / Hash / Paragraph / SingleQuantifier / DoubleQuantifier

_
  = [ \t\n\r]*