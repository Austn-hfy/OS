import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderHtmlToPdf } from "../src/services/invoice-pdf/runtime";

const outputDirectory = resolve("tmp/pdfs");
const outputPath = resolve(outputDirectory, "runtime-spike.pdf");

await mkdir(outputDirectory, { recursive: true });
const pdf = await renderHtmlToPdf(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <style>
      @page { size: Letter; margin: 0.75in; }
      body { font-family: Arial, sans-serif; color: #102236; }
      h1 { color: #247fcf; }
    </style>
  </head>
  <body><h1>HFY invoice PDF runtime</h1><p>Chromium rendering is available.</p></body>
</html>`);

if (pdf.length < 1_000 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
  throw new Error("Chromium did not return a valid PDF document.");
}

await writeFile(outputPath, pdf);
console.log(`PDF runtime verified (${pdf.length} bytes): ${outputPath}`);
