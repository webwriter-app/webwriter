Expression
  = Group/Sequence/Alternation/SimpleExpression

Group = &" "* "(" " "* expression:Expression " "* ")" quantifier:Quantifier? &" "* {
	return {...expression, ...(quantifier ?? {min: expression.min ?? 1, max: expression.max ?? 1}), raw: text()}
}

Sequence = " "* head:(Group/Alternation/SimpleExpression) tail:(" "+ @value:(Group/Alternation/SimpleExpression))+ " "* {
	return {type: "Sequence", content: [head, ...tail], min: 1, max: 1, raw: text()}
}

Alternation = &" "* head:(Group/SimpleExpression) tail:(" "* "|" " "* @value:(Group/SimpleExpression))+ &" "* {
	return {type: "Alternation", content: [head, ...tail], min: 1, max: 1, raw: text()}
}

SimpleExpression = &" "* content:Token quantifier:Quantifier? &" "* {
	return {type: "SimpleExpression", content, ...(quantifier ?? {min: 1, max: 1}), raw: text()}
}

Token
  = $([_a-zA-Z][_a-zA-Z0-9]*)
  
Star = "*" {
	return {min: 0, max: Number.POSITIVE_INFINITY}
}

Plus = "+" {
	return {min: 1, max: Number.POSITIVE_INFINITY}
}

Question = "?" {
	return {min: 0, max: 1}
}

SingleQuantifier = "{"valStr:([0-9]+)"}" {
	let min, max; min = max = parseInt(valStr.join(""))
	return {min, max}
}

DoubleQuantifier = '{' _ minStr:([0-9]+)',' _ maxStr:([0-9]+) _ '}' {
    let min = parseInt(minStr.join(""))
    let max = parseInt(maxStr.join(""))
    min > max? error("min must be less than or equal to max"): null
	return {min, max}
}

Quantifier = Star / Plus / Question / SingleQuantifier / DoubleQuantifier

_
  = [ \t\n\r]*