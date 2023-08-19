"use strict";

function peg$subclass(child, parent) {
  function C() { this.constructor = child; }
  C.prototype = parent.prototype;
  child.prototype = new C();
}

function peg$SyntaxError(message, expected, found, location) {
  var self = Error.call(this, message);
  // istanbul ignore next Check is a necessary evil to support older environments
  if (Object.setPrototypeOf) {
    Object.setPrototypeOf(self, peg$SyntaxError.prototype);
  }
  self.expected = expected;
  self.found = found;
  self.location = location;
  self.name = "SyntaxError";
  return self;
}

peg$subclass(peg$SyntaxError, Error);

function peg$padEnd(str, targetLength, padString) {
  padString = padString || " ";
  if (str.length > targetLength) { return str; }
  targetLength -= str.length;
  padString += padString.repeat(targetLength);
  return str + padString.slice(0, targetLength);
}

peg$SyntaxError.prototype.format = function(sources) {
  var str = "Error: " + this.message;
  if (this.location) {
    var src = null;
    var k;
    for (k = 0; k < sources.length; k++) {
      if (sources[k].source === this.location.source) {
        src = sources[k].text.split(/\r\n|\n|\r/g);
        break;
      }
    }
    var s = this.location.start;
    var offset_s = (this.location.source && (typeof this.location.source.offset === "function"))
      ? this.location.source.offset(s)
      : s;
    var loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;
    if (src) {
      var e = this.location.end;
      var filler = peg$padEnd("", offset_s.line.toString().length, ' ');
      var line = src[s.line - 1];
      var last = s.line === e.line ? e.column : line.length + 1;
      var hatLen = (last - s.column) || 1;
      str += "\n --> " + loc + "\n"
          + filler + " |\n"
          + offset_s.line + " | " + line + "\n"
          + filler + " | " + peg$padEnd("", s.column - 1, ' ')
          + peg$padEnd("", hatLen, "^");
    } else {
      str += "\n at " + loc;
    }
  }
  return str;
};

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
    literal: function(expectation) {
      return "\"" + literalEscape(expectation.text) + "\"";
    },

    class: function(expectation) {
      var escapedParts = expectation.parts.map(function(part) {
        return Array.isArray(part)
          ? classEscape(part[0]) + "-" + classEscape(part[1])
          : classEscape(part);
      });

      return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]";
    },

    any: function() {
      return "any character";
    },

    end: function() {
      return "end of input";
    },

    other: function(expectation) {
      return expectation.description;
    }
  };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, "\\\\")
      .replace(/"/g,  "\\\"")
      .replace(/\0/g, "\\0")
      .replace(/\t/g, "\\t")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/[\x00-\x0F]/g,          function(ch) { return "\\x0" + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return "\\x"  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, "\\\\")
      .replace(/\]/g, "\\]")
      .replace(/\^/g, "\\^")
      .replace(/-/g,  "\\-")
      .replace(/\0/g, "\\0")
      .replace(/\t/g, "\\t")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/[\x00-\x0F]/g,          function(ch) { return "\\x0" + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return "\\x"  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = expected.map(describeExpectation);
    var i, j;

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== undefined ? options : {};

  var peg$FAILED = {};
  var peg$source = options.grammarSource;

  var peg$startRuleFunctions = { Expression: peg$parseExpression };
  var peg$startRuleFunction = peg$parseExpression;

  var peg$c0 = " ";
  var peg$c1 = "(";
  var peg$c2 = ")";
  var peg$c3 = "|";
  var peg$c4 = "*";
  var peg$c5 = "+";
  var peg$c6 = "?";
  var peg$c7 = "{";
  var peg$c8 = "}";
  var peg$c9 = ",";

  var peg$r0 = /^[_a-zA-Z]/;
  var peg$r1 = /^[_a-zA-Z0-9]/;
  var peg$r2 = /^[0-9]/;
  var peg$r3 = /^[ \t\n\r]/;

  var peg$e0 = peg$literalExpectation(" ", false);
  var peg$e1 = peg$literalExpectation("(", false);
  var peg$e2 = peg$literalExpectation(")", false);
  var peg$e3 = peg$literalExpectation("|", false);
  var peg$e4 = peg$classExpectation(["_", ["a", "z"], ["A", "Z"]], false, false);
  var peg$e5 = peg$classExpectation(["_", ["a", "z"], ["A", "Z"], ["0", "9"]], false, false);
  var peg$e6 = peg$literalExpectation("*", false);
  var peg$e7 = peg$literalExpectation("+", false);
  var peg$e8 = peg$literalExpectation("?", false);
  var peg$e9 = peg$literalExpectation("{", false);
  var peg$e10 = peg$classExpectation([["0", "9"]], false, false);
  var peg$e11 = peg$literalExpectation("}", false);
  var peg$e12 = peg$literalExpectation(",", false);
  var peg$e13 = peg$classExpectation([" ", "\t", "\n", "\r"], false, false);

  var peg$f0 = function(expression, quantifier) {
	return {...expression, ...(quantifier ?? {min: expression.min ?? 1, max: expression.max ?? 1}), raw: text()}
};
  var peg$f1 = function(head, tail) {
	return {type: "Sequence", content: [head, ...tail], min: 1, max: 1, raw: text()}
};
  var peg$f2 = function(head, tail) {
	return {type: "Alternation", content: [head, ...tail], min: 1, max: 1, raw: text()}
};
  var peg$f3 = function(content, quantifier) {
	return {type: "SimpleExpression", content, ...(quantifier ?? {min: 1, max: 1}), raw: text()}
};
  var peg$f4 = function() {
	return {min: 0, max: Number.POSITIVE_INFINITY}
};
  var peg$f5 = function() {
	return {min: 1, max: Number.POSITIVE_INFINITY}
};
  var peg$f6 = function() {
	return {min: 0, max: 1}
};
  var peg$f7 = function(valStr) {
	let min, max; min = max = parseInt(valStr.join(""))
	return {min, max}
};
  var peg$f8 = function(minStr, maxStr) {
    let min = parseInt(minStr.join(""))
    let max = parseInt(maxStr.join(""))
    min > max? error("min must be less than or equal to max"): null
	return {min, max}
};
  var peg$currPos = 0;
  var peg$savedPos = 0;
  var peg$posDetailsCache = [{ line: 1, column: 1 }];
  var peg$maxFailPos = 0;
  var peg$maxFailExpected = [];
  var peg$silentFails = 0;

  var peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function offset() {
    return peg$savedPos;
  }

  function range() {
    return {
      source: peg$source,
      start: peg$savedPos,
      end: peg$currPos
    };
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== undefined
      ? location
      : peg$computeLocation(peg$savedPos, peg$currPos);

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== undefined
      ? location
      : peg$computeLocation(peg$savedPos, peg$currPos);

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos];
    var p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line: details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;

      return details;
    }
  }

  function peg$computeLocation(startPos, endPos, offset) {
    var startPosDetails = peg$computePosDetails(startPos);
    var endPosDetails = peg$computePosDetails(endPos);

    var res = {
      source: peg$source,
      start: {
        offset: startPos,
        line: startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line: endPosDetails.line,
        column: endPosDetails.column
      }
    };
    if (offset && peg$source && (typeof peg$source.offset === "function")) {
      res.start = peg$source.offset(res.start);
      res.end = peg$source.offset(res.end);
    }
    return res;
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parseExpression() {
    var s0;

    s0 = peg$parseGroup();
    if (s0 === peg$FAILED) {
      s0 = peg$parseSequence();
      if (s0 === peg$FAILED) {
        s0 = peg$parseAlternation();
        if (s0 === peg$FAILED) {
          s0 = peg$parseSimpleExpression();
        }
      }
    }

    return s0;
  }

  function peg$parseGroup() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = peg$currPos;
    peg$silentFails++;
    s2 = [];
    if (input.charCodeAt(peg$currPos) === 32) {
      s3 = peg$c0;
      peg$currPos++;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e0); }
    }
    while (s3 !== peg$FAILED) {
      s2.push(s3);
      if (input.charCodeAt(peg$currPos) === 32) {
        s3 = peg$c0;
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
    }
    peg$silentFails--;
    peg$currPos = s1;
    s1 = undefined;
    if (input.charCodeAt(peg$currPos) === 40) {
      s2 = peg$c1;
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e1); }
    }
    if (s2 !== peg$FAILED) {
      s3 = [];
      if (input.charCodeAt(peg$currPos) === 32) {
        s4 = peg$c0;
        peg$currPos++;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        if (input.charCodeAt(peg$currPos) === 32) {
          s4 = peg$c0;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e0); }
        }
      }
      s4 = peg$parseExpression();
      if (s4 !== peg$FAILED) {
        s5 = [];
        if (input.charCodeAt(peg$currPos) === 32) {
          s6 = peg$c0;
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e0); }
        }
        while (s6 !== peg$FAILED) {
          s5.push(s6);
          if (input.charCodeAt(peg$currPos) === 32) {
            s6 = peg$c0;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
        }
        if (input.charCodeAt(peg$currPos) === 41) {
          s6 = peg$c2;
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e2); }
        }
        if (s6 !== peg$FAILED) {
          s7 = peg$parseQuantifier();
          if (s7 === peg$FAILED) {
            s7 = null;
          }
          s8 = peg$currPos;
          peg$silentFails++;
          s9 = [];
          if (input.charCodeAt(peg$currPos) === 32) {
            s10 = peg$c0;
            peg$currPos++;
          } else {
            s10 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
          while (s10 !== peg$FAILED) {
            s9.push(s10);
            if (input.charCodeAt(peg$currPos) === 32) {
              s10 = peg$c0;
              peg$currPos++;
            } else {
              s10 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$e0); }
            }
          }
          peg$silentFails--;
          peg$currPos = s8;
          s8 = undefined;
          peg$savedPos = s0;
          s0 = peg$f0(s4, s7);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSequence() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = [];
    if (input.charCodeAt(peg$currPos) === 32) {
      s2 = peg$c0;
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e0); }
    }
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      if (input.charCodeAt(peg$currPos) === 32) {
        s2 = peg$c0;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
    }
    s2 = peg$parseGroup();
    if (s2 === peg$FAILED) {
      s2 = peg$parseAlternation();
      if (s2 === peg$FAILED) {
        s2 = peg$parseSimpleExpression();
      }
    }
    if (s2 !== peg$FAILED) {
      s3 = [];
      s4 = peg$currPos;
      s5 = [];
      if (input.charCodeAt(peg$currPos) === 32) {
        s6 = peg$c0;
        peg$currPos++;
      } else {
        s6 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
      if (s6 !== peg$FAILED) {
        while (s6 !== peg$FAILED) {
          s5.push(s6);
          if (input.charCodeAt(peg$currPos) === 32) {
            s6 = peg$c0;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
        }
      } else {
        s5 = peg$FAILED;
      }
      if (s5 !== peg$FAILED) {
        s6 = peg$parseGroup();
        if (s6 === peg$FAILED) {
          s6 = peg$parseAlternation();
          if (s6 === peg$FAILED) {
            s6 = peg$parseSimpleExpression();
          }
        }
        if (s6 !== peg$FAILED) {
          s4 = s6;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
      } else {
        peg$currPos = s4;
        s4 = peg$FAILED;
      }
      if (s4 !== peg$FAILED) {
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$currPos;
          s5 = [];
          if (input.charCodeAt(peg$currPos) === 32) {
            s6 = peg$c0;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
          if (s6 !== peg$FAILED) {
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              if (input.charCodeAt(peg$currPos) === 32) {
                s6 = peg$c0;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$e0); }
              }
            }
          } else {
            s5 = peg$FAILED;
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseGroup();
            if (s6 === peg$FAILED) {
              s6 = peg$parseAlternation();
              if (s6 === peg$FAILED) {
                s6 = peg$parseSimpleExpression();
              }
            }
            if (s6 !== peg$FAILED) {
              s4 = s6;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        }
      } else {
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        s4 = [];
        if (input.charCodeAt(peg$currPos) === 32) {
          s5 = peg$c0;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e0); }
        }
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          if (input.charCodeAt(peg$currPos) === 32) {
            s5 = peg$c0;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
        }
        peg$savedPos = s0;
        s0 = peg$f1(s2, s3);
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAlternation() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = peg$currPos;
    peg$silentFails++;
    s2 = [];
    if (input.charCodeAt(peg$currPos) === 32) {
      s3 = peg$c0;
      peg$currPos++;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e0); }
    }
    while (s3 !== peg$FAILED) {
      s2.push(s3);
      if (input.charCodeAt(peg$currPos) === 32) {
        s3 = peg$c0;
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
    }
    peg$silentFails--;
    peg$currPos = s1;
    s1 = undefined;
    s2 = peg$parseGroup();
    if (s2 === peg$FAILED) {
      s2 = peg$parseSimpleExpression();
    }
    if (s2 !== peg$FAILED) {
      s3 = [];
      s4 = peg$currPos;
      s5 = [];
      if (input.charCodeAt(peg$currPos) === 32) {
        s6 = peg$c0;
        peg$currPos++;
      } else {
        s6 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
      while (s6 !== peg$FAILED) {
        s5.push(s6);
        if (input.charCodeAt(peg$currPos) === 32) {
          s6 = peg$c0;
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e0); }
        }
      }
      if (input.charCodeAt(peg$currPos) === 124) {
        s6 = peg$c3;
        peg$currPos++;
      } else {
        s6 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e3); }
      }
      if (s6 !== peg$FAILED) {
        s7 = [];
        if (input.charCodeAt(peg$currPos) === 32) {
          s8 = peg$c0;
          peg$currPos++;
        } else {
          s8 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e0); }
        }
        while (s8 !== peg$FAILED) {
          s7.push(s8);
          if (input.charCodeAt(peg$currPos) === 32) {
            s8 = peg$c0;
            peg$currPos++;
          } else {
            s8 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
        }
        s8 = peg$parseGroup();
        if (s8 === peg$FAILED) {
          s8 = peg$parseSimpleExpression();
        }
        if (s8 !== peg$FAILED) {
          s4 = s8;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
      } else {
        peg$currPos = s4;
        s4 = peg$FAILED;
      }
      if (s4 !== peg$FAILED) {
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$currPos;
          s5 = [];
          if (input.charCodeAt(peg$currPos) === 32) {
            s6 = peg$c0;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            if (input.charCodeAt(peg$currPos) === 32) {
              s6 = peg$c0;
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$e0); }
            }
          }
          if (input.charCodeAt(peg$currPos) === 124) {
            s6 = peg$c3;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e3); }
          }
          if (s6 !== peg$FAILED) {
            s7 = [];
            if (input.charCodeAt(peg$currPos) === 32) {
              s8 = peg$c0;
              peg$currPos++;
            } else {
              s8 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$e0); }
            }
            while (s8 !== peg$FAILED) {
              s7.push(s8);
              if (input.charCodeAt(peg$currPos) === 32) {
                s8 = peg$c0;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$e0); }
              }
            }
            s8 = peg$parseGroup();
            if (s8 === peg$FAILED) {
              s8 = peg$parseSimpleExpression();
            }
            if (s8 !== peg$FAILED) {
              s4 = s8;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        }
      } else {
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        s4 = peg$currPos;
        peg$silentFails++;
        s5 = [];
        if (input.charCodeAt(peg$currPos) === 32) {
          s6 = peg$c0;
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e0); }
        }
        while (s6 !== peg$FAILED) {
          s5.push(s6);
          if (input.charCodeAt(peg$currPos) === 32) {
            s6 = peg$c0;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e0); }
          }
        }
        peg$silentFails--;
        peg$currPos = s4;
        s4 = undefined;
        peg$savedPos = s0;
        s0 = peg$f2(s2, s3);
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSimpleExpression() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$currPos;
    peg$silentFails++;
    s2 = [];
    if (input.charCodeAt(peg$currPos) === 32) {
      s3 = peg$c0;
      peg$currPos++;
    } else {
      s3 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e0); }
    }
    while (s3 !== peg$FAILED) {
      s2.push(s3);
      if (input.charCodeAt(peg$currPos) === 32) {
        s3 = peg$c0;
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
    }
    peg$silentFails--;
    peg$currPos = s1;
    s1 = undefined;
    s2 = peg$parseToken();
    if (s2 !== peg$FAILED) {
      s3 = peg$parseQuantifier();
      if (s3 === peg$FAILED) {
        s3 = null;
      }
      s4 = peg$currPos;
      peg$silentFails++;
      s5 = [];
      if (input.charCodeAt(peg$currPos) === 32) {
        s6 = peg$c0;
        peg$currPos++;
      } else {
        s6 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e0); }
      }
      while (s6 !== peg$FAILED) {
        s5.push(s6);
        if (input.charCodeAt(peg$currPos) === 32) {
          s6 = peg$c0;
          peg$currPos++;
        } else {
          s6 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e0); }
        }
      }
      peg$silentFails--;
      peg$currPos = s4;
      s4 = undefined;
      peg$savedPos = s0;
      s0 = peg$f3(s2, s3);
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseToken() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (peg$r0.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e4); }
    }
    if (s2 !== peg$FAILED) {
      s3 = [];
      if (peg$r1.test(input.charAt(peg$currPos))) {
        s4 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e5); }
      }
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        if (peg$r1.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e5); }
        }
      }
      s2 = [s2, s3];
      s1 = s2;
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      s0 = input.substring(s0, peg$currPos);
    } else {
      s0 = s1;
    }

    return s0;
  }

  function peg$parseStar() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 42) {
      s1 = peg$c4;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e6); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$f4();
    }
    s0 = s1;

    return s0;
  }

  function peg$parsePlus() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s1 = peg$c5;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e7); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$f5();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseQuestion() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 63) {
      s1 = peg$c6;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e8); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$f6();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseSingleQuantifier() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c7;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e9); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$r2.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e10); }
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$r2.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e10); }
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 125) {
          s3 = peg$c8;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e11); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s0 = peg$f7(s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDoubleQuantifier() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c7;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e9); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      s3 = [];
      if (peg$r2.test(input.charAt(peg$currPos))) {
        s4 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e10); }
      }
      if (s4 !== peg$FAILED) {
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          if (peg$r2.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e10); }
          }
        }
      } else {
        s3 = peg$FAILED;
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s4 = peg$c9;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$e12); }
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parse_();
          s6 = [];
          if (peg$r2.test(input.charAt(peg$currPos))) {
            s7 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s7 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$e10); }
          }
          if (s7 !== peg$FAILED) {
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              if (peg$r2.test(input.charAt(peg$currPos))) {
                s7 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$e10); }
              }
            }
          } else {
            s6 = peg$FAILED;
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parse_();
            if (input.charCodeAt(peg$currPos) === 125) {
              s8 = peg$c8;
              peg$currPos++;
            } else {
              s8 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$e11); }
            }
            if (s8 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f8(s3, s6);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseQuantifier() {
    var s0;

    s0 = peg$parseStar();
    if (s0 === peg$FAILED) {
      s0 = peg$parsePlus();
      if (s0 === peg$FAILED) {
        s0 = peg$parseQuestion();
        if (s0 === peg$FAILED) {
          s0 = peg$parseSingleQuantifier();
          if (s0 === peg$FAILED) {
            s0 = peg$parseDoubleQuantifier();
          }
        }
      }
    }

    return s0;
  }

  function peg$parse_() {
    var s0, s1;

    s0 = [];
    if (peg$r3.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$e13); }
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      if (peg$r3.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$e13); }
      }
    }

    return s0;
  }

  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

export const SyntaxError = peg$SyntaxError
export const parse = peg$parse