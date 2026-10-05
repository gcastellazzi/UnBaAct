"""Run from tmp/abaqus: abaqus python ../../scripts/abaqus-results.py.
Requires the completed gravity, elastic, eccentric and tied fixtures. Reads only ODBs.
"""
from odbAccess import openOdb
import json

results = {}
def near(actual, expected, relative=.005):
    assert abs(actual-expected) < relative*max(1., abs(expected)), (actual, expected)

for name in ('gravity', 'elastic', 'eccentric', 'tied'):
    odb = openOdb(name+'.odb', readOnly=True)
    try:
        step = odb.steps['Gravity_and_applied_loads']
        frame = step.frames[-1]
        near(frame.frameValue, 2. if name=='elastic' else 1., 1e-7)
        row = {'time': frame.frameValue}
        if name == 'elastic':
            values = []
            for i in range(2, 8):
                inst = odb.rootAssembly.instances['P%d_I' % i]
                values.append(frame.fieldOutputs['U'].getSubset(region=inst).values[0].data[2])
            reaction = -sum(values)*5e5*.3/6
            expected = (1800*.3+2400*.15*.3)*9.81+100.
            near(reaction, expected)
            row.update(soil_reaction=reaction, expected=expected, mean_settlement=-sum(values)/6)
        else:
            support = next(inst for inst in odb.rootAssembly.instances.values() if 'FIXED' in inst.nodeSets)
            rfs = frame.fieldOutputs['RF'].getSubset(region=support).values
            reaction = sum(v.data[2] for v in rfs)
            depth = .45 if name=='eccentric' else .3
            expected = 1800*depth*9.81+100.
            near(reaction, expected)
            row.update(reaction=reaction, expected=expected)
            if name == 'eccentric':
                coords = dict((n.label, n.coordinates) for n in support.nodes)
                moment = sum(coords[v.nodeLabel][1]*v.data[2]-coords[v.nodeLabel][2]*v.data[1] for v in rfs)
                near(moment, -17.5)
                row.update(reaction_moment_x=moment, expected_moment_x=-17.5)
        results[name] = row
    finally:
        odb.close()
with open('verification.json', 'w') as stream:
    json.dump(results, stream, indent=2)
print(json.dumps(results, indent=2))
