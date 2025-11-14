/**
 * Drop-in replacement for Fzf library that uses word boundary matching
 * instead of fuzzy matching.
 *
 * API-compatible with fzf library:
 * - new Fzf(items, { selector: (item) => string })
 * - fzfInstance.find(searchValue) returns array of { item: original }
 */

interface FzfOptions<T> {
	selector: (item: T) => string
}

interface FzfResult<T> {
	item: T
	score: number
	positions: Set<number>
}

export class Fzf<T> {
	private items: T[]
	private selector: (item: T) => string

	constructor(items: T[], options: FzfOptions<T>) {
		this.items = items
		this.selector = options.selector
	}

	/**
	 * Find items that match the search query using word boundary matching.
	 *
	 * Word boundary matching means:
	 * - "foo" matches "fool org" (starts with "foo")
	 * - "foo" matches "the fool" (word starts with "foo")
	 * - "foo" does NOT match "faoboc" (no word boundary)
	 * - "foo bar" matches items containing both "foo" and "bar" as separate words
	 * - "clso" matches "Claude Sonnet" (first letters of words: Cl + So)
	 *
	 * @param query The search string
	 * @returns Array of results with item and metadata
	 */
	find(query: string): FzfResult<T>[] {
		if (!query || query.trim() === "") {
			return this.items.map((item) => ({
				item,
				score: 0,
				positions: new Set<number>(),
			}))
		}

		const normalizedQuery = query.toLowerCase().trim()

		// Split query into words for multi-word matching
		const queryWords = normalizedQuery.split(/\s+/).filter((word) => word.length > 0)

		const results: FzfResult<T>[] = []

		for (const item of this.items) {
			const text = this.selector(item).toLowerCase()

			// For multi-word queries, all words must match
			if (queryWords.length > 1) {
				const matches = queryWords.map((word) => this.matchWordBoundary(text, word))

				// All query words must match
				if (matches.every((match) => match !== null)) {
					// Combine scores and positions from all matches
					const totalScore = matches.reduce((sum, match) => sum + (match?.score || 0), 0)
					const allPositions = new Set<number>()
					matches.forEach((match) => {
						if (match) {
							match.positions.forEach((pos) => allPositions.add(pos))
						}
					})

					results.push({
						item,
						score: totalScore,
						positions: allPositions,
					})
				}
			} else {
				// Single word query - try word boundary match first
				let match = this.matchWordBoundary(text, normalizedQuery)

				// If no match, try acronym matching (e.g., "clso" matches "Claude Sonnet")
				if (!match) {
					match = this.matchAcronym(text, normalizedQuery)
				}

				if (match) {
					results.push({
						item,
						score: match.score,
						positions: match.positions,
					})
				}
			}
		}

		// Sort by score (higher is better)
		results.sort((a, b) => b.score - a.score)

		return results
	}

	/**
	 * Check if query matches text at word boundaries.
	 * Returns match info with score and positions, or null if no match.
	 */
	private matchWordBoundary(text: string, query: string): { score: number; positions: Set<number> } | null {
		// Split text into words (by spaces, hyphens, underscores, etc.)
		const wordBoundaryRegex = /[\s\-_./\\]+/
		const words = text.split(wordBoundaryRegex)

		let bestScore = -1
		let bestPositions = new Set<number>()
		let currentPos = 0

		// Check each word
		for (let i = 0; i < words.length; i++) {
			const word = words[i]
			if (word.startsWith(query)) {
				// Exact prefix match at word boundary
				const score = this.calculateScore(word, query, currentPos, text.length)
				if (score > bestScore) {
					bestScore = score
					bestPositions = new Set(Array.from({ length: query.length }, (_, i) => currentPos + i))
				}
			} else if (word.includes(query)) {
				// Query appears within the word (lower priority)
				const queryIndex = word.indexOf(query)
				const score = this.calculateScore(word, query, currentPos + queryIndex, text.length) * 0.8
				if (score > bestScore) {
					bestScore = score
					bestPositions = new Set(Array.from({ length: query.length }, (_, i) => currentPos + queryIndex + i))
				}
			}

			// Move position forward by finding the actual next word position in the original text
			// This handles multi-character separators correctly
			if (i < words.length - 1) {
				const nextWordIndex = text.indexOf(words[i + 1], currentPos + word.length)
				currentPos = nextWordIndex
			}
		}

		// Also check if query matches at the very start of the text (highest priority)
		if (text.startsWith(query)) {
			const score = this.calculateScore(text, query, 0, text.length) * 1.2
			if (score > bestScore) {
				bestScore = score
				bestPositions = new Set(Array.from({ length: query.length }, (_, i) => i))
			}
		}

		return bestScore >= 0 ? { score: bestScore, positions: bestPositions } : null
	}

	/**
	 * Calculate match score based on various factors:
	 * - Earlier matches score higher
	 * - Longer query matches score higher
	 * - Matches in shorter text score higher
	 */
	private calculateScore(word: string, query: string, position: number, _textLength: number): number {
		// Base score from query length (longer queries are more specific)
		let score = query.length * 10

		// Bonus for matching at the start
		if (position === 0) {
			score += 50
		}

		// Bonus for matching early in the text
		score += Math.max(0, 100 - position)

		// Bonus for exact word match
		if (word === query) {
			score += 100
		}

		// Bonus for matching a larger portion of the word
		const matchRatio = query.length / word.length
		score += matchRatio * 30

		return score
	}

	/**
	 * Match query as an acronym against text.
	 * For example, "clso" matches "Claude Sonnet" (Cl + So)
	 * Each character in the query should match the start of a word in the text.
	 */
	private matchAcronym(text: string, query: string): { score: number; positions: Set<number> } | null {
		const wordBoundaryRegex = /[\s\-_./\\]+/
		const words = text.split(wordBoundaryRegex).filter((w) => w.length > 0)

		let queryIndex = 0
		let currentPos = 0
		const positions = new Set<number>()
		const matchedWordIndices: number[] = []

		for (let wordIdx = 0; wordIdx < words.length && queryIndex < query.length; wordIdx++) {
			const word = words[wordIdx]

			// Try to match as many consecutive characters as possible from this word
			let matchedInWord = 0
			while (
				queryIndex < query.length &&
				matchedInWord < word.length &&
				word[matchedInWord] === query[queryIndex]
			) {
				positions.add(currentPos + matchedInWord)
				queryIndex++
				matchedInWord++
			}

			if (matchedInWord > 0) {
				matchedWordIndices.push(wordIdx)
			}

			// Move to next word position
			if (wordIdx < words.length - 1) {
				const nextWordIndex = text.indexOf(words[wordIdx + 1], currentPos + word.length)
				currentPos = nextWordIndex
			}
		}

		// Only match if we consumed the entire query
		if (queryIndex === query.length) {
			// Score acronym matches lower than direct matches
			const score = query.length * 5 + matchedWordIndices.length * 10
			return { score, positions }
		}

		return null
	}
}
