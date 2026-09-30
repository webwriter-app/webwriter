export const groupingTarget = "ww-grouping"

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const fail = message => { throw new TypeError(`Invalid grouping rules: ${message}`) }
const text = (value, label, {empty = true, max = 200} = {}) => {
  if(typeof value !== "string" || (!empty && !value.trim()) || value.length > max) fail(`${label} must be a ${empty ? "string" : "non-empty string"}`)
  return value
}
const boolean = (value, label) => {
  if(typeof value !== "boolean") fail(`${label} must be boolean`)
  return value
}
const enumValue = (value, values, label) => {
  if(!values.includes(value)) fail(`${label} must be one of ${values.join(", ")}`)
  return value
}

const randomSeed = () => {
  const cryptoObject = globalThis.crypto
  if(cryptoObject?.getRandomValues) {
    const words = new Uint32Array(2)
    cryptoObject.getRandomValues(words)
    return `${words[0].toString(36)}${words[1].toString(36)}`
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

export function defaultGroupingRules(seed = randomSeed()) {
  return {
    version: 1,
    method: "automatic",
    namingScheme: "Group @",
    groupBy: "members",
    number: 3,
    allocateBy: "random",
    preventSmallGroup: false,
    ignoreGrouped: false,
    activeOnly: true,
    roleId: "",
    cohortId: "",
    sourceGroupId: "",
    sourceGroupingId: "",
    grouping: "new",
    groupingName: "Grouping",
    groupingId: "",
    messaging: false,
    seed: text(seed, "seed", {max: 256}),
    manualGroups: [],
    existingGroupingId: "",
  }
}

export function validateGroupingRules(value) {
  if(!isRecord(value)) fail("configuration must be an object")
  if(value.version !== 1) fail("version must be 1")
  const number = value.number
  if(!Number.isInteger(number) || number < 1 || number > 10000) fail("number must be an integer from 1 to 10000")
  const manualGroups = value.manualGroups
  if(!Array.isArray(manualGroups)) fail("manualGroups must be an array")
  const ids = new Set(), names = new Set()
  const canonicalManualGroups = manualGroups.map((group, index) => {
    if(!isRecord(group)) fail(`manualGroups[${index}] must be an object`)
    const id = text(group.id, `manualGroups[${index}].id`, {empty: false, max: 128})
    const name = text(group.name, `manualGroups[${index}].name`, {empty: false})
    const key = name.trim().toLocaleLowerCase()
    if(ids.has(id)) fail(`duplicate manual group id ${id}`)
    if(names.has(key)) fail(`duplicate manual group name ${name}`)
    ids.add(id); names.add(key)
    if(!Array.isArray(group.members) || !group.members.every(member => typeof member === "string" && member.length > 0)) fail(`manualGroups[${index}].members must be an array of user IDs`)
    return {id, name, members: [...group.members]}
  })
  for(const field of ["roleId", "cohortId", "sourceGroupId", "sourceGroupingId", "groupingName", "groupingId", "seed", "existingGroupingId"]) text(value[field], field, {max: field === "seed" ? 256 : 200})
  return {
    version: 1,
    method: enumValue(value.method, ["automatic", "manual", "existing"], "method"),
    namingScheme: text(value.namingScheme, "namingScheme", {empty: false}),
    groupBy: enumValue(value.groupBy, ["groups", "members"], "groupBy"),
    number,
    allocateBy: enumValue(value.allocateBy, ["random", "firstname", "lastname", "idnumber", "none"], "allocateBy"),
    preventSmallGroup: boolean(value.preventSmallGroup, "preventSmallGroup"),
    ignoreGrouped: boolean(value.ignoreGrouped, "ignoreGrouped"),
    activeOnly: boolean(value.activeOnly, "activeOnly"),
    roleId: value.roleId, cohortId: value.cohortId, sourceGroupId: value.sourceGroupId, sourceGroupingId: value.sourceGroupingId,
    grouping: enumValue(value.grouping, ["none", "new", "existing"], "grouping"),
    groupingName: value.groupingName, groupingId: value.groupingId,
    messaging: boolean(value.messaging, "messaging"), seed: value.seed,
    manualGroups: canonicalManualGroups, existingGroupingId: value.existingGroupingId,
  }
}

const hash = string => {
  let value = 2166136261
  for(let index = 0; index < string.length; index++) value = Math.imul(value ^ string.charCodeAt(index), 16777619)
  return value >>> 0
}
const makeRandom = seed => {
  let state = hash(seed) || 0x6d2b79f5
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
const shuffle = (items, seed) => {
  const result = [...items], random = makeRandom(seed)
  for(let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}
const alpha = value => String(value ?? "").trim().toLocaleLowerCase()
const compareText = (left, right) => alpha(left).localeCompare(alpha(right), undefined, {numeric: true})
const compareId = (left, right) => compareText(left, right) || (left < right ? -1 : left > right ? 1 : 0)
const compareParticipants = (field, participants) => [...participants].sort((a, b) => compareText(a[field], b[field]) || compareId(a.id, b.id))
const groupName = (scheme, index, count) => {
  const tokens = [...scheme.matchAll(/[@#]/g)]
  if(tokens.length !== 1 && count !== 1) fail("namingScheme must contain exactly one @ or # token")
  if(tokens.length === 0) return scheme
  const token = tokens[0][0]
  let label = String(index + 1)
  if(token === "@") {
    label = ""
    let value = index + 1
    while(value > 0) { value--; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26) }
  }
  return scheme.replace(token, label)
}
const generatedId = (seed, index) => `group-${hash(`${seed}:${index}`).toString(36)}-${index + 1}`

const asArray = value => Array.isArray(value) ? value : []
const matchesScope = (person, rules) => (!rules.activeOnly || person.active !== false)
  && (!rules.roleId || asArray(person.roles).includes(rules.roleId))
  && (!rules.cohortId || asArray(person.cohorts).includes(rules.cohortId))
  && (!rules.sourceGroupId || asArray(person.groups).includes(rules.sourceGroupId))
  && (!rules.sourceGroupingId || asArray(person.groupings).includes(rules.sourceGroupingId))

export function formWidgetGroups(value, context = {}) {
  const rules = validateGroupingRules(value)
  const groupCatalog = asArray(context.groups)
  const groupingCatalog = asArray(context.groupings)
  const participants = asArray(context.participants)
    .filter(person => isRecord(person) && typeof person.id === "string" && person.id.length > 0)
    .map(person => {
      const catalogGroups = groupCatalog.filter(group => asArray(group?.members).includes(person.id)).map(group => group.id)
      const allGroups = new Set([...asArray(person.groups), ...catalogGroups])
      const catalogGroupings = groupingCatalog.filter(grouping => asArray(grouping?.groups).some(id => allGroups.has(id))).map(grouping => grouping.id)
      return {...person, groups: [...allGroups], groupings: [...new Set([...asArray(person.groupings), ...catalogGroupings])]}
    })
    .filter(person => matchesScope(person, rules))
  const participantIds = new Set()
  for(const person of participants) {
    if(participantIds.has(person.id)) fail("duplicate participant id " + person.id)
    participantIds.add(person.id)
  }
  const existingMembership = new Set(participants.filter(person => asArray(person.groups).length > 0).map(person => person.id))
  const eligible = rules.method === "automatic" && rules.ignoreGrouped
    ? participants.filter(person => !existingMembership.has(person.id)) : participants
  const assignments = {}
  const assign = (userId, groupId) => Object.defineProperty(assignments, userId, {value: groupId, writable: true, enumerable: true, configurable: true})
  let groups

  if(rules.method === "manual") {
    if(rules.manualGroups.length === 0) fail("manual method requires at least one manual group")
    const eligibleIds = new Set(eligible.map(person => person.id))
    const seen = new Set()
    groups = rules.manualGroups.map(group => {
      const members = group.members.map(id => {
        if(seen.has(id)) fail(`user ${id} appears in more than one manual group`)
        if(!eligibleIds.has(id)) fail(`user ${id} is not an eligible participant`)
        seen.add(id); assign(id, group.id)
        return id
      })
      return {id: group.id, name: group.name, members}
    })
  }
  else if(rules.method === "existing") {
    const grouping = asArray(context.groupings).find(item => item?.id === rules.existingGroupingId)
    if(!grouping) fail(`existing grouping ${rules.existingGroupingId} was not found`)
    const selectedParticipantIds = new Set(participants.map(person => person.id))
    const grouped = new Set()
    groups = asArray(grouping.groups).map(id => {
      const source = asArray(context.groups).find(group => group?.id === id)
      if(!source) fail(`group ${id} in the existing grouping was not found`)
      const members = asArray(source.members).filter(userId => selectedParticipantIds.has(userId))
      for(const userId of members) {
        if(grouped.has(userId)) fail(`user ${userId} appears in more than one existing group`)
        grouped.add(userId); assign(userId, source.id)
      }
      return {id: source.id, name: source.name, members}
    })
  }
  else {
    let count = eligible.length === 0 ? (rules.allocateBy === "none" ? rules.number : 0)
      : rules.groupBy === "groups" ? rules.number : Math.ceil(eligible.length / rules.number)
    if(count > eligible.length && rules.allocateBy !== "none") fail("number of groups cannot exceed eligible participants")
    if(rules.groupBy === "members" && rules.preventSmallGroup && count > 1) {
      const lastSize = eligible.length - (count - 1) * rules.number
      if(lastSize > 0 && lastSize < rules.number * 0.7) count--
    }
    const groupCount = count
    if(groupCount > 0) {
      if(!rules.namingScheme.includes("@") && !rules.namingScheme.includes("#") && groupCount !== 1) fail("namingScheme must contain exactly one @ or # token")
      const stableEligible = [...eligible].sort((a, b) => compareId(a.id, b.id))
      const ordered = rules.allocateBy === "random" ? shuffle(stableEligible, rules.seed)
        : rules.allocateBy === "firstname" ? compareParticipants("firstName", eligible)
          : rules.allocateBy === "lastname" ? compareParticipants("lastName", eligible)
            : rules.allocateBy === "idnumber" ? compareParticipants("idNumber", eligible)
              : [...eligible]
      groups = Array.from({length: groupCount}, (_, index) => ({id: generatedId(rules.seed, index), name: groupName(rules.namingScheme, index, groupCount), members: []}))
      if(rules.allocateBy !== "none") {
        const baseSize = Math.floor(ordered.length / groupCount), extra = ordered.length % groupCount
        let offset = 0
        groups.forEach((group, index) => {
          const size = baseSize + (index < extra ? 1 : 0)
          group.members = ordered.slice(offset, offset + size).map(person => person.id)
          offset += size
          for(const id of group.members) assign(id, group.id)
        })
      }
    }
    else groups = []
  }

  let grouping
  if(rules.grouping === "none") grouping = {mode: "none"}
  else if(rules.grouping === "new") grouping = {mode: "new", id: generatedId(`${rules.seed}:grouping`, 0), name: rules.groupingName}
  else {
    const found = asArray(context.groupings).find(item => item?.id === rules.groupingId)
    if(!found) fail(`grouping ${rules.groupingId} was not found`)
    grouping = {mode: "existing", id: found.id, name: found.name}
  }
  return {groups, assignments, grouping}
}
