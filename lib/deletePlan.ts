import { allPaths, rawDoc, removeDocs, StoreError } from '@/lib/store';
import { claimAsset, listAssets, removeAssetFiles } from '@/lib/assets';

// Deleting a plan, all on the server, in one step:
// 1. Check the plan exists and the caller is one of its organizers (the same rule as before;
//    the caller is identified by the browser's id, which is not verified until real accounts).
// 2. Work out everything that belongs to it: the plan record (with its change log), every
//    record under it (members, expenses, packing, chat, bucket list, photos, pot, songs and any
//    other), and each person's private spend list for it.
// 3. Remove all of those together (lib/store.ts removeDocs): if the database can't be saved,
//    nothing is removed.
// 4. Then delete its uploaded files (boarding passes, photos): files saved for this plan and
//    older files only this plan pointed to, but never a file that any remaining record still
//    mentions. Files left over from any other deleted plan (say a disk error last time) are
//    swept up too, under the same rule.
// Repeating it is safe: an already-deleted plan only gets step 4 again.

const ASSET = /\b[0-9a-f]{32}\b/g;
const idsIn = (v: unknown) => new Set(JSON.stringify(v ?? null).match(ASSET) || []);

export type DeleteResult = { deleted: boolean; records: number; files: number; filesLeft: number };

export function deletePlan(tid: string, user: string): DeleteResult {
  if (!/^[A-Za-z0-9_\-]{4,40}$/.test(tid)) throw new StoreError('invalid_argument', 'That isn’t a plan id.');
  const plan = rawDoc('trips/' + tid);
  let records = 0;
  if (plan) {
    const owner = plan.createdBy === user || (!!plan.orgs && typeof plan.orgs === 'object' && !!(plan.orgs as Record<string, unknown>)[user]);
    if (!owner) throw new StoreError('permission_denied', 'Only organizers can delete this plan.');
    const mine = allPaths().filter(p => p === 'trips/' + tid || p.startsWith(`trips/${tid}/`) || new RegExp(`^data/users/[^/]+/spend-${tid}$`).test(p));
    // files only this plan points to, from before uploads recorded their plan
    const referenced = new Set<string>(); for (const p of mine) for (const id of idsIn(rawDoc(p))) referenced.add(id);
    for (const id of referenced) claimAsset(id, tid);
    records = removeDocs(mine);
  }
  // files of this plan, or of any plan that no longer exists, that nothing left mentions
  const files = listAssets().filter(a => a.tid === tid || (a.tid && !rawDoc('trips/' + a.tid)));
  let removed = 0, left = 0;
  if (files.length) {
    const still = new Set<string>(); for (const p of allPaths()) for (const id of idsIn(rawDoc(p))) still.add(id);
    for (const a of files) { if (still.has(a.id)) continue; if (removeAssetFiles(a.id)) removed++; else left++; }
  }
  return { deleted: !!plan, records, files: removed, filesLeft: left };
}
