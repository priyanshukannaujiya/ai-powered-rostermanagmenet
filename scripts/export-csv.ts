import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const fixturePath = path.join(process.cwd(), "fixtures", "sample-roster.xlsx");
const wb = XLSX.readFile(fixturePath);
const outDir = path.join(process.cwd(), "fixtures", "csv");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const sheet of wb.SheetNames) {
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheet]);
  const filePath = path.join(outDir, `${sheet.toLowerCase()}.csv`);
  fs.writeFileSync(filePath, csv, "utf8");
  console.log(`Exported: ${filePath}`);
}

console.log("All sheets exported successfully!");
