// §3.7 — Person clustering from face embeddings (agglomerative, single-linkage)
import type { FaceFeature, PersonCluster, PhotoEntry } from "./types";
import { cosineSimilarity } from "./faceEmbedding";

const SAME_PERSON_THRESHOLD = 0.80; // cosine similarity ≥ 0.80 → same person
const MERGE_THRESHOLD = 0.82;       // cross-folder centroid similarity threshold

interface FaceRef {
  photoId: string;
  faceIdx: number;
  embedding: Float32Array;
  confidence: number;
}

function l2NormalizeMut(v: Float32Array): void {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 1e-6) for (let i = 0; i < v.length; i++) v[i] /= norm;
}

function buildCentroid(refs: FaceRef[]): Float32Array {
  const dim = refs[0].embedding.length;
  const c = new Float32Array(dim);
  for (const r of refs) for (let k = 0; k < dim; k++) c[k] += r.embedding[k];
  for (let k = 0; k < dim; k++) c[k] /= refs.length;
  l2NormalizeMut(c);
  return c;
}

/**
 * §3.7 — cluster all faces in photosMap into PersonCluster objects.
 * Single-pass agglomerative: assign each face to the first cluster whose
 * centroid exceeds the threshold (greedy, O(n²) but typical n < 2000).
 */
export function clusterPersons(
  photos: Map<string, PhotoEntry>
): Map<string, PersonCluster> {
  const refs: FaceRef[] = [];

  for (const [photoId, photo] of photos) {
    if (!photo.faces) continue;
    for (let fi = 0; fi < photo.faces.length; fi++) {
      const face = photo.faces[fi] as FaceFeature;
      if (face.embedding && face.embedding.length > 0) {
        refs.push({ photoId, faceIdx: fi, embedding: face.embedding, confidence: face.faceConfidence });
      }
    }
  }

  if (refs.length === 0) return new Map();

  // Agglomerative: single-linkage with running centroid update
  const clusterMembers: FaceRef[][] = [];
  const centroids: Float32Array[] = [];

  for (const ref of refs) {
    let bestCluster = -1;
    let bestSim = SAME_PERSON_THRESHOLD - 1e-9;

    for (let c = 0; c < centroids.length; c++) {
      const sim = cosineSimilarity(ref.embedding, centroids[c]);
      if (sim > bestSim) { bestSim = sim; bestCluster = c; }
    }

    if (bestCluster === -1) {
      clusterMembers.push([ref]);
      centroids.push(new Float32Array(ref.embedding));
    } else {
      clusterMembers[bestCluster].push(ref);
      centroids[bestCluster] = buildCentroid(clusterMembers[bestCluster]);
    }
  }

  // Build PersonCluster objects
  const result = new Map<string, PersonCluster>();

  for (let c = 0; c < clusterMembers.length; c++) {
    const members = clusterMembers[c];
    const personId = `p${c + 1}`;
    const photoIds = [...new Set(members.map((m) => m.photoId))];

    // Representative: highest face confidence
    const rep = members.reduce((a, b) => b.confidence > a.confidence ? b : a);
    const repFace = photos.get(rep.photoId)?.faces?.[rep.faceIdx] as FaceFeature | undefined;

    result.set(personId, {
      id: personId,
      centroid: centroids[c],
      faceCount: members.length,
      photoIds,
      representativePhotoId: rep.photoId,
      representativeFaceBbox: repFace?.bbox ?? { x: 0.3, y: 0.1, w: 0.4, h: 0.6 },
      isHero: false,
    });
  }

  return result;
}

/**
 * §3.7 cross-folder — merge person clusters across multiple FolderSession analyses.
 * Clusters with centroid cosine similarity ≥ MERGE_THRESHOLD are unified.
 */
export function mergePersonClusters(
  clusterSets: Map<string, PersonCluster>[]
): Map<string, PersonCluster> {
  if (clusterSets.length === 0) return new Map();
  if (clusterSets.length === 1) return new Map(clusterSets[0]);

  const all: PersonCluster[] = clusterSets.flatMap((m) => [...m.values()]);
  const labels = new Int32Array(all.length).fill(-1);
  let nextId = 0;

  for (let i = 0; i < all.length; i++) {
    if (labels[i] !== -1) continue;
    labels[i] = nextId;
    for (let j = i + 1; j < all.length; j++) {
      if (labels[j] !== -1) continue;
      if (cosineSimilarity(all[i].centroid, all[j].centroid) >= MERGE_THRESHOLD) {
        labels[j] = nextId;
      }
    }
    nextId++;
  }

  const merged = new Map<string, PersonCluster>();

  for (let c = 0; c < nextId; c++) {
    const members = all.filter((_, i) => labels[i] === c);
    if (members.length === 0) continue;

    const personId = `p${c + 1}`;
    const photoIds = [...new Set(members.flatMap((m) => m.photoIds))];
    const totalFaces = members.reduce((s, m) => s + m.faceCount, 0);

    // Weighted centroid by face count
    const dim = members[0].centroid.length;
    const centroid = new Float32Array(dim);
    for (const m of members) {
      for (let k = 0; k < dim; k++) centroid[k] += m.centroid[k] * m.faceCount;
    }
    for (let k = 0; k < dim; k++) centroid[k] /= totalFaces;
    l2NormalizeMut(centroid);

    const rep = members.reduce((a, b) => b.faceCount > a.faceCount ? b : a);

    merged.set(personId, {
      ...rep,
      id: personId,
      centroid,
      faceCount: totalFaces,
      photoIds,
      isHero: false,
    });
  }

  return merged;
}
