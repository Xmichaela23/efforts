import Ajv from 'ajv';
import poolsSchema from './contracts/pools.schema.json';
import templatesSchema from './contracts/templates.schema.json';
import intensityMapsSchema from './contracts/intensity_maps.schema.json';
import metadataSchema from './contracts/metadata.schema.json';

export type PlansBundle = {
  metadata: any;
  pools: any;
  templates: any;
  intensity: any;
};

const ajv = new Ajv({ allErrors: true, strict: true });
const validatePools = ajv.compile(poolsSchema as any);
const validateTemplates = ajv.compile(templatesSchema as any);
const validateIntensity = ajv.compile(intensityMapsSchema as any);
const validateMetadata = ajv.compile(metadataSchema as any);

export async function loadPlansBundle(activeId: string): Promise<PlansBundle> {
  const base = `/${activeId}`;
  const [metadata, pools, templates, intensity] = await Promise.all([
    fetch(`${base}/metadata.json`).then(r => r.json()),
    fetch(`${base}/pools.json`).then(r => r.json()),
    fetch(`${base}/templates.json`).then(r => r.json()),
    fetch(`${base}/intensity_maps.json`).then(r => r.json())
  ]);

  // Validate
  if (!validateMetadata(metadata)) throw new Error(`Bundle metadata invalid: ${ajv.errorsText(validateMetadata.errors)}`);
  if (!validatePools(pools)) throw new Error(`Bundle pools invalid: ${ajv.errorsText(validatePools.errors)}`);
  if (!validateTemplates(templates)) throw new Error(`Bundle templates invalid: ${ajv.errorsText(validateTemplates.errors)}`);
  if (!validateIntensity(intensity)) throw new Error(`Bundle intensity_maps invalid: ${ajv.errorsText(validateIntensity.errors)}`);

  // Referential integrity (basic)
  const poolIds = new Set((pools.pools || []).map((p: any) => p.id));
  for (const t of templates.templates || []) {
    if (!poolIds.has(t.poolId)) throw new Error(`Template ${t.id} references unknown poolId ${t.poolId}`);
  }
  for (const p of pools.pools || []) {
    for (const s of p.stackableWith || []) {
      if (!poolIds.has(s)) throw new Error(`Pool ${p.id} stackableWith unknown id ${s}`);
    }
  }

  return { metadata, pools, templates, intensity };
}


