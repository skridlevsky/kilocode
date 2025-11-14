# Word Boundary Fzf

A drop-in replacement for the [fzf](https://github.com/ajitid/fzf-for-js) library that uses word boundary matching instead of fuzzy matching.

## Why This Replacement?

The original Fzf library uses fuzzy matching, which allows queries like "foo" to match "fAoBoC" through sequential character matching. This can sometimes produce unexpected results where the query matches text that doesn't contain the search term as a recognizable word or prefix.

This implementation uses **word boundary matching**, which is more intuitive for many use cases:

- ✅ "foo" matches "**foo**l org" (starts with "foo")
- ✅ "foo" matches "the **foo**l" (word starts with "foo")
- ❌ "foo" does NOT match "faoboc" (no word boundary)

## API Compatibility

This implementation maintains 100% API compatibility with the original Fzf library:

```typescript
// Original fzf usage
import { Fzf } from "fzf"

// Drop-in replacement
import { Fzf } from "@/lib/word-boundary-fzf"

// Same API
const fzf = new Fzf(items, {
	selector: (item) => item.searchableText,
})

const results = fzf.find(query)
// Returns: Array<{ item: T, score: number, positions: Set<number> }>
```

## How It Works

### Word Boundaries

The implementation recognizes the following as word separators:

- Spaces
- Hyphens (`-`)
- Underscores (`_`)
- Slashes (`/`, `\`)
- Dots (`.`)

### Matching Strategy

1. **Exact prefix match at text start** (highest priority)

    - "foo" in "**foo** bar" → highest score

2. **Prefix match at word boundary**

    - "foo" in "hello **foo**bar" → high score

3. **Substring match within word** (lower priority)
    - "foo" in "bar**foo**baz" → lower score

### Scoring

Results are ranked by score (higher is better) based on:

- **Position**: Earlier matches score higher
- **Query length**: Longer queries are more specific
- **Match type**: Exact matches > prefix matches > substring matches
- **Match ratio**: Matching a larger portion of a word scores higher

## Usage Example

```typescript
const modes = [
	{ value: "code", label: "Code", description: "Write code" },
	{ value: "architect", label: "Architect", description: "Design systems" },
	{ value: "debug", label: "Debug", description: "Fix bugs" },
]

const fzf = new Fzf(modes, {
	selector: (item) => [item.label, item.value].join(" "),
})

// Search for "cod"
const results = fzf.find("cod")
// Returns: [{ item: { value: "code", ... }, score: 150, positions: Set(3) }]
```

## Migration

To migrate from the original fzf library:

1. Change the import statement:

    ```typescript
    // Before
    import { Fzf } from "fzf"

    // After
    import { Fzf } from "@/lib/word-boundary-fzf"
    ```

2. That's it! No other changes needed.

## Testing

The implementation includes comprehensive tests covering:

- Basic word boundary matching
- Case insensitivity
- Various word separators
- Scoring and ranking
- Edge cases
- API compatibility

Run tests with:

```bash
cd webview-ui && npx vitest run src/lib/__tests__/word-boundary-fzf.spec.ts
```
