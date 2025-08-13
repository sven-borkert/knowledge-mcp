# MCP Client Instruction Guide

## How to Design MCP Tools That Shape AI Behavior

### Core Principle

MCP tool descriptions are not just API documentation - they are **behavioral programming interfaces** that shape how AI clients think and act. The tool description becomes a cognitive scaffold that guides the AI through complex reasoning patterns.

## 1. Tool Description as Behavioral Framework

### Structure Your Description in Layers

```typescript
const TOOL_DEFINITION = {
  description: `
    [ONE-LINE SUMMARY]
    [EXPANDED EXPLANATION OF PURPOSE]
    
    When to use this tool:
    - [SPECIFIC USE CASE 1]
    - [SPECIFIC USE CASE 2]
    - [ANTI-PATTERN: When NOT to use]
    
    Key features:
    - [CAPABILITY 1 with behavioral implication]
    - [CAPABILITY 2 with flexibility note]
    
    You should:
    1. [EXPLICIT BEHAVIORAL INSTRUCTION]
    2. [THINKING PATTERN TO FOLLOW]
    3. [SELF-CORRECTION MECHANISM]
  `,
};
```

### Example from Sequential Thinking

- **Summary**: "A detailed tool for dynamic and reflective problem-solving"
- **Use cases**: Lists 7 specific scenarios
- **Features**: Each feature implies a thinking behavior
- **"You should" section**: 11 explicit directives

## 2. Parameter Design as Cognitive Nudges

### Make Parameters Guide Thinking

```typescript
inputSchema: {
  // DECISION FORCING PARAMETERS
  nextStepNeeded: boolean,      // Forces explicit continuation decision
  confidenceLevel: number,      // Forces uncertainty assessment

  // SELF-REFLECTION PARAMETERS
  isRevision?: boolean,         // Encourages reconsideration
  revisesStep?: number,         // Creates accountability chain

  // FLEXIBILITY PARAMETERS
  estimatedTotal: number,       // Adjustable, not fixed
  needsMoreSteps?: boolean,    // Escape hatch for rigid thinking

  // BRANCHING PARAMETERS
  branchId?: string,           // Enables parallel exploration
  branchFrom?: number          // Maintains context during exploration
}
```

### Parameter Naming Strategies

- Use **action-oriented** names: `nextThoughtNeeded` vs `complete`
- Include **metacognitive** triggers: `isRevision`, `needsMoreThoughts`
- Allow **progressive disclosure**: Required params simple, optional params complex

## 3. Instruction Patterns That Work

### The "You Should" Pattern

Instead of passive documentation, use direct imperatives:

```
You should:
1. Start with an initial estimate but be ready to adjust
2. Feel free to question previous decisions
3. Express uncertainty when present
4. Mark thoughts that revise previous thinking
```

### The "Permission to Fail" Pattern

Explicitly allow correction and adjustment:

```
- You can adjust total_thoughts up or down as you progress
- Don't hesitate to add more thoughts if needed
- Not every thought needs to build linearly
```

### The "Contextual Guidance" Pattern

Explain WHEN and WHY, not just HOW:

```
When to use this tool:
- Breaking down complex problems [WHEN]
- Planning with room for revision [WHY: flexibility needed]
- Analysis that might need course correction [WHY: uncertainty exists]
```

## 4. Feedback Mechanisms

### Visual Reinforcement (Console Output)

```typescript
private formatOutput(data: ToolData): string {
  // Use emojis/symbols to reinforce modes
  const prefix = data.isRevision ? '🔄 Revision' : '💭 Thought';

  // Show progress to encourage completion
  const progress = `${data.current}/${data.total}`;

  // Make state changes visible
  const context = data.branched ? `(branch: ${data.branchId})` : '';
}
```

### Response Structure

Return data that reinforces correct usage:

```typescript
return {
  thoughtNumber: validatedInput.thoughtNumber,
  totalThoughts: validatedInput.totalThoughts, // Show flexibility
  nextThoughtNeeded: validatedInput.nextThoughtNeeded, // Confirm decision
  branches: Object.keys(this.branches), // Show exploration paths
  thoughtHistoryLength: this.thoughtHistory.length, // Provide context
};
```

## 5. Implementation Checklist

### Tool Description Must Include:

- [ ] Clear "When to use" scenarios (minimum 3)
- [ ] "You should" behavioral instructions (5-10 items)
- [ ] Flexibility permissions ("You can adjust", "Feel free to")
- [ ] Anti-patterns ("Don't use when...")
- [ ] Conceptual explanation before technical details

### Parameters Should:

- [ ] Force explicit decisions (boolean flags for continuation)
- [ ] Enable self-correction (revision/adjustment parameters)
- [ ] Allow flexibility (adjustable estimates, optional branches)
- [ ] Use descriptive names that imply behavior

### Response Design:

- [ ] Provide progress indicators
- [ ] Confirm parameter interpretations
- [ ] Include metadata about process state
- [ ] Use formatting to reinforce modes/states

## 6. Advanced Patterns

### The "Hypothesis-Verification Loop"

Build scientific method into tool usage:

```
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on previous steps
9. Repeat the process until satisfied
10. Provide a single, ideally correct answer
```

### The "Irrelevance Filter"

Explicitly instruct to ignore distractions:

```
6. Ignore information that is irrelevant to the current step
```

### The "Uncertainty Expression"

Normalize admitting limitations:

```
4. Express uncertainty when present
```

## 7. Testing Your Instructions

### Validation Questions:

1. **Clarity**: Can the AI understand WHEN to use this tool from description alone?
2. **Flexibility**: Do parameters allow for course correction?
3. **Guidance**: Do instructions shape thinking process, not just output?
4. **Reinforcement**: Does response data reinforce correct usage?
5. **Anti-rigid**: Can the AI escape from initial wrong assumptions?

### Red Flags to Avoid:

- Pure technical documentation without behavioral guidance
- Fixed/rigid parameter requirements
- No self-correction mechanisms
- Missing "when to use" scenarios
- No permission for flexibility/uncertainty

## Key Insight

The most effective MCP tools don't just expose functionality - they **teach methodology**. They turn the protocol layer into a thinking tutor by:

1. Embedding cognitive scaffolds in descriptions
2. Using parameters as behavioral nudges
3. Providing feedback that reinforces patterns
4. Allowing flexibility while maintaining structure

When designing an MCP tool, think of yourself as designing a **thinking framework**, not just an API. The tool description is your opportunity to program not just what the AI does, but how it thinks while doing it.
