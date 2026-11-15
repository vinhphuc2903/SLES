using System.IO.Compression;
using System.Xml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using SLES.Application.QuestionBank;
using SLES.Domain.Enums;
using SLES.Infrastructure.QuestionBank;

namespace SLES.Infrastructure.QuestionImport;

public sealed class ExcelQuestionReader
{
    public const int MaxBytes = 4 * 1024 * 1024, MaxRows = 1000, MaxField = 32767;
    private static readonly string[] Headers = ["QuestionText", "OptionA", "OptionB", "OptionC", "OptionD", "CorrectAnswer", "Difficulty", "Explanation"];
    public ImportRow[] Read(byte[] bytes)
    {
        CheckPackage(bytes);
        using var stream = new MemoryStream(bytes, false);
        using var document = SpreadsheetDocument.Open(stream, false, new OpenSettings { MaxCharactersInPart = 20 * 1024 * 1024 });
        if (document.DocumentType != DocumentFormat.OpenXml.SpreadsheetDocumentType.Workbook) throw new InvalidDataException("Chỉ hỗ trợ workbook .xlsx không macro.");
        var book = document.WorkbookPart ?? throw new InvalidDataException("Thiếu workbook.");
        var sheet = (book.Workbook ?? throw new InvalidDataException("Thiếu workbook root.")).Sheets?.Elements<Sheet>().SingleOrDefault(x => x.Name?.Value == "Questions") ?? throw new InvalidDataException("Thiếu worksheet Questions.");
        var part = book.GetPartById(sheet.Id!) as WorksheetPart ?? throw new InvalidDataException("Questions phải là worksheet.");
        var strings = book.SharedStringTablePart?.SharedStringTable?.Elements<SharedStringItem>().Select(x => x.InnerText).ToArray() ?? [];
        var source = (part.Worksheet ?? throw new InvalidDataException("Thiếu worksheet root.")).GetFirstChild<SheetData>()?.Elements<Row>().ToArray() ?? [];
        if (source.Length > MaxRows + 1) throw new InvalidDataException("Tối đa 1000 dòng dữ liệu, không tính header.");
        var rows = new List<ImportRow>(); var seen = new HashSet<uint>(); var characters = 0;
        foreach (var row in source)
        {
            var index = row.RowIndex?.Value ?? 0;
            if (index == 0 || index > MaxRows + 1 || !seen.Add(index)) throw new InvalidDataException("Số hàng không hợp lệ hoặc vượt hàng 1001.");
            var cells = new string[8]; Array.Fill(cells, ""); var columns = new HashSet<int>();
            foreach (var cell in row.Elements<Cell>())
            {
                var reference = cell.CellReference?.Value ?? "";
                if (reference.Length < 2 || reference[0] < 'A' || reference[0] > 'H' || !uint.TryParse(reference[1..], out var cellRow) || cellRow != index) throw new InvalidDataException($"Hàng {index}: chỉ hỗ trợ các cột A–H của mẫu.");
                var col = reference[0] - 'A'; if (!columns.Add(col)) throw new InvalidDataException("Ô trùng lặp.");
                var value = cell.CellValue?.Text ?? cell.InlineString?.InnerText ?? "";
                if (cell.DataType?.Value == CellValues.SharedString)
                {
                    if (!int.TryParse(value, out var position) || position < 0 || position >= strings.Length) throw new InvalidDataException("Shared string không hợp lệ.");
                    value = strings[position];
                }
                else if (cell.DataType?.Value == CellValues.Error || cell.DataType?.Value == CellValues.Boolean || cell.DataType?.Value == CellValues.Date) throw new InvalidDataException($"Ô {reference}: cần văn bản hoặc số, không nhận lỗi/ngày/boolean.");
                cells[col] = value.Trim(); characters += value.Length;
            }
            if (characters > 2_000_000) throw new InvalidDataException("Tổng nội dung vượt 2 triệu ký tự.");
            if (index == 1) { if (!cells.SequenceEqual(Headers)) throw new InvalidDataException("Header hàng 1 phải đúng thứ tự: " + string.Join(", ", Headers)); continue; }
            if (cells.All(string.IsNullOrWhiteSpace)) continue;
            var errors = new List<string>();
            for (var i = 0; i < 8; i++) if (cells[i].Length > MaxField) errors.Add(Headers[i] + ": tối đa 32767 ký tự.");
            if (string.IsNullOrWhiteSpace(cells[0])) errors.Add("QuestionText: không được trống.");
            for (var i = 1; i <= 4; i++) if (string.IsNullOrWhiteSpace(cells[i])) errors.Add(Headers[i] + ": không được trống.");
            if (cells[5].Length != 1 || !"ABCD".Contains(cells[5], StringComparison.Ordinal)) errors.Add("CorrectAnswer: phải là A, B, C hoặc D.");
            if (!Enum.TryParse<QuestionDifficulty>(cells[6], out var difficulty) || !Enum.IsDefined(difficulty) || difficulty.ToString() != cells[6]) errors.Add("Difficulty: phải là RECOGNITION, COMPREHENSION, LOW_APPLICATION hoặc HIGH_APPLICATION.");
            var options = Enumerable.Range(1, 4).Select(i => new QuestionOptionRequest(cells[i], cells[5] == ((char)('A' + i - 1)).ToString())).ToArray();
            if (errors.Count == 0 && QuestionBankService.Validate(cells[0], options) is not null) errors.Add("Câu hỏi không đáp ứng quy tắc ngân hàng câu hỏi.");
            rows.Add(new((int)index, cells[0], cells[1], cells[2], cells[3], cells[4], cells[5], cells[6], cells[7].Length == 0 ? null : cells[7], errors));
        }
        if (!seen.Contains(1)) throw new InvalidDataException("Thiếu header hàng 1.");
        if (rows.Count == 0) throw new InvalidDataException("Questions không có dòng dữ liệu.");
        return rows.ToArray();
    }
    private static void CheckPackage(byte[] bytes)
    {
        if (bytes.Length == 0 || bytes.Length > MaxBytes) throw new InvalidDataException("File phải từ 1 byte đến 4 MiB.");
        using var zip = new ZipArchive(new MemoryStream(bytes, false), ZipArchiveMode.Read);
        if (zip.Entries.Count > 128 || zip.Entries.Sum(e => e.Length) > 20 * 1024 * 1024) throw new InvalidDataException("Workbook vượt giới hạn giải nén.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in zip.Entries)
        {
            var name = entry.FullName;
            if (!names.Add(name) || name.Contains("..") || name.Contains('\\') || name.StartsWith('/') || (!name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase) && !name.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)) || name.Contains("externalLink", StringComparison.OrdinalIgnoreCase) || name.Contains("connections", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Workbook chứa phần nhúng hoặc liên kết không hỗ trợ.");
            if (entry.Length > 8 * 1024 * 1024 || (entry.Length > 1024 * 1024 && entry.Length > entry.CompressedLength * 200)) throw new InvalidDataException("Workbook có tỷ lệ nén hoặc kích thước phần quá lớn.");
            using var input = entry.Open();
            using var xml = XmlReader.Create(input, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 20 * 1024 * 1024 });
            while (xml.Read())
            {
                if (xml.NodeType != XmlNodeType.Element) continue;
                if (xml.LocalName is "f" or "externalReference" or "oleObject" or "definedName" || xml.GetAttribute("TargetMode")?.Equals("External", StringComparison.OrdinalIgnoreCase) == true || (xml.GetAttribute("ContentType") ?? "").Contains("macro", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Không nhận công thức, macro, tên định nghĩa hoặc liên kết ngoài.");
            }
        }
        if (!names.Contains("[Content_Types].xml") || !names.Contains("xl/workbook.xml")) throw new InvalidDataException("File không phải XLSX hợp lệ.");
    }
}
