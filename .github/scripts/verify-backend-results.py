"""Fail CI if either real PostgreSQL test was silently skipped."""
from pathlib import Path
import xml.etree.ElementTree as ET

required = {'Migration_rollback_bulk_concurrency_and_blueprint_work_on_real_schema',
            'Authenticated_permissions_and_student_queries_work_on_Postgres'}
passed = set()
for path in Path('test-results/backend').glob('*.trx'):
    for result in ET.parse(path).iter():
        if result.tag.endswith('UnitTestResult') and result.attrib.get('outcome') == 'Passed':
            for name in required:
                if name in result.attrib.get('testName', ''):
                    passed.add(name)
if passed != required:
    raise SystemExit('Required PostgreSQL integration tests did not pass: ' + ', '.join(sorted(required - passed)))
print('Both required PostgreSQL integration tests passed.')
