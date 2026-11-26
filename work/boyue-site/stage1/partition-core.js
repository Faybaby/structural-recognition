// Apply derived classification masks without changing the saved native models,
// original input files, or the baseline geometry key.
export function applyPartition(data,floorInput,partition){
 for(const plan of data.plans){
  for(const zone of plan.zones){const patch=partition.zoneOverrides[zone.id];if(patch)Object.assign(zone,patch,{commonRegion:patch.commonRegion||patch.region,exclusiveRegion:patch.exclusiveRegion||[]});}
  plan.zones.push(...partition.extraZones.filter(z=>z.key===plan.key));
 }
 floorInput.floors=partition.floors;
 floorInput.partitionRevision=partition.rule;
 return {data,floorInput};
}
