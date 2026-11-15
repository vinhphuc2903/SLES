import sys, zipfile
from xml.sax.saxutils import escape
headers=['QuestionText','OptionA','OptionB','OptionC','OptionD','CorrectAnswer','Difficulty','Explanation']
levels=['RECOGNITION']*60+['COMPREHENSION']*60+['LOW_APPLICATION']*40+['HIGH_APPLICATION']*40
rows=[headers]+[[f'Hoá học câu {i+1}',f'Đúng {i+1}','Sai B','Sai C','Sai D','A',level,'Giải thích hoá học'] for i,level in enumerate(levels)]
if len(sys.argv)>2: rows[1][6]='INVALID'
xml='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
for n,row in enumerate(rows,1):
    xml+=f'<row r="{n}">'+''.join(f'<c r="{chr(65+j)}{n}" t="inlineStr"><is><t>{escape(v)}</t></is></c>' for j,v in enumerate(row))+'</row>'
xml+='</sheetData></worksheet>'
from pathlib import Path
source=Path(__file__).resolve().parents[2]/'src/SLES.Infrastructure/QuestionImport/Template.xlsx'
with zipfile.ZipFile(source) as original, zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as target:
    for item in original.infolist(): target.writestr(item,xml if item.filename=='xl/worksheets/sheet1.xml' else original.read(item.filename))
