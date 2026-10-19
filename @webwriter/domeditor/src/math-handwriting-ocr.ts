/* Adapted from @webwriter/algebra-term.
Copyright 2026 Johannes Bauer

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
import type { InferenceSession } from "onnxruntime-web/wasm";
import vocabPayload from "./math-handwriting-vocab.json";
import wasmURL from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

// Handwriting recognition for the virtual keyboard: pen strokes go into a small CTC model that
// spells out LaTeX, which the LaTeX importer then turns into an expression. The ONNX runtime,
// its wasm and the model are fetched only once the first prediction is asked for, so an editor
// that is never drawn on pays nothing for them.

export interface StrokePoint {
	x: number;
	y: number;
	t: number;
}

export type Stroke = StrokePoint[];

export const MAX_POINTS = 2048;
const FEATURE_DIM = 7;
const BASE_URL = "https://math-ocr-model-a92a79.pages.git.nrw";
const MODEL_URL = `${BASE_URL}/equation-ocr-model.onnx`;

interface VocabPayload {
	blank_id: number;
	tokens: Record<string, number>;
}

type Ort = typeof import("onnxruntime-web/wasm");

const vocab = buildVocab(vocabPayload as VocabPayload);
let sessionPromise: Promise<{ ort: Ort; session: InferenceSession }> | undefined;

export async function predictLatexFromStrokes(strokes: Stroke[]): Promise<string> {
	validateStrokes(strokes);
	const { ort, session } = await getSession();
	const features = strokesToFeatures(strokes);
	const points = features.length / FEATURE_DIM;
	const inputs = new ort.Tensor("float32", features, [1, points, FEATURE_DIM]);
	const inputLengths = new ort.Tensor("int64", BigInt64Array.from([BigInt(points)]), [1]);
	const outputs = await session.run({ inputs, input_lengths: inputLengths });
	return greedyDecode(
		outputs.log_probs.data as Float32Array,
		outputs.log_probs.dims,
		outputs.output_lengths.data as BigInt64Array | number[],
	);
}

export function validateStrokes(strokes: Stroke[]): void {
	const points = strokes.reduce((count, stroke) => count + stroke.length, 0);
	if (points === 0) throw new Error("Nothing drawn");
	if (points > MAX_POINTS) throw new Error(`Too much drawn: ${points} points, at most ${MAX_POINTS}`);
}

export function getSession() {
	sessionPromise ??= (async () => {
		const ort = await import("onnxruntime-web/wasm");
		ort.env.wasm.numThreads = 1;
		ort.env.wasm.proxy = false;
		ort.env.wasm.wasmPaths = { wasm: new URL(wasmURL, import.meta.url).href };
		const session = await ort.InferenceSession.create(MODEL_URL, {
			executionProviders: ["wasm"],
			graphOptimizationLevel: "all",
		});
		return { ort, session };
	})();
	// A failed download must not be remembered, or the tab would never work again.
	sessionPromise.catch(() => (sessionPromise = undefined));
	return sessionPromise;
}

function strokesToFeatures(strokes: Stroke[]): Float32Array {
	const points = strokes.flat();
	const xs = points.map(point => point.x);
	const ys = points.map(point => point.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const xCenter = (minX + maxX) / 2;
	const yCenter = (minY + maxY) / 2;
	const scale = Math.max(maxX - minX, maxY - minY, 1e-6);
	const positiveDts: number[] = [];

	for (const stroke of strokes) {
		for (let index = 1; index < stroke.length; index += 1) {
			const dt = stroke[index].t - stroke[index - 1].t;
			if (dt > 0) positiveDts.push(dt);
		}
	}

	const medianDt = Math.max(median(positiveDts), 1e-6);
	const features = new Float32Array(points.length * FEATURE_DIM);
	let featureRow = 0;

	for (const stroke of strokes) {
		for (let index = 0; index < stroke.length; index += 1) {
			const point = stroke[index];
			const offset = featureRow * FEATURE_DIM;
			features[offset] = (point.x - xCenter) / scale;
			features[offset + 1] = (point.y - yCenter) / scale;
			if (index > 0) {
				const prev = stroke[index - 1];
				features[offset + 2] = (point.x - prev.x) / scale;
				features[offset + 3] = (point.y - prev.y) / scale;
				features[offset + 4] = Math.log1p(Math.max(point.t - prev.t, 0) / medianDt);
			}
			features[offset + 5] = index === 0 ? 1 : 0;
			features[offset + 6] = index === stroke.length - 1 ? 1 : 0;
			featureRow += 1;
		}
	}
	return features;
}

function median(values: number[]): number {
	if (!values.length) return 1;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function greedyDecode(
	logProbs: Float32Array,
	shape: readonly number[],
	lengths: BigInt64Array | number[],
): string {
	const frames = Math.min(Number(lengths[0]), shape[1]);
	const vocabSize = shape[2];
	const ids: number[] = [];
	let prev: number | null = null;
	for (let frame = 0; frame < frames; frame += 1) {
		const rowOffset = frame * vocabSize;
		let bestId = 0;
		let bestScore = logProbs[rowOffset];
		for (let tokenId = 1; tokenId < vocabSize; tokenId += 1) {
			const score = logProbs[rowOffset + tokenId];
			if (score > bestScore) {
				bestScore = score;
				bestId = tokenId;
			}
		}
		if (bestId !== prev && bestId !== vocab.blankId) ids.push(bestId);
		prev = bestId;
	}
	return detokenize(ids.map(id => vocab.tokens[id]).filter(token => token !== undefined));
}

function detokenize(tokens: string[]): string {
	const parts: string[] = [];
	let prev = "";
	for (const token of tokens) {
		if (parts.length && /^\\[A-Za-z]+$/.test(prev) && /^[A-Za-z]/.test(token)) {
			parts.push(" ");
		}
		parts.push(token);
		prev = token;
	}
	return parts.join("");
}

function buildVocab(payload: VocabPayload): { blankId: number; tokens: Record<number, string> } {
	const tokens: Record<number, string> = {};
	for (const [token, id] of Object.entries(payload.tokens)) tokens[id] = token;
	return { blankId: payload.blank_id, tokens };
}
