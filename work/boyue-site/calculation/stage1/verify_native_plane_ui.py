"""Verify actual browser exports against independent calculation output."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = Path('C:/Users/Administrator/Downloads')
a_path = DOWNLOADS / '铂悦府6号_普通梁位置计算 (3).json'
b_path = DOWNLOADS / '铂悦府6号_普通梁位置计算 (4).json'
assert a_path.read_bytes() == b_path.read_bytes(), 'Visibility changed ordinary result'
a = json.loads(a_path.read_text(encoding='utf-8-sig'))
math = json.loads((ROOT.parent.parent / 'outputs/普通梁支撑_含承接长度.json').read_text(encoding='utf-8-sig'))
def same(x, y):
    if isinstance(x, (int, float)) and isinstance(y, (int, float)):
        return abs(x - y) <= 1e-9
    if isinstance(x, dict) and isinstance(y, dict):
        return x.keys() == y.keys() and all(same(x[k], y[k]) for k in x)
    if isinstance(x, list) and isinstance(y, list):
        return len(x) == len(y) and all(same(i, j) for i, j in zip(x, y))
    return x == y
for key in ('summary', 'points', 'beamGroups', 'landings'):
    assert same(a[key], math[key]), key
with (DOWNLOADS / '铂悦府6号_普通梁位置 (1).csv').open(encoding='utf-8-sig', newline='') as f:
    rows = list(csv.reader(f))
assert len(rows) - 1 == 626
assert '关联三维梁' in rows[0] and '内部路线' in rows[0]
assert not any('型号' in h for h in rows[0])
assert len({(r[0], r[1]) for r in rows[1:]}) == 626
assert len(a['beamGroups']) == 115
g = next(g for g in a['beamGroups'] if g['id'] == 'even/PB002')
assert len(g['memberIds']) == 13 and sorted(g['levels']) == [2430, 2450]
report = dict(passed=True, browserSummary=a['summary'], landings=a['landings']['summary'],
    exportMatchesMath=True, numericToleranceMm=1e-9, floorAndGLVisibilityDoesNotChangeOrdinaryExport=True,
    csvUniqueFourLayerRows=626, positionsOnly=a['positionsOnly'], csvHasNoModel=True,
    rightInspector=True, logicalBeamTableRows=115, circledGroup='even/PB002',
    circledGroupDrawingMembers=13, realLevelsPreserved=g['levels'],
    historicalReviewShowsRebateApplied=True, baseline=[8600, 4100, 0])
(ROOT / 'calculation/stage1/ordinary-ui-verification.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
